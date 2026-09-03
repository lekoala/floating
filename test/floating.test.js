import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { Window } from "happy-dom";

let window;
let document;
let resizeCallback;
let resizeObserver;
let resizeObserveCalls = 0;
let nativeGetComputedStyle;
const resizeObserved = new Set();
const resizeObservers = [];

function installDOM() {
  window = new Window({ url: "https://example.test/" });
  document = window.document;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Event = window.Event;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.DOMRect = window.DOMRect;

  window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  nativeGetComputedStyle = window.getComputedStyle.bind(window);

  window.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.elements = new Set();
      this.disconnected = false;
      resizeCallback = callback;
      resizeObserver = this;
      resizeObservers.push(this);
    }

    observe(element) {
      resizeObserveCalls += 1;
      this.elements.add(element);
      resizeObserved.add(element);
    }

    unobserve(element) {
      this.elements.delete(element);
      resizeObserved.delete(element);
    }

    disconnect() {
      this.disconnected = true;
      for (const element of this.elements) resizeObserved.delete(element);
      this.elements.clear();
    }
  };
}

function uninstallDOM() {
  window?.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.HTMLElement;
  delete globalThis.Element;
  delete globalThis.Event;
  delete globalThis.KeyboardEvent;
  delete globalThis.DOMRect;
}

function setViewport(width = 1024, height = 768) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function mockRect(element, { x, y, width, height }) {
  const rect = {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON() {
      return this;
    },
  };

  element.getBoundingClientRect = () => rect;
  element.getClientRects = () => [rect];
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    value: height,
  });
  return rect;
}

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

before(installDOM);
after(uninstallDOM);

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.dir = "";
  document.body.style.margin = "";
  window.getComputedStyle = nativeGetComputedStyle;
  delete document.documentElement.getBoundingClientRect;
  resizeObserved.clear();
  resizeObservers.length = 0;
  delete window.visualViewport;
});

const floatingModule = import(`../src/floating.js?test=${Date.now()}`);

async function api() {
  return floatingModule;
}

test("module import is SSR-safe", async () => {
  // Import already happened without module-level DOM access before any API call.
  const { reposition } = await api();
  assert.equal(typeof reposition, "function");
});

test("reposition sets coordinates, placement, and available height", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 100, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  assert.equal(reposition(ref, float, { placement: "bottom-start", distance: 8 }), true);
  assert.equal(float.style.left, "100px");
  assert.equal(float.style.top, "132px");
  assert.equal(float.dataset.placement, "bottom-start");
  // The box is edge-aligned, not centered: the arrow points at the reference.
  assert.equal(float.style.getPropertyValue("--arrow-x"), "25%");
  assert.equal(float.style.getPropertyValue("--available-height"), "632px");
});

test("reposition measures transformed floating elements from layout size", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 100, width: 20, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 80, height: 40 });
  Object.defineProperty(float, "offsetWidth", { configurable: true, value: 100 });
  Object.defineProperty(float, "offsetHeight", { configurable: true, value: 50 });

  reposition(ref, float, { placement: "bottom" });
  assert.equal(float.style.left, "60px");
  assert.equal(float.style.top, "120px");
});

test("reposition flips when preferred side overflows", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 730, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  reposition(ref, float, { placement: "bottom-start", distance: 4 });
  assert.equal(float.dataset.placement, "top-start");
  assert.ok(Number.parseFloat(float.style.top) < 730);
});

test("reposition shifts side placements on the y axis", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 730, width: 20, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 100, height: 100 });

  reposition(ref, float, { placement: "right", distance: 8 });
  assert.equal(float.style.top, "664px");
  // The box was pushed up by 26px, so the reference sits below its center.
  assert.equal(float.style.getPropertyValue("--arrow-y"), "76%");
});

test("reposition honors a scoped boundary", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML =
    '<div id="scope"><button id="ref"></button><div id="float"></div></div>';
  const scope = document.getElementById("scope");
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(scope, { x: 50, y: 50, width: 300, height: 200 });
  mockRect(ref, { x: 300, y: 100, width: 40, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 60 });

  reposition(ref, float, { placement: "bottom-start", scope });
  assert.ok(Number.parseFloat(float.style.left) <= 226);
});

test("reposition uses visual viewport offsets", async () => {
  const { reposition } = await api();
  setViewport();
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { width: 500, height: 400, offsetLeft: 20, offsetTop: 30 },
  });
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 480, y: 100, width: 20, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 100, height: 80 });

  reposition(ref, float, { placement: "bottom", distance: 8 });
  assert.equal(float.style.left, "416px");
});

