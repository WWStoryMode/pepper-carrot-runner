/**
 * Build-time asset pipeline.
 *
 * Repacks the loose CC-BY source art into a Phaser multiatlas and re-encodes
 * everything as WebP.
 *
 * We deliberately do not reuse the original's shipped `skin.atlas`: its ten
 * 1024×1024 pages were packed without regard for grouping, so a single
 * animation is split across sheets (`pepper_run` spans skin7, skin8 and skin9),
 * which costs a texture bind per frame. Packing from the 140 loose PNGs in
 * `desktop/skin/` — the original's actual source of truth — also lets us trim
 * transparent margins, which matters when 30 of the frames are 380×380 squares
 * of a character that fills maybe half of one.
 *
 * Output goes to `public/`, which Vite serves at the root and copies into
 * `dist/`. It is gitignored: this script is the source of truth, not its output.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { MaxRectsPacker } from 'maxrects-packer';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const SPRITE_DIR = join(root, 'assets/src/sprites');
const BACKGROUND_DIR = join(root, 'assets/src/backgrounds');
const OUT_DIR = join(root, 'public/art');

/** Max atlas page. 2048 is safe on every WebGL target we care about. */
const PAGE_SIZE = 2048;

/** Transparent gutter between frames, so linear filtering cannot bleed. */
const PADDING = 2;

/** Alpha at or below this counts as empty when trimming. */
const ALPHA_THRESHOLD = 0;

/** Standalone textures: tiled or full-screen, so they stay out of the atlas. */
const STANDALONE = ['testbg.png', 'kitchen.png'];

/** What we hand the packer: a box to place, carrying its sprite along. */
interface PackedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  sprite: Trimmed;
}

