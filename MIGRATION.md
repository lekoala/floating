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

## Lifecycle

Start tracking only while the surface is open and always call the cleanup function
when it closes or disconnects. `autoUpdate()` itself does not open, close, hide, or
dismiss anything.
