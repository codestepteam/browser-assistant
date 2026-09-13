import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { VoiceAssistant } from "../src/client/voice.js";
/** Browser regression: restore pending work through a fresh snapshot; stop rejects late responses. */
export async function checkSessionResume() {
  const assert = (v: unknown, m: string) => {
    if (!v) throw new Error(m);
  };
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const until = async (check: () => unknown) => {
    for (let n = 0; n < 150; n++) {
      if (check()) return;
      await tick();
    }
    throw new Error("Session test timed out");
  };
  const scope = "browser-assistant:v1:/resume-test:resume";
  const original = window.fetch,
    previous = sessionStorage.getItem(scope),
    requests: any[] = [],
    calls: string[] = [];
  let late: ((value: Response) => void) | undefined;
  sessionStorage.setItem(
    scope,
    JSON.stringify({
      messages: [
        {
          id: "prior",
          role: "user",
          text: "이전 대화",
          at: new Date().toISOString(),
        },
      ],
      pending: "현재 화면 읽기",
      open: true,
    }),
  );
  const fixture = document.createElement("div");
  document.body.append(fixture);
  const root = createRoot(fixture);
  window.fetch = async (url, options) => {
    if (String(url) === "/resume-test/health")
      return Response.json({ configured: false });
    if (String(url) !== "/resume-test/chat") return original(url, options);
    const input = JSON.parse(String(options!.body));
    requests.push(input);
    if (input.prompt === "중단 검사")
      return new Promise((resolve) => {
        late = resolve;
      });
    if (!input.continuation.length)
      return Response.json({
        reply: "",
        calls: [
          { name: "get_current_view", argumentsJson: "{}", callId: "read" },
        ],
        responseItems: [
          {
            type: "function_call",
            name: "get_current_view",
            arguments: "{}",
            call_id: "read",
          },
        ],
      });
    return Response.json({ reply: "재개 확인", calls: [], responseItems: [] });
  };
  try {
    root.render(
      createElement(VoiceAssistant, {
        locale: "ko-KR",
        serverUrl: "/resume-test",
        sessionKey: "resume",
        onCommand: async (call) => {
          calls.push(call.name);
          return {
            ok: true,
            state: { view: { revision: "new-page:1", children: [] } },
          };
        },
      }),
    );
    await until(() => fixture.innerText.includes("재개 확인"));
    assert(
      !fixture.querySelector('[aria-label="대화 내용"]'),
      "Restoring work must not expand history",
    );
    fixture
      .querySelector<HTMLButtonElement>('[aria-label="대화 펼치기 또는 접기"]')!
      .click();
    await tick();
    assert(fixture.innerText.includes("이전 대화"), "Lost history");
    assert(calls[0] === "get_current_view", "Resumed without observing");
    assert(requests[0].prompt.includes("재개"), "Missing resume context");
    assert(
      JSON.parse(sessionStorage.getItem(scope)!).pending === null,
      "Completed run remains pending",
    );
    const input = fixture.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "중단 검사");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    fixture
      .querySelector<HTMLButtonElement>('[aria-label="메시지 보내기"]')!
      .click();
    await until(() => late);
    fixture
      .querySelector<HTMLButtonElement>('[aria-label="실행 중지"]')!
      .click();
    await tick();
    late!(
      Response.json({
        reply: "",
        calls: [{ name: "use_element", argumentsJson: "{}", callId: "late" }],
        responseItems: [],
      }),
    );
    await tick();
    assert(!calls.includes("use_element"), "Late response ran after stop");
    assert(
      JSON.parse(sessionStorage.getItem(scope)!).pending === null,
      "Stopped run resumes on reload",
    );
    return {
      ok: true,
      historyRestored: true,
      pendingRunResumed: true,
      freshSnapshotFirst: true,
      stopBlocksLateTools: true,
    };
  } finally {
    root.unmount();
    fixture.remove();
    window.fetch = original;
    if (previous === null) sessionStorage.removeItem(scope);
    else sessionStorage.setItem(scope, previous);
  }
}
