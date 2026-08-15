# Source assets

Unmodified art and data from the original
[WinterLicht/PepperAndCarrotRunningGame](https://github.com/WinterLicht/PepperAndCarrotRunningGame),
CC-BY 4.0 — see [../../ATTRIBUTION.md](../../ATTRIBUTION.md).

Nothing here is loaded at runtime. The build pipeline (added in M2) reads these and writes to
`assets/generated/`, which is gitignored.

| Directory | Contents | Origin |
|---|---|---|
| `sprites/` | 140 loose PNGs — character/enemy animation frames, UI, nine-patches | `desktop/skin/` |
| `tilesets/` | `tiles2` (475×665), `ground`, `enemies`, `potions`, `ingredients` | `android/assets/` |
| `backgrounds/` | 1280×720 backdrops + `top_bg` (1280×123), `loading_screen` | `android/assets/` |
| `levels/` | 8 Tiled TMX maps | `android/assets/` |
| `fonts/` | 4 AngelCode bitmap fonts (`.fnt` + page PNG) | `android/assets/` |
| `particles/` | 3 libGDX particle effects | `android/assets/` |
| `branding/` | Webcomic logo and game icon | `android/assets/` |

## Deliberately not copied

`skin.png`…`skin10.png` and `skin.atlas` — the prebuilt 10-page libGDX atlas. Its pages scatter
single animations across multiple sheets (`pepper_run` spans `skin7/8/9`), so we repack from the
loose `sprites/` PNGs instead. `pack.json` (libGDX packer config) is likewise superseded.

## Known defects in the source data

Carried over verbatim; the pipeline is responsible for correcting them.

- **`fonts/Fondamento60.fnt`** declares `page file="fondamento60.png"` (lowercase) but the file is
  `Fondamento60.png`. Breaks on case-sensitive servers.
- **`fonts/Fondamento60.fnt`** declares `scaleW=512 scaleH=512`; the PNG is 512×**339**. UV math
  must use one or the other consistently, not a mix.
- **`particles/poison-clouds.p`** hardcodes an absolute path from the original author's machine:
  `/home/anya/workspace/PepperAndCarrotRunningGame/desktop/skin/p-cloud.png`.

## Level format notes

TMX **version 1.0** (pre-Tiled-1.2): embedded tilesets, no `.tsx`, layer data **base64 + zlib**.
Tile size 95×95; gameplay maps are 35×7 tiles, `startlevel.tmx` is an empty 7×7 spacer.

GIDs carry Tiled flip flags — mask with `& 0x1FFFFFFF` and apply `0x80000000` (H), `0x40000000`
(V), `0x20000000` (diagonal). These are used heavily in the background and foreground layers.

**There are no object layers.** Entity placement is encoded as tiles in hidden layers whose
tileset tiles carry properties:

| Property | Values |
|---|---|
| `type` | `potion`, `enemy`, `ingredient` |
| `name` | `fly`, `spider`, `ingredient_sour-1..3` |
| `color` | `orange`, `green`, `blue`, `pink` |
| `obstacle` | `deadly` |
| `emitter` | a `.p` filename |

Layer-level properties: `platforms=true` (every non-empty cell becomes a collidable AABB),
`events=true` (scan for the tile properties above), `z-index` (≥50 renders in front of the player).
