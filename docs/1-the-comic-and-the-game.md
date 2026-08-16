# 1. The comic and the game

Every asset in this repository — every frame of Pepper's run cycle, every tile of the potion
cellar — was drawn by someone else, for something else, and given away. This document is about
who they were and what that permission actually means, because it is the reason the rest of this
repository is allowed to exist.

## Pepper&Carrot

**[Pepper&Carrot](https://www.peppercarrot.com/)** is a webcomic by **David Revoy**, a French
illustrator and concept artist. It follows Pepper, a young witch, and her cat Carrot through a
world of potion-brewing and magical rivalry. It has run since 2014 and is translated into dozens
of languages by volunteers.

Two things make it unusual, and both matter here.

The first is how it is funded. There is no publisher and no paywall. Readers pay what they like
through a patronage model, and every episode is published free the day it is finished. The comic
is not a product with a marketing site attached; the comic *is* the thing.

The second is the licence: **[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)**
(CC-BY 4.0). Not "free to read" — free to *use*. You may copy it, translate it, remix it, print
it, sell it, or build a video game out of it. The single obligation is that you credit the
source.

Revoy goes further than the licence requires. The sources are published too — the layered Krita
files, the brushes, the character reference sheets. If you want to draw Pepper yourself, the
same files he works from are downloadable.

This is why a fan game exists at all, and why this repository can carry 140 sprite files without
a lawyer being involved. Most game art you find online is "free" in the sense of costing nothing
while remaining legally untouchable. This is genuinely free, and the price is a credit line.

> **For designers:** the licence of your art is a production constraint, not paperwork. It
> decides whether you can ship, modify, or sell what you make. Settle it before you build on
> top of something, not after. See [ATTRIBUTION.md](../ATTRIBUTION.md) for how this project
> discharges its obligations.

## The original game

In 2016, a developer working as **WinterLicht** built an endless runner in the Pepper&Carrot
universe, with 2D game art by **Anna Dorokhova**. It was written in Java using
**[libGDX](https://libgdx.com/)**, targeting desktop and Android, and released under the
**GNU GPLv3**. It lives at
[WinterLicht/PepperAndCarrotRunningGame](https://github.com/WinterLicht/PepperAndCarrotRunningGame).

It is a real game, not a demo. Pepper runs left to right, jumps and double-jumps, collects
coloured potions, and casts four distinct spells. There are flies and spiders to kill, green
sludge that kills you instantly, and a kitchen where ingredients gathered during a level are
brewed into potions and fed to a ghost.

It is also, in a few places, quietly not what it appears to be — which turns out to be the most
useful thing about it as a teaching subject.

**It is not endless.** Despite being an endless runner, difficulty was a hand-written list of
level-segment filenames per level, growing from five segments to nine. Reach the end of the list
and you win. The genre's defining feature — content that never runs out — was never built.

**The ghost does nothing.** You gather ingredients, you brew them, you feed the ghost, and the
ghost changes colour. That is the entire reward. Every part of a meta-progression system is
present except the part where it affects the game.

**A whole overworld was designed and never connected.** There is a data file describing twelve
map nodes with typed edges and unlock conditions, fully modelled — and commented out in favour
of ten hard-coded buttons.

None of this is incompetence. It is what an unfinished game looks like from the inside, and
every designer should recognise the shape: the systems that got built, the systems that got
designed and abandoned, and the gap between them.

## Why it stopped, and why that is instructive

The last substantial commit is **January 2017**.

The project had a browser target from the start — a `html` module using GWT, which compiles Java
to JavaScript. It has never worked. Trying to build it today, the reasons stack up immediately:
it pins GWT 2.6.0 and libGDX 1.9.2, both long superseded; it depends on a Gradle plugin that has
since been removed from Gradle itself; its `index.html` references three files that are not in
the repository; its launcher is the untouched 480×320 template; and the core module depends on a
submodule that was never vendored.

So the game runs today only if you can assemble a 2017 Java toolchain. Its art is CC-BY and its
code is open, and it is still effectively unplayable for anyone who is not prepared to do
archaeology.

> **The lesson:** a game is not preserved by publishing its source. It is preserved by being
> *runnable*. The web is the most durable target available — a browser from 2016 still opens a
> page written today. That, rather than nostalgia, is the argument for this port.

## What this project did with it

This repository is a **reimagining, not a translation**. The code is new, written in TypeScript
against [Phaser 4](https://phaser.io/). The art, characters and premise are the original's. The
mechanics were redesigned for the browser:

| | Original (2016) | This version |
|---|---|---|
| Endlessness | Hand-authored segment list, then victory | Procedural streaming, difficulty curve |
| Physics | Tied to frame rate — a 144 Hz monitor played a different game | Fixed timestep, frame-rate independent |
| Falling | Impossible; the player was clamped above a floor | Lethal pits you must clear |
| Platform faces | Ran straight through them | Solid, if they rest on the floor |
| Input forgiveness | None | Coyote time and jump buffering |
| Meta-progression | Ghost changes colour | Ingredients brew permanent upgrades |
| Score | None | Distance and a personal best |
| Audio | None whatsoever | Synthesised cues |

The original is treated as *reference, not specification*. Where it was good — the four
abilities, the jump feel, the art direction — it was reproduced exactly, down to the frame
timings. Where it was broken, the break is documented and fixed. Both halves are in
[the walkthrough](6-walkthrough-the-jump.md).

## Credit where it is owed

- **David Revoy** — Pepper&Carrot, its characters and universe. CC-BY 4.0.
- **Anna Dorokhova** — the 2D game art. CC-BY 4.0.
- **WinterLicht**, with momsen, Marko J, Craig Maloney and calimeroteknik — the original game.
  GPLv3.

Full terms in [ATTRIBUTION.md](../ATTRIBUTION.md).

---

Next: [2. Building it with AI](2-building-it-with-ai.md) — how this port was actually made, including
what went wrong.
