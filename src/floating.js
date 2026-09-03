/**
 * Small positioning engine for menus, tooltips, comboboxes, context menus,
 * and other floating UI.
 *
 * Core coordinate math is adapted from Floating UI (MIT).
 */

/**
 * @typedef {"top" | "top-start" | "top-end" | "right" | "right-start" | "right-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "left-start" | "left-end"} Placement
 */

/**
 * @typedef {Object} RepositionOptions
 * @property {Placement | undefined} [placement="bottom-start"] Preferred physical side and logical alignment.
 * @property {number | undefined} [distance=0] Distance in CSS pixels between reference and floating element.
 * @property {boolean | undefined} [flip=true] Flip to the opposite side when the preferred side overflows.
 * @property {boolean | undefined} [shift=true] Keep the element inside the active boundary on the cross axis.
 * @property {number | undefined} [shiftPadding=4] Minimum distance in CSS pixels from the boundary while shifting, dropped when the element cannot fit inside it.
 * @property {HTMLElement | undefined} [scope] Optional clipping/positioning boundary instead of the visual viewport.
 */

/**
 * @typedef {Object} VirtualReference
 * @property {Document} ownerDocument
 * @property {string | undefined} [dir]
 * @property {((selector: string) => boolean) | undefined} [matches]
 * @property {() => ArrayLike<DOMRect>} getClientRects
 */

/** @typedef {Element | VirtualReference} PositionReference */

/**
 * @typedef {Object} Subscription
 * @property {Element | null} reference
 * @property {HTMLElement} floating
 * @property {(detail: AutoUpdateDetail) => void} callback
 */

/**
 * @typedef {Object} AutoUpdateDetail
 * @property {"scroll" | "resize" | "element-resize"} type What changed since the last frame.
 */

/* Alignment and shifting slide along the cross axis: `top`/`bottom` place the
 * element above or below, so both happen on x. Flipping uses the other one. */
/** @param {string} side */
function crossAxisFor(side) {
  return side === "top" || side === "bottom" ? "x" : "y";
}

/** @param {string} placement */
function parsePlacement(placement) {
  const [side, align = null] = placement.split("-");
  return { side, align, crossAxis: crossAxisFor(side) };
}

/**
 * @param {string} side
 * @param {string | null} align
 */
function formatPlacement(side, align) {
  return align ? `${side}-${align}` : side;
}

/** @param {string} side */
function flipSide(side) {
  return { top: "bottom", bottom: "top", left: "right", right: "left" }[side] || side;
}

function computeCoords(reference, floating, side, align, rtl, distance) {
  const crossAxis = crossAxisFor(side);
  const commonX = reference.x + reference.width / 2 - floating.width / 2;
  const commonY = reference.y + reference.height / 2 - floating.height / 2;
  const commonAlign =
    reference[crossAxis === "x" ? "width" : "height"] / 2 -
    floating[crossAxis === "x" ? "width" : "height"] / 2;

  let coords;
  switch (side) {
    case "top":
      coords = { x: commonX, y: reference.y - floating.height - distance };
      break;
    case "bottom":
      coords = { x: commonX, y: reference.y + reference.height + distance };
      break;
    case "right":
      coords = { x: reference.x + reference.width + distance, y: commonY };
      break;
    case "left":
      coords = { x: reference.x - floating.width - distance, y: commonY };
      break;
    default:
      coords = { x: reference.x, y: reference.y };
  }

  /* Physical sides stay physical in RTL; only logical alignment follows the
   * reference direction, and only on the cross axis it slides along. */
  if (align === "start" || align === "end") {
    const direction = (rtl && crossAxis === "x" ? -1 : 1) * (align === "end" ? 1 : -1);
    coords[crossAxis] += commonAlign * direction;
  }

  return coords;
}

function getInlineOverflow(coords, floating, minX, maxX) {
  return Math.max(minX - coords.x, 0) + Math.max(coords.x + floating.width - maxX, 0);
}

/* Only `rtl` and `ltr` settle the direction on their own: `auto` and an unset
 * `dir` both have to be resolved against the rendered tree. */
/** @param {PositionReference} element */
function isRTL(element) {
  const direction = "dir" in element ? element.dir : "";
  if (direction === "rtl") return true;
  if (direction === "ltr") return false;

  const win = element.ownerDocument?.defaultView;
  if (win?.CSS?.supports?.("selector(:dir(rtl))") && typeof element.matches === "function") {
    return element.matches(":dir(rtl)");
  }

  return Boolean(
    win?.Element &&
      element instanceof win.Element &&
      win.getComputedStyle(element).direction === "rtl",
  );
}

