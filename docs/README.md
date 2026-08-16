# How a 2D game is made

Learning material built around a real, finished, playable game — not a toy example.

**[▶ Play it first](https://wwstorymode.github.io/pepper-carrot-runner/)**, for two minutes. The
rest makes more sense once you have died a few times.

## Who this is for

**Game designers**, primarily. There is no code to copy and no programming to learn. Files are
named so you can go and look at the evidence, but every idea stands on its own without opening
one.

It is also useful to a programmer who wants to see how a small 2D game is actually structured,
and to anyone curious about what building software with an AI collaborator really looks like.

## The reading path

Sequential, but each stands alone.

| | | |
|---|---|---|
| **1** | [The comic and the game](1-the-comic-and-the-game.md) | Where the art came from, why it is free to use, and why the original game stopped working |
| **2** | [Building it with AI](2-building-it-with-ai.md) | The collaboration log, including the bugs that shipped three times |
| **3** | [How a 2D game works](3-how-a-2d-game-works.md) | The parts every 2D game is built from |
| **4** | [How a runner works](4-how-a-runner-works.md) | What this genre does differently, and why that makes it a good first project |
| **5** | [Designing your own](5-designing-your-own.md) | Asset checklist, systems checklist, work breakdown, reading list |
| **6** | [Walkthrough — the jump](6-walkthrough-the-jump.md) | One feature traced from intention to what a player feels |

**In a hurry?** Read [5. Designing your own](5-designing-your-own.md). It is the checklists.

**Here for the AI story?** [2. Building it with AI](2-building-it-with-ai.md) stands alone.

## Some things you will find here

- Why the original game **played differently on a 144 Hz monitor** — and what fixes it.
- Why milestone one had **no art at all**, only grey rectangles.
- The **jump envelope**: measure your jump, then design every level against that measurement.
- Why *hearts are for things that hit you, and geometry is for things you hit.*
- A bot that plays the game to prove the levels are possible — and the **three real design flaws
  it caught**.
- A test that **passed for the wrong reason** while the bug it was written for was still present.
- A build that **scored better on performance because it was broken**.

## Poke at the running game

The game has debug flags. Add them to the URL:

| Flag | What it shows |
|---|---|
| `?debug=1` | Hitboxes, platform edges, current state, velocity, the measured arc of your last jump |
| `?autopilot=1` | The bot plays it |
| `?x=4500` | Start further into the run, to inspect one section |

`?debug=1` is the most instructive. Almost every idea in documents 3 and 4 becomes visible.

## Credits

The art and universe belong to other people, who gave permission. See
[ATTRIBUTION.md](../ATTRIBUTION.md) — David Revoy (Pepper&Carrot), Anna Dorokhova (game art),
WinterLicht (the original game).