test("reposition returns false for a hidden floating element", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float" hidden></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 100, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  assert.equal(reposition(ref, float), false);
  assert.equal(float.style.left, "");
});

test("reposition returns false when reference is outside boundary", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: -220, y: 100, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  assert.equal(reposition(ref, float, { placement: "bottom-start" }), false);
});

test("repositionAt positions from a point reference", async () => {
  const { repositionAt } = await api();
  setViewport();
  document.body.innerHTML = '<div id="float"></div>';
  const float = document.getElementById("float");
  mockRect(float, { x: 0, y: 0, width: 100, height: 50 });

  repositionAt(200, 160, float, { placement: "right", distance: 10 });
  assert.equal(float.style.left, "210px");
  assert.equal(float.style.top, "135px");
  assert.equal(float.dataset.placement, "right");
});

test("physical right placement is not flipped by RTL", async () => {
  const { repositionAt } = await api();
  setViewport();
  document.documentElement.dir = "rtl";
  document.body.innerHTML = '<div id="float"></div>';
  const float = document.getElementById("float");
  mockRect(float, { x: 0, y: 0, width: 100, height: 50 });

  repositionAt(200, 160, float, { placement: "right", distance: 10 });
  assert.equal(float.style.left, "210px");
});

test("start alignment follows RTL", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref" dir="rtl"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 100, width: 80, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 40, height: 30 });

  reposition(ref, float, { placement: "bottom-start", shift: false });
  assert.equal(float.style.left, "140px");
});

test("autoUpdate observes both reference and floating", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  const stop = autoUpdate(ref, float, () => {});

  assert.equal(resizeObserved.has(ref), true);
  assert.equal(resizeObserved.has(float), true);

  stop();
  assert.equal(resizeObserved.has(ref), false);
  assert.equal(resizeObserved.has(float), false);
});

test("autoUpdate reports reference and floating element resize", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  const calls = [];
  const stop = autoUpdate(ref, float, (detail) => calls.push(detail.type));

  // ResizeObserver reports every newly observed element once before any resize.
  resizeCallback([{ target: ref }, { target: float }], resizeObserver);
  await nextFrame();
  await nextFrame();
  assert.deepEqual(calls, []);

  resizeCallback([{ target: ref }], resizeObserver);
  await nextFrame();
  await nextFrame();
  resizeCallback([{ target: float }], resizeObserver);
  await nextFrame();
  await nextFrame();

  assert.deepEqual(calls, ["element-resize", "element-resize"]);
  stop();
});

test("autoUpdate batches scroll and resize by frame but preserves event types", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  const calls = [];
  const stop = autoUpdate(ref, float, (detail) => calls.push(detail.type));

  window.dispatchEvent(new window.Event("resize"));
  document.dispatchEvent(new window.Event("scroll"));
  await nextFrame();

  assert.deepEqual(calls, ["resize", "scroll"]);
  stop();
});

test("autoUpdate cleanup is idempotent and stops callbacks", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  const calls = [];
  const stop = autoUpdate(ref, float, (detail) => calls.push(detail.type));

  stop();
  stop();
  window.dispatchEvent(new window.Event("resize"));
  await nextFrame();

  assert.deepEqual(calls, []);
});

test("autoUpdate validates ownerDocument", async () => {
  const { autoUpdate } = await api();
  const otherWindow = new Window({ url: "https://other.test/" });
  const ref = document.createElement("button");
  const float = otherWindow.document.createElement("div");

  assert.throws(() => autoUpdate(ref, float, () => {}), /same document/);
  otherWindow.close();
});

test("autoUpdate supports point-positioned surfaces without a reference", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<div id="float"></div>';
  const float = document.getElementById("float");
  const calls = [];
  const stop = autoUpdate(null, float, (detail) => calls.push(detail.type));

  assert.equal(resizeObserved.has(float), true);
  window.dispatchEvent(new window.Event("resize"));
  await nextFrame();
  assert.deepEqual(calls, ["resize"]);
  stop();
});

