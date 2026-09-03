# @lekoala/floating

Small, framework-agnostic positioning engine for floating browser UI.

It covers the intentionally narrow geometry needed by menus, tooltips, comboboxes,
context menus, and similar surfaces without pulling a full UI framework or a broad
positioning middleware system.

## Principles

- Pure ESM.
- Zero runtime dependencies.
- ES2022 source, shipped without transpilation.
- SSR-safe at import time; DOM access only happens when functions are called.
- No opening, dismissal, focus, popover, animation, or component lifecycle policy.
- One positioning model across supported browsers; CSS Anchor Positioning is not required.
- Per-document batching for scroll, viewport resize, and element resize updates.

## Install

```sh
npm install @lekoala/floating
```

## Basic usage

```js
import { autoUpdate, reposition } from "@lekoala/floating";

const anchor = document.querySelector("#anchor");
const popup = document.querySelector("#popup");

popup.style.position = "fixed";

function update() {
  reposition(anchor, popup, {
    placement: "bottom-start",
    distance: 4,
    flip: true,
    shift: true,
  });
}

update();
const stop = autoUpdate(anchor, popup, update);

// When the popup closes:
stop();
```

`autoUpdate()` does not perform the initial placement itself. Position once, then
start tracking while the floating element is open.

## Context menu / point positioning

```js
import { repositionAt } from "@lekoala/floating";

menu.style.position = "fixed";
repositionAt(event.clientX, event.clientY, menu, {
  placement: "right-start",
  distance: 4,
});
```

## Matching an anchor width

Width policy belongs to the consumer. A combobox can keep its popup as wide as its
control while still delegating placement to the engine:

```js
function update() {
  popup.style.inlineSize = `${anchor.getBoundingClientRect().width}px`;
  reposition(anchor, popup, {
    placement: "bottom-start",
    distance: 4,
  });
}
```

Because `autoUpdate()` observes both the reference and floating element, a layout
change that resizes either side triggers a new frame-batched update.

## API

### `reposition(reference, floating, options?)`

Positions `floating` relative to `reference`. Returns `false` when positioning cannot
be performed, otherwise `true`.

Options:

- `placement`: `top`, `right`, `bottom`, `left`, optionally suffixed by `-start` / `-end`.
- `distance`: gap from the reference in CSS pixels. Default `0`.
- `flip`: flip to the opposite side on main-axis overflow. Default `true`.
- `shift`: shift back inside the boundary. Default `true`.
- `shiftPadding`: boundary padding while shifting. Default `4`.
- `scope`: optional element used as the positioning boundary instead of the visual viewport.

The function writes:

- `style.left`
- `style.top`
- `data-placement`
- `--arrow-x`
- `--arrow-y`
- `--available-height`

The package does **not** set `position: fixed`; that remains consumer policy.

### `repositionAt(x, y, floating, options?)`

Uses a viewport point as the reference. Intended for context menus and pointer-based
surfaces.

### `autoUpdate(reference, floating, callback)`

Starts frame-batched update tracking and returns an idempotent cleanup function.
Pass `null` as `reference` for a point-positioned surface that only needs scroll,
viewport resize, and floating-element resize tracking.

The callback receives:

```js
{
  type: "scroll" | "resize" | "element-resize",
  targets: Set,
  timeStamp: 0,
}
```

Tracking covers:

- captured scroll events in the owner document;
- window and visual viewport scroll/resize;
- `ResizeObserver` changes to the reference, when one is supplied;
- `ResizeObserver` changes to the floating element.

Listeners and the `ResizeObserver` are shared per document. Document/window listeners
are detached when the last subscription is removed.

## RTL

Physical placements (`left` / `right`) remain physical. `start` / `end` alignment on
vertical placements follows the reference direction.

## Visual viewport and boundaries

Viewport positioning prefers `visualViewport` when available, which keeps fixed
surfaces aligned during mobile zoom/keyboard viewport changes. A consumer may pass
`scope` to constrain positioning to a specific element instead.

## Browser contract

The package targets ES2022 and supports Chromium 99+, Firefox 98+, and Safari 15.4+ as
its functional browser floor. It assumes standard browser primitives such as
`getBoundingClientRect`, `requestAnimationFrame`, and DOM events. `ResizeObserver` is
used when available; scroll and viewport resize tracking still work without it.

The source is not transpiled and no polyfills are included.

## Non-goals

This package deliberately does not manage:

- open/close state;
- Popover API integration;
- Escape or outside-click dismissal;
- focus restoration or focus trapping;
- modal/sheet/backdrop behavior;
- animations;
- CSS Anchor Positioning;
- application-specific surface policy.

Those concerns belong to the consumer.

## Development

```sh
bun install
bun run check
```

JSDoc is the source of truth for the generated TypeScript declarations.
