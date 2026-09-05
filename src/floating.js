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
 * @property {boolean | undefined} [flip=true] Take the opposite side when it overflows the boundary less than the preferred one.
 * @property {boolean | undefined} [shift=true] Clamp on the cross axis only.
 * @property {number | undefined} [shiftPadding=4] Boundary padding in CSS pixels for side selection and shifting. Clamping may drop it to fit.
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
 * @property {"scroll" | "resize" | "element-resize"} type Most specific change since the last frame, at most one per frame.
 */

/* Alignment and shift use x for top/bottom, y for left/right. */
/** @param {string} side */
function crossAxisFor(side) {
  return side === "top" || side === "bottom" ? "x" : "y";
}

/** @param {string} placement */
function parsePlacement(placement) {
  const [side, align = null] = placement.split("-");
  return { side, align, crossAxis: crossAxisFor(side) };
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

  /* RTL changes horizontal start/end alignment only. */
  if (align === "start" || align === "end") {
    const direction = (rtl && crossAxis === "x" ? -1 : 1) * (align === "end" ? 1 : -1);
    coords[crossAxis] += commonAlign * direction;
  }

  return coords;
}

/* Total overflow past both edges. */
function overflowOn(position, size, start, end) {
  return Math.max(start - position, 0) + Math.max(position + size - end, 0);
}

/* Resolve inherited direction and dir="auto" from the rendered tree. */
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

/* Upper bound for the reserved-gutter heuristic. */
const STABLE_SCROLLBAR_MAX_WIDTH = 25;

