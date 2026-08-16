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

/**
 * Tiles of clearance a gap needs either side of any raised platform.
 *
 * The single-jump arc is ~340 px ≈ 3.6 tiles, so four keeps the whole flight
 * path clear of overhangs.
 */
const JUMP_CLEARANCE_TILES = 4;

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
 * Column ranges where a hole may be punched in the floor.
 *
 * A gap must not appear under the chunk's own ground-level tiles — a bookshelf
 * hanging over a void looks broken — nor under anything low enough to be
 * stranded on the far side of it. Everything else is fair game.
 *
 * Both chunk edges are excluded too, so a gap never straddles a join, where the
 * neighbouring chunk's content is unknown at authoring time.
 */
function findSafeWindows(
  widthTiles: number,
  platforms: readonly OutPlatform[],
  entities: readonly OutEntity[],
): { start: number; len: number }[] {
  const blocked = new Array<boolean>(widthTiles).fill(false);

  const block = (col: number): void => {
    if (col >= 0 && col < widthTiles) blocked[col] = true;
  };

  for (const run of platforms) {
    if (run.row === 0) {
      // Row 0 sits flush with the floor; a hole under it would leave the
      // shelf hanging over a void.
      for (let i = -1; i <= run.len; i += 1) block(run.col + i);
      continue;
    }

    // Anything higher is an obstacle to *jumping* the gap. A gap forces the
    // player into the air, and the arc spans ~340 px — about 3.6 tiles — so a
    // shelf anywhere near the take-off makes the pairing unclearable: jump and
    // you hit the shelf, don't jump and you fall in. Found by an autopilot
    // death at level5's overhang, not by reading the maps.
    for (let i = -JUMP_CLEARANCE_TILES; i < run.len + JUMP_CLEARANCE_TILES; i += 1) {
      block(run.col + i);
    }
  }

  for (const entity of entities) {
    if (entity.row > 1) continue;
    block(entity.col - 1);
    block(entity.col);
    block(entity.col + 1);
  }

  // Margin at both ends.
  block(0);
  block(widthTiles - 1);

  const windows: { start: number; len: number }[] = [];
  let start = -1;

  for (let col = 0; col < widthTiles; col += 1) {
    if (!blocked[col]) {
      if (start < 0) start = col;
      continue;
    }
    if (start >= 0) {
      windows.push({ start, len: col - start });
      start = -1;
    }
  }
  if (start >= 0) windows.push({ start, len: widthTiles - start });

  return windows.filter((w) => w.len >= 2);
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
      safeWindows: findSafeWindows(map.width, platforms, entities),
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
    const widest = chunk.safeWindows.reduce((max, w) => Math.max(max, w.len), 0);
    console.log(
      `  ${chunk.name.padEnd(8)} difficulty ${String(chunk.difficulty).padStart(3)}` +
        `  gapWindows ${String(chunk.safeWindows.length).padStart(2)} (widest ${String(widest).padStart(2)})` +
        `  tiles ${String(chunk.tiles.length).padStart(4)}` +
        `  platforms ${String(chunk.platforms.length).padStart(3)}` +
        `  enemies ${enemies}  hazards ${String(hazards).padStart(2)}  pickups ${pickups}`,
    );
  }
}

await main();
