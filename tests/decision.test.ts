import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.js";
import { createAssistantProvider } from "../src/server/provider.js";
import {
  collectControls,
  createDecisionShadow,
  type ShadowRecord,
} from "../src/server/decision.js";

const view = {
  title: "Customers",
  url: "/customers",
  revision: 3,
  children: [
    {
      role: "navigation",
      name: "Main",
      children: [
        {
          role: "link",
          ref: "nav-settings",
          name: "Settings",
          actions: ["click"],
          href: "https://app.test/settings",
        },
      ],
    },
    { role: "heading", text: "Customer list" },
    {
      role: "table",
      children: [
        {
          role: "row",
          children: [
            {
              role: "cell",
              children: [{ role: "text", text: "Alice 900101-1234567" }],
            },
            {
              role: "button",
              ref: "delete-alice",
              name: "Delete",
              actions: ["click"],
            },
          ],
        },
        {
          role: "row",
          children: [
            { role: "cell", children: [{ role: "text", text: "Bob" }] },
            {
              role: "button",
              ref: "delete-bob",
              name: "Delete",
              actions: ["click"],
              requiresConfirmation: true,
            },
          ],
        },
      ],
    },
    { role: "textbox", ref: "search", name: "Search", actions: ["fill"] },
    {
      role: "button",
      ref: "off",
      name: "Export",
      actions: ["click"],
      disabled: true,
    },
  ],
};

test("collectControls keeps enabled click targets with row and heading context", () => {
  const controls = collectControls(view);
  assert.deepEqual(
    controls.map((c) => c.ref),
    ["nav-settings", "delete-alice", "delete-bob"],
  );
  assert.equal(controls[0].context, "Main");
  assert.match(controls[1].context, /Customer list > Alice/);
  assert.ok(!JSON.stringify(controls).includes("900101-1234567"));
  assert.equal(controls[2].requiresConfirmation, true);
});

function setup(
  llmCall: Record<string, unknown> | null,
  jev: (body: any) => Response | Promise<Response>,
) {
  const logs: ShadowRecord[] = [];
  const bodies: any[] = [];
  let resolveLogged: () => void;
  const logged = new Promise<void>((resolve) => (resolveLogged = resolve));
  const provider = createAssistantProvider({
    apiKey: () => "test-key",
    fetch: async () =>
      Response.json({
        status: "completed",
        output: llmCall
          ? [{ type: "function_call", call_id: "two", ...llmCall }]
          : [
              {
                type: "message",
                content: [{ type: "output_text", text: "Done" }],
              },
            ],
      }),
  });
  const shadow = createDecisionShadow({
    apiKey: () => "jev-key",
    fetch: async (url, init) => {
      assert.equal(url, "https://api.typesafe.ai/v1/systemone");
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return jev(body);
    },
    logger: (record) => {
      logs.push(record);
      resolveLogged();
    },
  });
  const app = createApp({ provider, shadow });
  const send = (continuation: unknown[]) =>
    app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Open settings", continuation }),
    });
  return { logs, bodies, logged, send };
}

const afterFirstView = [
  {
    type: "function_call",
    call_id: "one",
    name: "get_current_view",
    arguments: "{}",
  },
  {
    type: "function_call_output",
    call_id: "one",
    output: JSON.stringify({ ok: true, state: { view } }),
  },
];

const jevAnswer = (target: string, commits: number[]) =>
  Response.json({
    model: "jev-1.13.0",
    answers: {
      intent: { type: "choice", choice: "single_click", confidence: 0.93 },
      target: { type: "choice", choice: target, confidence: 0.9 },
      ...Object.fromEntries(
        commits.map((noul, i) => [`commit_${i}`, { type: "noul", noul }]),
      ),
    },
    usage: { input_tokens: 900, output_tokens: 40 },
  });

const click = (ref: string, requireConfirmation = false) => ({
  name: "use_element",
  arguments: JSON.stringify({
    requireConfirmation,
    ref,
    action: "click",
    value: null,
    expectedRevision: 3,
    requestId: "r1",
  }),
});

test("shadow logs agreement with the LLM's first action and eligible fast paths", async () => {
  const { logs, bodies, logged, send } = setup(click("nav-settings"), () =>
    jevAnswer("nav-settings", [0.03, 0.9, 0.95]),
  );
  const response = await send(afterFirstView);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).calls[0].name, "use_element");
  await logged;
  const question = bodies[0].questions;
  assert.equal(bodies[0].model, "jev-1.13.0");
  assert.deepEqual(Object.keys(question.target.criteria), [
    "nav-settings",
    "delete-alice",
    "delete-bob",
    "__none__",
  ]);
  assert.equal(question.commit_1.type, "noul");
  assert.equal(logs[0].targetMatch, true);
  assert.equal(logs[0].jev?.fastPath, true);
  assert.equal(logs[0].confirmationGap, false);
});

test("shadow flags clicks Jev considers committing that the LLM left unconfirmed", async () => {
  const { logs, logged, send } = setup(click("delete-alice"), () =>
    jevAnswer("delete-alice", [0.03, 0.9, 0.95]),
  );
  await send(afterFirstView);
  await logged;
  assert.equal(logs[0].confirmationGap, true);
  assert.equal(logs[0].jev?.fastPath, false);
});

test("shadow never delays or breaks the chat response", async () => {
  let release!: (response: Response) => void;
  const { logs, logged, send } = setup(
    null,
    () => new Promise<Response>((resolve) => (release = resolve)),
  );
  const response = await send(afterFirstView);
  assert.deepEqual((await response.json()).reply, "Done");
  assert.equal(logs.length, 0);
  release(new Response("overloaded", { status: 529 }));
  await logged;
  assert.equal(logs[0].error, "http_529");
});

test("shadow only runs on the first screen of a request", async () => {
  const { bodies, send } = setup(click("nav-settings"), () =>
    jevAnswer("nav-settings", [0, 0, 0]),
  );
  await send([]);
  await send([
    ...afterFirstView,
    { type: "function_call", call_id: "x", ...click("nav-settings") },
    { type: "function_call_output", call_id: "x", output: "{}" },
  ]);
  assert.equal(bodies.length, 0);
});