/* Most scrollbars leave 15-18px; anything wider is not a gutter. */
const STABLE_SCROLLBAR_MAX_WIDTH = 25;
const NARROW_INLINE_FLIP_FALLBACK = 128;

function getViewportBoundary(doc) {
  const win = doc.defaultView;
  if (!win) return null;

  const docEl = doc.documentElement;
  const visualViewport = win.visualViewport;
  const x = visualViewport?.offsetLeft || 0;
  const y = visualViewport?.offsetTop || 0;
  let width = visualViewport?.width || docEl.clientWidth || win.innerWidth;
  const height = visualViewport?.height || docEl.clientHeight || win.innerHeight;

  /* `scrollbar-gutter: stable` reserves space the viewport width still counts.
   * The root `clientWidth` reports the viewport minus a rendered scrollbar,
   * while the <html> border box also loses the reserved gutter, so their
   * difference isolates it. Only a declared gutter narrows the boundary: any
   * other narrowing of the <html> box (a margin, a width, a transform) must not
   * be mistaken for one, which a body-width comparison cannot tell apart. The
   * style lookup is read last so it stays off the common path. */
  const reserved =
    doc.compatMode === "BackCompat"
      ? width - docEl.clientWidth
      : docEl.clientWidth - docEl.getBoundingClientRect().width;

  if (reserved > 0 && reserved <= STABLE_SCROLLBAR_MAX_WIDTH) {
    const gutter = win.getComputedStyle?.(docEl).scrollbarGutter;
    if (gutter && gutter !== "auto") width -= reserved;
  }

  return { x, y, width, height, right: x + width, bottom: y + height };
}

/* A `DOMRect` already carries every field a boundary needs. */
function getBoundary(reference, options) {
  return options.scope
    ? options.scope.getBoundingClientRect()
    : getViewportBoundary(reference.ownerDocument);
}

/* Boundary containment wins over `shiftPadding`: when the floating element does
 * not fit inside the padded boundary the padding is dropped, and when it is
 * larger than the boundary itself it is aligned to the boundary start. Consumers
 * that cannot accept overflow own the sizing policy. */
function clampToBoundary(position, size, start, end, padding) {
  const paddedMin = start + padding;
  const paddedMax = end - size - padding;
  const fitsPadded = paddedMax >= paddedMin;
  const min = fitsPadded ? paddedMin : start;
  const max = fitsPadded ? paddedMax : end - size;
  return Math.max(min, Math.min(position, max));
}

/* Where the reference center falls inside the floating box, as a percentage of
 * its size. This covers alignment, realignment and clamping in one value: a
 * centered placement lands on 50%, an aligned one points at the reference
 * instead of at the middle of the box. Values stay inside the box so the arrow
 * remains drawable, and are rounded to keep the custom property short. */
function arrowPercent(referenceCenter, boxStart, size) {
  if (!size) return 50;
  const percent = ((referenceCenter - boxStart) / size) * 100;
  return Math.round(Math.min(100, Math.max(0, percent)) * 1000) / 1000;
}

function isOutsideBoundary(rect, boundary) {
  return (
    rect.right < boundary.x ||
    rect.left > boundary.right ||
    rect.bottom < boundary.y ||
    rect.top > boundary.bottom
  );
}

function getAvailableHeight(referenceRect, side, boundary, distance, padding) {
  if (side === "top") {
    return Math.max(0, referenceRect.top - boundary.y - distance - padding);
  }
  if (side === "bottom") {
    return Math.max(0, boundary.bottom - referenceRect.bottom - distance - padding);
  }
  return Math.max(0, boundary.height - padding * 2);
}

/* `checkVisibility()` is called with its defaults on purpose: an element hidden
 * with `visibility` or `opacity` still has a box and stays measurable, which is
 * what lets a consumer hide an out-of-boundary surface and bring it back. */
function isVisible(element) {
  if (element.hidden) return false;
  if (typeof element.checkVisibility === "function") return element.checkVisibility();
  return element.getClientRects().length > 0;
}

/* Layout size is preferred so a transformed floating element is measured by the
 * box it occupies, not by its painted rect. */
function getFloatingSize(floating) {
  const width = floating.offsetWidth;
  const height = floating.offsetHeight;
  if (width && height) return { width, height };
  const rect = floating.getBoundingClientRect();
  return { width: width || rect.width, height: height || rect.height };
}

/* Per-document update trackers. A document gets one captured scroll listener and
 * one resize listener regardless of subscription count. Size observation is per
 * subscription instead: sharing it would need reference counting and per-element
 * priming for a page that rarely holds more than a couple of open surfaces. */
const trackers = new WeakMap();

