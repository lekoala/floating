# Choosing a coordinate space

This is the contract every consumer of `@lekoala/floating` follows. Components
built on this package should point here rather than restate it.

`reposition()` and `repositionAt()` take one option that decides where the
written `left`/`top` live:

```js
reposition(reference, panel, { coordinateSpace: "viewport" | "document" });
```

There are exactly two strategies, both explicit. **The package provides no
automatic resolver, and consumers should not build one**; the reasoning is
measured below.

| Space        | Panel                | Role                                                    |
|--------------|----------------------|---------------------------------------------------------|
| `"viewport"` | `position: fixed`    | The robust baseline. Default.                           |
| `"document"` | `position: absolute` | A scroll optimization, valid only under known conditions |

The space and the CSS `position` form a single contract. The engine writes
geometry and never sets `position`, so pairing them correctly is the consumer's
job.

## Viewport space

```js
panel.style.position = "fixed";

reposition(reference, panel, { coordinateSpace: "viewport" });
```

Coordinates are written in viewport space, and `autoUpdate()` follows scrolling
and resizing once the browser reports them. This works in every layout.

The trade-off: during asynchronous page scrolling, typically touch scrolling on
mobile, a fixed surface can briefly lag behind a reference that is moving
natively with the document. [mobile-scroll-wobble.md](mobile-scroll-wobble.md)
documents that case in detail.

## Document space

```js
panel.style.position = "absolute";

reposition(reference, panel, { coordinateSpace: "document" });
```

The page scroll is added to the written coordinates, so the browser carries the
surface along with the page and the lag above disappears.

Use it only when both conditions are known to hold:

1. the reference moves with the root document during page scrolling;
2. the floating element's `position: absolute` resolves against the initial
   containing block.

A top-layer popover with `position: absolute` satisfies the second condition: in
the top layer, an absolutely positioned box resolves against the initial
containing block rather than against a positioned ancestor. An ordinary absolute
element inside `position: relative` does not, and lands off by that ancestor's
position. The engine never looks for an offset parent and never compensates for
one.

Nested scrolling is `autoUpdate()` work in either space. It is therefore not a
reason to avoid document space: the inner scroll costs the same either way, while
the page scroll is free here.

## There is no reliable generic `"auto"`

The tempting heuristic is to walk up from the reference and return `viewport` on
the first computed `fixed` or `sticky`, `document` otherwise. It was prototyped
against this package and measured in Chrome. The page was scrolled by 400px and
the reference's client rect read before and after:

| Configuration | Reference moved | Heuristic says | Truth |
|---|---|---|---|
| `position: fixed` under a `transform`ed ancestor | 400px | `viewport` | `document` |
| `position: sticky` in a scroller that itself rides the page | 400px | `viewport` | `document` |
| Reference in an `absolute` top-layer popover whose DOM ancestor is `fixed` | 400px | `viewport` | `document` |
| Reference slotted into a **closed** shadow root under a `fixed` wrapper | 0px | `document` | `viewport` |

The causes are structural, not a matter of walking further:

- A `transform`, `filter`, `perspective`, containment or related `will-change` on
  an ancestor establishes the fixed-position containing block, so a `fixed`
  descendant scrolls with that ancestor. Answering correctly means resolving
  containing blocks.
- `sticky` is relative to its nearest scrollport, not to the viewport. Whether it
  is viewport-anchored depends on whether that scrollport itself moves with the
  page.
- The top layer breaks the correspondence between the DOM chain and the layout
  chain. Walking DOM ancestors past a top-layer box reads information that no
  longer describes how the box moves.
- A closed shadow root returns `null` from `assignedSlot`, by design. The walk
  does not merely lack the answer: it cannot detect that part of the flattened
  tree is missing, so a conservative fallback never fires.

Getting this right would require resolving containing blocks, scrollports and
top-layer membership, which is the positioning-strategy engine this package
deliberately is not.

Two corollaries worth stating, because both were believed here at some point:

- A reference inside an open popover or a modal dialog is **not** intrinsically
  viewport-anchored. UA styles make those boxes `fixed`, but an author can set
  `position: absolute`, and in the top layer that resolves against the initial
  containing block, so the box and everything inside it ride the page.
- An ordinary nested scroller is **not** a reason to prefer `viewport`.

## For reusable components

Expose the choice; do not infer it.

```js
component.coordinateSpace = "viewport"; // default
component.coordinateSpace = "document"; // explicit optimization
```

Read the value once when the surface opens, and let that value close over the
matching `autoUpdate()` subscription:

```js
const space = component.coordinateSpace;

panel.style.position = space === "document" ? "absolute" : "fixed";

const update = () =>
  reposition(reference, panel, {
    placement: "bottom-start",
    distance: 4,
    coordinateSpace: space,
  });

update();
const stop = autoUpdate(reference, panel, update);
```

Reading once also freezes the value for that opening, which is the behavior you
want, and it needs no resolved state on the instance.

Do not derive the choice from `position: fixed`, `position: sticky`,
`:popover-open`, `<dialog>`, `offsetParent`, or DOM ancestry. Those are useful
facts in a layout you control, and none of them is a generic proof of how the
reference moves. If a component cannot know that document space is valid, it uses
viewport space.

## Quick reference

A component's own documentation needs no more than this, plus a link back here:

| Value                    | Panel                | Use when                                                                    |
|--------------------------|----------------------|-----------------------------------------------------------------------------|
| `"viewport"` *(default)* | `position: fixed`    | General integration                                                         |
| `"document"`             | `position: absolute` | The reference is known to ride the page scroll, and the panel resolves against the initial containing block |

For a native popover panel, also reset the UA centering styles:

```css
[popover] {
  inset: auto;
  margin: 0;
}
```
