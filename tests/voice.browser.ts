import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { VoiceAssistant } from "../src/client/voice.js";

/** Real UI with a fake Live transport; no microphone access or provider charges. */
export async function checkVoiceHold() {
  const require = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (check: () => unknown) => {
    for (let n = 0; n < 200; n++) {
      if (check()) return;
      await tick();
    }
    throw new Error(
      "Live UI timed out: " +
        JSON.stringify({ requests, events: events.map((e) => e.type) }),
    );
  };
  const original = {
    fetch: window.fetch,
    audioContext: window.AudioContext,
    pc: window.RTCPeerConnection,
    play: HTMLMediaElement.prototype.play,
  };
  const mediaDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );
  const scope = "browser-assistant:v1:/assistant:voice-test";
  sessionStorage.removeItem(scope);
  const requests: string[] = [],
    events: any[] = [],
    tracks: any[] = [];
  let mediaCalls = 0,
    operations = 0,
    energy = 0;
  let grant: (() => void) | undefined, connect: (() => void) | undefined;
  let finishTool: (() => void) | undefined;
  let deferredTool = false,
    acknowledgeUnmute = true;
  let attached: any = null;
  const emit = (event: unknown) =>
    dc.onmessage?.({ data: JSON.stringify(event) });
  const dc = {
    readyState: "connecting",
    onmessage: null as any,
    send(value: string) {
      const event = JSON.parse(value);
      events.push(event);
      if (event.type === "session.input_audio.unmute" && acknowledgeUnmute)
        queueMicrotask(() =>
          emit({
            type: "session.input_audio.unmuted",
            client_event_id: event.event_id,
          }),
        );
    },
    close() {
      this.readyState = "closed";
    },
  };
  class Peer {
    connectionState = "new";
    iceGatheringState = "complete";
    localDescription: unknown;
    addTransceiver() {
      return {
        sender: {
          replaceTrack: async (track: any) => {
            attached = track;
          },
        },
      };
    }
    createDataChannel() {
      dc.readyState = "connecting";
      return dc;
    }
    async createOffer() {
      return { type: "offer", sdp: "v=0\r\ns=test browser offer" };
    }
    async setLocalDescription(offer: unknown) {
      this.localDescription = offer;
    }
    async setRemoteDescription() {
      this.connectionState = "connected";
      dc.readyState = "open";
      queueMicrotask(() =>
        emit({ type: "session.started", session: { id: "live-test" } }),
      );
    }
    async getStats() {
      return new Map([
        [
          "audio",
          { type: "inbound-rtp", kind: "audio", totalAudioEnergy: energy },
        ],
      ]);
    }
    close() {
      this.connectionState = "closed";
    }
  }
  window.RTCPeerConnection = Peer as any;
  const silenceTrack = { enabled: true, stop() {} };
  window.AudioContext = class {
    async resume() {}
    async close() {}
    createMediaStreamDestination() {
      return { stream: { getAudioTracks: () => [silenceTrack] } };
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
  } as any;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        mediaCalls++;
        const track = {
          enabled: true,
          readyState: "live",
          stop() {
            this.enabled = false;
            this.readyState = "ended";
          },
        };
        tracks.push(track);
        const media = {
          getTracks: () => [track],
          getAudioTracks: () => [track],
        } as any;
        if (mediaCalls === 1)
          return new Promise((resolve) => {
            grant = () => resolve(media);
          });
        return media;
      },
    },
  });
  HTMLMediaElement.prototype.play = async () => {};
  window.fetch = async (input, options) => {
    const path = new URL(String(input), location.href).pathname;
    requests.push(path);
    if (path === "/assistant/health")
      return Response.json({
        configured: true,
        voiceApi: "live",
        voiceIdleSeconds: 1,
        voiceSessionSeconds: 600,
      });
    if (path === "/assistant/live")
      return new Promise((resolve) => {
        connect = () =>
          resolve(
            Response.json({
              sdp: "v=0\r\ns=test answer",
              sessionId: "live-test",
            }),
          );
      });
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
    const props = {
      locale: "ko-KR" as const,
      serverUrl: "/assistant",
      chatVisibility: "always" as const,
      sessionKey: "voice-test",
      context: {},
      onCommand: async () => {
        operations++;
        if (deferredTool)
          await new Promise<void>((resolve) => {
            finishTool = resolve;
          });
        return { ok: true, state: {} };
      },
    };
    root.render(createElement(VoiceAssistant, props));
    await until(() => container.querySelector("[data-voice-fab]"));
    await tick(100);
    require(!requests.length &&
      !mediaCalls, "Page load must neither connect nor request microphone access");
    const button =
      container.querySelector<HTMLButtonElement>("[data-voice-fab]")!;
    const down = () =>
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    const up = () =>
      button.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", bubbles: true }),
      );
    down();
    await until(() => grant);
    up();
    down();
    await tick();
    up();
    require(mediaCalls === 1, "Pending permission must be shared");
    grant!();
    await tick(100);
    require(!tracks[0].enabled &&
      !requests.includes(
        "/assistant/live",
      ), "Late permission must not record or create a paid session");
    down();
    await until(() => connect);
    require(!tracks[0].enabled, "Connecting must keep microphone muted");
    connect!();
    await until(() => button.getAttribute("aria-pressed") === "true");
    require(attached === silenceTrack &&
      tracks[0].enabled, "Held button must enable the negotiated microphone");
    const liveCount = () =>
      requests.filter((p) => p === "/assistant/live").length;
    up();
    require(!tracks[0].enabled &&
      attached.enabled, "Release must mute the microphone while keeping the silence transport active");
    require(!events.some(
      (e) =>
        e.type === "input_audio_buffer.commit" || e.type === "response.create",
    ), "Release must not use Realtime turn triggers");
    down();
    await until(() => tracks[0].enabled);
    up();
    require(liveCount() === 1 &&
      mediaCalls ===
        1, "Repeated holds reuse the same connection and microphone");
    // A delayed unmute acknowledgment must never activate a released hold.
    acknowledgeUnmute = false;
    const unmuteCount = () =>
      events.filter((e) => e.type === "session.input_audio.unmute").length;
    const beforeUnmute = unmuteCount();
    down();
    await until(() => unmuteCount() > beforeUnmute);
    const pending = events.at(-1);
    up();
    emit({
      type: "session.input_audio.unmuted",
      client_event_id: pending.event_id,
    });
    require(!tracks[0]
      .enabled, "Late unmute acknowledgment must not reopen microphone");
    acknowledgeUnmute = true;
    const backend = (event: unknown) =>
      emit({ type: "response.event", delegation_id: "delegation-1", event });
    emit({
      type: "session.delegation.created",
      delegation: { id: "delegation-1", target: "responses" },
    });
    backend({ type: "response.created", response: { id: "response-1" } });
    const call = {
      type: "function_call",
      name: "get_current_view",
      call_id: "call-1",
      arguments: "{}",
    };
    backend({ type: "response.output_item.done", item: call });
    backend({ type: "response.output_item.done", item: call });
    deferredTool = true;
    backend({
      type: "response.completed",
      response: { id: "response-1", output: [] },
    });
    await until(() => finishTool);
    await tick(1400);
    require(!events.some(
      (e) => e.type === "session.close",
    ), "Pending tool work must postpone idle closure");
    finishTool!();
    await until(() => events.some((e) => e.type === "response.create"));
    require(operations ===
      1, "Repeated tool events must execute only once, even with empty terminal output");
    require(!tracks[0].enabled, "Tool execution must never enable microphone");
    const resultIndex = events.findIndex(
      (e) => e.type === "response.item.create",
    );
    require(resultIndex >= 0 &&
      resultIndex <
        events.findIndex(
          (e) => e.type === "response.create",
        ), "Tool result must precede backend continuation");
    backend({ type: "response.created", response: { id: "response-2" } });
    backend({
      type: "response.completed",
      response: { id: "response-2", output: [] },
    });
    emit({
      type: "session.output_transcript.delta",
      start_ms: 1,
      end_ms: 500,
      delta: "공실만 ",
    });
    emit({
      type: "session.output_transcript.delta",
      start_ms: 500,
      end_ms: 900,
      delta: "모아뒀어요.",
    });
    await until(
      () =>
        container.querySelector("[data-floating-response]")?.textContent ===
        "공실만 모아뒀어요.",
    );
    require(!container.querySelector(
      '[aria-label="대화 내용"]',
    ), "Voice must leave history collapsed");
    container
      .querySelector<HTMLButtonElement>('[aria-label="대화 펼치기 또는 접기"]')!
      .click();
    await tick();
    const captionCopies = (text: string) =>
      [...container.querySelectorAll('[aria-label="대화 내용"] p')].filter(
        (p) => p.textContent === text,
      ).length;
    require(captionCopies("공실만 모아뒀어요.") ===
      1, "Live caption must render once while the session is active");
    emit({
      type: "session.output_transcript.delta",
      start_ms: 900,
      end_ms: 1000,
      delta: " 확인하세요.",
    });
    await tick();
    require(captionCopies("공실만 모아뒀어요. 확인하세요.") === 1 &&
      captionCopies("공실만 모아뒀어요.") ===
        0, "Further caption fragments must update the same row without a duplicate preview");
    container
      .querySelector<HTMLButtonElement>('[aria-label="대화 내용 접기"]')!
      .click();
    await tick();
    // Actual received speech keeps the session active, independent of caption events.
    for (let i = 0; i < 7; i++) {
      energy += 0.1;
      await tick(200);
    }
    require(!events.some(
      (e) => e.type === "session.close",
    ), "Audio playback must reset idle time");
    await until(() => events.some((e) => e.type === "session.close"));
    require(dc.readyState ===
      "open", "Close must wait for final usage before closing the transport");
    emit({ type: "session.closed", usage: { seconds: 15 } });
    require(dc.readyState === "closed" &&
      tracks.every(
        (t) => t.readyState === "ended",
      ), "Finalized closure must release resources");
    window.dispatchEvent(new Event("online"));
    await tick(100);
    require(liveCount() ===
      1, "Online notification must not create another paid session");
    container
      .querySelector<HTMLButtonElement>('[aria-label="대화 펼치기 또는 접기"]')!
      .click();
    await tick();
    require(container.textContent?.includes(
      "공실만 모아뒀어요.",
    ), "Caption fragments must remain in history");
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
    require(liveCount() === 1, "Typed input must not start a voice session");
    root.render(
      createElement(VoiceAssistant, {
        ...props,
        pendingAction: createElement(
          "div",
          { "aria-label": "검증용 확인" },
          "실행할 내용",
        ),
      }),
    );
    await tick();
    require(container.querySelector(
      '[aria-label="검증용 확인"]',
    ), "Existing confirmation UI must remain available");
    // Reconnect only after explicit hold, then cancel by touch and ignore late events.
    connect = undefined;
    down();
    await until(() => connect);
    connect!();
    await until(() => tracks.at(-1).enabled);
    const staleHandler = dc.onmessage;
    button.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    require(!tracks.at(-1)
      .enabled, "Pointer cancellation must stop microphone immediately");
    staleHandler({
      data: JSON.stringify({
        type: "response.event",
        delegation_id: "late",
        event: { type: "response.output_item.done", item: call },
      }),
    });
    require(operations === 1, "Late tools after cancellation must not execute");
    emit({ type: "session.closed", usage: { seconds: 15 } });
    connect = undefined;
    down();
    await until(() => connect);
    connect!();
    await until(() => tracks.at(-1).enabled);
    window.dispatchEvent(new Event("blur"));
    require(!tracks.at(-1)
      .enabled, "Window blur must stop microphone immediately");
    emit({ type: "session.closed", usage: { seconds: 15 } });
    root.unmount();
    mounted = false;
    require(tracks.every(
      (t) => t.readyState === "ended",
    ), "Unmount must release resources");
    return {
      ok: true,
      microphoneRequests: mediaCalls,
      initialPermissionRequests: 1,
      onDemandConnection: true,
      mutedBetweenHolds: true,
      idleClosure: true,
      latePermissionCancelled: true,
      lateUnmuteCancelled: true,
      toolRoundTrip: true,
    };
  } finally {
    if (mounted) root.unmount();
    container.remove();
    window.fetch = original.fetch;
    window.RTCPeerConnection = original.pc;
    window.AudioContext = original.audioContext;
    if (mediaDescriptor)
      Object.defineProperty(navigator, "mediaDevices", mediaDescriptor);
    else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
    HTMLMediaElement.prototype.play = original.play;
  }
}
