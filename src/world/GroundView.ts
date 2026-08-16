import Phaser from 'phaser';
import type { Platform } from '@/sim/types';
import { GROUND_DEPTH } from './ChunkStream';

/**
 * Paints the floor slabs, so the holes in it are visible.
 *
 * The original drew one endless strip (`Background.java`, `ground.png` with
 * TextureWrap.Repeat) because its floor had no holes. Ours does, so the strip
 * becomes one tile sprite per slab, pooled.
 *
 * `tilePositionX` is set from world position so the texture stays locked to the
 * world rather than sliding as slabs are recycled.
 */
export class GroundView {
  private readonly pool: Phaser.GameObjects.TileSprite[] = [];
  private inUse: Phaser.GameObjects.TileSprite[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly texture: string,
  ) {}

  get activeSpriteCount(): number {
    return this.inUse.length;
  }

  sync(segments: readonly Platform[]): void {
    while (this.inUse.length > segments.length) {
      const spare = this.inUse.pop()!;
      spare.setVisible(false).setActive(false);
      this.pool.push(spare);
    }

    while (this.inUse.length < segments.length) {
      this.inUse.push(this.acquire());
    }

    for (const [index, segment] of segments.entries()) {
      const strip = this.inUse[index]!;
      strip
        .setPosition(segment.x, -segment.y)
        .setSize(segment.width, GROUND_DEPTH)
        .setVisible(true)
        .setActive(true);
      strip.tilePositionX = segment.x;
    }
  }

  clear(): void {
    for (const strip of this.inUse) {
      strip.setVisible(false).setActive(false);
      this.pool.push(strip);
    }
    this.inUse = [];
  }

  private acquire(): Phaser.GameObjects.TileSprite {
    const recycled = this.pool.pop();
    if (recycled !== undefined) return recycled;

    return this.scene.add
      .tileSprite(0, 0, 100, GROUND_DEPTH, this.texture)
      .setOrigin(0, 0)
      .setDepth(-50);
  }
}