interface Trimmed {
  readonly name: string;
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

/**
 * Find the opaque bounding box by scanning alpha directly.
 *
 * sharp exposes a `.trim()` whose offset reporting has changed shape between
 * versions; scanning 140 small images ourselves costs milliseconds and cannot
 * drift underneath us.
 */
function opaqueBounds(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { left: number; top: number; right: number; bottom: number } | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + (channels - 1)] ?? 0;
      if (alpha <= ALPHA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  return right < 0 ? null : { left, top, right, bottom };
}

async function trimSprite(file: string): Promise<Trimmed> {
  const name = basename(file, '.png');
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const bounds = opaqueBounds(data, info.width, info.height, info.channels);

  // Fully transparent frames still need to exist so animation indices line up
  // (`sparkling_04` and `_05` are all but empty); a 1×1 hole is enough.
  const box = bounds ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const width = box.right - box.left + 1;
  const height = box.bottom - box.top + 1;

  const buffer = await sharp(file)
    .ensureAlpha()
    .extract({ left: box.left, top: box.top, width, height })
    .png()
    .toBuffer();

  return {
    name,
    buffer,
    width,
    height,
    offsetX: box.left,
    offsetY: box.top,
    sourceWidth: info.width,
    sourceHeight: info.height,
  };
}

async function packSprites(): Promise<{ pages: number; bytes: number }> {
  const files = (await readdir(SPRITE_DIR))
    .filter((f) => f.endsWith('.png'))
    // Nine-patch sources carry a 1 px guide border and need their own handling;
    // the UI milestone deals with them.
    .filter((f) => !f.endsWith('.9.png'))
    .sort();

  const sprites = await Promise.all(files.map((f) => trimSprite(join(SPRITE_DIR, f))));

  const packer = new MaxRectsPacker<PackedRect>(PAGE_SIZE, PAGE_SIZE, PADDING, {
    smart: true,
    pot: false,
    square: false,
    allowRotation: false,
  });

  // `x`/`y` are placeholders — the packer assigns them. Padding is the packer's
  // job too, so the sizes here are the true trimmed sizes.
  packer.addArray(
    sprites.map((sprite) => ({
      x: 0,
      y: 0,
      width: sprite.width,
      height: sprite.height,
      sprite,
    })),
  );

  const textures: unknown[] = [];
  let bytes = 0;

  for (const [index, bin] of packer.bins.entries()) {
    const image = `atlas-${index}.webp`;

    const composites = bin.rects.map((rect) => ({
      input: rect.sprite.buffer,
      left: rect.x,
      top: rect.y,
    }));

    const png = await sharp({
      create: {
        width: bin.width,
        height: bin.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    // The art is painted rather than pixel art, so q95 is visually lossless on
    // colour while halving the payload against true lossless (2.36 → 1.07 MiB
    // for page 0). Alpha stays lossless: these are cutout sprites, and a soft
    // alpha edge reads as a halo against the dark background.
    const webp = await sharp(png)
      // Dropped from 95 to 82 after comparing crops at 2x: on this soft-shaded
      // painted art the difference is invisible, and in game the sprites draw
      // at 0.62 scale. It takes the atlas from 1624 KB to 1120 KB, which is
      // decode time off the boot path as much as it is bytes off the wire.
      // Alpha stays lossless — the sprites are cut out, and fringing on an edge
      // would show where colour banding does not.
      .webp({ quality: 82, alphaQuality: 100, effort: 6 })
      .toBuffer();
    await writeFile(join(OUT_DIR, image), webp);
    bytes += webp.length;

    textures.push({
      image,
      format: 'RGBA8888',
      size: { w: bin.width, h: bin.height },
      scale: 1,
      frames: bin.rects.map(({ sprite, x, y }) => {
        return {
          filename: sprite.name,
          rotated: false,
          trimmed:
            sprite.width !== sprite.sourceWidth || sprite.height !== sprite.sourceHeight,
          sourceSize: { w: sprite.sourceWidth, h: sprite.sourceHeight },
          spriteSourceSize: {
            x: sprite.offsetX,
            y: sprite.offsetY,
            w: sprite.width,
            h: sprite.height,
          },
          frame: { x, y, w: sprite.width, h: sprite.height },
        };
      }),
    });
  }

  const json = {
    textures,
    meta: {
      app: 'pepper-carrot-runner/scripts/pack-atlas.ts',
      version: '1.0',
      // Lets us confirm at a glance that the checked-out art produced this atlas.
      source: createHash('sha1')
        .update(sprites.map((s) => `${s.name}:${s.width}x${s.height}`).join('|'))
        .digest('hex')
        .slice(0, 12),
    },
  };

  await writeFile(join(OUT_DIR, 'atlas.json'), JSON.stringify(json));

  return { pages: packer.bins.length, bytes };
}

async function convertStandalone(): Promise<number> {
  let bytes = 0;

  for (const file of STANDALONE) {
    const name = basename(file, '.png');
    // Tiling texture: lossless, because block artefacts would repeat visibly.
    const webp = await sharp(join(BACKGROUND_DIR, file))
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    await writeFile(join(OUT_DIR, `${name}.webp`), webp);
    bytes += webp.length;
  }

  return bytes;
}

async function main(): Promise<void> {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const { pages, bytes: atlasBytes } = await packSprites();
  const standaloneBytes = await convertStandalone();

  const total = atlasBytes + standaloneBytes;
  const mib = (n: number): string => `${(n / 1024 / 1024).toFixed(2)} MiB`;

  const manifest = await readFile(join(OUT_DIR, 'atlas.json'), 'utf8');
  const frameCount = (JSON.parse(manifest) as { textures: { frames: unknown[] }[] }).textures
    .reduce((sum, t) => sum + t.frames.length, 0);

  console.log(`atlas      ${pages} page(s), ${frameCount} frames, ${mib(atlasBytes)}`);
  console.log(`standalone ${STANDALONE.length} texture(s), ${mib(standaloneBytes)}`);
  console.log(`total      ${mib(total)}`);
}

await main();
