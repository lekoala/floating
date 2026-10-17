# Changelog

## 0.3.1

- Fix: `repositionAt()` validates `placement` and `coordinateSpace` without a
  browsing context too, throwing a `TypeError` like `reposition()` instead of
  returning `false` first. It reads the document `direction` only for aligned
  placements.
- The internal `Subscription` type is no longer exported from the declarations.

## 0.3.0

- Fix: a multiline inline reference that flips from `bottom` to `top` now anchors
  to its first line instead of covering it from the last one. The arrow and
  `--available-height` follow the resolved side's line as well.
- Fix: `start`/`end` alignment follows the reference's computed `direction`, so a
  CSS `direction: rtl` without a `dir` attribute counts, matching `repositionAt()`.
  `VirtualReference.matches` is removed; virtual references set `dir` to `"rtl"`
  or `"ltr"`, and `"auto"` is no longer resolved for them.
- `reposition()` and `repositionAt()` throw a `TypeError`, before writing anything,
  for an unknown `placement` or `coordinateSpace`, instead of silently writing the
  reference origin or falling back to `"viewport"`. Only an absent or `undefined`
  option takes the default; an empty string throws.
- Fix: a multiline reference is outside the boundary only when every line is, so a
  side can flip to a line that is still visible instead of `reposition()` returning
  `false` when the preferred side's line is outside.
- Fix: an `autoUpdate()` callback that throws is reported through `reportError()`
  and no longer prevents later subscriptions from being called in that frame.
- Document that ResizeObserver does not report non-replaced inline references.
- `exports` uses the `default` condition, so `require("@lekoala/floating")` works on
  Node versions with `require(esm)`.
- Side selection is one candidate comparison of overflow after shifting; behavior
  is unchanged for single-rect references.
- Add `docs/coordinate-space.md`, the coordinate space contract for components
  built on this package: the two explicit strategies and their `position`
  pairing, when `"document"` is valid, what a reusable component should expose,
  and a short table its own documentation can carry instead of a copy. Consumers
  should link to it rather than restate it.
- Document why no automatic resolver ships, with the four configurations where
  deriving the space from the reference's ancestry was measured wrong in Chrome:
  `fixed` under a `transform`ed ancestor, `sticky` in a scroller that rides the
  page, a reference in an `absolute` top-layer popover under a `fixed` DOM
  ancestor, and a reference slotted into a closed shadow root, where the walk
  cannot even detect what it is missing.
- Correct two over-strong claims in the coordinate space guidance. A reference
  inside a modal dialog or an open popover is not intrinsically viewport-anchored:
  UA styles make those boxes `fixed`, but an author can set `position: absolute`,
  and in the top layer that resolves against the initial containing block, so the
  box and everything in it ride the page. And an ordinary nested scroller is no
  reason to prefer `"viewport"`: its inner scroll is `autoUpdate()` work in either
  space, while the page scroll is free in `"document"`.
- Ship `docs/` in the published package, so those links resolve from an install.
- No API change: `reposition()` and `repositionAt()` still take
  `"viewport" | "document"` and inspect nothing.

## 0.2.0

- Add `coordinateSpace: "viewport" | "document"` to `reposition()` and `repositionAt()`.
  `"document"` adds the page scroll to the written `left`/`top`, for an absolutely
  positioned surface whose containing block is the initial one, such as a top-layer
  popover. The browser then scrolls it with the page instead of waiting for
  `autoUpdate()`, which removes the lag visible on touch devices, where scrolling is
  driven asynchronously. Measurement, flip, shift, arrows and available height stay in
  viewport coordinates, and no offset parent is ever resolved. Default is unchanged.

## 0.1.1

- Keep the preferred side unless the opposite side overflows less, including
  the top/bottom fallback which now compares shifted overflow on both axes.
- Clamp only on the cross axis of the resolved side, using `shiftPadding`
  for side selection and dropping it to fit when needed.
- Call `autoUpdate()` back at most once per frame, keeping the most specific
  change (`scroll` < `resize` < `element-resize`).
- Settle a size driven by `--available-height` with a single corrective pass
  pinned to the resolved placement.
- Add real-browser coverage (`test/browser.test.js`), a popover demo, and
  expanded unit tests; refresh `README.md` and demos.

## 0.1.0

- Initial standalone package.
- Expose `reposition()`, `repositionAt()`, and `autoUpdate()`.
- Track both reference and floating element resize through a shared per-document `ResizeObserver`,
  without the unobserve/re-observe cycle that reported a resize on every frame.
- Keep document scroll and viewport resize work frame-batched and shared per document.
- Preserve RTL, visual viewport, scope boundary, flip, shift, and available-height behavior.
- Derive `--arrow-x` / `--arrow-y` from the reference center so they stay accurate for
  aligned placements and on both sides of a clamp, keep them within `0%`-`100%`, and
  round them to three decimals.
- Make `shift: false` disable shifting entirely instead of still clamping wide elements.
- Prefer boundary containment over `shiftPadding` when the element cannot fit inside it.
- Return `false` instead of throwing when the document has no browsing context.
- Narrow the viewport boundary only for a declared `scrollbar-gutter`, instead of for
  any narrowing of the document box within a scrollbar-sized range.
- Emit optional option types as `T | undefined` so consumers can enable
  `exactOptionalPropertyTypes`.
- Give each subscription its own `ResizeObserver` instead of sharing one per document
  behind reference counting, with no change to what is observed.
- Reduce the `autoUpdate()` callback detail to `type`; `targets` and `timeStamp` had no
  consumer and forced a nested notification store.
- Keep imports SSR-safe and runtime dependency-free.
