# Changelog

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
- Keep imports SSR-safe and runtime dependency-free.