function createTracker(doc) {
  const win = doc.defaultView;
  if (!win) throw new TypeError("floating must belong to a document with a browsing context");

  /** @type {Set<Subscription>} */
  const subscriptions = new Set();
  /** @type {Map<Subscription, Set<AutoUpdateDetail["type"]>>} */
  const pending = new Map();

  const ResizeObserverCtor = win.ResizeObserver;
  let tick = false;
  let listening = false;
  const visualViewport = win.visualViewport;

  function queue(subscription, type) {
    let types = pending.get(subscription);
    if (!types) {
      types = new Set();
      pending.set(subscription, types);
    }
    types.add(type);
  }

  function scheduleFlush() {
    if (tick) return;
    tick = true;
    win.requestAnimationFrame(() => {
      const notifications = [...pending];
      pending.clear();
      tick = false;

      for (const [subscription, types] of notifications) {
        if (!subscriptions.has(subscription) || !subscription.floating.isConnected) continue;
        for (const type of types) subscription.callback({ type });
      }
    });
  }

  function notifyAll(type) {
    for (const subscription of subscriptions) queue(subscription, type);
    scheduleFlush();
  }

  function observeSizes(subscription) {
    if (!ResizeObserverCtor) return null;

    const primed = new Set();
    const observer = new ResizeObserverCtor((entries) => {
      /* ResizeObserver reports every newly observed element once, before any
       * size change happened. Swallow that delivery instead of unobserving and
       * re-observing, which would report the element again on every frame for
       * as long as the subscription lives. */
      let changed = false;
      for (const entry of entries) {
        if (primed.has(entry.target)) changed = true;
        else primed.add(entry.target);
      }
      if (!changed) return;
      queue(subscription, "element-resize");
      scheduleFlush();
    });

    const { reference, floating } = subscription;
    if (reference) observer.observe(reference);
    if (floating !== reference) observer.observe(floating);
    return observer;
  }

  const onScroll = () => notifyAll("scroll");
  const onResize = () => notifyAll("resize");

  function startListening() {
    if (listening) return;
    doc.addEventListener("scroll", onScroll, { passive: true, capture: true });
    win.addEventListener("resize", onResize, { passive: true });
    visualViewport?.addEventListener("scroll", onScroll, { passive: true });
    visualViewport?.addEventListener("resize", onResize, { passive: true });
    listening = true;
  }

  function stopListening() {
    if (!listening) return;
    doc.removeEventListener("scroll", onScroll, { capture: true });
    win.removeEventListener("resize", onResize);
    visualViewport?.removeEventListener("scroll", onScroll);
    visualViewport?.removeEventListener("resize", onResize);
    listening = false;
  }

  return {
    add(reference, floating, callback) {
      const subscription = { reference, floating, callback };
      subscriptions.add(subscription);
      startListening();
      const observer = observeSizes(subscription);

      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        subscriptions.delete(subscription);
        pending.delete(subscription);
        observer?.disconnect();
        if (subscriptions.size === 0) stopListening();
      };
    },
  };
}

function trackerFor(element) {
  const doc = element.ownerDocument;
  let tracker = trackers.get(doc);
  if (!tracker) {
    tracker = createTracker(doc);
    trackers.set(doc, tracker);
  }
  return tracker;
}

/**
 * Track geometry changes that may require repositioning.
 *
 * The callback is batched to animation frames and runs for captured document
 * scrolls, viewport resizes, and ResizeObserver changes to either the reference
 * or floating element. It is not invoked immediately; call `reposition()` once
 * before registering if initial placement is required.
 *
 * @param {Element | null} reference Optional reference element. Pass `null` for point-positioned surfaces.
 * @param {HTMLElement} floating
 * @param {(detail: AutoUpdateDetail) => void} callback
 * @returns {() => void} Idempotent cleanup function.
 */
export function autoUpdate(reference, floating, callback) {
  if (!floating?.ownerDocument) {
    throw new TypeError("autoUpdate() expects a floating HTMLElement");
  }
  if (reference && reference.ownerDocument !== floating.ownerDocument) {
    throw new TypeError("reference and floating must belong to the same document");
  }
  if (typeof callback !== "function") throw new TypeError("callback must be a function");

  return trackerFor(floating).add(reference, floating, callback);
}

/**
 * Position a floating element relative to a reference element.
 *
 * The floating element should normally use `position: fixed`. This function
 * writes `left`, `top`, `data-placement`, `--arrow-x`, `--arrow-y`, and
 * `--available-height` to the floating element. Arrow percentages locate the
 * reference center inside the floating box and stay within `0%`-`100%`.
 *
 * @param {PositionReference} reference
 * @param {HTMLElement} floating
 * @param {RepositionOptions} [options]
 * @returns {boolean} False when positioning cannot be performed: hidden floating element, missing reference rect, reference outside the boundary, or a document without a browsing context.
 */
