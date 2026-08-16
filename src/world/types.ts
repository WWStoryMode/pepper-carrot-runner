/**
 * Runtime shape of `public/art/levels.json`, produced by `scripts/build-levels.ts`.
 *
 * Positions are in **tiles**, with `row` counted from the bottom so it converts
 * to world Y by multiplication. Nothing here knows about Phaser.
 */

export interface TilesetData {
  readonly name: string;
  readonly image: string;
  readonly columns: number;
  readonly tileCount: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export interface ChunkTile {
  /** Index into `LevelData.tilesets`. */
  readonly ts: number;
  /** Tile index within that tileset. */
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly depth: number;
  readonly fh: boolean;
  readonly fv: boolean;
  readonly fd: boolean;
}

/** A horizontal run of collidable tiles, merged at build time. */
export interface ChunkPlatform {
  readonly col: number;
  readonly row: number;
  readonly len: number;
}

export type EntityKind = 'enemy' | 'potion' | 'ingredient' | 'hazard';

export interface ChunkEntity {
  readonly kind: EntityKind;
  readonly name: string;
  readonly col: number;
  readonly row: number;
  readonly emitter?: string;
}

export interface ChunkData {
  readonly name: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  /** Derived from hazard and enemy content; higher is harder. */
  readonly difficulty: number;
  readonly tiles: readonly ChunkTile[];
  readonly platforms: readonly ChunkPlatform[];
  readonly entities: readonly ChunkEntity[];
}

export interface LevelData {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly playerDepth: number;
  readonly tilesets: readonly TilesetData[];
  readonly chunks: readonly ChunkData[];
}

/** A chunk currently in the world. */
export interface ActiveChunk {
  /** Index into `LevelData.chunks`. */
  readonly index: number;
  /** World X of the chunk's left edge. */
  readonly x: number;
  readonly widthPx: number;
  /** Monotonic id, so views can key their pooled objects. */
  readonly id: number;
}
