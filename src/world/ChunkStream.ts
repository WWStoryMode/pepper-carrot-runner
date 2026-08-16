import type { Platform } from '@/sim/types';
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
 * straight through the bookshelves instead of along them. The original had the
 * same offset — it clamped at the bottom of row 0 — but it also had no reason
 * to care, since its levels were hand-paired rather than streamed.
 */
export const GROUND_Y = 95;

/** How far either side of the player the synthetic ground slab extends. */
const GROUND_REACH = 4000;

export class ChunkStream {
  private readonly selector: ChunkSelector;
  private active: ActiveChunk[] = [];
  private platforms: Platform[] = [];
  private nextId = 0;
  private frontier = 0;
  private dirty = true;

  constructor(
    private readonly data: LevelData,
    rng: Rng,
  ) {
    this.selector = new ChunkSelector(data.chunks, rng);
  }

  get activeChunks(): readonly ActiveChunk[] {
    return this.active;
  }

  get chunkCount(): number {
    return this.active.length;
  }

  reset(startX: number): void {
    this.active = [];
    this.platforms = [];
    this.selector.reset();
    this.frontier = startX;
    this.dirty = true;
  }

  /**
   * Spawn and retire chunks around `playerX`.
   *
   * Returns the chunks that appeared and disappeared this call, so the view can
   * acquire and release its pooled sprites without diffing the whole list.
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
      this.active.push(active);
      spawned.push(active);

      this.frontier += widthPx;
    }

    const cutoff = playerX - BEHIND;
    while (this.active.length > 0 && this.active[0]!.x + this.active[0]!.widthPx < cutoff) {
      retired.push(this.active.shift()!);
    }

    if (spawned.length > 0 || retired.length > 0) this.dirty = true;

    return { spawned, retired };
  }

  /**
   * Collidable surfaces for the active window, including the ground plane.
   *
   * Rebuilt only when the chunk window changes; the ground slab is repositioned
   * every call, which is one object rather than an allocation per frame.
   */
  getPlatforms(playerX: number): readonly Platform[] {
    if (this.dirty) {
      this.rebuildPlatforms();
      this.dirty = false;
    }

    const ground = this.platforms[0] as { x: number; y: number; width: number; height: number };
    ground.x = playerX - GROUND_REACH;
    ground.y = GROUND_Y;
    ground.width = GROUND_REACH * 2;

    return this.platforms;
  }

  private rebuildPlatforms(): void {
    const { tileWidth, tileHeight } = this.data;

    // Slot 0 is the mutable ground slab; everything after is chunk geometry.
    const next: Platform[] = [{ x: 0, y: GROUND_Y, width: 0, height: 400 }];

    for (const active of this.active) {
      const chunk = this.data.chunks[active.index]!;
      for (const run of chunk.platforms) {
        next.push({
          x: active.x + run.col * tileWidth,
          // `row` counts from the bottom, and the collidable surface is the
          // tile's top edge.
          y: (run.row + 1) * tileHeight,
          width: run.len * tileWidth,
          height: tileHeight,
        });
      }
    }

    this.platforms = next;
  }
}