export function reposition(reference, floating, options = {}) {
  if (!isVisible(floating)) return false;

  const placement = /** @type {Placement} */ (options.placement || "bottom-start");
  const distance = options.distance || 0;
  const flip = options.flip !== false;
  const shift = options.shift !== false;
  const shiftPadding = options.shiftPadding ?? 4;

  let { side, align, crossAxis } = parsePlacement(placement);
  /* Direction only changes logical alignment, and resolving it costs a style
   * recalc on engines without `:dir()`. Centered placements never need it. */
  const rtl = align ? isRTL(reference) : false;

  const rects = reference.getClientRects();
  const referenceRect = side === "bottom" ? rects[rects.length - 1] : rects[0];
  if (!referenceRect) return false;

  const boundary = getBoundary(reference, options);
  if (!boundary || isOutsideBoundary(referenceRect, boundary)) return false;

  const floatingRect = getFloatingSize(floating);
  let coords = computeCoords(referenceRect, floatingRect, side, align, rtl, distance);

  if (flip) {
    const x = Math.ceil(coords.x);
    const y = Math.ceil(coords.y);

    if (
      (crossAxis === "x" && (y < boundary.y || y + floatingRect.height >= boundary.bottom)) ||
      (crossAxis === "y" && (x < boundary.x || x + floatingRect.width >= boundary.right))
    ) {
      side = flipSide(side);
      coords = computeCoords(referenceRect, floatingRect, side, align, rtl, distance);
    }

    if (
      crossAxis === "y" &&
      (coords.x < boundary.x || coords.x + floatingRect.width > boundary.right) &&
      boundary.width - floatingRect.width < NARROW_INLINE_FLIP_FALLBACK
    ) {
      side = "top";
      crossAxis = "x";
      coords = computeCoords(referenceRect, floatingRect, side, align, rtl, distance);
    }
  }

  if (crossAxis === "x" && shift && align) {
    const minX = boundary.x + shiftPadding;
    const maxX = boundary.right - shiftPadding;
    const currentOverflow = getInlineOverflow(coords, floatingRect, minX, maxX);

    if (currentOverflow > 0) {
      const nextAlign = align === "end" ? "start" : "end";
      const candidate = computeCoords(referenceRect, floatingRect, side, nextAlign, rtl, distance);

      if (getInlineOverflow(candidate, floatingRect, minX, maxX) < currentOverflow) {
        align = nextAlign;
        coords = candidate;
      }
    }
  }

  if (shift) {
    coords.x = clampToBoundary(
      coords.x,
      floatingRect.width,
      boundary.x,
      boundary.right,
      shiftPadding,
    );
    if (crossAxis === "y") {
      coords.y = clampToBoundary(
        coords.y,
        floatingRect.height,
        boundary.y,
        boundary.bottom,
        shiftPadding,
      );
    }
  }

  const arrowX = arrowPercent(
    referenceRect.x + referenceRect.width / 2,
    coords.x,
    floatingRect.width,
  );
  const arrowY = arrowPercent(
    referenceRect.y + referenceRect.height / 2,
    coords.y,
    floatingRect.height,
  );

  const availableHeight = getAvailableHeight(referenceRect, side, boundary, distance, shiftPadding);
  floating.style.setProperty("--arrow-x", `${arrowX}%`);
  floating.style.setProperty("--arrow-y", `${arrowY}%`);
  floating.style.setProperty("--available-height", `${availableHeight}px`);
  floating.dataset.placement = formatPlacement(side, align);
  floating.style.left = `${coords.x}px`;
  floating.style.top = `${coords.y}px`;

  return true;
}

/**
 * Position a floating element relative to a viewport point, useful for context menus.
 *
 * @param {number} x
 * @param {number} y
 * @param {HTMLElement} floating
 * @param {RepositionOptions} [options]
 * @returns {boolean}
 */
export function repositionAt(x, y, floating, options = {}) {
  const doc = floating.ownerDocument;
  const docEl = doc.documentElement;
  const win = doc.defaultView;
  if (!win) return false;

  const direction = doc.dir || docEl?.dir || win.getComputedStyle?.(docEl).direction || "";
  const point = new win.DOMRect(x, y, 0, 0);
  const reference = {
    ownerDocument: doc,
    dir: direction,
    matches: (selector) => selector === ":dir(rtl)" && direction === "rtl",
    getClientRects: () => [point],
  };

  return reposition(reference, floating, options);
}
