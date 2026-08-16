import Phaser from 'phaser';
import type { ActiveChunk, ChunkTile, LevelData } from './types';

/**
 * Draws active chunks as pooled tile images.
 *
 * Sprites are recycled rather than created and destroyed, because an endless
 * runner spawns a chunk every few seconds for as long as the player survives,
 * and Phaser game objects are not cheap to churn. The pool only ever grows to
 * the high-water mark of one window's worth of tiles.
 *
 * The original rendered tile layers by reaching into libGDX's
 * `OrthogonalTiledMapRenderer` from inside an Actor's `draw()` and poking its
 * view bounds — a hack with no browser analogue.
 */

export const tilesetTextureKey = (name: string): string => `tileset:${name}`;

export class ChunkView {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly inUse = new Map<number, Phaser.GameObjects.Image[]>();
  private peakInUse = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly data: LevelData,
  ) {}

  /** Total images allocated, in use or idle — the pool's high-water mark. */
  get poolSize(): number {
    return this.pool.length + this.activeSpriteCount;
  }

  get activeSpriteCount(): number {
    let count = 0;
    for (const sprites of this.inUse.values()) count += sprites.length;
    return count;
  }

  get peakSpriteCount(): number {
    return this.peakInUse;
  }

  spawn(active: ActiveChunk): void {
    const chunk = this.data.chunks[active.index];
    if (chunk === undefined) return;

    const sprites: Phaser.GameObjects.Image[] = [];
    for (const tile of chunk.tiles) {
      sprites.push(this.placeTile(tile, active.x));
    }

    this.inUse.set(active.id, sprites);
    this.peakInUse = Math.max(this.peakInUse, this.activeSpriteCount);
  }

  retire(active: ActiveChunk): void {
    const sprites = this.inUse.get(active.id);
    if (sprites === undefined) return;

    for (const sprite of sprites) {
      sprite.setVisible(false).setActive(false);
      this.pool.push(sprite);
    }
    this.inUse.delete(active.id);
  }

  clear(): void {
    for (const id of [...this.inUse.keys()]) {
      this.retire({ id, index: 0, x: 0, widthPx: 0 });
    }
  }

  private placeTile(tile: ChunkTile, chunkX: number): Phaser.GameObjects.Image {
    const tileset = this.data.tilesets[tile.ts]!;
    const { tileWidth, tileHeight } = this.data;

    // Centre origin so Tiled's diagonal flag can be expressed as a rotation.
    const x = chunkX + tile.col * tileWidth + tileWidth / 2;
    const worldY = tile.row * tileHeight + tileHeight / 2;

    const image = this.acquire();
    image
      .setTexture(tilesetTextureKey(tileset.name), tile.id)
      .setPosition(x, -worldY)
      .setDepth(tile.depth)
      .setVisible(true)
      .setActive(true);

    applyTiledFlags(image, tile);
    return image;
  }

  private acquire(): Phaser.GameObjects.Image {
    const recycled = this.pool.pop();
    if (recycled !== undefined) return recycled;

    const first = this.data.tilesets[0]!;
    return this.scene.add.image(0, 0, tilesetTextureKey(first.name), 0).setOrigin(0.5, 0.5);
  }
}

/**
 * Translate Tiled's three orientation bits into flips and rotation.
 *
 * The diagonal bit is a transpose, which no renderer expresses directly; the
 * six meaningful combinations reduce to a quarter-turn plus a flip. These bits
 * are used heavily in the original's background and foreground layers, so
 * ignoring them visibly scrambles the art.
 */
function applyTiledFlags(image: Phaser.GameObjects.Image, tile: ChunkTile): void {
  image.setRotation(0).setFlip(false, false);

  if (!tile.fd) {
    image.setFlip(tile.fh, tile.fv);
    return;
  }

  if (tile.fh && !tile.fv) {
    image.setRotation(Math.PI / 2);
  } else if (!tile.fh && tile.fv) {
    image.setRotation(-Math.PI / 2);
  } else if (tile.fh && tile.fv) {
    image.setRotation(Math.PI / 2).setFlip(false, true);
  } else {
    image.setRotation(-Math.PI / 2).setFlip(false, true);
  }
}
