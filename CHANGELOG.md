# Changelog

## Unreleased

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