test("autoUpdate tracks visual viewport scroll and resize", async () => {
  const { autoUpdate } = await api();
  const otherWindow = new Window({ url: "https://viewport.test/" });
  const otherDocument = otherWindow.document;
  const visualViewport = new otherWindow.EventTarget();
  Object.defineProperty(otherWindow, "visualViewport", {
    configurable: true,
    value: visualViewport,
  });
  otherWindow.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  const float = otherDocument.createElement("div");
  otherDocument.body.append(float);
  const calls = [];
  const stop = autoUpdate(null, float, (detail) => calls.push(detail.type));

  visualViewport.dispatchEvent(new otherWindow.Event("scroll"));
  visualViewport.dispatchEvent(new otherWindow.Event("resize"));
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(calls, ["scroll", "resize"]);
  stop();
  otherWindow.close();
});

function reserveScrollbarGutter(width, scrollbarGutter) {
  // The root clientWidth reports the viewport; the <html> border box also loses
  // the reserved gutter, so their difference isolates it.
  document.documentElement.getBoundingClientRect = () => ({ width, height: 768 });
  window.getComputedStyle = (element) =>
    element === document.documentElement ? { scrollbarGutter } : nativeGetComputedStyle(element);
}

test("reposition subtracts a reserved scrollbar gutter from the viewport boundary", async () => {
  const { reposition } = await api();
  setViewport();
  reserveScrollbarGutter(1009, "stable");
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 950, y: 100, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  reposition(ref, float, { placement: "bottom", distance: 8 });
  assert.equal(float.style.left, "885px");
});

test("reposition ignores a narrowed html box without a declared gutter", async () => {
  const { reposition } = await api();
  setViewport();
  // Same 15px narrowing, but from a margin/width/transform rather than a gutter.
  reserveScrollbarGutter(1009, "auto");
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 950, y: 100, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  reposition(ref, float, { placement: "bottom", distance: 8 });
  assert.equal(float.style.left, "900px");
});

test("reposition falls back to top when a side placement cannot fit inline", async () => {
  const { reposition } = await api();
  setViewport(300, 768);
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 300, width: 40, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 260, height: 100 });

  reposition(ref, float, { placement: "right" });
  assert.equal(float.dataset.placement, "top");
  assert.equal(float.style.left, "4px");
  assert.equal(float.style.top, "200px");
  assert.equal(float.style.getPropertyValue("--arrow-x"), "44.615%");
});

test("reposition realigns start to end instead of clamping", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 960, y: 100, width: 40, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 200, height: 50 });

  reposition(ref, float, { placement: "bottom-start" });
  assert.equal(float.dataset.placement, "bottom-end");
  assert.equal(float.style.left, "800px");
  assert.equal(float.style.top, "120px");
  // Realigned to the end: the reference now sits near the far edge of the box.
  assert.equal(float.style.getPropertyValue("--arrow-x"), "90%");
});

test("reposition reports arrow offset when clamped to the boundary", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 990, y: 100, width: 20, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 200, height: 50 });

  reposition(ref, float, { placement: "bottom" });
  assert.equal(float.style.left, "820px");
  // The box was pushed left by 80px, so the reference sits right of its center.
  assert.equal(float.style.getPropertyValue("--arrow-x"), "90%");
});

test("reposition honors shiftPadding", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 990, y: 100, width: 20, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 200, height: 50 });

  reposition(ref, float, { placement: "bottom", shiftPadding: 20 });
  assert.equal(float.style.left, "804px");
});

test("flip: false keeps the preferred side even when it overflows", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 730, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  reposition(ref, float, { placement: "bottom-start", distance: 4, flip: false });
  assert.equal(float.dataset.placement, "bottom-start");
  assert.equal(float.style.top, "758px");
});

test("shift: false leaves the element where the placement puts it", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 960, y: 100, width: 40, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 200, height: 50 });

  reposition(ref, float, { placement: "bottom-start", shift: false });
  assert.equal(float.dataset.placement, "bottom-start");
  assert.equal(float.style.left, "960px");
  assert.equal(float.style.getPropertyValue("--arrow-x"), "10%");

  reposition(ref, float, { placement: "bottom-start" });
  assert.equal(float.dataset.placement, "bottom-end");
  assert.equal(float.style.left, "800px");
});

test("reposition reports available height above a top placement", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 100, y: 400, width: 60, height: 24 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 80 });

  reposition(ref, float, { placement: "top", distance: 8 });
  assert.equal(float.dataset.placement, "top");
  assert.equal(float.style.getPropertyValue("--available-height"), "388px");
});

test("reposition returns false when the reference is outside a scoped boundary", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML =
    '<div id="scope"><div id="float"></div></div><button id="ref"></button>';
  const scope = document.getElementById("scope");
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(scope, { x: 50, y: 50, width: 300, height: 200 });
  mockRect(ref, { x: 400, y: 100, width: 40, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 120, height: 60 });

  assert.equal(reposition(ref, float, { placement: "bottom-start", scope }), false);
  assert.equal(float.style.left, "");
});

