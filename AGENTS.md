# AGENTS.md

## Scope

This repository contains a small, generic floating-element positioning engine.
Keep it focused on geometry and update tracking.

Do not add component behavior such as dismissal, focus management, Popover API
wiring, sheets, backdrops, animations, or framework adapters unless the public scope
is explicitly reconsidered first.

## Language and compatibility

- Code, comments, documentation, tests, and commit messages are written in English.
- Source targets ES2022 and is published without transpilation.
- Do not introduce newer syntax or standard-library APIs for novelty or terseness.
- DOM/platform features are evaluated separately from the ES language target.
- Importing the package must remain SSR-safe and free of DOM/global side effects.

## API

The public API is intentionally tiny:

- `reposition(reference, floating, options?)`
- `repositionAt(x, y, floating, options?)`
- `autoUpdate(reference, floating, callback)`

Prefer improving these primitives over introducing middleware/plugin abstractions.
New public API needs a concrete use case in more than one consumer.

## Architecture invariants

- Runtime dependencies: zero.
- Positioning policy is physical side + logical alignment.
- `left` and `right` stay physical in RTL; `start`/`end` alignments follow direction.
- Consumers own width, visibility, positioning mode, lifecycle, focus, and dismissal.
- `autoUpdate()` observes both reference and floating element when ResizeObserver exists.
- Scroll/resize work is shared and frame-batched per document; size observation is per
  subscription.
- `autoUpdate()` calls back at most once per subscription per frame.
- Side selection compares overflow: the preferred side is kept unless another one
  overflows less. Nothing moves the element along the main axis of its placement.
- `reposition()` settles a size its own `--available-height` drove, in at most one
  corrective pass, pinned to the side already resolved. Adding a write that can resize
  the element means revisiting it.
- Closed surfaces should stop tracking; the package does not decide when that happens.

## Tests

Any geometry change must cover the relevant edge cases:

- preferred placement;
- flip, including the cases where flipping would overflow more and must not happen;
- shift/clamping, including boundaries the element cannot fit inside;
- arrow percentages;
- RTL;
- visual viewport;
- scoped boundary;
- point positioning;
- transformed floating elements measured by layout size;
- a size driven by `--available-height`, settled by a single call;
- reference resize and floating resize;
- cleanup, listener sharing, and listener detachment;
- the initial `ResizeObserver` delivery, which is not a resize.

Geometry that depends on a real engine belongs in `test/browser.test.js`, which drives
headless Chrome through `Bun.WebView` and skips itself when no browser is available:
the top layer and popover UA styles, `--available-height` constraining a real box,
layout size versus a painted transform, `:dir(rtl)`, and tracking a real scroll.

Run `npm run check` before publishing.
