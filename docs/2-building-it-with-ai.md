# 2. Building it with AI

This port was written by an AI (Claude) working with one human, over a single extended session.
This document is the log. It is deliberately unflattering in places, because the failures are
the part you can learn something from — a list of things that went right teaches nobody
anything.

## The arrangement

The division of labour settled early and never changed:

- **The human** decided what to build, judged whether it felt good, playtested every milestone,
  and merged every pull request by hand.
- **The AI** read the original Java, designed the architecture, wrote the code and the tests,
  and reported what it had and had not verified.

The workflow was fixed by the human at the start and treated as non-negotiable:

```
branch → implement → test locally → push → open a PR → STOP
```

The AI never merged its own work. Every one of the nine milestones waited for a human to look at
it. That single rule is responsible for most of what went well, for reasons that become obvious
below.

## The milestones

Nine branches, nine pull requests, each one playable on its own.

| | Milestone | What it delivered |
|---|---|---|
| M0 | Scaffold | Repo, toolchain, CI, vendored CC-BY art, licence and attribution |
| M1 | Runner core | Fixed-timestep physics, jump feel, one-way platforms — **grey rectangles, no art** |
| M2 | Art pipeline | Texture atlas build step, animations, Pepper and Carrot on screen |
| M3 | Endless streaming | Original levels cut into chunks, streamed with a difficulty curve |
| M4 | Hazards and pickups | Enemies, lethal pits, side collision, health, potions, ingredients |
| M5 | Abilities | All four spells, rebuilt for touch |
| M6 | Shell, audio, responsive | Title, pause, game over, camera framing, sound, gamepad |
| M7 | Meta-progression | The kitchen: ingredients brew into permanent upgrades |
| M8 | Polish and deploy | Loading screen, error boundary, icons, GitHub Pages |

