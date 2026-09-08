# Working on Ashenveil

## Git

**Push to `main` by default.** Work on the feature branch, commit there, then
fast-forward `main` and push both. Do not leave finished work sitting on a
branch waiting to be asked — the owner has said so explicitly and it stands
until they say otherwise.

```bash
git push -u origin <branch>
git push origin HEAD:main        # fast-forward; never force
```

`main` is what GitHub Pages serves, so pushing it is publishing. That is the
intent, but it means a broken `main` is a broken live build: run the suites
before pushing, not after.

Do not open pull requests unless asked.

## Before pushing

Both suites, and they are slow — several minutes each. Run them in the
background rather than blocking on them.

```bash
for t in test-bestiary test-smith test-hunt test-achievements test-progression \
         test-movement test-loot test-extraction test-nav test-heroai \
         test-ecology test-walkers test-salvage; do
  node tools/$t.js
done

for t in test-layout test-bags test-unlocks test-navigation \
         test-forge test-huntpad test-sprites test-salvage; do
  node tools/$t.mjs        # need Playwright; they skip without it
done
```

## How this project is built

Zero dependencies, vanilla ES modules, Canvas 2D, no build step. Anything that
would need compiling, bundling or installing does not belong here.

The simulation has no DOM dependency. `tools/` drives it headless, which is why
balance can be measured rather than guessed at.

### Measure before believing

Most of what is written in the README came from measurement, and several
comments exist to record a number that contradicted the obvious explanation.
Two habits worth keeping:

- **Check that a test can fail.** Three separate checks in this repo were
  written so they could not — `a || b || b_is_always_true`, a ratio against a
  zero baseline. Injecting the bug a test guards is the only way to know it
  guards it.
- **A statistic that swings on the seed is not a threshold.** The worst-pin
  check in `test-movement.js` read 34s, 104s, 208s and 259s across four batches
  of the same build. Maxima on a heavy tail do not converge; prefer a rate.

When a test fails after an unrelated change, find out which before touching the
limit. Loosening a threshold to make a failure go away is the wrong move and
has been the wrong answer every time it was tempting here.

### The art is code

`src/art/` draws the classes and creatures; `tools/bake-sprites.mjs` renders
them to `assets/sprites/` through headless Chromium. Both the baker and the
live renderer call the same draw functions, so sheets cannot drift from the
game. Change the art by changing the code and re-baking, never by editing a
PNG.

Iterate on `tools/lineup.mjs` and `tools/contact-sheet.mjs` output, large.
Judging a figure from a 128px thumbnail is how its head ends up in the wrong
place for three rounds running.
