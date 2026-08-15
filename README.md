# Pepper&Carrot Runner

An endless runner set in the [Pepper&Carrot](https://www.peppercarrot.com/) universe, built for
the browser with **Phaser 4 + TypeScript + Vite**.

This is a web reimagining of [WinterLicht/PepperAndCarrotRunningGame](https://github.com/WinterLicht/PepperAndCarrotRunningGame),
an unfinished Java/libGDX game last updated in January 2017. It keeps the original's art,
characters and premise, but redesigns the mechanics, progression and UI for the web.

See [ATTRIBUTION.md](ATTRIBUTION.md) for credits and asset licensing.

## Requirements

Node 20 (pinned in `.nvmrc`):

```sh
nvm use
npm ci
```

## Development

```sh
npm run dev        # dev server with HMR
npm run build      # production build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm test           # unit tests (Vitest)
npm run art        # regenerate the texture atlas
```

`dev` and `build` regenerate the atlas first, so `npm run art` is only needed after
changing something in `assets/src/` while a dev server is already running.

### Debug flags

Query parameters, combinable:

| Flag | Effect |
|---|---|
| `?debug=1` | Overlay: hitboxes, platform edges, state, velocity, measured jump arc, fps. Backtick toggles it. |
| `?autopilot=1` | A bot plays, jumping where the course requires it. |
| `?x=4500` | Start the run at that world position, to inspect one section without replaying. |

### Controls

Space / W / ↑ or tap to jump (twice for a double jump), R to restart.

## Layout

```
assets/src/     CC-BY source art and level data, never loaded at runtime
scripts/        build-time asset pipeline
src/sim/        pure simulation — no Phaser import, unit tested headlessly
src/scenes/     Phaser scenes
src/entities/   views that draw simulation state
```

The split matters: `src/sim/` is the game, and it stays testable without a browser.

## Contributing

Work proceeds in milestones. Each milestone gets its own branch (`feat/mN-<slug>`), is tested
locally, and lands on `main` via a pull request. CI runs a production build on every PR.