test("repositionAt follows document direction for start alignment", async () => {
  const { repositionAt } = await api();
  setViewport();
  document.body.innerHTML = '<div id="float"></div>';
  const float = document.getElementById("float");
  mockRect(float, { x: 0, y: 0, width: 100, height: 50 });

  repositionAt(200, 160, float, { placement: "bottom-start" });
  assert.equal(float.style.left, "200px");

  document.documentElement.dir = "rtl";
  repositionAt(200, 160, float, { placement: "bottom-start" });
  assert.equal(float.style.left, "100px");
});

test("autoUpdate ignores the initial ResizeObserver delivery and keeps observing", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  const calls = [];
  const stop = autoUpdate(ref, float, (detail) => calls.push(detail.type));
  const observeCalls = resizeObserveCalls;

  resizeCallback([{ target: ref }, { target: float }], resizeObserver);
  await nextFrame();
  await nextFrame();
  assert.deepEqual(calls, []);

  resizeCallback([{ target: float }], resizeObserver);
  await nextFrame();
  await nextFrame();
  assert.deepEqual(calls, ["element-resize"]);

  // Elements stay observed: no unobserve/re-observe cycle per delivery.
  assert.equal(resizeObserveCalls, observeCalls);
  assert.equal(resizeObserved.has(ref), true);
  assert.equal(resizeObserved.has(float), true);
  stop();
});

test("each subscription owns its size observer", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<button id="ref"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  const calls = [];
  const observeCalls = resizeObserveCalls;
  const stopA = autoUpdate(ref, float, () => calls.push("a"));
  const stopB = autoUpdate(ref, float, () => calls.push("b"));

  // Two subscriptions, one observer each, watching reference and floating.
  assert.equal(resizeObservers.length, 2);
  assert.equal(resizeObserveCalls - observeCalls, 4);

  window.dispatchEvent(new window.Event("resize"));
  await nextFrame();
  assert.deepEqual(calls, ["a", "b"]);

  stopA();
  assert.equal(resizeObservers[0].disconnected, true);
  assert.equal(resizeObservers[1].disconnected, false);
  stopB();
  assert.equal(resizeObservers[1].disconnected, true);
});

test("autoUpdate does not deliver an event queued before the subscription", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<div id="early"></div><div id="late"></div>';
  const early = document.getElementById("early");
  const late = document.getElementById("late");
  const earlyCalls = [];
  const lateCalls = [];
  const stopEarly = autoUpdate(null, early, (detail) => earlyCalls.push(detail.type));

  document.dispatchEvent(new window.Event("scroll"));
  const stopLate = autoUpdate(null, late, (detail) => lateCalls.push(detail.type));
  await nextFrame();

  assert.deepEqual(earlyCalls, ["scroll"]);
  assert.deepEqual(lateCalls, []);
  stopEarly();
  stopLate();
});

test("autoUpdate shares document listeners and detaches them with the last subscription", async () => {
  const { autoUpdate } = await api();
  const otherWindow = new Window({ url: "https://listeners.test/" });
  const otherDocument = otherWindow.document;
  otherWindow.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  const added = [];
  const removed = [];
  const nativeAdd = otherDocument.addEventListener.bind(otherDocument);
  const nativeRemove = otherDocument.removeEventListener.bind(otherDocument);
  otherDocument.addEventListener = (type, ...rest) => {
    added.push(type);
    return nativeAdd(type, ...rest);
  };
  otherDocument.removeEventListener = (type, ...rest) => {
    removed.push(type);
    return nativeRemove(type, ...rest);
  };

  const first = otherDocument.createElement("div");
  const second = otherDocument.createElement("div");
  otherDocument.body.append(first, second);
  const stopFirst = autoUpdate(null, first, () => {});
  const stopSecond = autoUpdate(null, second, () => {});

  assert.deepEqual(added, ["scroll"]);
  stopFirst();
  assert.deepEqual(removed, []);
  stopSecond();
  assert.deepEqual(removed, ["scroll"]);
  otherWindow.close();
});

test("autoUpdate rejects invalid arguments", async () => {
  const { autoUpdate } = await api();
  document.body.innerHTML = '<div id="float"></div>';
  const float = document.getElementById("float");

  assert.throws(() => autoUpdate(null, null, () => {}), TypeError);
  assert.throws(() => autoUpdate(null, float, null), TypeError);
});

