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
 * @property {Placement} [placement="bottom-start"] Preferred physical side and logical alignment.
 * @property {number} [distance=0] Distance in CSS pixels between reference and floating element.
 * @property {boolean} [flip=true] Flip to the opposite side when the preferred side overflows.
 * @property {boolean} [shift=true] Shift inside the active boundary when needed.
 * @property {number} [shiftPadding=4] Minimum distance in CSS pixels from the boundary while shifting.
 * @property {HTMLElement} [scope] Optional clipping/positioning boundary instead of the visual viewport.
 */

/**
 * @typedef {Object} VirtualReference
 * @property {Document} ownerDocument
 * @property {string} [dir]
 * @property {(selector: string) => boolean} [matches]
 * @property {() => ArrayLike<DOMRect>} getClientRects
 */

/** @typedef {Element | VirtualReference} PositionReference */

/**
 * @typedef {Object} AutoUpdateDetail
 * @property {"scroll" | "resize" | "element-resize"} type
 * @property {Set<EventTarget>} targets Event or resized element targets coalesced into this frame.
 * @property {number} timeStamp Greatest source event timestamp coalesced into this frame.
 */

function getSide(placement) {
  return placement.split("-")[0];
}

function getAlignment(placement) {
  return placement.split("-")[1] || null;
}

function getMainAxis(placement) {
  return ["top", "bottom"].includes(getSide(placement)) ? "x" : "y";
}

function flipSide(side) {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  if (side === "right") return "left";
  return side;
}

function computeCoords(reference, floating, placement, rtl) {
  const commonX = reference.x + reference.width / 2 - floating.width / 2;
  const commonY = reference.y + reference.height / 2 - floating.height / 2;
  const mainAxis = getMainAxis(placement);
  const commonAlign =
    reference[mainAxis === "x" ? "width" : "height"] / 2 -
    floating[mainAxis === "x" ? "width" : "height"] / 2;
  const side = getSide(placement);

  let coords;
  switch (side) {
    case "top":
      coords = { x: commonX, y: reference.y - floating.height };
      break;
    case "bottom":
      coords = { x: commonX, y: reference.y + reference.height };
      break;
    case "right":
      coords = { x: reference.x + reference.width, y: commonY };
      break;
    case "left":
      coords = { x: reference.x - floating.width, y: commonY };
      break;
    default:
      coords = { x: reference.x, y: reference.y };
  }

  const align = getAlignment(placement);
  const isVertical = mainAxis === "x";
  if (align === "start") coords[mainAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
  if (align === "end") coords[mainAxis] += commonAlign * (rtl && isVertical ? -1 : 1);

  return coords;
}

function applyOffset(coords, side, offset) {
  switch (side) {
    case "top":
      coords.y -= offset;
      break;
    case "bottom":
      coords.y += offset;
      break;
    case "left":
      coords.x -= offset;
      break;
    case "right":
      coords.x += offset;
      break;
  }
}

function getInlineOverflow(coords, floating, minX, maxX) {
  return Math.max(minX - coords.x, 0) + Math.max(coords.x + floating.width - maxX, 0);
}

function toBoundary(rect) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  };
}

/** @param {PositionReference} element */
function supportsDirSelector(element) {
  const css = element.ownerDocument?.defaultView?.CSS;
  return typeof css?.supports === "function" && css.supports("selector(:dir(rtl))");
}

/** @param {PositionReference} element */
function isRTL(element) {
  const direction = "dir" in element ? element.dir : "";
  if (direction === "rtl") return true;
  if (direction === "ltr") return false;
  if (supportsDirSelector(element) && typeof element.matches === "function") {
    return element.matches(":dir(rtl)");
  }
  const win = element.ownerDocument?.defaultView;
  if (win?.Element && element instanceof win.Element) {
    return win.getComputedStyle(element).direction === "rtl";
  }
  return false;
}

function toNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

const STABLE_SCROLLBAR_MAX_WIDTH = 25;
const NARROW_INLINE_FLIP_FALLBACK = 128;

function getViewportBoundary(doc) {
  const win = doc.defaultView;
  if (!win) throw new Error("@lekoala/floating requires a browser document at call time");

  const docEl = doc.documentElement;
  const visualViewport = win.visualViewport;
  const x = visualViewport?.offsetLeft || 0;
  const y = visualViewport?.offsetTop || 0;
  let width = visualViewport?.width || docEl.clientWidth || win.innerWidth;
  const height = visualViewport?.height || docEl.clientHeight || win.innerHeight;

  const body = doc.body;
  if (body?.clientWidth > 0) {
    const bodyStyle = win.getComputedStyle?.(body);
    const bodyMargin =
      doc.compatMode === "CSS1Compat"
        ? toNumber(bodyStyle?.marginLeft) + toNumber(bodyStyle?.marginRight)
        : 0;
    const stableScrollbar = Math.abs(docEl.clientWidth - body.clientWidth - bodyMargin);
    if (stableScrollbar <= STABLE_SCROLLBAR_MAX_WIDTH) width -= stableScrollbar;
  }

  return toBoundary({ x, y, width, height });
}