The ordering is not arbitrary and is worth stealing — it is explained in
[5. Designing your own](5-designing-your-own.md#work-breakdown).

## What the AI was good at

**Archaeology.** The first task was to read roughly 1,500 lines of unfamiliar Java and work out
what the game actually did. The output was a table of every physical constant with its origin —
gravity as `speedY -= 1` per frame, a jump impulse of 26 pixels per frame — converted into
frame-rate-independent units. That table became [`src/config/constants.ts`](../src/config/constants.ts)
and is still the single source of truth for how the game feels. This is genuinely tedious work
that AI does well.

**Finding bugs in the source it was reading.** The original's horizontal overlap test uses `||`
where `&&` was clearly meant, making ledges far more forgiving than intended. Its save-file
loader is missing a `break` in a `switch`, so one statistic silently overwrites itself on every
load. Neither had been noticed in the intervening decade.

**Architecture that pays off later.** The decision in M1 to put the rules of the game in
[`src/sim/`](../src/sim/) with no reference to the rendering library meant 106 tests run in under
a second with no browser. Physics could be verified by arithmetic rather than by looking.

**Building tools to check its own work.** When generated levels needed validating, the AI wrote
an autopilot ([`src/sim/autopilot.ts`](../src/sim/autopilot.ts)) that plays the game. It found
three real design flaws — see [4. How a runner works](4-how-a-runner-works.md#validating-levels-automatically).

## What went wrong

### The buttons that did nothing, three times

The game-over screen shipped with **both buttons completely dead**. It was fixed. It shipped
broken again. It was fixed again. It shipped broken a third time.

1. **First:** the buttons were built inside Phaser `Container`s and relied on the framework
   inferring a clickable region. It inferred nothing.
2. **Second:** a tap-anywhere-to-restart handler on the scene fired *before* the buttons and
   swallowed every press. The human diagnosed this one correctly from symptoms alone: *"The
   problem may be because I can restart the game tap anywhere on screen."*
3. **Third:** the clickable regions were offset by exactly half a button, because the framework
   adds the object's origin before hit-testing. Hovering over one button highlighted its
   neighbour.

**The human found all three.** Not the type checker, not the 100-odd unit tests, not the
screenshots.

### The test that passed for the wrong reason

After the second failure the AI wrote a test that drove real mouse input through the browser and
clicked the buttons. It passed — while the third bug was present.

The test clicked each button's **exact centre**. The hit area was displaced by half a button, so
the centre landed precisely on the corner of the displaced rectangle. A boundary counts as
inside. The click registered, the test went green, and the bug shipped.

> A passing test proves nothing until you have watched it fail. The fix was to click
> deliberately off-centre and to assert *which* button the framework believed was under the
> cursor.

### A broken build that scored better

During the final performance work, one Lighthouse run scored 80 where others scored 71. The AI
briefly treated the 80 as a real improvement.

It was a broken build. The atlas packer clears its output directory before writing, so running
the bundler *without* the asset pipeline ships a game with no level data. The game failed early,
did far less work, and scored better for being broken.

Worse: this exact trap had been discovered and written down five milestones earlier. The AI had
its own notes and walked into it anyway.

### The kitchen that crashed on the second visit

Entering the kitchen worked. Leaving and coming back crashed the game.

The framework reuses a scene *object* between visits while destroying everything it drew. A list
of on-screen rows was created once when the object was constructed, so the second visit appended
to a list still holding the previous visit's destroyed items, and then tried to recolour a piece
of text that no longer had a canvas.

The AI had shipped it, the tests passed, and it took a human opening the kitchen twice. When the
harness was extended to reproduce it, the cause was clear within minutes: **no automated test had
ever left a screen and come back**, so that entire path was unreachable by construction.

### Effort spent on nothing

Chasing the final performance numbers, the AI re-packed the entire texture atlas at four quality
settings in a loop that timed out, then re-packed two of them *again* for a comparison it could
have made the first time. A rough calculation on paper — 1.5 MB over a 1.6 Mbit/s connection is
about eight seconds — would have predicted the eventual conclusion in ten seconds flat, and it
was never done until late.

When the human asked directly whether time was being wasted, the answer was yes: roughly a third
of that milestone.

### A number that was simply wrong

An early analysis pass reported the jump apex as 351 pixels. The real figure is **325**. Gravity
is applied *before* the position update, so the rise sums 25 down to 1, not 26 down to 1.

It was caught by reading the loop rather than trusting the summary, and then pinned with a test
so it could not drift. The full story is in [the walkthrough](6-walkthrough-the-jump.md).

## The pattern

Every failure above is the same shape.

**The AI was reliable at things with a definite answer** — converting physics constants,
implementing a documented algorithm, keeping a type checker happy, writing tests for logic it
could reason about.

**It was unreliable at things only observable by looking** — whether a button responds, whether
the camera shows enough of the floor, whether a spell reads as powerful, whether a screen still
works the second time you open it.

Automated checks share the blind spot exactly. **Unit tests do not press buttons. Screenshots do
not either.** An entire category of "it renders correctly and does nothing" was invisible to
every check in the project until a human found it by playing.

The tooling that eventually caught these bugs — a harness driving real mouse and keyboard input
through the browser — was written *after* shipping the bug class three times. It was a reaction,
not a precaution, and that is the honest chronology.

## Human feedback that changed the design

The most valuable input was not bug reports. It was judgement:

- *"Side collision is ok for blocks on floor, blocking on floating platform is too punishing."*
  → Only platforms resting on the ground got solid faces. A shelf hanging in mid-air gives the
  player nothing at ground level to read as "jump now", so hitting it feels arbitrary. No test
  could have produced this.
- *"The camera is currently too close to the character and we cannot see the floor or gap when
  we are dropping from height."* → A wider frame and a downward bias while falling.
- *"I would prefer a hit of space bar or 'R' can immediately restart."* → Instant restart.

Each is a sentence about how the game *feels*. None is derivable from the source code.

## What was never verified

Stated plainly, because a log that only records successes is marketing:

- **Never tested on a real phone.** Touch input and responsive layout were built and reasoned
  about, not confirmed in a hand.
- **Nobody has judged the audio.** It is synthesised in code. It was verified to *exist*.
- **60 fps on real hardware is unmeasured.** Object pooling is in place; the profiler was not.
- **Two of the final milestone's targets were missed** — a Lighthouse score of 71 against a
  target of 90, and a 9.8-second load on a slow mobile connection against a target of 5. Both
  are documented with measurements and causes rather than quietly dropped.

## If you are trying this yourself

1. **Keep a human in the merge path.** One rule, most of the value.
2. **Playtest every milestone.** Every single UI failure here was found by a person playing, and
   none by a machine checking.
3. **Make each milestone independently playable.** "Grey rectangles that feel right" was a
   better first milestone than "a beautiful screen that does nothing", because feel is the thing
   most likely to be wrong and the thing hardest to retrofit.
4. **Ask what has not been verified.** A useful collaborator distinguishes *I tested this* from
   *I believe this*. Ask for that distinction explicitly and keep asking.
5. **Watch your tests fail before you trust them.** A green test that has never been red is a
   green light of unknown provenance.

---

Next: [3. How a 2D game works](3-how-a-2d-game-works.md) — the parts every 2D game is built from.
