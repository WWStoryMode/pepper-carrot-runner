# Pepper&Carrot Runner

An endless runner set in David Revoy's [Pepper&Carrot](https://www.peppercarrot.com/) universe —
and a **worked example of how a 2D game is made**.

### **[▶ Play it](https://wwstorymode.github.io/pepper-carrot-runner/)**   ·   **[📖 Read how it was built](docs/)**

---

## What this repository is for

This is a finished, playable game. It is also **teaching material**, which is the actual reason
it exists.

Most people learning game development get either a toy tutorial that omits everything difficult,
or a real codebase with no explanation of *why* it is shaped that way. This is a real game with
the reasoning kept: why the physics run on their own clock, why milestone one had no art in it at
all, why the jump had to be measured before a single level was designed.

The written material is aimed at **game designers**. It contains no code to copy and requires no
programming. → **[Start reading](docs/)**

## Where it came from

A [webcomic](https://www.peppercarrot.com/) by **David Revoy**, published under CC-BY — free not
just to read but to *use*. In 2016 **WinterLicht** built a Java runner from it, with art by **Anna
Dorokhova**. It was abandoned in January 2017, and its browser version never worked at all.

This is a reimagining rather than a translation: the art, characters and premise are the
original's; the code is new, and the mechanics were redesigned for the browser. The full story is
in [document 1](docs/1-the-comic-and-the-game.md).

It was built by an AI working with one human over a single session, one milestone at a time, with
every pull request merged by hand. That log — including the buttons that shipped dead three times
— is [document 2](docs/2-building-it-with-ai.md).

## The reading path

| | | |
|---|---|---|
| **1** | [The comic and the game](docs/1-the-comic-and-the-game.md) | Origins, licensing, and why the original stopped working |
| **2** | [Building it with AI](docs/2-building-it-with-ai.md) | The collaboration log, warts and all |
| **3** | [How a 2D game works](docs/3-how-a-2d-game-works.md) | The parts every 2D game is built from |
| **4** | [How a runner works](docs/4-how-a-runner-works.md) | What this genre does differently |
| **5** | [Designing your own](docs/5-designing-your-own.md) | Checklists, work breakdown, reading list |
| **6** | [Walkthrough — the jump](docs/6-walkthrough-the-jump.md) | One feature, end to end |

## Playing

Space, W or ↑ — or tap — to jump; press again in mid-air for a double jump. `R` restarts.
Spells are `V`, `Y`, `X`, `C` once you have collected potions for them. `K` opens the kitchen,
where ingredients gathered on a run brew into permanent upgrades.

## Credits and licence

The art and universe belong to other people, who gave permission:

- **David Revoy** — Pepper&Carrot, characters and universe. CC-BY 4.0.
- **Anna Dorokhova** — the 2D game art. CC-BY 4.0.
- **WinterLicht** and contributors — the original game. GPLv3.

This project is GPLv3. Full details in [ATTRIBUTION.md](ATTRIBUTION.md).

---

# Developing

Built with **Phaser 4 + TypeScript + Vite**. Node 20 (pinned in `.nvmrc`):

```sh
nvm use
npm ci
```

```sh
npm run dev        # dev server with HMR
npm run build      # production build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm test           # unit tests (Vitest)
npm run art        # regenerate the texture atlas, level data and icons
```

`dev` and `build` regenerate the atlas first, so `npm run art` is only needed after changing
something in `assets/src/` while a dev server is already running.

> **Note:** `npm run art` clears `public/art/` before rebuilding it. Running `vite build` on its
> own therefore ships a game with no level data — always use `npm run build`.

### Debug flags

Query parameters, combinable:

| Flag | Effect |
|---|---|
| `?debug=1` | Overlay: hitboxes, platform edges, state, velocity, measured jump arc, fps. Backtick toggles it. |
| `?autopilot=1` | A bot plays, jumping where the course requires it. |
| `?charged=1` | Every ability starts fully charged. |
| `?x=4500` | Start the run at that world position, to inspect one section without replaying. |

### Layout

```
assets/src/     CC-BY source art and level data, never loaded at runtime
scripts/        build-time asset pipeline (atlas, levels, icons)
src/sim/        pure simulation — no Phaser import, unit tested headlessly
src/scenes/     Phaser scenes
src/entities/   views that draw simulation state
src/world/      chunk streaming and the difficulty curve
docs/           the learning material
```

The split matters: `src/sim/` is the game, and it stays testable without a browser.

### Testing

Beyond the unit tests, two harnesses drive the real input pipeline through the Chrome DevTools
Protocol, because unit tests do not press buttons and screenshots do not either:

```sh
node --experimental-websocket scripts/click-test.mjs    # game-over buttons
node --experimental-websocket scripts/kitchen-test.mjs  # the brewing loop
```

Both need Chrome running with `--remote-debugging-port=9222` and the game served. They exist
because an entire class of "it renders but does nothing" bug shipped three times without any
other check noticing.