function getBoundary(reference, options) {
  if (!options.scope) return getViewportBoundary(reference.ownerDocument);
  const rect = options.scope.getBoundingClientRect();
  return toBoundary({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
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

function isVisible(element) {
  if (element.hidden) return false;
  if (typeof element.checkVisibility === "function") return element.checkVisibility();
  return element.getClientRects().length > 0;
}

function getFloatingSize(floating) {
  const rect = floating.getBoundingClientRect();
  return {
    width: floating.offsetWidth || rect.width,
    height: floating.offsetHeight || rect.height,
  };
}

/* Per-document update trackers. A document gets one captured scroll listener,
 * one resize listener, and one ResizeObserver regardless of subscription count. */
const trackers = new WeakMap();

function createTracker(doc) {
  const win = doc.defaultView;
  if (!win) throw new Error("@lekoala/floating requires a browser document at call time");

  /** @type {Set<{reference: Element | null, floating: HTMLElement, callback: (detail: AutoUpdateDetail) => void}>} */
  const subscriptions = new Set();
  /** @type {Map<Element, number>} */
  const observed = new Map();
  /** @type {Map<{reference: Element | null, floating: HTMLElement, callback: (detail: AutoUpdateDetail) => void}, Map<AutoUpdateDetail["type"], {targets: Set<EventTarget>, timeStamp: number}>>} */
  const pending = new Map();

  const ResizeObserverCtor = win.ResizeObserver;
  let resizeObserver = null;
  let tick = false;
  let listening = false;

  function queue(subscription, type, source) {
    let notifications = pending.get(subscription);
    if (!notifications) {
      notifications = new Map();
      pending.set(subscription, notifications);
    }

    let notification = notifications.get(type);
    if (!notification) {
      notification = { targets: new Set(), timeStamp: 0 };
      notifications.set(type, notification);
    }

    if (source?.target) notification.targets.add(source.target);
    notification.timeStamp = Math.max(notification.timeStamp, source?.timeStamp || 0);
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
        for (const [type, detail] of types) subscription.callback({ type, ...detail });
      }
    });
  }

  function notifyAll(type, source) {
    for (const subscription of subscriptions) queue(subscription, type, source);
    scheduleFlush();
  }

  function notifyElementResize(source) {
    for (const subscription of subscriptions) {
      if (subscription.reference === source.target || subscription.floating === source.target) {
        queue(subscription, "element-resize", source);
      }
    }
    scheduleFlush();
  }

  function getResizeObserver() {
    if (resizeObserver || !ResizeObserverCtor) return resizeObserver;

    resizeObserver = new ResizeObserverCtor((entries, observer) => {
      for (const entry of entries) {
        observer.unobserve(entry.target);
        notifyElementResize(entry);
        win.requestAnimationFrame(() => {
          if ((observed.get(entry.target) || 0) > 0) observer.observe(entry.target);
        });
      }
    });
    return resizeObserver;
  }

  function observe(element) {
    const count = observed.get(element) || 0;
    observed.set(element, count + 1);
    if (count === 0) getResizeObserver()?.observe(element);
  }

  function unobserve(element) {
    const count = observed.get(element) || 0;
    if (count <= 1) {
      observed.delete(element);
      resizeObserver?.unobserve(element);
    } else {
      observed.set(element, count - 1);
    }
  }

  const onScroll = (event) => notifyAll("scroll", event);
  const onResize = (event) => notifyAll("resize", event);

  function startListening() {
    if (listening) return;
    doc.addEventListener("scroll", onScroll, { passive: true, capture: true });
    win.addEventListener("resize", onResize, { passive: true });
    listening = true;
  }

  function stopListening() {
    if (!listening) return;
    doc.removeEventListener("scroll", onScroll, { capture: true });
    win.removeEventListener("resize", onResize);
    listening = false;
  }

  return {
    add(reference, floating, callback) {
      const subscription = { reference, floating, callback };
      subscriptions.add(subscription);
      startListening();
      if (reference) observe(reference);
      if (floating !== reference) observe(floating);

      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        subscriptions.delete(subscription);
        pending.delete(subscription);
        if (reference) unobserve(reference);
        if (floating !== reference) unobserve(floating);
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
 * `--available-height` to the floating element.
 *
 * @param {PositionReference} reference
 * @param {HTMLElement} floating
 * @param {RepositionOptions} [options]
 * @returns {boolean} False when positioning cannot be performed (hidden floating element, missing rect, or reference outside boundary).
 */
export function reposition(reference, floating, options = {}) {
  if (!isVisible(floating)) return false;

  const placement = /** @type {Placement} */ (options.placement || "bottom-start");
  const distance = options.distance || 0;
  const flip = options.flip !== false;
  const shift = options.shift !== false;
  const shiftPadding = options.shiftPadding ?? 4;
  const rtl = isRTL(reference);

  const rects = reference.getClientRects();
  const referenceRect = placement.startsWith("bottom") ? rects[rects.length - 1] : rects[0];
  if (!referenceRect) return false;

  const boundary = getBoundary(reference, options);
  if (isOutsideBoundary(referenceRect, boundary)) return false;

  const floatingRect = getFloatingSize(floating);
  const minBoundaryX = boundary.x;
  const minBoundaryY = boundary.y;
  const maxBoundaryX = boundary.right;
  const maxBoundaryY = boundary.bottom;

  let side = getSide(placement);
  const align = getAlignment(placement);
  let axis = getMainAxis(placement);
  let current = placement;
  let coords = computeCoords(referenceRect, floatingRect, current, rtl);
  applyOffset(coords, side, distance);

  if (flip) {
    const x = Math.ceil(coords.x);
    const y = Math.ceil(coords.y);

    if (
      (axis === "x" && (y < minBoundaryY || y + floatingRect.height >= maxBoundaryY)) ||
      (axis === "y" && (x < minBoundaryX || x + floatingRect.width >= maxBoundaryX))
    ) {
      side = flipSide(side);
      current = /** @type {Placement} */ (align ? `${side}-${align}` : side);
      coords = computeCoords(referenceRect, floatingRect, current, rtl);
      applyOffset(coords, side, distance);
    }

    if (
      axis === "y" &&
      (coords.x < minBoundaryX || coords.x + floatingRect.width > maxBoundaryX) &&
      boundary.width - floatingRect.width < NARROW_INLINE_FLIP_FALLBACK
    ) {
      side = "top";
      axis = "x";
      current = /** @type {Placement} */ (align ? `${side}-${align}` : side);
      coords = computeCoords(referenceRect, floatingRect, current, rtl);
      applyOffset(coords, side, distance);
    }
  }

  if (axis === "x" && shift && getAlignment(current)) {
    const minX = minBoundaryX + shiftPadding;
    const maxX = maxBoundaryX - shiftPadding;
    const currentOverflow = getInlineOverflow(coords, floatingRect, minX, maxX);

    if (currentOverflow > 0) {
      const nextAlign = getAlignment(current) === "end" ? "start" : "end";
      const candidatePlacement = /** @type {Placement} */ (`${side}-${nextAlign}`);
      const candidate = computeCoords(referenceRect, floatingRect, candidatePlacement, rtl);
      applyOffset(candidate, side, distance);

      if (getInlineOverflow(candidate, floatingRect, minX, maxX) < currentOverflow) {
        current = candidatePlacement;
        coords = candidate;
      }
    }
  }

  let arrowX = 50;
  if (shift || floatingRect.width > referenceRect.width) {
    const minX = minBoundaryX + shiftPadding;
    const maxX = maxBoundaryX - floatingRect.width - shiftPadding;

    if (coords.x < minX) {
      const total = minX - coords.x;
      coords.x = minX;
      arrowX = 50 - (total / floatingRect.width) * 100;
    } else if (coords.x > maxX) {
      const total = maxX - coords.x;
      coords.x = Math.max(minBoundaryX, maxX);
      arrowX = 50 + (total / floatingRect.width) * 100;
    }
  }

  let arrowY = 50;
  if (axis === "y" && (shift || floatingRect.height > referenceRect.height)) {
    const minY = minBoundaryY + shiftPadding;
    const maxY = maxBoundaryY - floatingRect.height - shiftPadding;

    if (coords.y < minY) {
      const total = minY - coords.y;
      coords.y = minY;
      arrowY = 50 - (total / floatingRect.height) * 100;
    } else if (coords.y > maxY) {
      const total = maxY - coords.y;
      coords.y = Math.max(minBoundaryY, maxY);
      arrowY = 50 + (total / floatingRect.height) * 100;
    }
  }

  const availableHeight = getAvailableHeight(
    referenceRect,
    side,
    boundary,
    distance,
    shiftPadding,
  );
  floating.style.setProperty("--arrow-x", `${arrowX}%`);
  floating.style.setProperty("--arrow-y", `${arrowY}%`);
  floating.style.setProperty("--available-height", `${availableHeight}px`);
  floating.dataset.placement = current;
  Object.assign(floating.style, {
    left: `${coords.x}px`,
    top: `${coords.y}px`,
  });

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
  if (!win) throw new Error("@lekoala/floating requires a browser document at call time");

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
