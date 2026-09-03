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

Positions `floating` relative to `reference`. Returns `true` when it positioned the
element, and `false` when it could not: a hidden floating element, a reference with no
client rect, a reference outside the boundary, or a document without a browsing context.

Options:

- `placement`: `top`, `right`, `bottom`, `left`, optionally suffixed by `-start` / `-end`.
- `distance`: gap from the reference in CSS pixels. Default `0`.
- `flip`: flip to the opposite side on main-axis overflow. Default `true`.
- `shift`: keep the element inside the boundary on the cross axis. Default `true`.
  With `shift: false` the coordinates are exactly those of the placement, overflow included.
- `shiftPadding`: minimum distance from the boundary while shifting. Default `4`.
- `scope`: optional element used as the positioning boundary instead of the visual viewport.

The function writes:

- `style.left`
- `style.top`
- `data-placement`
- `--arrow-x`
- `--arrow-y`
- `--available-height`

`--arrow-x` and `--arrow-y` locate the center of the reference inside the floating box,
as a percentage of its size. A centered placement with no shifting reports `50%`; an
aligned placement, a realignment, or a clamp all move the value so an arrow keeps
pointing at the reference. They are clamped to `0%`-`100%` and rounded to three decimals.

Use the one matching the placement axis, and keep the tip off the rounded corners on the
consumer side:

```css
.popup[data-placement^="bottom"]::after {
  left: clamp(.7rem, var(--arrow-x, 50%), calc(100% - .7rem));
  translate: -50% -50%;
}
```

The package does **not** set `position: fixed`; that remains consumer policy.

Because the written coordinates are viewport coordinates, the floating element must
not sit inside an ancestor that establishes a containing block for fixed elements --
a `transform`, `filter`, `backdrop-filter`, `perspective`, a `will-change` naming one
of those, or `contain: layout | paint | strict | content`. Render the surface as a
direct child of `<body>`, or in the top layer.

#### Main axis and cross axis

`flip` acts on the main axis of the placement, `shift` on the cross axis. For
`top` / `bottom` placements the vertical space is reported through
`--available-height` instead: sizing and overflow stay consumer policy, so a surface
that does not fit scrolls or shrinks on its own terms rather than being moved.

```css
.listbox {
  overflow-y: auto;
  max-block-size: min(20rem, var(--available-height, 20rem));
}
```

#### Boundary containment

`shiftPadding` is a preference, not a guarantee. When the floating element cannot fit
inside the padded boundary the padding is dropped in favour of containment, and when it
is larger than the boundary itself it is aligned to the boundary start. Keeping a
surface narrow enough to fit is consumer policy.

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
  type: "scroll" | "resize" | "element-resize";
}
```

Tracking covers:

- captured scroll events in the owner document;
- window and visual viewport scroll/resize;
- `ResizeObserver` changes to the reference, when one is supplied;
- `ResizeObserver` changes to the floating element.

Scroll and viewport listeners are shared per document and detached when the last
subscription is removed. Each subscription owns its `ResizeObserver`, watching the
reference and the floating element for its whole lifetime; the delivery
`ResizeObserver` emits for every newly observed element is not reported as
`element-resize`.

Tracking does **not** cover a reference that moves without resizing and without a
scroll: a sibling collapsing above it, an animation, a font swap reflowing the page.
There is no layout-shift observer. Call `reposition()` yourself after a layout change
your own code caused.

## Hiding and re-showing

`reposition()` refuses to measure a floating element that is not rendered and returns
`false`. Unhide first, then position:

```js
popup.hidden = false;
reposition(anchor, popup, options);
```

To keep a surface in the DOM while it is out of its boundary, hide it with
`visibility` rather than `hidden`, otherwise the next `reposition()` call cannot
measure it and it can never come back:

```js
popup.style.visibility = reposition(anchor, popup, { scope }) ? "visible" : "hidden";
```

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

Viewport geometry accounts for a declared `scrollbar-gutter`, but not for
`scrollbar-gutter: stable both-edges`, a scrollbar rendered on the inline start edge,
or the CSS `zoom` property. `zoom` scales the viewport coordinates this package writes
while leaving layout sizes unscaled, so a zoomed subtree is not supported.

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

The demo pages import `src/floating.js` as a real module, so they need a static server:

```sh
npx serve .        # then open /demo/index.html
```

- `demo/index.html` covers every behavior: the twelve placements, `distance`,
  `flip`, `shift`, `shiftPadding`, arrows driven by `--arrow-x` / `--arrow-y`,
  `--available-height`, a scoped boundary, RTL, anchor width matching, point
  positioning, and the `autoUpdate` event stream.
- `demo/basic.html` is the minimal integration.
