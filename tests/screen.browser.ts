import { createScreenController } from "../src/client/screen.js";
import { createConversationTools } from "../src/client/tools.js";
/** Import and await checkScreen() in a browser served by Vite. No real business API is called. */
export async function checkScreen() {
  const assert = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const fixture = document.createElement("section");
  fixture.innerHTML =
    '<h1>고객 관리</h1><div><div><span>홍길동 · 301호</span><button type="button" data-agent-action="safe">수정</button></div></div><form><label>고객 이름 <input value="홍길동"></label><input type="password" value="SECRET_VALUE"><input type="checkbox" aria-label="선택"><input type="submit" value="확정" aria-label="입력형 저장"><span data-agent-exclude>PRIVATE_TEXT</span><button>저장</button></form><div role="status"></div>';
  document.body.prepend(fixture);
  let saves = 0,
    changes = 0;
  fixture.querySelector("form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    saves++;
    fixture.querySelector('[role="status"]')!.textContent = "저장 완료";
  });
  fixture.querySelector("input")!.addEventListener("input", () => changes++);
  const screen = createScreenController({
    locale: "ko-KR",
    root: () => fixture,
  });
  let resolve: ((value: boolean) => void) | undefined;
  const tools = createConversationTools({
    active: () => true,
    view: screen.view,
    operate: screen.operate,
    settled: async () => {},
    confirmationState: screen.actionSignature,
    confirm: () => new Promise((done) => (resolve = done)),
  });
  try {
    let view = screen.view();
    let json = JSON.stringify(view);
    assert(
      json.includes("heading") && json.includes("홍길동 · 301호"),
      "Lost headings or group context",
    );
    assert(
      view.controls.some((c) => c.name === "선택" && c.role === "checkbox"),
      "Native checkbox role lost",
    );
    assert(
      view.controls.some(
        (c) =>
          c.name === "입력형 저장" &&
          c.role === "button" &&
          JSON.stringify(c.actions) === '["click"]',
      ),
      "Input submit must be clickable",
    );
    assert(
      !json.includes("SECRET_VALUE") && !json.includes("PRIVATE_TEXT"),
      "Sensitive text leaked",
    );
    const node = view.controls.find((c) => c.name === "고객 이름")!;
    const result = await tools.execute("use_element", {
      ref: node.ref,
      action: "fill",
      value: "김검증",
      expectedRevision: view.revision,
      requestId: "fill",
    });
    assert(
      result.ok &&
        changes === 1 &&
        fixture.querySelector("input")!.value === "김검증",
      "Native input event failed",
    );
    view = screen.view();
    const save = view.controls.find((c) => c.name === "저장")!;
    const input = {
      ref: save.ref,
      action: "click",
      value: null,
      expectedRevision: view.revision,
      requestId: "save",
    };
    const waiting = tools.execute("use_element", input);
    await Promise.resolve();
    assert(saves === 0, "Saved before approval");
    resolve!(true);
    assert((await waiting).ok && saves === 1, "Approved save did not complete");
    assert(
      (await tools.execute("use_element", input)).state.replayed && saves === 1,
      "Duplicate save",
    );
    assert(
      JSON.stringify(screen.view()).includes("저장 완료"),
      "Missing save outcome",
    );
    assert(
      createScreenController({ locale: "ko-KR", root: () => fixture }).view()
        .revision !== screen.view().revision,
      "Page instances share revisions",
    );
    return {
      ok: true,
      nestedSemantics: true,
      privateContentExcluded: true,
      inputEvent: true,
      confirmedSave: saves,
      replayBlocked: true,
      newPageRevision: true,
    };
  } finally {
    fixture.remove();
  }
}
