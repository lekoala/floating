# Consumer migration notes

This package is intentionally a geometry/update-tracking primitive. Existing
components should keep their own surface lifecycle and replace only their local
positioning engine.

## Upgrading from 0.2 to 0.3

0.3 contains breaking changes. A `^0.2.0` range does not pick it up; widen it to
`^0.3.0` once the points below are handled.

### Unknown options throw

`reposition()` and `repositionAt()` throw a `TypeError`, before writing anything,
for a `placement` outside `Placement` or a `coordinateSpace` other than
`"viewport"` and `"document"`. Before, an unknown placement silently wrote the
reference origin, and an unknown space silently meant `"viewport"`. Only an absent
or `undefined` option takes the default: `placement: ""` and `coordinateSpace: ""`
throw too. TypeScript callers are already covered by the types. Placements read at runtime, such as a data
attribute written by an author, must be validated where they are read, once,
rather than caught inside the `autoUpdate()` callback, where the error would
come back on every tracked frame:

```js
const PLACEMENTS = new Set(
  ["top", "right", "bottom", "left"].flatMap((side) => [side, `${side}-start`, `${side}-end`]),
);

function readPlacement(element, fallback = "bottom-start") {
  const value = element.dataset.placement;
  if (value === undefined || PLACEMENTS.has(value)) return value ?? fallback;
  console.warn(`Unknown placement "${value}", using "${fallback}"`, element);
  return fallback;
}
```

### Virtual references: `matches` is removed

`VirtualReference.matches` is no longer read. Direction comes from `dir` alone,
which must be `"rtl"` or `"ltr"`: `"auto"` is no longer resolved for a virtual
reference. Resolve it yourself, for instance from the computed `direction` of the
element the virtual reference stands for:

```js
const reference = {
  ownerDocument: doc,
  dir: getComputedStyle(host).direction,
  getClientRects: () => [rect],
};
```

`repositionAt()` builds its own virtual reference and needs no change.

### `autoUpdate()` callbacks are isolated

A callback that throws is reported through `reportError()` and no longer prevents
the subscriptions after it from being called in the same frame. Code that relied
on the exception propagating out of the animation frame should catch it inside
its own callback.

### Behavior changes without code changes

- `start`/`end` alignment follows the reference's computed `direction`. A CSS
  `direction: rtl` without a `dir` attribute now mirrors the alignment; before, it
  could be ignored when `:dir()` was supported.
- A reference spanning several lines that flips from `bottom` to `top` anchors to
  its first line instead of covering it from the last one. The arrow and
  `--available-height` follow the resolved line.
- Such a reference is outside the boundary only when every line is. A link whose
  last line is below the viewport now gets a surface above its first line, where
  `reposition()` returned `false` before.
- `exports` uses the `default` condition, so `require("@lekoala/floating")` works
  on Node versions with `require(esm)`.

## Anchored surface

Before (single-element tracker):

```js
stopTracking = autoUpdate(menu, update);
```

After:

```js
stopTracking = autoUpdate(anchor, menu, update);
```

The reference is now observed as well as the floating element. This matters for
controls whose *size* changes because of surrounding layout without a window
resize. A reference that moves without resizing and without a scroll is not
detected; see the tracking limits in the README.

## Point-positioned surface

For context menus or other surfaces positioned from pointer coordinates:

```js
repositionAt(x, y, menu, options);
stopTracking = autoUpdate(null, menu, update);
```

Passing `null` keeps scroll, viewport resize, and floating-element resize tracking
without inventing a DOM anchor.

## Width matching

The package deliberately does not own width policy:

```js
function update() {
  popup.style.inlineSize = `${anchor.getBoundingClientRect().width}px`;
  reposition(anchor, popup, {
    placement: "bottom-start",
    distance: 4,
  });
}
```

## Coordinate space

`coordinateSpace` defaults to `"viewport"`, which is the pre-0.2 behavior and
needs no migration. Treat `"document"` as an opt-in for surfaces whose layout you
know:

```js
reposition(anchor, panel, { coordinateSpace: this.coordinateSpace ?? "viewport" });
```

with `panel.style.position` set to `absolute` for `"document"` and `fixed` for
`"viewport"`, since the two form one contract.

Resist auto-detecting the space from the reference's ancestry. That heuristic
fails on a `fixed` element under a `transform`ed ancestor, on `sticky` relative
to a moving scrollport, on a top-layer box whose layout chain has left the DOM
chain, and silently on a closed shadow root. A reusable component exposes the
choice to the application instead, which keeps the escape hatch where the
knowledge is.

[docs/coordinate-space.md](docs/coordinate-space.md) holds the full contract,
including the measurements behind that rule and the recipe a component should
follow.

## Lifecycle

Start tracking only while the surface is open and always call the cleanup function
when it closes or disconnects. `autoUpdate()` itself does not open, close, hide, or
dismiss anything.
