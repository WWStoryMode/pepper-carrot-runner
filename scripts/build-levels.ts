/**
 * Converts the original's Tiled maps into runtime chunk data.
 *
 * Each of `level1..7.tmx` becomes one chunk, 35 tiles wide. The plan called for
 * cutting them smaller, but the maps turn out not to survive it: their platform
 * layers are sparse shelves that only make sense above a continuous floor (see
 * `GROUND` note below), so arbitrary cut points would produce sections with no
 * reachable geometry at all. Whole maps compose the way their author intended.
 *
 * GROUND — the important discovery. These maps have no floor of their own;
 * `level2.tmx` has nothing at all on row 0. The original ran the player along an
 * invisible plane (`Constants.OFFSET_TO_GROUND`, which `Runner.act` clamps
 * against) and painted `ground.png` behind it on repeat. The tile layers are
 * elevated platforms above that plane, not the ground itself. Runtime therefore
 * supplies a continuous floor and these chunks sit on top.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';
import { parseTmx, resolveGid, type TmxMap } from './lib/tmx.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const LEVEL_DIR = join(root, 'assets/src/levels');
const TILESET_DIR = join(root, 'assets/src/tilesets');
const OUT_DIR = join(root, 'public/art');

/** Player depth in the original was 50; layers sort either side of it. */
const PLAYER_DEPTH = 50;

interface OutTile {
  readonly ts: number;
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly depth: number;
  readonly fh: boolean;
  readonly fv: boolean;
  readonly fd: boolean;
}

interface OutPlatform {
  readonly col: number;
  readonly row: number;
  readonly len: number;
}

interface OutEntity {
  readonly kind: 'enemy' | 'potion' | 'ingredient' | 'hazard';
  readonly name: string;
  readonly col: number;
  readonly row: number;
  readonly emitter?: string;
}

/**
 * Merge horizontally adjacent platform tiles on the same row into runs.
 *
 * The original made one collidable box per cell. Runs mean fewer boxes to test
 * and, more importantly, no internal seams for the landing sweep to catch on.
 */
function mergePlatformRuns(tiles: readonly { col: number; row: number }[]): OutPlatform[] {
  const byRow = new Map<number, number[]>();
  for (const tile of tiles) {
    const cols = byRow.get(tile.row) ?? [];
    cols.push(tile.col);
    byRow.set(tile.row, cols);
  }

  const runs: OutPlatform[] = [];
  for (const [row, cols] of byRow) {
    cols.sort((a, b) => a - b);

    let start = cols[0]!;
    let previous = start;

    for (const col of cols.slice(1)) {
      if (col === previous + 1) {
        previous = col;
        continue;
      }
      runs.push({ col: start, row, len: previous - start + 1 });
      start = col;
      previous = col;
    }
    runs.push({ col: start, row, len: previous - start + 1 });
  }

  return runs.sort((a, b) => a.col - b.col || a.row - b.row);
}

function buildChunk(map: TmxMap, tilesetIndex: Map<string, number>) {
  const tiles: OutTile[] = [];
  const entities: OutEntity[] = [];
  let platforms: OutPlatform[] = [];

  for (const [order, layer] of map.layers.entries()) {
    const declared = layer.properties['z-index'];
    // Ties are broken by TMX order so layers stack the way they were authored.
    const depth = (declared === undefined ? 0 : Number(declared)) + order * 0.01;

    if (layer.visible) {
      for (const tile of layer.tiles) {
        const resolved = resolveGid(tile.gid, map.tilesets);
        if (resolved === null) continue;

        const perTile = resolved.tileset.tileProperties.get(resolved.localId);
        const tileDepth = perTile?.['z-index'] === undefined ? depth : Number(perTile['z-index']);

        tiles.push({
          ts: tilesetIndex.get(resolved.tileset.name)!,
          id: resolved.localId,
          col: tile.col,
          row: tile.row,
          depth: tileDepth,
          fh: tile.flipH,
          fv: tile.flipV,
          fd: tile.flipD,
        });
      }
    }

    if (layer.properties['platforms'] === 'true') {
      platforms = mergePlatformRuns(layer.tiles);
    }

    // `events=true` layers carry gameplay placement in their tile properties.
    if (layer.properties['events'] === 'true') {
      for (const tile of layer.tiles) {
        const resolved = resolveGid(tile.gid, map.tilesets);
        if (resolved === null) continue;

        const props = resolved.tileset.tileProperties.get(resolved.localId);
        if (props === undefined) continue;

        const emitter = props['emitter'];
        const base = { col: tile.col, row: tile.row };

        if (props['obstacle'] === 'deadly') {
          entities.push({
            kind: 'hazard',
            name: 'deadly',
            ...base,
            ...(emitter === undefined ? {} : { emitter }),
          });
          continue;
        }

        const type = props['type'];
        if (type === 'enemy') {
          entities.push({ kind: 'enemy', name: props['name'] ?? 'fly', ...base });
        } else if (type === 'potion') {
          entities.push({ kind: 'potion', name: props['color'] ?? 'orange', ...base });
        } else if (type === 'ingredient') {
          entities.push({ kind: 'ingredient', name: props['name'] ?? 'ingredient_sour-1', ...base });
        }
      }
    }
  }

  return { tiles, platforms, entities };
}

