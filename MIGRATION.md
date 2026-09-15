# Consumer migration notes

This package is intentionally a geometry/update-tracking primitive. Existing
components should keep their own surface lifecycle and replace only their local
positioning engine.

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
