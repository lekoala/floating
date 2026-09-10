# Mobile scroll wobble and `coordinateSpace: "document"`

This note explains the narrow sub-case that v0.2 targets: a floating surface
that can ride the document scroll natively instead of being corrected by
JavaScript after the fact.

## Summary

When the reference moves with the page, and the floating surface can be
`position: absolute` against the initial containing block (ICB), writing
document coordinates lets the browser scroll both together. That removes the
lag visible during asynchronous touch scrolling, with no per-frame JS
correction needed to maintain attachment during the page scroll itself;
`autoUpdate()` still re-evaluates flip, shift, and available height.

```text
document scroll
      |
      +-- reference moves with the document
      |
      +-- floating moves with the document
                       ^
                 same native scroll
```

This does not solve scrolling lag in general. It solves one layout
configuration well and leaves the others to `autoUpdate()`.

## Background: Floating UI #2530

[Floating UI #2530](https://github.com/floating-ui/floating-ui/issues/2530),
"Floating elements wobble around reference during scrolling on mobile devices,
even with animationFrame: true", was opened on 5 September 2023 and is now
closed as "not planned".

The following points synthesize the issue body and the maintainer discussion
in the thread; in particular, the notes about transforms and GPU acceleration
come from the comment discussion rather than the issue body alone:

- On mobile, scroll positions can update asynchronously: the page moves before
  JavaScript runs.
- `animationFrame: true`, `strategy: "fixed"`, transforms, and GPU
  acceleration do not fundamentally remove that lag.
- The issue author noticed the official demos did not wobble. The maintainer's
  answer was, in substance, that the docs' floating elements live in the same
  scrolling container as their reference, so they do not need continuous
  repositioning during scroll.
- The conclusion was that this is a hard rendering-engine limitation in the
  general case.

The unfavorable reproduction in that issue is structurally:

```html
#portalRoot
    └── floating

#wrapper (overflow: scroll)
    └── reference
```

When `#wrapper` scrolls:

```text
reference
   -> moves natively with #wrapper

floating
   -> does not move

JS / autoUpdate
   -> corrects its position afterwards
```

The wobble is structural: one side moves natively, the other waits for JS.

In the docs layout, by contrast:

```text
body scroll
 ├── reference
 └── floating
```

both are carried by the same scroll, so the artifact disappears.

## What Floating UI still does (verified September 2026)

Floating UI's `autoUpdate()` still exposes:

```ts
ancestorScroll
ancestorResize
elementResize
layoutShift
animationFrame
```

with `animationFrame: false` by default. The `animationFrame` mode is
documented as opt-in for cases such as a reference animated with `transform`
or some nested floaters. There is no dedicated mechanism that removes mobile
scroll lag universally.

Its positioning strategy is still:

```ts
strategy: "absolute" // default
// or
strategy: "fixed"
```

`absolute` generally means less work for the browser, while `fixed` is useful
in particular when the reference itself is fixed, to reduce jumps on scroll.
See [autoUpdate](https://floating-ui.com/docs/autoupdate) and
[useFloating](https://floating-ui.com/docs/usefloating).

In short: Floating UI mitigates the problem through architecture and layout,
not through a universal scroll-lag fix. The maintainer comment remains
accurate: the best way to avoid the wobble, when possible, is to let the
floating element participate in the same native movement as its anchor.

## Floating UI `absolute` is not this package's `document`

Floating UI:

```text
strategy: absolute
        ↓
nearest positioned containing block
```

It therefore needs the full machinery for converting coordinates toward that
containing block.

This package (`src/floating.js:471-479`):

```text
coordinateSpace: document
        ↓
viewport coords + scrollX/Y
        ↓
initial containing block only
```

That is deliberately narrower. Measurement, flip, shift, arrow percentages,
and `--available-height` stay in viewport coordinates. Only the written
`left`/`top` leave that space. The engine never looks for an offset parent
and never compensates for one.

That limitation is acceptable for exactly one configuration:

```text
top-layer popover
+
position: absolute
```

In the top layer, an absolutely positioned box resolves against the ICB
rather than a positioned ancestor. The ICB is then precisely what document
coordinates need.

## How v0.2 implements it

`reposition()` and `repositionAt()` accept:

```js
reposition(anchor, tooltip, {
  placement: "top",
  distance: 6,
  coordinateSpace: "document",
});
```

with:

```css
.tooltip[popover] {
  position: absolute;
  inset: auto;
  margin: 0;
}
```

Behavior (`README.md:81-126`, `CHANGELOG.md:5-13`):

- Everything is measured with `getBoundingClientRect()` in viewport space.
- With `coordinateSpace: "document"`, the write adds
  `reference.ownerDocument.defaultView.scrollX` and `.scrollY` (effectively the
  page scroll for the reference's own document, including iframe cases).
- The containing block must be the initial one. An ordinary absolutely
  positioned element inside `position: relative` will land off by that
  ancestor's position.
- `repositionAt()` inputs stay viewport coordinates (`clientX`/`clientY`);
  only the output changes space.
- `autoUpdate()` is still required: flip, shift, and available height are
  re-evaluated on scroll in either space.

## When to use which space

| Reference                          | Recommended space         | Reason                                   |
|------------------------------------|---------------------------|------------------------------------------|
| Moves with the document            | `document` / `absolute`   | Stays attached with no JS correction     |
| Inside a nested scroll container   | `viewport` / `fixed` + JS | That scroll is still `autoUpdate()` work |
| `fixed`, or `sticky` while stuck   | `viewport` / `fixed`      | A document-space surface scrolls away    |
| Reference inside a modal dialog, open popover, or otherwise viewport-anchored | `viewport` / `fixed` | The reference itself follows the viewport |
| `clientX`/`clientY` context menu   | `viewport` / `fixed`      | Plus dismiss-on-scroll; no tracking need |

The model is therefore:

```text
reference document
→ document / absolute
→ no wobble on page scroll

reference fixed / sticky / inside modal / inside open popover
→ viewport / fixed
→ same frame as the reference

nested scroller
→ JS must still follow
→ acknowledged limitation

context-menu clientX/Y
→ viewport / fixed + dismissOnScroll
→ no need to follow
```

Here, “inside an open popover” describes the **reference** being viewport-anchored.
It does not conflict with the favorable case above where the **floating surface**
itself is a top-layer popover using `position: absolute` and document coordinates.

## Limits

- Nested scrollers are unchanged: if the reference moves inside a container
  that the floating element does not belong to, only JS tracking can follow.
- `fixed` and stuck-`sticky` references get worse in document space: the
  surface scrolls away until the next update.
- Positioned ancestors break the ICB assumption; this engine does not resolve
  or offset them.
- Compare `demo/actual-vs-tippy.html` and `demo/vs-tippy.html` with native
  touch scrolling on a mobile device. Scripted auto-scroll may not reproduce
  the asynchronous lag seen during real touch scrolling.
