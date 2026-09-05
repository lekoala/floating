/*
 * Real-browser checks, run in headless Chrome through `Bun.WebView`.
 *
 * The happy-dom suite proves the arithmetic against synthetic rects. These
 * cases prove what only a real engine can answer: the top layer and the popover
 * UA styles, `--available-height` actually constraining a box, layout size
 * versus a painted transform, `:dir(rtl)`, and tracking a real scroll. They are
 * skipped when no Chrome is available.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";

const VIEWPORT = { width: 900, height: 700 };

function chromeAvailable() {
  try {
    new Bun.WebView({ backend: "chrome" }).close();
    return true;
  } catch {
    return false;
  }
}

const browserTest = chromeAvailable() ? test : test.skip;

let server;
let view;

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      const path = pathname === "/" ? "/test/fixtures/browser.html" : pathname;
      const file = Bun.file(`.${path}`);
      return file.size > 0 ? new Response(file) : new Response("not found", { status: 404 });
    },
  });

  if (!chromeAvailable()) return;

  view = new Bun.WebView({ backend: "chrome", ...VIEWPORT });
  await view.navigate(`http://localhost:${server.port}/`);
  /* Device metrics pin the layout viewport: headless Chrome clamps the window
   * size to a platform minimum, which would silently move every expectation. */
  await view.cdp("Emulation.setDeviceMetricsOverride", {
    ...VIEWPORT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await view.evaluate(`(async () => {
    for (let i = 0; i < 100 && !window.floating; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!window.floating) throw new Error("fixture module never loaded");
  })()`);
});

afterAll(() => {
  view?.close();
  server?.stop(true);
});

/* Runs `body` as an async function body inside the page and returns its value.
 * Every case starts from an empty document at scroll origin. */
function run(body) {
  return view.evaluate(`(async () => {
    const { reposition, repositionAt, autoUpdate } = window.floating;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const el = (tag, css, parent = document.body) => {
      const node = document.createElement(tag);
      node.style.cssText = css;
      parent.append(node);
      return node;
    };
    document.body.replaceChildren();
    document.body.style.height = "";
    window.scrollTo(0, 0);
    ${body}
  })()`);
}

browserTest(
  "a native popover is positioned by the written coordinates",
  async () => {
    const result = await run(`
      const anchor = el("button", "position:absolute; left:120px; top:180px; width:140px; height:34px; margin:0");
      const panel = document.createElement("div");
      panel.setAttribute("popover", "");
      // The recipe from demo/popover.html: undo the centering UA styles.
      panel.style.cssText = "position:fixed; inset:auto; margin:0; border:0; padding:0; width:220px; height:90px";
      document.body.append(panel);
      panel.showPopover();

      const ok = reposition(anchor, panel, { placement: "bottom-start", distance: 6 });
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const open = panel.matches(":popover-open");
      panel.hidePopover();
      return {
        ok,
        open,
        placement: panel.dataset.placement,
        left: p.left - a.left,
        gap: p.top - a.bottom,
        width: p.width,
      };
    `);

    expect(result.ok).toBe(true);
    expect(result.open).toBe(true);
    expect(result.placement).toBe("bottom-start");
    expect(result.left).toBeCloseTo(0, 1);
    expect(result.gap).toBeCloseTo(6, 1);
    expect(result.width).toBeCloseTo(220, 1);
  },
  20000,
);

browserTest(
  "an unstyled popover is centered by the UA and needs the demo reset",
  async () => {
    const result = await run(`
      const anchor = el("button", "position:absolute; left:120px; top:180px; width:140px; height:34px; margin:0");
      const panel = document.createElement("div");
      panel.setAttribute("popover", "");
      panel.style.cssText = "width:220px; height:90px";
      document.body.append(panel);
      panel.showPopover();

      const applied = getComputedStyle(panel);
      const styles = { inset: applied.insetBlockStart, margin: applied.marginBlockStart };
      reposition(anchor, panel, { placement: "bottom-start", distance: 6 });
      const gap = panel.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom;
      panel.hidePopover();
      return { ...styles, gap };
    `);

    // Documents why the reset exists: `inset` and `margin` outrank left/top.
    expect(result.inset).not.toBe("auto");
    expect(result.margin).not.toBe("0px");
    expect(Math.abs(result.gap - 6)).toBeGreaterThan(1);
  },
  20000,
);

browserTest(
  "--available-height constrains a real box once the CSS has applied",
  async () => {
    const result = await run(`
      // Only 188px of room above, so the available height outranks the 20rem cap.
      const anchor = el("button", "position:absolute; left:60px; top:200px; width:140px; height:32px; margin:0");
      const panel = el(
        "div",
        "position:fixed; inset:auto; margin:0; width:220px; overflow-y:auto;" +
          " max-block-size: min(20rem, var(--available-height, 20rem))",
      );
      for (let i = 0; i < 60; i += 1) {
        el("div", "height:24px", panel).textContent = "row " + i;
      }

      const options = { placement: "top", distance: 8, flip: false };
      // A single call: reposition settles the size it drove itself.
      reposition(anchor, panel, options);
      const constrained = panel.getBoundingClientRect().height;

      const p = panel.getBoundingClientRect();
      const available = Number.parseFloat(
        getComputedStyle(panel).getPropertyValue("--available-height"),
      );
      return {
        available,
        constrained,
        height: p.height,
        top: p.top,
        bottom: p.bottom,
        gap: anchor.getBoundingClientRect().top - p.bottom,
        scrollable: panel.scrollHeight > panel.clientHeight,
      };
    `);

    expect(result.constrained).toBeCloseTo(result.available, 0);
    expect(result.height).toBeCloseTo(result.available, 0);
    expect(result.scrollable).toBe(true);
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.bottom).toBeLessThanOrEqual(VIEWPORT.height);
    expect(result.gap).toBeCloseTo(8, 1);
  },
  20000,
);

