import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.js";
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8796);
if (
  (!["127.0.0.1", "localhost", "::1"].includes(host) ||
    process.env.NODE_ENV === "production") &&
  !process.env.SERVER_TOKEN
)
  throw new Error(
    "외부 주소로 실행하려면 SERVER_TOKEN과 인증 프록시를 설정하세요.",
  );
const app = new Hono();
app.get("/widget.js", serveStatic({ path: "./dist/widget.js" }));
app.get("/assets/*", serveStatic({ root: "./dist/examples" }));
app.get("/demo", serveStatic({ path: "./dist/examples/index.html" }));
app.get("/react", serveStatic({ path: "./dist/examples/react/index.html" }));
app.route(
  "/",
  createApp({
    token: process.env.SERVER_TOKEN,
    origins: process.env.ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    requestsPerMinute: Number(process.env.REQUESTS_PER_MINUTE || 60),
    maxConcurrent: Number(process.env.MAX_CONCURRENT || 4),
    voiceSessionSeconds: Number(process.env.VOICE_SESSION_SECONDS || 600),
    logger: (entry) => console.log(JSON.stringify(entry)),
  }),
);
serve({ fetch: app.fetch, hostname: host, port }, () =>
  console.log(`Browser Assistant listening on http://${host}:${port}`),
);
