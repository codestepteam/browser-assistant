import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
const fake = createServer((req, res) => {
  assert.equal(req.headers.authorization, "Bearer synthetic-server-token");
  assert.equal(req.headers.cookie, undefined);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, configured: true }));
});
await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const child = spawn(
  process.execPath,
  ["--import", "tsx", "examples/auth-gateway.ts"],
  {
    env: {
      ...process.env,
      SERVER_TOKEN: "synthetic-server-token",
      DEMO_LOGIN_PASSWORD: "synthetic-login-password",
      GATEWAY_PORT: String(port),
      ASSISTANT_URL: `http://127.0.0.1:${fake.address().port}`,
      COOKIE_SECURE: "0",
    },
    stdio: "pipe",
  },
);
const base = `http://localhost:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + "/assistant/health");
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  assert.ok(ready, "Gateway did not start");
  assert.equal((await fetch(base + "/assistant/health")).status, 401);
  assert.equal(
    (
      await fetch(base + "/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://foreign.invalid",
        },
        body: JSON.stringify({ password: "synthetic-login-password" }),
      })
    ).status,
    403,
  );
  const response = await fetch(base + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "synthetic-login-password" }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  const headers = { Cookie: cookie.split(";")[0] };
  assert.equal(
    (await fetch(base + "/assistant/health", { headers })).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/assistant/not-a-tool", { headers })).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + "/logout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/assistant/health", { headers })).status,
    401,
  );
  console.log(
    "Gateway sign-in, origin check, server-only token forwarding and logout passed.",
  );
} finally {
  child.kill("SIGTERM");
  fake.close();
}
