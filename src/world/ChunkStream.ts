import {
  ENTITY_SIZES,
  GAP_CHANCE,
  GAP_FULL_DISTANCE,
  GAP_MAX_TILES,
  GAP_MIN_TILES,
  GAP_START_DISTANCE,
} from '@/config/constants';
import type { Platform, SimEntity } from '@/sim/types';
import { ChunkSelector } from './selector';
import type { Rng } from './rng';
import type { ActiveChunk, LevelData } from './types';

/**
 * Keeps a window of chunks alive around the player.
 *
 * Pure logic — no Phaser — so a whole run can be simulated headlessly and
 * checked for stalls or unclearable joins. `ChunkView` renders whatever this
 * reports.
 *
 * The original streamed by shifting every actor's X leftwards each frame
 * (`LevelStream.moveLeft`). We leave chunks at fixed world positions and move
 * the player instead, which means chunk geometry is computed once on spawn
 * rather than mutated 60 times a second.
 */

/**
 * Keep chunks spawned this far ahead of the player.
 *
 * Comfortably more than one chunk width (35 × 95 = 3325) so there is always a
 * full chunk of runway beyond the visible 1280, whatever the join positions.
 */
const AHEAD = 4200;

/** Retire chunks once their right edge is this far behind. */
const BEHIND = 1600;

/**
 * The continuous floor the level data assumes.
 *
 * `level2.tmx` has nothing on row 0 at all: the original ran the player along
 * `Constants.OFFSET_TO_GROUND` and painted `ground.png` behind it, treating the
 * tile layers as shelves above that plane. Without this the maps are not
 * traversable.
 *
 * The value is one tile up, not zero, so the floor is **flush with the top of
 * row 0**. Placing it at zero puts the walking surface a tile below the maps'
 * own ground tiles, and because platforms are one-way the player then runs
 * straight through the bookshelves rather than along them.
 */
export const GROUND_Y = 95;

/** Depth of the floor slab, for rendering and for side-collision extents. */
export const GROUND_DEPTH = 400;

/** Runway painted to the left of the first chunk, so the view is never empty. */
const GROUND_LEAD_IN = 2000;

/** A hole in the floor. */
export interface Gap {
  readonly x: number;
  readonly width: number;
}

export class ChunkStream {
  private readonly selector: ChunkSelector;
  private active: ActiveChunk[] = [];
  private gaps = new Map<number, Gap>();
  private entitiesByChunk = new Map<number, SimEntity[]>();

  private platforms: Platform[] = [];
  private groundSegments: Platform[] = [];
  private entities: SimEntity[] = [];

  private nextId = 0;
  private nextEntityId = 0;
  private frontier = 0;
  private dirty = true;

  constructor(
    private readonly data: LevelData,
    private readonly rng: Rng,
  ) {
    this.selector = new ChunkSelector(data.chunks, rng);
  }

  get activeChunks(): readonly ActiveChunk[] {
    return this.active;
  }

  get chunkCount(): number {
    return this.active.length;
  }

  /** Floor slabs, exposed so the renderer can paint the gaps it implies. */
  get ground(): readonly Platform[] {
    this.ensureBuilt();
    return this.groundSegments;
  }

  get activeEntities(): readonly SimEntity[] {
    this.ensureBuilt();
    return this.entities;
  }

  gapFor(chunkId: number): Gap | undefined {
    return this.gaps.get(chunkId);
  }

  reset(startX: number): void {
    this.active = [];
    this.gaps.clear();
    this.entitiesByChunk.clear();
    this.platforms = [];
    this.groundSegments = [];
    this.entities = [];
    this.selector.reset();
    this.frontier = startX;
    this.dirty = true;
  }

  /**
   * Spawn and retire chunks around `playerX`.
   *
   * Returns what appeared and disappeared, so views can acquire and release
   * pooled objects without diffing the whole list.
   */
  update(playerX: number): { spawned: ActiveChunk[]; retired: ActiveChunk[] } {
    const spawned: ActiveChunk[] = [];
    const retired: ActiveChunk[] = [];

    while (this.frontier < playerX + AHEAD) {
      const index = this.selector.next(Math.max(0, this.frontier));
      const chunk = this.data.chunks[index]!;
      const widthPx = chunk.widthTiles * this.data.tileWidth;

      const active: ActiveChunk = { index, x: this.frontier, widthPx, id: this.nextId };
      this.nextId += 1;

      const gap = this.chooseGap(active);
      if (gap !== null) this.gaps.set(active.id, gap);
      this.entitiesByChunk.set(active.id, this.buildEntities(active, gap));

      this.active.push(active);
      spawned.push(active);
      this.frontier += widthPx;
    }

    const cutoff = playerX - BEHIND;
    while (this.active.length > 0 && this.active[0]!.x + this.active[0]!.widthPx < cutoff) {
      const gone = this.active.shift()!;
      this.gaps.delete(gone.id);
      this.entitiesByChunk.delete(gone.id);
      retired.push(gone);
    }

    if (spawned.length > 0 || retired.length > 0) this.dirty = true;

    return { spawned, retired };
  }

