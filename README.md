# @lekoala/floating

Small positioning engine for menus, tooltips, and other floating surfaces.
Single file, zero runtime dependencies, ES2022 ESM, SSR-safe import.

Consumers own sizing, visibility, positioning mode, and lifecycle.

## Install

```sh
npm install @lekoala/floating
```

## Usage

```js
import { autoUpdate, reposition } from "@lekoala/floating";

const anchor = document.querySelector("#anchor");
const popup = document.querySelector("#popup");
popup.style.position = "fixed";

function update() {
  reposition(anchor, popup, { placement: "bottom-start", distance: 4 });
}

// Open the surface before measuring it.
update();
const stop = autoUpdate(anchor, popup, update);

// On close:
stop();
```

For native popovers, reset the default positioning styles:

```css
[popover] {
  position: fixed;
  inset: auto;
  margin: 0;
}
```

See [the Popover demo](demo/popover.html) for opening and cleanup.

## API

### `reposition(reference, floating, options?)`

Writes viewport coordinates to `left` and `top`. Returns `false` if the surface is
not rendered, the reference has no rect or is outside the boundary, or the document
has no browsing context. Otherwise returns `true`.

| Option | Default | Behavior |
| --- | --- | --- |
| `placement` | `"bottom-start"` | `top`, `right`, `bottom`, `left`, optionally with `-start` or `-end`. |
| `distance` | `0` | Gap from the reference in CSS pixels. |
| `flip` | `true` | Use the opposite side if it overflows less. |
| `shift` | `true` | Clamp on the cross axis: x for top/bottom, y for left/right. |
| `shiftPadding` | `4` | Boundary padding in CSS pixels for side selection and shifting. |
| `scope` | Visual viewport | Optional element whose border rect replaces the viewport boundary. |

Physical `left`/`right` stay physical in RTL. Horizontal `start`/`end` alignment
follows the reference direction.

If neither lateral side fits, the engine tries top/bottom and switches only if
that reduces overflow after shifting. Ties keep the current side.
`data-placement` reports the resolved placement, including any realignment.

Clamping drops padding when needed to fit. Oversized surfaces align to the boundary
start on the cross axis. Remaining overflow is accepted; consumers control sizing.

Use `position: fixed` in the top layer or outside ancestors that establish a fixed
containing block (`transform`, `filter`, `perspective`, containment, or related
`will-change`). The engine does not set `position` or convert coordinates for these
ancestors.

### Sizing and arrows

The engine also writes three CSS properties:

- `--arrow-x`, `--arrow-y`: reference center within the floating box, clamped to
  `0%`–`100%` and rounded to three decimals.
- `--available-height`: space on the resolved side, excluding distance and padding.
  For left/right, this is the boundary height minus twice the padding.

A simple height cap is often enough. To limit a menu to the available space:

```css
.menu {
  overflow-y: auto;
  max-block-size: min(80vh, var(--available-height, 80vh));
}
```

If a changed height variable resizes the surface, `reposition()` corrects once,
keeping the chosen side for that call. Arbitrary CSS sizing feedback is not resolved.

For an arrow on a bottom placement:

```css
.popup[data-placement^="bottom"]::after {
  left: clamp(.7rem, var(--arrow-x, 50%), calc(100% - .7rem));
  translate: -50% -50%;
}
```

To match the reference width, set it before positioning:

```js
popup.style.inlineSize = `${anchor.getBoundingClientRect().width}px`;
reposition(anchor, popup);
```

### `repositionAt(x, y, floating, options?)`

Positions from a viewport point, with the same options and return value:

```js
repositionAt(event.clientX, event.clientY, menu, {
  placement: "right-start",
  distance: 4,
});
```

### `autoUpdate(reference, floating, callback)`

Tracks document scroll, viewport resize, visual viewport scroll/resize, and both
element sizes. Pass `null` as the reference for point positioning.

- No initial callback: position once before subscribing.
- At most one callback per subscription per frame.
- Returns an idempotent cleanup function; call it when the surface closes.
- Viewport listeners are shared per document and removed after the last cleanup.
- Each subscription owns its ResizeObserver and ignores its initial delivery.

The callback receives `{ type: "scroll" | "resize" | "element-resize" }`.
Multiple causes use this priority: `element-resize` > `resize` > `scroll`.
Listen directly for events that require their own action, such as closing on scroll.

Movement without scroll or resize is not tracked. Call `reposition()` after other
layout changes your code causes.

## Visibility

Open or unhide the surface before positioning. To hide an out-of-boundary surface
while keeping it measurable:

```js
popup.style.visibility = reposition(anchor, popup, { scope }) ? "visible" : "hidden";
```

## Compatibility and scope

Browser floor: Chromium 99+, Firefox 98+, Safari 15.4+. Source is not transpiled;
no polyfills are included. Without ResizeObserver, scroll and viewport tracking
still work. Popover support is separate from the engine's browser floor.

The boundary follows `visualViewport` when available, including its offsets.
Layout dimensions ignore transforms on the floating element itself.

Unsupported: CSS `zoom`, `scrollbar-gutter: stable both-edges`, and scrollbars on the
inline start edge.

Opening, dismissal, focus, animations, and Popover wiring belong to consumers.
CSS Anchor Positioning and framework adapters are outside this package's scope.

## Development

```sh
bun install
bun run check
```

JSDoc generates the TypeScript declarations. Unit tests run under Bun and Node.
`bun run test:browser` runs Chrome checks through `Bun.WebView`; they skip when no
browser is available.

Serve the repository to open the demos:

```sh
npx serve .
```

- [Basic](demo/basic.html)
- [Popover](demo/popover.html)
- [All features](demo/index.html)
