import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { Window } from "happy-dom";

let window;
let document;
let resizeCallback;
let resizeObserver;
const resizeObserved = new Set();

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

  window.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      resizeCallback = callback;
      resizeObserver = this;
    }

    observe(element) {
      resizeObserved.add(element);
    }

    unobserve(element) {
      resizeObserved.delete(element);
    }

    disconnect() {
      resizeObserved.clear();
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
  resizeObserved.clear();
  delete window.visualViewport;
});

const floatingModule = import(`../src/index.js?test=${Date.now()}`);

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
  assert.equal(float.style.getPropertyValue("--arrow-x"), "50%");
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
  assert.equal(float.style.getPropertyValue("--arrow-y"), "24%");
});

test("reposition honors a scoped boundary", async () => {
  const { reposition } = await api();
  setViewport();
  document.body.innerHTML = '<div id="scope"><button id="ref"></button><div id="float"></div></div>';
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
  const stop = autoUpdate(ref, float, (detail) => calls.push(detail));

  resizeCallback([{ target: ref }], resizeObserver);
  await nextFrame();
  await nextFrame();
  resizeCallback([{ target: float }], resizeObserver);
  await nextFrame();
  await nextFrame();

  assert.deepEqual(calls.map((entry) => entry.type), ["element-resize", "element-resize"]);
  assert.equal(calls[0].targets.has(ref), true);
  assert.equal(calls[1].targets.has(float), true);
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
