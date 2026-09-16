import { randomUUID, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  createAssistantProvider,
  chatSchema,
  realtimeSchema,
  validateContinuation,
} from "./provider.js";
export type RequestLog = {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
};
export type ServerOptions = {
  provider?: ReturnType<typeof createAssistantProvider>;
  token?: string;
  origins?: string[];
  /** Return an authenticated user ID, or null. Never trust a browser-supplied user ID directly. */
  authenticate?: (request: Request) => Promise<string | null>;
  requestsPerMinute?: number;
  maxConcurrent?: number;
  voiceSessionSeconds?: number;
  voiceIdleSeconds?: number;
  logger?: (entry: RequestLog) => void;
};
export function createApp(options: ServerOptions = {}) {
  const provider = options.provider ?? createAssistantProvider();
  const origins = options.origins ?? [
    "http://localhost:8796",
    "http://127.0.0.1:8796",
  ];
  const requestsPerMinute = options.requestsPerMinute ?? 60,
    maxConcurrent = options.maxConcurrent ?? 4;
  const voiceSessionSeconds = options.voiceSessionSeconds ?? 600;
  const voiceIdleSeconds = options.voiceIdleSeconds ?? 60;
  if (
    !Number.isInteger(voiceIdleSeconds) ||
    voiceIdleSeconds < 1 ||
    voiceIdleSeconds > 600
  )
    throw new Error("Invalid voiceIdleSeconds");
  if (
    !Number.isInteger(voiceSessionSeconds) ||
    voiceSessionSeconds < 30 ||
    voiceSessionSeconds > 3600
  )
    throw new Error("Invalid voiceSessionSeconds");
  for (const [name, value] of Object.entries({
    requestsPerMinute,
    maxConcurrent,
  }))
    if (!Number.isInteger(value) || value < 1)
      throw new Error(`Invalid ${name}`);
  // ponytail: per-process counters; use a shared store before running multiple replicas.
  const buckets = new Map<string, { count: number; reset: number }>();
  let active = 0;
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    const started = Date.now(),
      requestId = randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    c.header("X-Assistant-Protocol", "1");
    try {
      await next();
    } finally {
      options.logger?.({
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - started,
      });
    }
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 400000,
      onError: (c) =>
        c.json(
          {
            error: "Request is too large.",
            code: "REQUEST_TOO_LARGE",
            requestId: c.get("requestId"),
          },
          413,
        ),
    }),
  );
  app.use(
    "*",
    cors({
      origin: (origin) => (origins.includes(origin) ? origin : ""),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["X-Request-Id", "X-Assistant-Protocol"],
    }),
  );
  app.use("*", async (c, next) => {
    const fail = (code: string, error: string, status: 401 | 403 | 429 | 503) =>
      c.json({ error, code, requestId: c.get("requestId") }, status);
    const origin = c.req.header("Origin");
    if (origin && !origins.includes(origin))
      return fail("ORIGIN_DENIED", "This origin is not allowed.", 403);
    if (options.token) {
      const supplied = Buffer.from(c.req.header("Authorization") ?? ""),
        expected = Buffer.from(`Bearer ${options.token}`);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return fail("UNAUTHORIZED", "Server authentication is required.", 401);
    }
    const identity = options.authenticate
      ? await options.authenticate(c.req.raw)
      : "server";
    if (!identity)
      return fail("UNAUTHORIZED", "Sign in to use the assistant.", 401);
    if (c.req.method !== "POST") {
      await next();
      return;
    }
    const now = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.reset <= now) buckets.delete(key);
    if (!buckets.has(identity) && buckets.size >= 10000)
      return fail("SERVER_BUSY", "The server is busy.", 503);
    const bucket = buckets.get(identity) ?? { count: 0, reset: now + 60000 };
    if (bucket.count >= requestsPerMinute) {
      c.header("Retry-After", String(Math.ceil((bucket.reset - now) / 1000)));
      return fail("RATE_LIMITED", "Too many requests. Try again shortly.", 429);
    }
    if (active >= maxConcurrent)
      return fail("SERVER_BUSY", "Too many concurrent requests.", 503);
    bucket.count++;
    buckets.set(identity, bucket);
    active++;
    try {
      await next();
    } finally {
      active--;
    }
  });
  app.onError((error, c) => {
    const requestId = c.get("requestId");
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return c.json(
        { error: "Invalid request.", code: "INVALID_REQUEST", requestId },
        400,
      );
    if (error instanceof HTTPException)
      return c.json(
        {
          error: error.message,
          code:
            error.status === 408
              ? "REQUEST_CANCELLED"
              : error.status === 503
                ? "PROVIDER_NOT_CONFIGURED"
                : error.status === 400
                  ? "INVALID_REQUEST"
                  : "PROVIDER_ERROR",
          requestId,
        },
        error.status,
      );
    return c.json(
      { error: "The AI request failed.", code: "INTERNAL_ERROR", requestId },
      502,
    );
  });
  app.get("/health", (c) =>
    c.json({
      ok: true,
      configured: provider.configured(),
      protocolVersion: 1,
      voiceSessionSeconds,
      voiceApi: "live",
      voiceIdleSeconds,
    }),
  );
  app.post("/chat", async (c) => {
    const input = chatSchema.parse(await c.req.json());
    validateContinuation(input);
    return c.json(await provider.chat(input, c.req.raw.signal));
  });
  app.post("/realtime", async (c) => {
    const input = realtimeSchema.parse(await c.req.json());
    if (JSON.stringify(input.context ?? {}).length > 24000)
      throw new HTTPException(400, { message: "Screen context is too large." });
    return c.json(await provider.realtime(input, c.req.raw.signal));
  });
  app.post("/live", async (c) => {
    const input = realtimeSchema.parse(await c.req.json());
    if (JSON.stringify(input.context ?? {}).length > 24000)
      throw new HTTPException(400, { message: "Screen context is too large." });
    return c.json(await provider.live(input, c.req.raw.signal));
  });
  return app;
}
