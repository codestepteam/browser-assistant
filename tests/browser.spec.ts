import { test, expect } from "@playwright/test";
test("semantic extraction, private fields, native input, confirmation and replay", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  const result = await page.evaluate(async () => {
    const module = await import("/tests/screen.browser.ts" as string);
    return module.checkScreen();
  });
  expect(result.ok).toBe(true);
});
test("press-to-talk reuses permission, mutes on release, and runs only while authorized", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  const result = await page.evaluate(async () => {
    const module = await import("/tests/voice.browser.ts" as string);
    return module.checkVoiceHold();
  });
  expect(result.ok).toBe(true);
  expect(result.initialPermissionRequests).toBe(1);
});
test("pending tasks resume from a new snapshot and stop rejects late tools", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  const result = await page.evaluate(async () => {
    const module = await import("/tests/session.browser.ts" as string);
    return module.checkSessionResume();
  });
  expect(result.ok).toBe(true);
});
test("English and Korean UI, collapsed transcript and responsive placement", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/assistant/health", (route) =>
    route.fulfill({ json: { configured: false, protocolVersion: 1 } }),
  );
  await page.goto("/tests/browser.html");
  await page.evaluate(async () => {
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({
      serverUrl: "/assistant",
      locale: "en-US",
      sessionKey: "english",
      chatVisibility: "always",
    });
  });
  await expect(
    page.getByRole("button", { name: "Hold to talk", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Conversation", exact: true }),
  ).toHaveCount(0);
  const fab = await page.locator("[data-voice-fab]").boundingBox(),
    strip = await page.locator("[data-floating-response]").boundingBox();
  expect(fab).not.toBeNull();
  expect(strip!.x + strip!.width).toBeLessThan(fab!.x);
  await page
    .getByRole("button", { name: "Expand or collapse conversation" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({ serverUrl: "/assistant", locale: "ko-KR", sessionKey: "korean" });
  });
  await expect(
    page.getByRole("button", { name: "누르고 말하기", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("idle chat is hidden, session errors are visible, and modal transforms cannot move the microphone", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  await page.evaluate(async () => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new Error("Test microphone unavailable");
      },
    });
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({
      serverUrl: "/assistant",
      sessionKey: "placement-test",
      locale: "en-US",
    });
  });
  const fab = page.locator("[data-voice-fab]");
  await expect(fab).toBeVisible();
  await expect(page.locator("[data-floating-response]")).toHaveCount(0);
  const original = await fab.boundingBox();
  await page.evaluate(() => {
    const dialog = document.createElement("dialog");
    dialog.id = "placement-modal";
    dialog.style.cssText =
      "transform:translate(20px,30px);width:300px;height:200px";
    dialog.innerHTML = '<button id="inside-modal">Inside modal</button>';
    document.body.append(dialog);
    dialog.showModal();
  });
  await expect(page.locator("[data-browser-assistant]")).toHaveJSProperty(
    "popover",
    "manual",
  );
  await expect
    .poll(async () => {
      const b = await fab.boundingBox();
      return Math.abs(b!.x - original!.x) + Math.abs(b!.y - original!.y);
    })
    .toBeLessThan(2);
  await page.locator("#inside-modal").click();
  await fab.click();
  await expect(page.locator("[data-floating-response]")).toBeVisible();
  await page.evaluate(() => {
    (document.querySelector("#placement-modal") as HTMLDialogElement).close();
  });
  await expect
    .poll(async () => {
      const b = await fab.boundingBox();
      return Math.abs(b!.x - original!.x) + Math.abs(b!.y - original!.y);
    })
    .toBeLessThan(2);
});

test("confirmation buttons stay visible above chat input with long history and fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/tests/browser.html");
  await page.evaluate(async () => {
    const fixture = document.createElement("form");
    fixture.innerHTML =
      Array.from(
        { length: 20 },
        (_, i) => `<label>항목 ${i}<input value="긴 실행 내용 ${i}"></label>`,
      ).join("") +
      '<button type="button" data-agent-action="confirm">검사 작업</button>';
    document.body.prepend(fixture);
    sessionStorage.setItem(
      "browser-assistant:v1:/assistant:confirmation-layout",
      JSON.stringify({
        messages: Array.from({ length: 40 }, (_, i) => ({
          id: String(i),
          role: "assistant",
          text: "긴 대화 내용입니다. ".repeat(20),
          at: new Date().toISOString(),
        })),
        pending: null,
        open: false,
      }),
    );
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({
      serverUrl: "/assistant",
      sessionKey: "confirmation-layout",
      locale: "ko-KR",
      chatVisibility: "always",
      onReady: (tools: any) => {
        (window as any).layoutTools = tools;
      },
    });
  });
  await page.getByRole("button", { name: "대화 펼치기 또는 접기" }).click();
  await page.evaluate(async () => {
    const tools = (window as any).layoutTools;
    const result = await tools.execute("get_current_view", {});
    const view = result.state.view;
    const control = view.controls.find((c: any) => c.name === "검사 작업");
    void tools.execute("use_element", {
      ref: control.ref,
      action: "click",
      value: null,
      expectedRevision: view.revision,
      requireConfirmation: false,
      requestId: "layout-check",
    });
  });
  const group = page.getByRole("group", { name: "화면 작업 실행 확인" });
  const confirm = group.getByRole("button", { name: "확인하고 실행" });
  await expect(confirm).toBeVisible();
  await confirm.click({ trial: true });
  const buttons = await confirm.boundingBox();
  const input = await page
    .getByRole("textbox", { name: "도우미에게 요청" })
    .boundingBox();
  expect(buttons!.y + buttons!.height).toBeLessThanOrEqual(input!.y);
  await group.getByRole("button", { name: "취소", exact: true }).click();
  await expect(group).toHaveCount(0);
});
