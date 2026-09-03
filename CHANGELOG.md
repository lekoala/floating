# Changelog

## 0.1.0

- Initial standalone package.
- Expose `reposition()`, `repositionAt()`, and `autoUpdate()`.
- Track both reference and floating element resize through a shared per-document `ResizeObserver`.
- Keep document scroll and viewport resize work frame-batched and shared per document.
- Preserve RTL, visual viewport, scope boundary, flip, shift, and available-height behavior.
- Keep imports SSR-safe and runtime dependency-free.
