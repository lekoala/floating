/*
 * Static file server for the demos.
 *
 *   bun run serve
 *
 * `bun ./demo/*.html` cannot serve them: it maps each page to an extensionless
 * route and leaves inline module scripts alone, so their `../src/floating.js`
 * resolves against `/vs-tippy` and 404s. Serving the repository at its real
 * paths also means the browser gets the file a consumer imports, unbundled.
 */

const root = Bun.fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT) || 3002;

const server = Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const path = pathname === "/" ? "/demo/index.html" : decodeURIComponent(pathname);

    /* Serve the repository, and nothing above it. */
    const target = Bun.fileURLToPath(new URL(`.${path}`, Bun.pathToFileURL(root)));
    if (!target.startsWith(root)) return new Response("forbidden", { status: 403 });

    const file = Bun.file(target);
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});

console.log(`Demos on http://localhost:${server.port}/`);
