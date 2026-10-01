// Dev server: bundles the React app with hot reloading and proxies /api to the Express server.
import index from "./index.html";

const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const port = Number(process.env.CLIENT_PORT ?? 5173);

const server = Bun.serve({
  port,
  development: { hmr: true, console: true },
  routes: {
    "/api/*": async (req) => {
      const url = new URL(req.url);
      try {
        return await fetch(`${apiUrl}${url.pathname}${url.search}`, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          redirect: "manual",
        });
      } catch {
        return Response.json({ error: `API server not reachable at ${apiUrl}` }, { status: 502 });
      }
    },
    "/*": index,
  },
});

console.log(`Client running at ${server.url}`);