  /** Collidable surfaces for the active window, floor included. */
  getPlatforms(): readonly Platform[] {
    this.ensureBuilt();
    return this.platforms;
  }

  /**
   * Decide whether this chunk gets a hole in the floor, and how wide.
   *
   * Gaps widen with distance and are confined to the chunk's safe windows —
   * column ranges computed at build time that carry no ground-level tiles and
   * nothing low enough to be stranded. Chunks with no safe window (level6 and
   * level7, whose floors are dense) simply never get one.
   */
  private chooseGap(active: ActiveChunk): Gap | null {
    const chunk = this.data.chunks[active.index]!;
    if (chunk.safeWindows.length === 0) return null;
    if (active.x < GAP_START_DISTANCE) return null;
    if (this.rng.next() > GAP_CHANCE) return null;

    const progress = Math.min(
      1,
      Math.max(0, (active.x - GAP_START_DISTANCE) / (GAP_FULL_DISTANCE - GAP_START_DISTANCE)),
    );
    const tiles = GAP_MIN_TILES + Math.round((GAP_MAX_TILES - GAP_MIN_TILES) * progress);

    const candidates = chunk.safeWindows.filter((w) => w.len >= tiles);
    if (candidates.length === 0) return null;

    const window = candidates[this.rng.int(candidates.length)]!;
    const offset = this.rng.int(window.len - tiles + 1);
    const col = window.start + offset;

    return {
      x: active.x + col * this.data.tileWidth,
      width: tiles * this.data.tileWidth,
    };
  }

  /** Instantiate a chunk's entities in world coordinates. */
  private buildEntities(active: ActiveChunk, gap: Gap | null): SimEntity[] {
    const chunk = this.data.chunks[active.index]!;
    const { tileWidth, tileHeight } = this.data;
    const out: SimEntity[] = [];

    for (const entity of chunk.entities) {
      const x = active.x + (entity.col + 0.5) * tileWidth;

      // Anything that would hang over a hole is dropped rather than left
      // floating; safe windows make this rare, but joins can still surprise us.
      if (gap !== null && x > gap.x - tileWidth && x < gap.x + gap.width + tileWidth) continue;

      const size = ENTITY_SIZES[entity.kind === 'enemy' ? entity.name : entity.kind] ?? tileWidth;

      out.push({
        id: this.nextEntityId++,
        kind: entity.kind,
        name: entity.name,
        x,
        y: (entity.row + 0.5) * tileHeight,
        halfWidth: size / 2,
        halfHeight: size / 2,
        alive: true,
        touched: false,
        collected: false,
      });
    }

    return out;
  }

  private ensureBuilt(): void {
    if (!this.dirty) return;
    this.rebuild();
    this.dirty = false;
  }

  private rebuild(): void {
    const { tileWidth, tileHeight } = this.data;

    this.groundSegments = this.buildGround();

    const platforms: Platform[] = [...this.groundSegments];

    for (const active of this.active) {
      const chunk = this.data.chunks[active.index]!;
      for (const run of chunk.platforms) {
        const bottom = run.row * tileHeight;

        platforms.push({
          x: active.x + run.col * tileWidth,
          // `row` counts from the bottom, and the collidable surface is the
          // tile's top edge.
          y: (run.row + 1) * tileHeight,
          width: run.len * tileWidth,
          height: tileHeight,
          // Only things standing on the floor block you. A crate in your path
          // is a fair obstacle; a shelf hanging in mid-air is not, because
          // there is nothing to read at ground level that says "jump now".
          // Playtest feedback after M4, where every raised shelf was solid.
          ...(bottom > GROUND_Y ? { noSides: true } : {}),
        });
      }
    }

    this.platforms = platforms;

    this.entities = [];
    for (const active of this.active) {
      const owned = this.entitiesByChunk.get(active.id);
      if (owned !== undefined) this.entities.push(...owned);
    }
  }

  /**
   * Cut the floor into slabs around the holes.
   *
   * `noSides` keeps the lips of a gap from registering as walls: falling down a
   * hole and clipping the far edge should read as a fall, not a crash.
   */
  private buildGround(): Platform[] {
    if (this.active.length === 0) return [];

    const first = this.active[0]!;
    const last = this.active[this.active.length - 1]!;

    const holes = this.active
      .map((active) => this.gaps.get(active.id))
      .filter((gap): gap is Gap => gap !== undefined)
      .sort((a, b) => a.x - b.x);

    const segments: Platform[] = [];
    let cursor = first.x - GROUND_LEAD_IN;
    const end = last.x + last.widthPx;

    for (const hole of holes) {
      if (hole.x > cursor) {
        segments.push({
          x: cursor,
          y: GROUND_Y,
          width: hole.x - cursor,
          height: GROUND_DEPTH,
          noSides: true,
        });
      }
      cursor = Math.max(cursor, hole.x + hole.width);
    }

    if (end > cursor) {
      segments.push({
        x: cursor,
        y: GROUND_Y,
        width: end - cursor,
        height: GROUND_DEPTH,
        noSides: true,
      });
    }

    return segments;
  }
}
