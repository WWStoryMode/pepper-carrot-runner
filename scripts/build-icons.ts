/**
 * Generate the favicon, app icons and social card.
 *
 * Derived from the upstream game's own 256×256 icon rather than drawn fresh, so
 * the tab icon is the thing this game has always been. Generated rather than
 * committed as binaries so the provenance stays visible and the sizes can change
 * without anyone hand-exporting PNGs.
 *
 * Output goes to `public/` root, not `public/art/` — `pack-atlas.ts` clears that
 * directory wholesale on every run.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'assets/src/branding/Pepper_And_Carrot_Running_Game.png');
const OUT = join(root, 'public');

/** Matches `COLORS.black`, so the icon padding meets the page seamlessly. */
const BACKGROUND = { r: 0x11, g: 0x04, b: 0x10, alpha: 1 };

/** Square icons: the favicon plus the sizes iOS and Android ask for. */
const SIZES = [32, 180, 192, 512];

const SOCIAL = { width: 1200, height: 630 };

async function buildIcons(): Promise<void> {
  for (const size of SIZES) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover' })
      // Palette-quantised: the source is 256×256, so the larger sizes are
      // upscales that gain no detail and have no business costing half a
      // megabyte apiece.
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(join(OUT, `icon-${size}.png`));
  }

  // A dedicated favicon name, so the <link> does not have to know a pixel size.
  await sharp(SOURCE)
    .resize(48, 48, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, 'favicon.png'));
}

async function buildSocialCard(): Promise<void> {
  const art = await sharp(SOURCE).resize(300, 300, { fit: 'cover' }).toBuffer();

  // Text is drawn as SVG rather than composited from art: the game's bitmap
  // fonts are ASCII-only atlases meant for the canvas, not for still images.
  const caption = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL.width}" height="${SOCIAL.height}">
       <text x="550" y="286" font-family="Georgia, serif" font-size="62" fill="#D0A381">Pepper&amp;Carrot</text>
       <text x="550" y="358" font-family="Georgia, serif" font-size="62" fill="#F1E6D5">Runner</text>
       <text x="552" y="416" font-family="monospace" font-size="22" fill="#7D7D7D">an endless run through the potion cellar</text>
     </svg>`,
  );

  await sharp({
    create: {
      width: SOCIAL.width,
      height: SOCIAL.height,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([
      { input: art, left: 180, top: 165 },
      { input: caption, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, 'social.png'));
}

async function buildManifest(): Promise<void> {
  const manifest = {
    name: 'Pepper&Carrot Runner',
    short_name: 'P&C Runner',
    description: "An endless runner through Pepper's potion cellar.",
    // Relative, because the game is served from a project subpath on Pages and
    // an absolute "/" would resolve to the domain root.
    start_url: './',
    scope: './',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#110410',
    theme_color: '#110410',
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  await writeFile(join(OUT, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
}

await mkdir(OUT, { recursive: true });
await buildIcons();
await buildSocialCard();
await buildManifest();

console.log(`icons: ${SIZES.length + 1} PNGs, a social card and a manifest → public/`);
