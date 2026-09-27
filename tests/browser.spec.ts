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
test("chat-only mode skips the microphone and opens the composer from the chat FAB", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  const result = await page.evaluate(async () => {
    const module = await import("/tests/voice.browser.ts" as string);
    return module.checkVoiceDisabled();
  });
  expect(result.ok).toBe(true);
  expect(result.microphoneRequests).toBe(0);
  expect(result.liveRequests).toBe(0);
  expect(result.chatRequests).toBeGreaterThan(0);
});
test("widget voiceEnabled=false replaces the mic FAB and focuses the input", async ({
  page,
}) => {
  let mediaCalls = 0;
  await page.exposeFunction("recordMediaCall", () => {
    mediaCalls++;
  });
  await page.goto("/tests/browser.html");
  await page.evaluate(async () => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        await (
          window as unknown as { recordMediaCall: () => Promise<void> }
        ).recordMediaCall();
        throw new Error("microphone should not be requested");
      },
    });
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({
      serverUrl: "/assistant",
      locale: "en-US",
      sessionKey: "chat-only-widget",
      voiceEnabled: false,
    });
  });
  await expect(
    page.getByRole("button", { name: "Hold to talk", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("[data-voice-fab]")).toHaveCount(0);
  const fab = page.getByRole("button", { name: "Open chat", exact: true });
  await expect(fab).toBeVisible();
  await expect(page.locator("[data-floating-response]")).toHaveCount(0);
  await fab.click();
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" }),
  ).toBeFocused();
  const panel = page.getByRole("region", { name: "Conversation", exact: true });
  await expect(panel).toBeVisible();
  const chrome = await panel.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      borderTopWidth: style.borderTopWidth,
      borderTopColor: style.borderTopColor,
      boxShadow: style.boxShadow,
    };
  });
  expect(chrome.borderTopWidth).toBe("1px");
  expect(chrome.borderTopColor).toBe("rgb(226, 232, 240)");
  expect(chrome.boxShadow).not.toBe("none");
  const fabBox = await page.locator("[data-chat-fab]").boundingBox();
  const panelBox = await panel.boundingBox();
  expect(fabBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(
    Math.abs(panelBox!.x + panelBox!.width - (fabBox!.x + fabBox!.width)),
  ).toBeLessThan(4);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(fabBox!.y);
  expect(fabBox!.y - (panelBox!.y + panelBox!.height)).toBeLessThan(40);
  await expect(page.locator("[data-floating-response]")).toHaveCount(0);
  await expect(page.getByText("How can I help?")).toHaveCount(0);
  expect(mediaCalls).toBe(0);
  await expect(page.getByText("Allow microphone access")).toHaveCount(0);
});
test("assistant transcript renders Markdown instead of raw markers", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  await page.evaluate(async () => {
    sessionStorage.setItem(
      "browser-assistant:v1:/assistant:markdown",
      JSON.stringify({
        messages: [
          {
            id: "md-1",
            role: "assistant",
            text: "**장재휴**\n\n- 누적 구매액: **₩1,000**\n- 참고: `AB12`\n\n<script>alert(1)</script>",
            at: new Date().toISOString(),
          },
        ],
        pending: null,
        open: false,
      }),
    );
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({
      serverUrl: "/assistant",
      locale: "ko-KR",
      sessionKey: "markdown",
      voiceEnabled: false,
    });
  });
  await page.getByRole("button", { name: "대화 열기", exact: true }).click();
  const panel = page.getByRole("region", { name: "대화 내용", exact: true });
  await expect(panel.locator("strong", { hasText: "장재휴" })).toBeVisible();
  await expect(
    panel.getByRole("listitem").filter({ hasText: "누적 구매액" }),
  ).toBeVisible();
  await expect(panel.locator("strong", { hasText: "₩1,000" })).toBeVisible();
  await expect(panel.locator("code", { hasText: "AB12" })).toBeVisible();
  await expect(panel.locator("script")).toHaveCount(0);
  await expect(panel.getByText("<script>alert(1)</script>")).toBeVisible();
  await expect(panel.getByText("**장재휴**")).toHaveCount(0);
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

test("voice mode keeps its chrome, typed replies and plain previews after the session", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    const dc: any = {
      readyState: "connecting",
      onmessage: null,
      send(value: string) {
        const event = JSON.parse(value);
        if (event.type === "session.input_audio.unmute")
          queueMicrotask(() =>
            w.emitLive({
              type: "session.input_audio.unmuted",
              client_event_id: event.event_id,
            }),
          );
      },
      close() {
        this.readyState = "closed";
      },
    };
    w.emitLive = (event: unknown) =>
      dc.onmessage?.({ data: JSON.stringify(event) });
    w.RTCPeerConnection = class {
      connectionState = "new";
      iceGatheringState = "complete";
      localDescription: unknown;
      addTransceiver() {
        return { sender: { replaceTrack: async () => {} } };
      }
      createDataChannel() {
        return dc;
      }
      async createOffer() {
        return { type: "offer", sdp: "v=0\r\ns=offer" };
      }
      async setLocalDescription(offer: unknown) {
        this.localDescription = offer;
      }
      async setRemoteDescription() {
        this.connectionState = "connected";
        dc.readyState = "open";
        queueMicrotask(() => w.emitLive({ type: "session.started" }));
      }
      async getStats() {
        return new Map();
      }
      close() {}
      addEventListener() {}
      removeEventListener() {}
    };
    w.AudioContext = class {
      async resume() {}
      async close() {}
      createMediaStreamDestination() {
        return {
          stream: { getAudioTracks: () => [{ enabled: true, stop() {} }] },
        };
      }
      createMediaStreamSource() {
        return { connect() {} };
      }
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const track = { enabled: true, readyState: "live", stop() {} };
          return { getTracks: () => [track], getAudioTracks: () => [track] };
        },
      },
    });
    HTMLMediaElement.prototype.play = async () => {};
  });
  await page.route("**/assistant/health", (route) =>
    route.fulfill({
      json: {
        configured: true,
        voiceApi: "live",
        voiceIdleSeconds: 60,
        voiceSessionSeconds: 600,
      },
    }),
  );
  await page.route("**/assistant/live", (route) =>
    route.fulfill({ json: { sdp: "v=0\r\ns=answer", sessionId: "live" } }),
  );
  await page.route("**/assistant/chat", (route) =>
    route.fulfill({
      json: {
        reply: "**김민아** 고객을 찾았어요.\n\n- 도시: **서울**",
        calls: [],
        responseItems: [],
      },
    }),
  );
  await page.goto("/tests/browser.html");
  await page.evaluate(async () => {
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({
      serverUrl: "/assistant",
      locale: "ko-KR",
      sessionKey: "voice-chrome",
    });
  });
  const fab = page.locator("[data-voice-fab]");
  await fab.focus();
  await page.keyboard.down(" ");
  await expect(fab).toHaveAttribute("aria-pressed", "true");
  const chrome = (el: Element) => {
    const style = getComputedStyle(el);
    return {
      borderStyle: style.borderTopStyle,
      boxShadow: style.boxShadow,
    };
  };
  const recording = await fab.evaluate(chrome);
  expect(recording.boxShadow).not.toBe("none");
  await page.keyboard.up(" ");
  const strip = page.locator("[data-floating-response]");
  const bar = await strip
    .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")
    .evaluate(chrome);
  expect(bar.borderStyle).toBe("solid");
  expect(bar.boxShadow).not.toBe("none");
  await page.getByRole("button", { name: "대화 펼치기 또는 접기" }).click();
  await page.getByRole("textbox", { name: "도우미에게 요청" }).fill("김민아");
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  const panel = page.getByRole("region", { name: "대화 내용", exact: true });
  await expect(panel.locator("strong", { hasText: "김민아" })).toBeVisible();
  await page.waitForTimeout(200);
  await expect(panel).toBeVisible();
  await expect(strip).toHaveText("김민아 고객을 찾았어요. 도시: 서울");
  await page.getByRole("button", { name: "대화 내용 접기" }).click();
  await expect(panel).toHaveCount(0);
  await expect(strip).toHaveCount(0);
});
