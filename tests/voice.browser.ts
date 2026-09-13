import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { VoiceAssistant } from "../src/client/voice.js";

/** Isolated UI/transport regression check. Run on the standalone test server; no microphone or provider is used. */
export async function checkVoiceHold() {
  if (!isSecureContext) throw new Error("Use a secure test origin");
  const require = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
  const until = async (check: () => unknown) => {
    for (let n = 0; n < 200; n++) {
      if (check()) return;
      await tick();
    }
    throw new Error(
      "UI state timed out: " +
        JSON.stringify({
          mediaCalls,
          requests,
          events: events.map((e) => e.type),
          attached: !!attached,
          ready: dc.readyState,
        }),
    );
  };
  const original = {
    fetch: window.fetch,
    pc: window.RTCPeerConnection,
    media: navigator.mediaDevices.getUserMedia,
    play: HTMLMediaElement.prototype.play,
  };
  sessionStorage.removeItem("browser-assistant:v1:/assistant:voice-test");
  const events: any[] = [],
    requests: string[] = [],
    tracks: {
      stopped: boolean;
      enabled: boolean;
      readyState: string;
      stop: () => void;
    }[] = [];
  let connect: (() => void) | undefined;
  let operations = 0;
  let mediaCalls = 0,
    grant: ((value: MediaStream) => void) | undefined,
    pendingPermission = true,
    attached: unknown = null;
  const dc = {
    readyState: "connecting",
    onopen: null as any,
    onmessage: null as any,
    send: (value: string) => events.push(JSON.parse(value)),
    close() {
      this.readyState = "closed";
    },
  };
  class Peer {
    connectionState = "new";
    addTransceiver() {
      return {
        sender: {
          replaceTrack: async (track: unknown) => {
            attached = track;
          },
        },
      };
    }
    createDataChannel() {
      return dc;
    }
    async createOffer() {
      return { type: "offer", sdp: "v=0\r\ns=test offer" };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {
      this.connectionState = "connected";
      dc.readyState = "open";
      dc.onopen?.();
    }
    close() {
      this.connectionState = "closed";
    }
  }
  window.RTCPeerConnection = Peer as any;
  const mediaDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );
  const mockGetUserMedia = async () => {
    mediaCalls++;
    const track = {
      stopped: false,
      enabled: true,
      readyState: "live",
      stop() {
        this.stopped = true;
        this.enabled = false;
        this.readyState = "ended";
      },
    };
    tracks.push(track);
    const media = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream;
    if (pendingPermission)
      return new Promise((resolve) => {
        grant = () => resolve(media);
      });
    return media;
  };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: mockGetUserMedia },
  });
  HTMLMediaElement.prototype.play = async () => {};
  window.fetch = async (input, options) => {
    const path = new URL(String(input), location.href).pathname;
    requests.push(path);
    if (path === "/assistant/health")
      return Response.json({ configured: true });
    if (path === "/assistant/realtime")
      return new Promise((resolve) => {
        connect = () =>
          resolve(
            Response.json({
              sdp: "v=0\r\ns=test answer",
              usageId: "test-session",
            }),
          );
      });
    if (path === "/assistant/realtime/activate")
      return Response.json({ ok: true });
    if (path === "/assistant/chat")
      return Response.json({
        reply: "글 입력 확인",
        calls: [],
        responseItems: [],
      });
    return original.fetch(input, options);
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;
  try {
    root.render(
      createElement(VoiceAssistant, {
        locale: "ko-KR",
        serverUrl: "/assistant",
        sessionKey: "voice-test",
        context: {},
        onCommand: async () => {
          operations++;
          return { ok: true, state: {} };
        },
      }),
    );
    await until(() => connect);
    require(!container.querySelector(
      '[aria-label="대화 내용"]',
    ), "History must start collapsed");
    require(!!container.querySelector(
      "[data-voice-fab]",
    ), "The visible FAB must be the hold button");
    require(requests.filter((p) => p === "/assistant/realtime").length ===
      1, "Connect once on entry");
    require(mediaCalls === 0 &&
      attached === null, "Idle connection must not open the microphone");
    require(!events.some(
      (e) => e.type === "response.create",
    ), "Idle connection must not generate a paid answer");
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="누르고 말하기"]',
    )!;
    const down = () =>
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    const up = () =>
      button.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", bubbles: true }),
      );
    down();
    require(mediaCalls === 0, "Connecting hold must wait without recording");
    connect!();
    await until(() => grant);
    up();
    down();
    await tick();
    require(mediaCalls === 1, "Pending permission requests must be shared");
    up();
    grant!(null as any);
    await tick();
    require(!tracks[0].enabled &&
      !tracks[0].stopped &&
      attached ===
        null, "Permission granted after release must not start recording");
    require(!events.some(
      (e) => e.type === "input_audio_buffer.commit",
    ), "Late permission must not send audio");
    pendingPermission = false;
    button.setPointerCapture = () => {};
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        pointerId: 1,
        pointerType: "touch",
        bubbles: true,
      }),
    );
    await until(() => button.getAttribute("aria-pressed") === "true");
    require(!!attached &&
      tracks.at(-1)!.enabled &&
      !tracks.at(-1)!.stopped, "Hold must attach an active microphone");
    await new Promise((resolve) => setTimeout(resolve, 180));
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        pointerType: "touch",
        bubbles: true,
      }),
    );
    require(!tracks.at(-1)!.enabled &&
      attached === null, "Release must stop capture immediately");
    await until(() => events.some((e) => e.type === "response.create"));
    require(!container.querySelector(
      '[aria-label="대화 내용"]',
    ), "Releasing the FAB must not open history");
    const types = events.map((e) => e.type);
    require(types.indexOf("input_audio_buffer.commit") <
      types.indexOf("response.create"), "Commit must precede the answer");
    require(requests.filter((p) => p === "/assistant/realtime/activate")
      .length === 1, "Activate quota only at first committed speech");
    const commits = () =>
      events.filter((e) => e.type === "input_audio_buffer.commit").length;
    down();
    await until(() => button.getAttribute("aria-pressed") === "true");
    button.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    await tick();
    require(!tracks.at(-1)!.enabled &&
      commits() === 1, "Touch cancellation must discard recording");
    down();
    await until(() => button.getAttribute("aria-pressed") === "true");
    window.dispatchEvent(new Event("blur"));
    await tick();
    require(!tracks.at(-1)!.enabled &&
      commits() === 1, "Leaving the page must stop recording");
    const emit = (event: unknown) =>
      dc.onmessage({ data: JSON.stringify(event) });
    emit({
      type: "response.function_call_arguments.done",
      name: "get_current_view",
      call_id: "after-release",
      arguments: "{}",
    });
    await until(
      () =>
        operations === 1 &&
        events.some((e) => e.item?.type === "function_call_output"),
    );
    require(!tracks.some(
      (t) => t.enabled && !t.stopped,
    ), "Executing after release must not reopen the microphone");
    emit({
      type: "response.output_audio_transcript.delta",
      delta: "공실만 모아뒀어요.",
    });
    await until(
      () =>
        container.querySelector("[data-floating-response]")?.textContent ===
        "공실만 모아뒀어요.",
    );
    require(!container.querySelector(
      '[aria-label="대화 내용"]',
    ), "Speaking must not open history");
    emit({
      type: "response.output_audio_transcript.done",
      item_id: "answer",
      transcript: "공실만 모아뒀어요.",
    });
    emit({ type: "response.done", response: { output: [] } });
    await tick();
    require(container.querySelector("[data-floating-response]")?.textContent ===
      "공실만 모아뒀어요.", "Final AI text must remain in the floating strip");
    require(JSON.parse(
      sessionStorage.getItem("browser-assistant:v1:/assistant:voice-test")!,
    ).open === false, "Speech must persist the collapsed view");
    container
      .querySelector<HTMLButtonElement>('[aria-label="대화 펼치기 또는 접기"]')!
      .click();
    await tick();
    require(container
      .querySelector('[aria-label="대화 내용"]')
      ?.textContent?.includes(
        "공실만 모아뒀어요.",
      ), "The strip must expand full history");
    const chat = container.querySelector<HTMLInputElement>(
      '[aria-label="도우미에게 요청"]',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(chat, "글로 입력");
    chat.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    container
      .querySelector<HTMLButtonElement>('[aria-label="메시지 보내기"]')!
      .click();
    await until(() => container.textContent?.includes("글 입력 확인"));
    require(requests.includes("/assistant/chat") &&
      commits() === 1, "Typed requests must keep using the text endpoint");
    container
      .querySelector<HTMLButtonElement>('[aria-label="대화 내용 접기"]')!
      .click();
    await tick();
    require(!container.querySelector('[aria-label="대화 내용"]') &&
      container.querySelector("[data-floating-response]")?.textContent ===
        "글 입력 확인", "Collapse must leave only the latest AI reply");
    root.render(
      createElement(VoiceAssistant, {
        locale: "ko-KR",
        serverUrl: "/assistant",
        sessionKey: "voice-test",
        context: {},
        onCommand: async () => ({ ok: true, state: {} }),
        pendingAction: createElement(
          "div",
          { "aria-label": "검증용 확인" },
          "실행할 내용",
        ),
      }),
    );
    await tick();
    require(!!container.querySelector('[aria-label="검증용 확인"]') &&
      !container.querySelector(
        '[aria-label="대화 내용"]',
      ), "Confirmation must appear without expanding history");
    require(mediaCalls ===
      1, "Repeated holds must reuse the granted microphone");
    root.unmount();
    mounted = false;
    require(tracks.every(
      (t) => t.stopped,
    ), "Unmount must release microphone resources");
    return {
      ok: true,
      microphoneRequests: mediaCalls,
      reusedPermission: true,
      mutedBetweenHolds: true,
      releasedOnUnmount: true,
      confirmationWithoutHistory: true,
      directFab: true,
      collapsedDuringVoice: true,
      floatingReply: true,
      tapToExpand: true,
      executionAfterRelease: true,
      autoConnect: true,
      idleMicCalls: 0,
      holdAndRelease: true,
      latePermissionCancelled: true,
      touchCancel: true,
      blurCancel: true,
      textModelPreserved: true,
    };
  } finally {
    if (mounted) root.unmount();
    container.remove();
    window.fetch = original.fetch;
    window.RTCPeerConnection = original.pc;
    if (mediaDescriptor)
      Object.defineProperty(navigator, "mediaDevices", mediaDescriptor);
    else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
    HTMLMediaElement.prototype.play = original.play;
  }
}