function getViewportBoundary(doc) {
  const win = doc.defaultView;
  if (!win) return null;

  const docEl = doc.documentElement;
  const visualViewport = win.visualViewport;
  const x = visualViewport?.offsetLeft || 0;
  const y = visualViewport?.offsetTop || 0;
  let width = visualViewport?.width || docEl.clientWidth || win.innerWidth;
  const height = visualViewport?.height || docEl.clientHeight || win.innerHeight;

  /* Detect reserved root gutter space; require a declared gutter to exclude
   * unrelated changes to the root box. */
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

function getBoundary(reference, options) {
  return options.scope
    ? options.scope.getBoundingClientRect()
    : getViewportBoundary(reference.ownerDocument);
}

/* Drop padding when needed to fit; align oversized boxes to the start. */
function clampToBoundary(position, size, start, end, padding) {
  const paddedMin = start + padding;
  const paddedMax = end - size - padding;
  const fitsPadded = paddedMax >= paddedMin;
  const min = fitsPadded ? paddedMin : start;
  const max = fitsPadded ? paddedMax : end - size;
  return Math.max(min, Math.min(position, max));
}

/* Reference center as a clamped percentage of the floating box. */
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

/* Visibility and opacity do not prevent measurement. */
function isVisible(element) {
  if (element.hidden) return false;
  if (typeof element.checkVisibility === "function") return element.checkVisibility();
  return element.getClientRects().length > 0;
}

/* Use layout dimensions to ignore transforms on the floating element. */
function getFloatingSize(floating) {
  const width = floating.offsetWidth;
  const height = floating.offsetHeight;
  if (width && height) return { width, height };
  const rect = floating.getBoundingClientRect();
  return { width: width || rect.width, height: height || rect.height };
}

/* Share viewport listeners per document; observe sizes per subscription. */
const trackers = new WeakMap();
const TYPE_PRIORITY = { scroll: 0, resize: 1, "element-resize": 2 };

function createTracker(doc) {
  const win = doc.defaultView;
  if (!win) throw new TypeError("floating must belong to a document with a browsing context");

  /** @type {Set<Subscription>} */
  const subscriptions = new Set();
  /** @type {Map<Subscription, AutoUpdateDetail["type"]>} */
  const pending = new Map();

  const ResizeObserverCtor = win.ResizeObserver;
  let tick = false;
  let listening = false;
  const visualViewport = win.visualViewport;

  /* Keep one cause per subscription per frame, by priority. */
  function queue(subscription, type) {
    const current = pending.get(subscription);
    if (current === undefined || TYPE_PRIORITY[type] > TYPE_PRIORITY[current]) {
      pending.set(subscription, type);
    }
  }

  function scheduleFlush() {
    if (tick) return;
    tick = true;
    win.requestAnimationFrame(() => {
      const notifications = [...pending];
      pending.clear();
      tick = false;

      for (const [subscription, type] of notifications) {
        if (!subscriptions.has(subscription) || !subscription.floating.isConnected) continue;
        subscription.callback({ type });
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
      /* Ignore the initial delivery for each observed element. */
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
 * Track scroll, viewport resize, and both element sizes, once per frame.
 * No initial callback: position once before subscribing.
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
 * One positioning pass.
 *
 * @param {PositionReference} reference
 * @param {HTMLElement} floating
 * @param {RepositionOptions} options
 * @returns {{ width: number, height: number, roomChanged: boolean, placement: Placement } | null} Measured size and resolved placement, or null.
 */
function positionOnce(reference, floating, options) {
  if (!isVisible(floating)) return null;

  const placement = /** @type {Placement} */ (options.placement || "bottom-start");
  const distance = options.distance || 0;
  const flip = options.flip !== false;
  const shift = options.shift !== false;
  const shiftPadding = options.shiftPadding ?? 4;

  let { side, align, crossAxis } = parsePlacement(placement);
  /* Centered placements do not need direction. */
  const rtl = align ? isRTL(reference) : false;

  const rects = reference.getClientRects();
  const referenceRect = side === "bottom" ? rects[rects.length - 1] : rects[0];
  if (!referenceRect) return null;

  const boundary = getBoundary(reference, options);
  if (!boundary || isOutsideBoundary(referenceRect, boundary)) return null;

  const floatingRect = getFloatingSize(floating);
  /* Compare with padding; clamping may drop it to fit the boundary. */
  const limits = {
    x: { size: floatingRect.width, start: boundary.x, end: boundary.right },
    y: { size: floatingRect.height, start: boundary.y, end: boundary.bottom },
  };
  const place = (nextSide, nextAlign) =>
    computeCoords(referenceRect, floatingRect, nextSide, nextAlign, rtl, distance);
  const overflowAt = (position, axis) => {
    const { size, start, end } = limits[axis];
    return overflowOn(position, size, start + shiftPadding, end - shiftPadding);
  };
  /* Remaining cross-axis overflow after an optional shift. */
  const shiftedOverflowAt = (position, axis) => {
    const { size, start, end } = limits[axis];
    return overflowAt(
      shift ? clampToBoundary(position, size, start, end, shiftPadding) : position,
      axis,
    );
  };

  let coords = place(side, align);

  if (flip) {
    const mainAxis = crossAxis === "x" ? "y" : "x";
    let overflow = overflowAt(coords[mainAxis], mainAxis);

    /* Opposite sides share cross-axis coordinates; compare the main axis. */
    if (overflow > 0) {
      const opposite = flipSide(side);
      const flipped = place(opposite, align);
      const flippedOverflow = overflowAt(flipped[mainAxis], mainAxis);

      if (flippedOverflow < overflow) {
        side = opposite;
        coords = flipped;
        overflow = flippedOverflow;
      }
    }

    /* Compare both axes after shifting before switching to top/bottom. */
    if (mainAxis === "x" && overflow > 0) {
      const above = place("top", align);
      const below = place("bottom", align);
      // Top and bottom share their x, so only y separates the two.
      const useBottom = overflowAt(below.y, "y") < overflowAt(above.y, "y");
      const candidate = useBottom ? below : above;
      const swapped = overflowAt(candidate.y, "y") + shiftedOverflowAt(candidate.x, "x");

      if (swapped < overflow + shiftedOverflowAt(coords.y, "y")) {
        side = useBottom ? "bottom" : "top";
        crossAxis = "x";
        coords = candidate;
      }
    }
  }

  if (crossAxis === "x" && shift && align) {
    const overflow = overflowAt(coords.x, "x");

    if (overflow > 0) {
      const nextAlign = align === "end" ? "start" : "end";
      const candidate = place(side, nextAlign);

      if (overflowAt(candidate.x, "x") < overflow) {
        align = nextAlign;
        coords = candidate;
      }
    }
  }

  /* Shift only across the chosen side. */
  if (shift) {
    const { size, start, end } = limits[crossAxis];
    coords[crossAxis] = clampToBoundary(coords[crossAxis], size, start, end, shiftPadding);
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

  const availableHeight = `${getAvailableHeight(referenceRect, side, boundary, distance, shiftPadding)}px`;
  const { style } = floating;
  /* Reading the inline value does not trigger layout. */
  const roomChanged = style.getPropertyValue("--available-height") !== availableHeight;

  style.left = `${coords.x}px`;
  style.top = `${coords.y}px`;
  style.setProperty("--arrow-x", `${arrowX}%`);
  style.setProperty("--arrow-y", `${arrowY}%`);
  style.setProperty("--available-height", availableHeight);

  const resolved = /** @type {Placement} */ (align ? `${side}-${align}` : side);
  floating.dataset.placement = resolved;

  return {
    width: floatingRect.width,
    height: floatingRect.height,
    roomChanged,
    placement: resolved,
  };
}

/**
 * Position a floating element relative to a reference element.
 *
 * Uses viewport coordinates; normally requires `position: fixed`.
 * Writes left/top, data-placement, --arrow-x/y (0%-100%), and --available-height.
 *
 * @param {PositionReference} reference
 * @param {HTMLElement} floating
 * @param {RepositionOptions} [options]
 * @returns {boolean} False when positioning cannot be performed: hidden floating element, missing reference rect, reference outside the boundary, or a document without a browsing context.
 */
export function reposition(reference, floating, options = {}) {
  const measured = positionOnce(reference, floating, options);
  if (!measured) return false;

  /* If the new height limit resizes the box, correct once on the chosen side. */
  if (measured.roomChanged) {
    const settled = getFloatingSize(floating);
    if (settled.width !== measured.width || settled.height !== measured.height) {
      positionOnce(reference, floating, {
        ...options,
        placement: measured.placement,
        flip: false,
      });
    }
  }

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
