/** Runnable authentication example. Replace the demo login with your application's account/session system. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { serveStatic } from "@hono/node-server/serve-static";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
const password = process.env.DEMO_LOGIN_PASSWORD,
  token = process.env.SERVER_TOKEN;
if (!password || password.length < 12 || !token)
  throw Error(
    "Set DEMO_LOGIN_PASSWORD (12+ characters) and SERVER_TOKEN in .env.",
  );
const upstream = process.env.ASSISTANT_URL || "http://127.0.0.1:8796";
const app = new Hono();
const sessions = new Map<string, number>();
let attempts = 0,
  reset = Date.now() + 60000;
app.use("*", bodyLimit({ maxSize: 400000 }));
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("Origin");
    if (origin && new URL(origin).host !== c.req.header("Host"))
      return c.json({ error: "Origin denied" }, 403);
    if (!c.req.header("Content-Type")?.startsWith("application/json"))
      return c.json({ error: "JSON required" }, 415);
  }
  await next();
});
app.post("/login", async (c) => {
  const now = Date.now();
  if (now >= reset) {
    attempts = 0;
    reset = now + 60000;
  }
  if (++attempts > 20) return c.json({ error: "Try again later" }, 429);
  const input = z
    .object({ password: z.string().max(200) })
    .safeParse(await c.req.json().catch(() => null));
  const supplied = Buffer.from(input.success ? input.data.password : ""),
    expected = Buffer.from(password);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return c.json({ error: "Sign-in failed" }, 401);
  for (const [id, expiry] of sessions) if (expiry < now) sessions.delete(id);
  if (sessions.size >= 1000)
    return c.json({ error: "Session limit reached" }, 503);
  const id = randomBytes(32).toString("hex");
  sessions.set(id, now + 3600000);
  setCookie(c, "assistant_demo", id, {
    httpOnly: true,
    sameSite: "Strict",
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge: 3600,
  });
  return c.json({ ok: true });
});
app.post("/logout", (c) => {
  sessions.delete(getCookie(c, "assistant_demo") ?? "");
  deleteCookie(c, "assistant_demo", { path: "/" });
  return c.json({ ok: true });
});
app.all("/assistant/*", async (c) => {
  const expiry = sessions.get(getCookie(c, "assistant_demo") ?? "") ?? 0;
  if (expiry < Date.now())
    return c.json({ error: "Sign in first", code: "UNAUTHORIZED" }, 401);
  const path = c.req.path.slice("/assistant".length);
  if (
    !["/health", "/chat", "/realtime"].includes(path) ||
    !["GET", "POST"].includes(c.req.method)
  )
    return c.notFound();
  const result = await fetch(upstream + path, {
    method: c.req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: c.req.method === "POST" ? await c.req.text() : undefined,
    signal: c.req.raw.signal,
  });
  return new Response(result.body, {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": result.headers.get("X-Request-Id") ?? "",
    },
  });
});
app.get("/widget.js", serveStatic({ path: "./dist/widget.js" }));
app.get("/assets/*", serveStatic({ root: "./dist/examples" }));
app.get("/react", serveStatic({ path: "./dist/examples/react/index.html" }));
app.get("*", serveStatic({ path: "./dist/examples/index.html" }));
app.onError((_error, c) => c.json({ error: "Gateway request failed" }, 502));
serve(
  {
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: Number(process.env.GATEWAY_PORT || 4188),
  },
  () => console.log("Authentication example: http://macmini:4188"),
);
