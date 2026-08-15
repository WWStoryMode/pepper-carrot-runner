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
```

Append `?debug=1` to the URL to enable the debug overlay.

## Contributing

Work proceeds in milestones. Each milestone gets its own branch (`feat/mN-<slug>`), is tested
locally, and lands on `main` via a pull request. CI runs a production build on every PR.
