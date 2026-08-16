/**
 * Tiled TMX reader for the original's level data.
 *
 * The maps are **TMX version 1.0** — the pre-Tiled-1.2 format, with tilesets
 * embedded rather than referenced as `.tsx`, and layer data as base64 + zlib.
 * There are no object layers anywhere: enemies, potions, ingredients, hazards
 * and particle emitters are encoded as tiles in hidden layers whose *tileset
 * tiles* carry properties. That is the single most surprising thing about this
 * data, and everything below follows from it.
 *
 * Output is converted to a **Y-up** world with the bottom tile row at y = 0,
 * matching `src/sim/`. TMX itself is Y-down with row 0 at the top.
 */
import { inflateSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';

/** Tiled stores orientation flags in the high bits of each GID. */
const FLIP_HORIZONTAL = 0x80000000;
const FLIP_VERTICAL = 0x40000000;
const FLIP_DIAGONAL = 0x20000000;
const GID_MASK = 0x1fffffff;

export interface TileProperties {
  readonly [key: string]: string;
}

export interface TilesetInfo {
  readonly firstgid: number;
  readonly name: string;
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly columns: number;
  readonly tileCount: number;
  /** Properties per local tile id, for the tiles that declare any. */
  readonly tileProperties: ReadonlyMap<number, TileProperties>;
}

export interface PlacedTile {
  readonly col: number;
  /** Row index from the **bottom**, so it can be multiplied straight into world Y. */
  readonly row: number;
  readonly gid: number;
  readonly flipH: boolean;
  readonly flipV: boolean;
  readonly flipD: boolean;
}

export interface TmxLayer {
  readonly name: string;
  readonly visible: boolean;
  readonly properties: TileProperties;
  readonly tiles: readonly PlacedTile[];
}

export interface TmxMap {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tilesets: readonly TilesetInfo[];
  readonly layers: readonly TmxLayer[];
}

/** Normalise fast-xml-parser's "one child collapses to an object" behaviour. */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface RawProperty {
  readonly '@_name': string;
  readonly '@_value': string;
}

function readProperties(node: { properties?: { property?: RawProperty | RawProperty[] } }): TileProperties {
  const out: Record<string, string> = {};
  for (const property of toArray(node.properties?.property)) {
    out[property['@_name']] = String(property['@_value']);
  }
  return out;
}

function decodeLayerData(
  raw: string,
  encoding: string,
  compression: string | undefined,
  width: number,
  height: number,
): Uint32Array {
  if (encoding !== 'base64') {
    throw new Error(`unsupported layer encoding: ${encoding}`);
  }

  let buffer = Buffer.from(raw.trim(), 'base64');

  if (compression === 'zlib' || compression === 'gzip') {
    buffer = inflateSync(buffer);
  } else if (compression !== undefined && compression !== '') {
    throw new Error(`unsupported layer compression: ${compression}`);
  }

  const expected = width * height * 4;
  if (buffer.length !== expected) {
    throw new Error(`layer data is ${buffer.length} bytes, expected ${expected}`);
  }

  const gids = new Uint32Array(width * height);
  for (let i = 0; i < gids.length; i += 1) {
    gids[i] = buffer.readUInt32LE(i * 4);
  }
  return gids;
}

export function parseTmx(xml: string, name: string): TmxMap {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
  });

  const doc = parser.parse(xml) as { map: Record<string, unknown> };
  const map = doc.map;

  const width = Number(map['@_width']);
  const height = Number(map['@_height']);
  const tileWidth = Number(map['@_tilewidth']);
  const tileHeight = Number(map['@_tileheight']);

  const tilesets: TilesetInfo[] = toArray(
    map.tileset as Record<string, unknown> | Record<string, unknown>[],
  ).map((raw) => {
    const image = raw.image as Record<string, string>;
    const imageWidth = Number(image['@_width']);
    const imageHeight = Number(image['@_height']);
    const tsTileWidth = Number(raw['@_tilewidth']);
    const tsTileHeight = Number(raw['@_tileheight']);
    const columns = Math.floor(imageWidth / tsTileWidth);
    const rows = Math.floor(imageHeight / tsTileHeight);

    const tileProperties = new Map<number, TileProperties>();
    for (const tile of toArray(raw.tile as never)) {
      const node = tile as { '@_id': string };
      const props = readProperties(tile as never);
      if (Object.keys(props).length > 0) tileProperties.set(Number(node['@_id']), props);
    }

    return {
      firstgid: Number(raw['@_firstgid']),
      name: String(raw['@_name']),
      image: String(image['@_source']),
      imageWidth,
      imageHeight,
      columns,
      tileCount: columns * rows,
      tileProperties,
    };
  });

  const layers: TmxLayer[] = toArray(
    map.layer as Record<string, unknown> | Record<string, unknown>[],
  ).map((raw) => {
    const layerWidth = Number(raw['@_width']);
    const layerHeight = Number(raw['@_height']);
    const data = raw.data as Record<string, string>;

    const gids = decodeLayerData(
      data['#text'] ?? '',
      String(data['@_encoding']),
      data['@_compression'],
      layerWidth,
      layerHeight,
    );

    const tiles: PlacedTile[] = [];
    for (let index = 0; index < gids.length; index += 1) {
      const value = gids[index] ?? 0;
      if (value === 0) continue;

      const col = index % layerWidth;
      const topDownRow = Math.floor(index / layerWidth);

      tiles.push({
        col,
        // Flip to bottom-up so world Y falls out as row * tileHeight.
        row: layerHeight - 1 - topDownRow,
        gid: value & GID_MASK,
        flipH: (value & FLIP_HORIZONTAL) !== 0,
        flipV: (value & FLIP_VERTICAL) !== 0,
        flipD: (value & FLIP_DIAGONAL) !== 0,
      });
    }

    return {
      name: String(raw['@_name']),
      // Tiled omits the attribute when visible; "0" means hidden.
      visible: raw['@_visible'] === undefined || String(raw['@_visible']) !== '0',
      properties: readProperties(raw as never),
      tiles,
    };
  });

  return { name, width, height, tileWidth, tileHeight, tilesets, layers };
}

/** Resolve a global tile id to its tileset and local index. */
export function resolveGid(
  gid: number,
  tilesets: readonly TilesetInfo[],
): { tileset: TilesetInfo; localId: number } | null {
  let best: TilesetInfo | null = null;
  for (const tileset of tilesets) {
    if (tileset.firstgid <= gid && (best === null || tileset.firstgid > best.firstgid)) {
      best = tileset;
    }
  }
  if (best === null) return null;
  return { tileset: best, localId: gid - best.firstgid };
}