browserTest(
  "the documented flow settles a CSS-constrained surface on its own",
  async () => {
    const result = await run(`
      const anchor = el("button", "position:absolute; left:60px; top:200px; width:140px; height:32px; margin:0");
      const panel = el(
        "div",
        "position:fixed; inset:auto; margin:0; width:220px; overflow-y:auto;" +
          " max-block-size: min(20rem, var(--available-height, 20rem))",
      );
      for (let i = 0; i < 60; i += 1) {
        el("div", "height:24px", panel).textContent = "row " + i;
      }

      const options = { placement: "top", distance: 8, flip: false };
      let updates = 0;
      // Exactly what the README prescribes: position once, then track.
      reposition(anchor, panel, options);
      const stop = autoUpdate(anchor, panel, () => {
        updates += 1;
        reposition(anchor, panel, options);
      });

      await frame();
      await sleep(60);
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      stop();
      return { gap: a.top - p.bottom, top: p.top, height: p.height, updates };
    `);

    // The surface is already correct before the tracker ever fires: the initial
    // ResizeObserver delivery is not a change, and there is none to catch up on.
    expect(result.gap).toBeCloseTo(8, 1);
    expect(result.top).toBeCloseTo(4, 1);
    expect(result.height).toBeCloseTo(188, 1);
    expect(result.updates).toBe(0);
  },
  20000,
);

browserTest(
  "a transformed floating element is positioned by its layout box",
  async () => {
    const result = await run(`
      const anchor = el("button", "position:absolute; left:200px; top:200px; width:100px; height:30px; margin:0");
      const plain = el("div", "position:fixed; inset:auto; margin:0; width:200px; height:80px");
      const scaled = el("div", "position:fixed; inset:auto; margin:0; width:200px; height:80px; transform:scale(.5)");

      const options = { placement: "bottom-start", distance: 8 };
      reposition(anchor, plain, options);
      reposition(anchor, scaled, options);
      return {
        plain: { left: plain.style.left, top: plain.style.top },
        scaled: { left: scaled.style.left, top: scaled.style.top },
        painted: scaled.getBoundingClientRect().width,
      };
    `);

    expect(result.scaled).toEqual(result.plain);
    expect(result.painted).toBeCloseTo(100, 1);
  },
  20000,
);

browserTest(
  "start alignment follows a real :dir(rtl) subtree",
  async () => {
    const result = await run(`
      const wrapper = el("div", "position:absolute; left:300px; top:120px");
      wrapper.dir = "rtl";
      const anchor = el("button", "display:block; width:100px; height:30px; margin:0", wrapper);
      const panel = el("div", "position:fixed; inset:auto; margin:0; width:200px; height:60px");

      reposition(anchor, panel, { placement: "bottom-start" });
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return {
        supported: CSS.supports("selector(:dir(rtl))"),
        matches: anchor.matches(":dir(rtl)"),
        rightDelta: p.right - a.right,
      };
    `);

    expect(result.supported).toBe(true);
    expect(result.matches).toBe(true);
    // `start` is the right edge in RTL, so both right edges line up.
    expect(result.rightDelta).toBeCloseTo(0, 1);
  },
  20000,
);

browserTest(
  "the preferred side flips against the real viewport",
  async () => {
    const result = await run(`
      const top = innerHeight - 60;
      const anchor = el("button", "position:absolute; left:120px; top:" + top + "px; width:140px; height:32px; margin:0");
      const panel = el("div", "position:fixed; inset:auto; margin:0; width:200px; height:200px");

      reposition(anchor, panel, { placement: "bottom-start", distance: 6 });
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return { placement: panel.dataset.placement, gap: a.top - p.bottom, top: p.top };
    `);

    expect(result.placement).toBe("top-start");
    expect(result.gap).toBeCloseTo(6, 1);
    expect(result.top).toBeGreaterThanOrEqual(0);
  },
  20000,
);

browserTest(
  "autoUpdate keeps the element glued through a real scroll and resize",
  async () => {
    const result = await run(`
      document.body.style.height = "3000px";
      const anchor = el("button", "position:absolute; left:120px; top:900px; width:140px; height:32px; margin:0");
      const panel = el("div", "position:fixed; inset:auto; margin:0; width:200px; height:80px");
      const options = { placement: "bottom-start", distance: 6 };

      let updates = 0;
      reposition(anchor, panel, options);
      const stop = autoUpdate(anchor, panel, () => {
        updates += 1;
        reposition(anchor, panel, options);
      });

      window.scrollTo(0, 400);
      await frame();
      await sleep(60);
      const scrolledGap = panel.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom;

      // The reference is resized under the tracker as well.
      anchor.style.height = "60px";
      await frame();
      await sleep(60);
      const resizedGap = panel.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom;

      stop();
      const tracked = updates;
      window.scrollTo(0, 500);
      await frame();
      await sleep(60);
      return { scrolledGap, resizedGap, tracked, afterStop: updates - tracked };
    `);

    expect(result.tracked).toBeGreaterThan(0);
    expect(result.scrolledGap).toBeCloseTo(6, 1);
    expect(result.resizedGap).toBeCloseTo(6, 1);
    expect(result.afterStop).toBe(0);
  },
  20000,
);