/**
 * Rate a chunk by what it throws at the player.
 *
 * Derived from the data rather than hand-assigned, so hand-authored chunks
 * added later are rated on the same terms. Spiders count double: they are
 * larger and the original places them in its late levels.
 */
function rateDifficulty(entities: readonly OutEntity[]): number {
  let score = 0;
  for (const entity of entities) {
    if (entity.kind === 'hazard') score += 2;
    else if (entity.kind === 'enemy') score += entity.name === 'spider' ? 4 : 2;
  }
  return score;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(LEVEL_DIR))
    .filter((f) => f.endsWith('.tmx'))
    // A 7×7 blank spacer with no platform layer; nothing to stream.
    .filter((f) => f !== 'startlevel.tmx')
    .sort();

  const maps = await Promise.all(
    files.map(async (file) =>
      parseTmx(await readFile(join(LEVEL_DIR, file), 'utf8'), basename(file, '.tmx')),
    ),
  );

  // Tilesets are identical across all seven maps; collect them once.
  const tilesetIndex = new Map<string, number>();
  const tilesets: unknown[] = [];

  for (const map of maps) {
    for (const tileset of map.tilesets) {
      if (tilesetIndex.has(tileset.name)) continue;
      tilesetIndex.set(tileset.name, tilesets.length);

      const image = `tileset-${tileset.name}.webp`;
      // Lossless: tile edges abut, and lossy blocking would show as seams.
      const webp = await sharp(join(TILESET_DIR, tileset.image))
        .webp({ lossless: true, effort: 6 })
        .toBuffer();
      await writeFile(join(OUT_DIR, image), webp);

      tilesets.push({
        name: tileset.name,
        image,
        columns: tileset.columns,
        tileCount: tileset.tileCount,
        tileWidth: Math.floor(tileset.imageWidth / tileset.columns),
        tileHeight: Math.floor(tileset.imageHeight / (tileset.tileCount / tileset.columns)),
      });
    }
  }

  // The continuous floor the maps assume. `Background.java` drew this with
  // TextureWrap.Repeat behind everything else.
  await writeFile(
    join(OUT_DIR, 'ground.webp'),
    await sharp(join(TILESET_DIR, 'ground.png')).webp({ lossless: true, effort: 6 }).toBuffer(),
  );

  const first = maps[0]!;
  const chunks = maps.map((map) => {
    const { tiles, platforms, entities } = buildChunk(map, tilesetIndex);
    return {
      name: map.name,
      widthTiles: map.width,
      heightTiles: map.height,
      difficulty: rateDifficulty(entities),
      tiles,
      platforms,
      entities,
    };
  });

  const payload = {
    tileWidth: first.tileWidth,
    tileHeight: first.tileHeight,
    playerDepth: PLAYER_DEPTH,
    tilesets,
    chunks,
  };

  await writeFile(join(OUT_DIR, 'levels.json'), JSON.stringify(payload));

  console.log(`levels     ${chunks.length} chunks, ${tilesets.length} tilesets`);
  for (const chunk of chunks) {
    const enemies = chunk.entities.filter((e) => e.kind === 'enemy').length;
    const hazards = chunk.entities.filter((e) => e.kind === 'hazard').length;
    const pickups = chunk.entities.filter(
      (e) => e.kind === 'potion' || e.kind === 'ingredient',
    ).length;
    console.log(
      `  ${chunk.name.padEnd(8)} difficulty ${String(chunk.difficulty).padStart(3)}` +
        `  tiles ${String(chunk.tiles.length).padStart(4)}` +
        `  platforms ${String(chunk.platforms.length).padStart(3)}` +
        `  enemies ${enemies}  hazards ${String(hazards).padStart(2)}  pickups ${pickups}`,
    );
  }
}

await main();