test("reposition drops shiftPadding when the element cannot fit inside it", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML =
    '<div id="scope"><div id="float"></div></div><button id="ref"></button>';
  const scope = document.getElementById("scope");
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(scope, { x: 50, y: 50, width: 200, height: 200 });
  mockRect(ref, { x: 100, y: 100, width: 20, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 196, height: 60 });

  // 196 + 2 * 4 does not fit in a 200px boundary: containment wins over padding.
  reposition(ref, float, { placement: "bottom", scope });
  assert.equal(float.style.left, "50px");
});

test("reposition aligns an oversized element to the boundary start", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML =
    '<div id="scope"><div id="float"></div></div><button id="ref"></button>';
  const scope = document.getElementById("scope");
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(scope, { x: 50, y: 50, width: 200, height: 200 });
  mockRect(ref, { x: 100, y: 100, width: 20, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 400, height: 60 });

  reposition(ref, float, { placement: "bottom", scope });
  assert.equal(float.style.left, "50px");
  assert.equal(float.style.getPropertyValue("--arrow-x"), "15%");
});

test("reposition keeps arrow percentages inside the floating box", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML =
    '<div id="scope"><div id="float"></div></div><button id="ref"></button>';
  const scope = document.getElementById("scope");
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(scope, { x: 50, y: 50, width: 200, height: 200 });
  mockRect(ref, { x: 240, y: 100, width: 20, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 100, height: 60 });

  // The reference ends up past the clamped box, so the arrow stops at its edge.
  reposition(ref, float, { placement: "bottom", scope });
  assert.equal(float.style.left, "146px");
  assert.equal(float.style.getPropertyValue("--arrow-x"), "100%");
});

test("reposition returns false without a browsing context", async () => {
  const { reposition, repositionAt } = await api();
  setViewport();
  document.body.innerHTML = '<div id="float"></div>';
  const float = document.getElementById("float");
  mockRect(float, { x: 0, y: 0, width: 100, height: 50 });

  const viewless = document.implementation.createHTMLDocument("");
  assert.equal(viewless.defaultView, null);
  const reference = {
    ownerDocument: viewless,
    getClientRects: () => [
      { x: 10, y: 10, left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 },
    ],
  };

  assert.equal(reposition(reference, float, { placement: "bottom" }), false);
  assert.equal(float.style.left, "");

  const viewlessFloat = viewless.createElement("div");
  viewless.body.append(viewlessFloat);
  assert.equal(repositionAt(10, 10, viewlessFloat), false);
});

test("autoUpdate rejects a document without a browsing context", async () => {
  const { autoUpdate } = await api();
  const viewless = document.implementation.createHTMLDocument("");
  const float = viewless.createElement("div");
  viewless.body.append(float);

  assert.throws(() => autoUpdate(null, float, () => {}), TypeError);
});

test("the arrow points at the reference on an RTL aligned placement", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<button id="ref" dir="rtl"></button><div id="float"></div>';
  const ref = document.getElementById("ref");
  const float = document.getElementById("float");
  mockRect(ref, { x: 600, y: 100, width: 100, height: 20 });
  mockRect(float, { x: 0, y: 0, width: 300, height: 60 });

  // RTL `start` aligns the far edges: the box spans 400..700 under a 600..700
  // reference, so the arrow belongs near the end of the box, not in its middle.
  reposition(ref, float, { placement: "bottom-start" });
  assert.equal(float.style.left, "400px");
  assert.equal(float.style.getPropertyValue("--arrow-x"), "83.333%");
});

test("autoUpdate coalesces the window and visual viewport resize into one call", async () => {
  const { autoUpdate } = await api();
  const otherWindow = new Window({ url: "https://dupe.test/" });
  const otherDocument = otherWindow.document;
  const visualViewport = new otherWindow.EventTarget();
  Object.defineProperty(otherWindow, "visualViewport", {
    configurable: true,
    value: visualViewport,
  });
  otherWindow.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  const float = otherDocument.createElement("div");
  otherDocument.body.append(float);
  const calls = [];
  const stop = autoUpdate(null, float, (detail) => calls.push(detail));

  // A real window resize fires on both targets; the consumer must see it once.
  otherWindow.dispatchEvent(new otherWindow.Event("resize"));
  visualViewport.dispatchEvent(new otherWindow.Event("resize"));
  await nextFrame();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "resize");
  stop();
  otherWindow.close();
});
