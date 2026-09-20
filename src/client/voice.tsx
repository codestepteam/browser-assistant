import { createTranslator, type Locale } from "../i18n.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toolCallSchema, type ToolCall, type ToolResult } from "../protocol.js";
import { MarkdownMessage } from "./markdown.js";
type SavedSession = {
  messages: Message[];
  pending: string | null;
  open: boolean;
};
function readSession(key: string): SavedSession {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      saved &&
      Array.isArray(saved.messages) &&
      (saved.pending === null || typeof saved.pending === "string")
    )
      return saved;
  } catch {}
  return { messages: [], pending: null, open: false };
}
function saveSession(key: string, value: SavedSession) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage-disabled browsers keep the active conversation in memory. */
  }
}
type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  at: string;
  result?: unknown;
};
type Phase =
  "idle" | "connecting" | "ready" | "listening" | "speaking" | "working";
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clean = (value: string) =>
  value.replace(/\d{6}[-\s]?[1-8]\d{6}/g, "[redacted]");
export type VoiceProps = {
  serverUrl: string;
  sessionKey: string;
  locale?: Locale;
  timeZone?: string;
  translations?: Record<string, string>;
  title?: string;
  context?: unknown;
  instructions?: string;
  siteContext?: string;
  embedded?: boolean;
  chatVisibility?: "session" | "always";
  voiceEnabled?: boolean;
  pendingAction?: ReactNode;
  onInterrupt?: () => void;
  onCommand: (command: ToolCall) => Promise<unknown>;
};
export function VoiceAssistant({
  serverUrl,
  sessionKey,
  locale = "en-US",
  timeZone = "UTC",
  translations,
  title,
  context = {},
  instructions = "",
  siteContext = "",
  embedded = false,
  chatVisibility = "session",
  voiceEnabled = true,
  pendingAction,
  onInterrupt,
  onCommand,
}: VoiceProps) {
  const t = createTranslator(locale, translations);
  const [phase, setPhase] = useState<Phase>("idle"),
    [voiceError, setVoiceError] = useState(""),
    [recording, setRecording] = useState(false),
    [expanded, setExpanded] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [partial, setPartial] = useState(""),
    [input, setInput] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const connection = useRef<RTCPeerConnection | null>(null),
    stream = useRef<MediaStream | null>(null),
    microphoneRequest = useRef<Promise<MediaStream> | null>(null),
    channel = useRef<RTCDataChannel | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    inputAudio = useRef<AudioContext | null>(null),
    transportTrack = useRef<MediaStreamTrack | null>(null),
    abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0),
    voiceGeneration = useRef(0),
    voiceAbort = useRef<AbortController | null>(null),
    sender = useRef<RTCRtpSender | null>(null),
    held = useRef(false),
    holdGeneration = useRef(0),
    playing = useRef(false),
    liveReady = useRef(false),
    idleTimer = useRef<ReturnType<typeof setInterval> | null>(null),
    lastActivity = useRef(0),
    lastSpeech = useRef(0),
    audioEnergy = useRef(0),
    activeResponses = useRef(new Set<string>()),
    responseBatches = useRef(
      new Map<
        string,
        {
          turn: number;
          calls: { name: string; call_id: string; arguments: string }[];
        }
      >(),
    ),
    delegationTurns = useRef(new Map<string, number>()),
    delegationResponses = useRef(new Map<string, string>()),
    pendingUnmute = useRef<{ id: string; hold: number } | null>(null),
    captions = useRef<{
      user?: { id: string; end: number };
      assistant?: { id: string; end: number };
    }>({}),
    voiceTurn = useRef(0),
    textBusy = useRef(false),
    historyMessages = useRef<Message[]>([]),
    seen = useRef(new Set<string>()),
    tools = useRef(Promise.resolve()),
    contextRef = useRef(context),
    commandRef = useRef(onCommand),
    partialRef = useRef(""),
    scopeRef = useRef("");
  contextRef.current = context;
  commandRef.current = onCommand;
  const scope = `browser-assistant:v1:${serverUrl}:${sessionKey}`;
  const pendingRun = useRef<string | null>(null);
  const restoredRun = useRef<string | null>(null);
  const serializedContext = JSON.stringify(context ?? {});
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  const transcript = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusComposer = useRef(false);
  useEffect(() => {
    const el = transcript.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, partial, expanded]);
  useEffect(() => {
    if (!focusComposer.current || !expanded) return;
    focusComposer.current = false;
    inputRef.current?.focus();
  }, [expanded]);
  useEffect(() => {
    if (voiceEnabled || !pendingAction || expandedRef.current) return;
    expandedRef.current = true;
    setExpanded(true);
    saveSession(scope, {
      messages: historyMessages.current,
      pending: pendingRun.current,
      open: true,
    });
  }, [pendingAction, voiceEnabled, scope]);
  scopeRef.current = scope;
  function stop() {
    onInterrupt?.();
    const wasReady = liveReady.current;
    voiceGeneration.current++;
    voiceAbort.current?.abort();
    voiceAbort.current = null;
    if (timer.current) clearTimeout(timer.current);
    if (idleTimer.current) clearInterval(idleTimer.current);
    timer.current = null;
    idleTimer.current = null;
    liveReady.current = false;
    pendingUnmute.current = null;
    held.current = false;
    holdGeneration.current++;
    setRecording(false);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    transportTrack.current?.stop();
    transportTrack.current = null;
    void inputAudio.current?.close().catch(() => {});
    inputAudio.current = null;
    microphoneRequest.current = null;
    const dc = channel.current,
      pc = connection.current;
    channel.current = null;
    connection.current = null;
    sender.current = null;
    if (pc) pc.onconnectionstatechange = null;
    // Keep the old transport alive until final usage arrives, even during unmount.
    if (dc?.readyState === "open") {
      const timeout = setTimeout(() => {
        dc.close();
        pc?.close();
      }, 3000);
      dc.onmessage = (message) => {
        try {
          const type = JSON.parse(String(message.data)).type;
          if (type === "session.started" && !wasReady)
            dc.send(
              JSON.stringify({ type: "session.close", event_id: newId() }),
            );
          if (type !== "session.closed") return;
          clearTimeout(timeout);
          dc.close();
          pc?.close();
        } catch {
          /* Ignore malformed events while closing. */
        }
      };
      if (wasReady)
        dc.send(JSON.stringify({ type: "session.close", event_id: newId() }));
    } else {
      dc?.close();
      pc?.close();
    }
    playing.current = false;
    voiceTurn.current++;
    activeResponses.current.clear();
    responseBatches.current.clear();
    delegationTurns.current.clear();
    delegationResponses.current.clear();
    captions.current = {};
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
      audio.current = null;
    }
    setPhase("idle");
    setPartial("");
    partialRef.current = "";
  }
  useEffect(() => {
    stop();
    const restored = readSession(scope);
    setMessages(restored.messages);
    historyMessages.current = restored.messages;
    pendingRun.current = restored.pending;
    restoredRun.current = restored.pending;
    setBusy(false);
    textBusy.current = false;

    setError("");
    setExpanded(false);
    expandedRef.current = false;
    seen.current.clear();
    const resume = setTimeout(() => {
      if (restoredRun.current) {
        const prompt = restoredRun.current;
        restoredRun.current = null;
        void submit(prompt, true);
      }
    }, 0);
    const suspend = () => {
      if (document.hidden && (connection.current || voiceAbort.current)) stop();
    };
    const blur = () => endHold(false);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", suspend);
    return () => {
      clearTimeout(resume);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", suspend);
      generation.current++;
      abort.current?.abort();
      stop();
    };
  }, [scope, locale, timeZone]);
  useEffect(() => {
    // Detailed screen data stays in tool results; appends have a 500-token limit.
    if (liveReady.current)
      send({
        type: "session.thinking.append",
        event_id: newId(),
        delegation_id: null,
        content:
          "The visible page context changed. Ask the backend to read the current view before referring to or operating any control.",
      });
  }, [serializedContext]);
  function append(
    role: Message["role"],
    text: string,
    id = newId(),
    result?: unknown,
  ) {
    if (!text.trim() || seen.current.has(id)) return;
    seen.current.add(id);
    const serialized =
      result === undefined ? "" : clean(JSON.stringify(result));
    const message = {
      id,
      role,
      text: clean(text).slice(0, 12000),
      at: new Date().toISOString(),
      ...(serialized
        ? {
            result:
              serialized.length <= 24000
                ? JSON.parse(serialized)
                : {
                    summary: t(
                      "화면에 표시한 결과가 길어 본문에서 확인할 수 있습니다.",
                    ),
                  },
          }
        : {}),
    };
    const next = [...historyMessages.current, message];
    historyMessages.current = next;
    setMessages(next);
    saveSession(scopeRef.current, {
      messages: next.slice(-150),
      pending: pendingRun.current,
      open: expandedRef.current,
    });
  }
  function persistRun(prompt: string | null) {
    pendingRun.current = prompt;
    saveSession(scopeRef.current, {
      messages: historyMessages.current.slice(-150),
      pending: prompt,
      open: expandedRef.current,
    });
  }

  function send(event: unknown) {
    if (channel.current?.readyState === "open")
      channel.current.send(JSON.stringify(event));
  }
  async function request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`${serverUrl.replace(/\/$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body:
        body === undefined
          ? undefined
          : JSON.stringify({
              ...(body as object),
              instructions,
              siteContext,
              locale,
              timeZone,
              protocolVersion: 1,
            }),
      signal,
    });
    const data = await response
      .json()
      .catch(() => ({ error: t("응답을 읽지 못했습니다.") }));
    if (!response.ok)
      throw new Error(t(data.error ?? "요청을 처리하지 못했습니다."));
    return data;
  }
  async function execute(
    command: unknown,
    callId?: string,
    current = () => true,
  ) {
    const call = toolCallSchema.parse(command);
    if (!current()) return;
    if (call.name === "use_element") {
      const request = JSON.parse(call.argumentsJson);
      append("tool", t("선택한 화면 항목을 조작하고 있습니다."), newId(), {
        pendingAction: request,
      });
    }
    const result = (await commandRef.current(call)) as ToolResult;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (!current()) return;
    const labels = {
      get_current_view: t("현재 화면을 확인했습니다."),
      use_element: t("화면 항목을 조작했습니다."),
      scroll_view: t("화면을 스크롤했습니다."),
    };
    append(
      "tool",
      result.ok
        ? labels[call.name]
        : (result.error?.message ?? t("도구 실행을 확인하세요.")),
      callId ?? newId(),
      result,
    );
    return result;
  }
  function updatePhase() {
    if (!liveReady.current) return;
    setPhase(
      held.current
        ? "listening"
        : playing.current
          ? "speaking"
          : activeResponses.current.size
            ? "working"
            : "ready",
    );
  }
  function recordCaption(
    role: "user" | "assistant",
    event: Record<string, any>,
  ) {
    if (typeof event.delta !== "string" || !event.delta) return;
    const start = Number(event.start_ms ?? 0),
      end = Number(event.end_ms ?? start);
    let caption = captions.current[role];
    // ponytail: group caption fragments by a 1.5s gap; timestamps are not turn boundaries.
    if (!caption || start - caption.end > 1500) {
      caption = { id: newId(), end };
      captions.current[role] = caption;
    }
    caption.end = Math.max(caption.end, end);
    const prior = historyMessages.current.find((m) => m.id === caption.id);
    const text = clean((prior?.text ?? "") + event.delta).slice(0, 12000);
    const next = prior
      ? historyMessages.current.map((m) =>
          m.id === caption.id ? { ...m, text } : m,
        )
      : [
          ...historyMessages.current,
          { id: caption.id, role, text, at: new Date().toISOString() },
        ];
    historyMessages.current = next;
    setMessages(next);
    if (role === "assistant") {
      setPartial(text);
      partialRef.current = text;
    }
    if (role === "user") pendingRun.current = text;
    persistRun(pendingRun.current);
    lastActivity.current = performance.now();
  }
  function handleBackend(envelope: Record<string, any>, epoch: number) {
    const event = envelope.event;
    if (!event || typeof envelope.delegation_id !== "string") return;
    const id =
      event.response_id ??
      event.response?.id ??
      delegationResponses.current.get(envelope.delegation_id);
    if (event.type === "response.created" && typeof id === "string") {
      delegationResponses.current.set(envelope.delegation_id, id);
      activeResponses.current.add(id);
      responseBatches.current.set(id, {
        turn:
          delegationTurns.current.get(envelope.delegation_id) ??
          voiceTurn.current,
        calls: [],
      });
    }
    const batch = responseBatches.current.get(id);
    if (
      event.type === "response.output_item.done" &&
      event.item?.type === "function_call" &&
      batch
    ) {
      const call = event.item;
      if (
        typeof call.call_id === "string" &&
        typeof call.name === "string" &&
        typeof call.arguments === "string" &&
        !batch.calls.some((c) => c.call_id === call.call_id)
      )
        batch.calls.push(call);
    }
    if (
      [
        "response.completed",
        "response.failed",
        "response.incomplete",
        "response.cancelled",
      ].includes(event.type)
    ) {
      responseBatches.current.delete(id);
      if (event.type !== "response.completed" || !batch?.calls.length) {
        activeResponses.current.delete(id);
        if (event.type !== "response.completed")
          setVoiceError(
            t("AI가 응답을 마치지 못했습니다. 다시 말씀해 주세요."),
          );
        if (
          !activeResponses.current.size &&
          event.type === "response.completed"
        )
          persistRun(null);
      } else {
        tools.current = tools.current
          .catch(() => {})
          .then(async () => {
            try {
              // Tools must wait for release; a new hold invalidates older queued work.
              while (
                held.current &&
                epoch === voiceGeneration.current &&
                batch.turn === voiceTurn.current
              )
                await new Promise((resolve) => setTimeout(resolve, 25));
              for (const call of batch.calls) {
                if (epoch !== voiceGeneration.current) return;
                const current = () =>
                  epoch === voiceGeneration.current &&
                  batch.turn === voiceTurn.current &&
                  !textBusy.current;
                let result: unknown;
                if (!current())
                  result = {
                    ok: false,
                    error: {
                      code: "SUPERSEDED",
                      message:
                        "The user interrupted or changed this request. Read the current view before new work.",
                    },
                  };
                else {
                  try {
                    result = await execute(
                      { name: call.name, argumentsJson: call.arguments },
                      `result:${call.call_id}`,
                      current,
                    );
                  } catch (error) {
                    result = {
                      ok: false,
                      error: {
                        code: "TOOL_ERROR",
                        message:
                          error instanceof Error
                            ? error.message
                            : "Tool failed",
                      },
                    };
                  }
                }
                if (epoch !== voiceGeneration.current) return;
                // Every call receives a result, including cancelled work; never leave the backend waiting.
                send({
                  type: "response.item.create",
                  event_id: newId(),
                  item: {
                    type: "function_call_output",
                    call_id: call.call_id,
                    output: clean(
                      JSON.stringify(
                        result ?? { ok: false, error: { code: "SUPERSEDED" } },
                      ),
                    ),
                  },
                });
              }
              send({ type: "response.create", event_id: newId() });
            } finally {
              if (epoch === voiceGeneration.current) {
                activeResponses.current.delete(id);
                lastActivity.current = performance.now();
                updatePhase();
              }
            }
          });
      }
    }
    lastActivity.current = performance.now();
    updatePhase();
  }
  function handleEvent(raw: string, epoch: number) {
    if (epoch !== voiceGeneration.current) return;
    let event: Record<string, any>;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    switch (event.type) {
      case "session.started":
        liveReady.current = true;
        lastActivity.current = performance.now();
        send({ type: "session.input_audio.mute", event_id: newId() });
        updatePhase();
        if (held.current) void captureHold(holdGeneration.current, epoch);
        break;
      case "session.input_transcript.delta":
        recordCaption("user", event);
        break;
      case "session.input_audio.unmuted":
        if (
          pendingUnmute.current &&
          pendingUnmute.current.id === event.client_event_id &&
          held.current &&
          pendingUnmute.current.hold === holdGeneration.current
        ) {
          stream.current?.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });
          pendingUnmute.current = null;
          setRecording(true);
          setPhase("listening");
        }
        break;
      case "session.output_transcript.delta":
        recordCaption("assistant", event);
        break;
      case "session.delegation.created":
        if (event.delegation?.target === "responses")
          delegationTurns.current.set(event.delegation.id, voiceTurn.current);
        break;
      case "response.event":
        handleBackend(event, epoch);
        break;
      case "session.closed":
        // Already finalized: cleanup must not issue another close command.
        channel.current?.close();
        stop();
        break;
      case "error":
        setVoiceError(
          t(
            "음성 처리 중 오류가 발생했습니다. 버튼을 누르고 다시 말해 주세요.",
          ),
        );
        onInterrupt?.();
        stop();
        break;
    }
  }
  async function microphone(epoch: number) {
    if (!voiceEnabled) return null;
    if (
      stream.current
        ?.getAudioTracks()
        .some((track) => track.readyState === "live")
    )
      return stream.current;
    if (!microphoneRequest.current) {
      const pending = navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        })
        .then((media) => {
          media.getTracks().forEach((track) => {
            track.enabled = false;
          });
          if (epoch !== voiceGeneration.current)
            media.getTracks().forEach((track) => track.stop());
          else stream.current = media;
          return media;
        })
        .finally(() => {
          if (microphoneRequest.current === pending)
            microphoneRequest.current = null;
        });
      microphoneRequest.current = pending;
    }
    return microphoneRequest.current;
  }
  async function start() {
    if (!voiceEnabled || voiceAbort.current || connection.current) return;
    setVoiceError("");
    setPhase("connecting");
    const epoch = voiceGeneration.current,
      controller = new AbortController();
    voiceAbort.current = controller;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          t(
            "음성 입력은 HTTPS 주소에서 사용할 수 있습니다. 글로 입력할 수도 있습니다.",
          ),
        );
      // Permission denial or a released first hold must not create a billable session.
      const media = await microphone(epoch);
      if (!media || epoch !== voiceGeneration.current) return;
      if (!held.current) {
        setPhase("idle");
        return;
      }
      const state = await request<{
        configured: boolean;
        voiceApi?: string;
        voiceSessionSeconds?: number;
        voiceIdleSeconds?: number;
      }>("/health", undefined, controller.signal);
      if (!state.configured)
        throw new Error(
          t("AI 연결 설정이 필요합니다. OpenAI API 키를 등록해 주세요."),
        );
      if (state.voiceApi !== "live")
        throw new Error(t("GPT-Live를 지원하는 서버로 업데이트해 주세요."));
      if (epoch !== voiceGeneration.current || !held.current) {
        setPhase("idle");
        return;
      }
      const pc = new RTCPeerConnection();
      connection.current = pc;
      sender.current = pc.addTransceiver("audio", {
        direction: "sendrecv",
      }).sender;
      const inputContext = inputAudio.current ?? new AudioContext();
      inputAudio.current = inputContext;
      await inputContext.resume();
      if (epoch !== voiceGeneration.current) return;
      const destination = inputContext.createMediaStreamDestination();
      inputContext.createMediaStreamSource(media).connect(destination);
      // Live needs continuous frames after release to deliver backend results.
      // Mute the microphone source, never the transport's separate silence track.
      transportTrack.current = destination.stream.getAudioTracks()[0];
      await sender.current.replaceTrack(transportTrack.current);
      const playback = document.createElement("audio");
      playback.autoplay = true;
      audio.current = playback;
      pc.ontrack = (e) => {
        if (epoch !== voiceGeneration.current) return;
        playback.srcObject = new MediaStream([e.track]);
        void playback.play().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (epoch !== voiceGeneration.current) return;
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          onInterrupt?.();
          stop();
          setVoiceError(
            t("음성 연결이 끊어졌습니다. 버튼을 눌러 다시 준비해 주세요."),
          );
        }
      };
      const dc = pc.createDataChannel("oai-events");
      channel.current = dc;
      dc.onmessage = (e) => handleEvent(String(e.data), epoch);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (pc.iceGatheringState !== "complete")
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("ICE gathering timed out"));
          }, 10000);
          const changed = () => {
            if (pc.iceGatheringState === "complete") {
              cleanup();
              resolve();
            }
          };
          const cancel = () => {
            cleanup();
            reject(new Error("Connection cancelled"));
          };
          function cleanup() {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", changed);
            controller.signal.removeEventListener("abort", cancel);
          }
          pc.addEventListener("icegatheringstatechange", changed);
          controller.signal.addEventListener("abort", cancel, { once: true });
          if (controller.signal.aborted) cancel();
          else changed();
        });
      if (epoch !== voiceGeneration.current) return;
      if (!held.current) {
        stop();
        return;
      }
      const answer = await request<{ sdp: string }>(
        "/live",
        {
          sdp: pc.localDescription?.sdp,
          context: {
            screen: contextRef.current,
            recentConversation: historyMessages.current
              .filter((m) => m.role !== "tool")
              .slice(-6)
              .map((m) => ({ role: m.role, text: m.text.slice(0, 1500) })),
          },
        },
        controller.signal,
      );
      if (epoch !== voiceGeneration.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      const started = performance.now();
      lastActivity.current = started;
      lastSpeech.current = 0;
      audioEnergy.current = 0;
      // Poll received audio energy: Live has no spoken-response-completed event.
      let polling = false;
      idleTimer.current = setInterval(() => {
        if (polling || epoch !== voiceGeneration.current) return;
        polling = true;
        void (async () => {
          try {
            const now = performance.now();
            const stats = await pc.getStats();
            if (epoch !== voiceGeneration.current) return;
            let energy = 0;
            stats.forEach((report) => {
              if (
                report.type === "inbound-rtp" &&
                (report.kind === "audio" || report.mediaType === "audio")
              )
                energy += Number(report.totalAudioEnergy ?? 0);
            });
            if (energy > audioEnergy.current + 0.000001) {
              lastSpeech.current = now;
              lastActivity.current = now;
            }
            audioEnergy.current = energy;
            playing.current = now - lastSpeech.current < 1500;
            if (
              held.current ||
              activeResponses.current.size ||
              textBusy.current
            )
              lastActivity.current = now;
            updatePhase();
            const idleMs = Math.max(1, state.voiceIdleSeconds ?? 60) * 1000;
            if (
              (!held.current &&
                !playing.current &&
                !activeResponses.current.size &&
                !textBusy.current &&
                now - lastActivity.current >= idleMs) ||
              now - started >= (state.voiceSessionSeconds ?? 600) * 1000
            ) {
              onInterrupt?.();
              stop();
            } else if (!liveReady.current && now - started > 15000) {
              stop();
              setVoiceError(
                t(
                  "음성 연결이 지연되고 있습니다. 버튼을 눌러 다시 준비해 주세요.",
                ),
              );
            }
          } catch {
            if (epoch === voiceGeneration.current) {
              onInterrupt?.();
              stop();
            }
          } finally {
            polling = false;
          }
        })();
      }, 250);
    } catch (e) {
      if (epoch !== voiceGeneration.current) return;
      stop();
      setVoiceError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? t("마이크 권한을 허용한 뒤 버튼을 다시 누르고 말해 주세요.")
          : e instanceof Error
            ? e.message
            : t("음성 연결을 준비하지 못했습니다."),
      );
    } finally {
      if (voiceAbort.current === controller) voiceAbort.current = null;
    }
  }
  function interruptVoice() {
    onInterrupt?.();
    voiceTurn.current++;
    partialRef.current = "";
    setPartial("");
  }
  function beginHold() {
    if (!voiceEnabled || held.current || textBusy.current) return;
    held.current = true;
    const hold = ++holdGeneration.current;
    lastActivity.current = performance.now();
    interruptVoice();
    setVoiceError("");
    if (window.isSecureContext && !inputAudio.current) {
      inputAudio.current = new AudioContext();
      void inputAudio.current.resume().catch(() => {});
    }
    void audio.current?.play().catch(() => {});
    if (liveReady.current) void captureHold(hold, voiceGeneration.current);
    else {
      setPhase("connecting");
      void start();
    }
  }
  async function captureHold(hold: number, epoch: number) {
    if (
      !voiceEnabled ||
      !held.current ||
      hold !== holdGeneration.current ||
      epoch !== voiceGeneration.current
    )
      return;
    try {
      const media = await microphone(epoch);
      if (!media) return;
      if (
        !held.current ||
        hold !== holdGeneration.current ||
        epoch !== voiceGeneration.current
      )
        return;
      const track = media.getAudioTracks()[0];
      if (!track || track.readyState !== "live")
        throw new Error(t("마이크 연결이 종료되었습니다."));
      if (
        !held.current ||
        hold !== holdGeneration.current ||
        epoch !== voiceGeneration.current
      )
        return;
      const id = newId();
      pendingUnmute.current = { id, hold };
      send({ type: "session.input_audio.unmute", event_id: id });
    } catch {
      if (epoch !== voiceGeneration.current) return;
      endHold(false);
      setVoiceError(
        t("마이크를 켜지 못했습니다. 연결과 권한을 확인해 주세요."),
      );
    }
  }
  function endHold(keepSession: boolean) {
    if (!held.current) return;
    held.current = false;
    pendingUnmute.current = null;
    holdGeneration.current++;
    // Mute only the microphone; the separate Web Audio track keeps sending silence.
    stream.current?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    setRecording(false);
    lastActivity.current = performance.now();
    if (!keepSession) {
      onInterrupt?.();
      stop();
      return;
    }
    // Local muting preserves the last audio packets; no manual turn commit is sent to Live.
    updatePhase();
  }
  async function submit(resumePrompt?: string, resumed = false) {
    const text = (resumePrompt ?? input).trim();
    if (!text || textBusy.current) return;
    setInput("");
    setError("");
    if (!resumed) {
      setExpanded(true);
      expandedRef.current = true;
    }
    persistRun(text);
    if (!resumed) append("user", text);
    endHold(false);
    interruptVoice();
    stop();
    textBusy.current = true;
    const epoch = generation.current,
      controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    try {
      const continuation: Record<string, unknown>[] = [];
      const history = historyMessages.current
        .slice(-12)
        .map((message) => ({ role: message.role, text: message.text }));
      while (JSON.stringify(history).length > 28000 && history.length > 1)
        history.shift();
      // ponytail: cap each run at 30 steps; keep its prompt so users can continue longer workflows.
      for (let step = 0; step < 30; step++) {
        const response = await request<{
          reply: string;
          calls: (ToolCall & { callId: string })[];
          responseItems: Record<string, unknown>[];
        }>(
          "/chat",
          {
            prompt: resumed
              ? `${text}\n페이지 전환 후 재개합니다. 이전 조작을 반복하지 말고 먼저 현재 화면에서 완료 여부를 확인하세요.`
              : text,
            context: contextRef.current,
            history,
            continuation,
          },
          controller.signal,
        );
        if (epoch !== generation.current) return;
        if (!response.calls.length) {
          persistRun(null);
          append("assistant", response.reply);
          return;
        }
        if (
          JSON.stringify(continuation).length > 180000 ||
          continuation.length > 80
        ) {
          continuation.length = 0;
          continue;
        }
        continuation.push(...response.responseItems);
        for (const call of response.calls) {
          const result = await execute(
            { name: call.name, argumentsJson: call.argumentsJson },
            undefined,
            () => epoch === generation.current,
          );
          if (epoch !== generation.current) return;
          continuation.push({
            type: "function_call_output",
            call_id: call.callId,
            output: JSON.stringify(result ?? { ok: false, state: {} }),
          });
        }
      }
      persistRun(null);
      append(
        "assistant",
        t(
          "한 번에 실행할 수 있는 단계에 도달했습니다. 계속하려면 이어서 진행해 달라고 요청하세요.",
        ),
      );
    } catch (e) {
      if (epoch === generation.current) {
        persistRun(null);
        setError(
          e instanceof Error ? e.message : t("대화를 처리하지 못했습니다."),
        );
      }
    } finally {
      if (epoch === generation.current) {
        setBusy(false);
        textBusy.current = false;
      }
    }
  }
  function cancelRun() {
    generation.current++;
    abort.current?.abort();
    endHold(false);
    interruptVoice();
    stop();
    persistRun(null);
    setBusy(false);
    textBusy.current = false;
    setPhase(channel.current?.readyState === "open" ? "ready" : "idle");
  }
  function toggleConversation() {
    const open = !expandedRef.current;
    expandedRef.current = open;
    setExpanded(open);
    saveSession(scope, {
      messages: historyMessages.current,
      pending: pendingRun.current,
      open,
    });
  }
  function toggleChatComposer() {
    if (expandedRef.current) {
      toggleConversation();
      return;
    }
    focusComposer.current = true;
    toggleConversation();
  }
  const button =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50";
  const working = busy || phase === "working" || phase === "speaking";
  const latestReply = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.text;
  const visibleVoiceError = voiceEnabled ? voiceError : "";
  const floatingText = recording
    ? t("누르는 동안 듣고 있어요. 놓으면 마이크가 꺼집니다.")
    : error ||
      visibleVoiceError ||
      partial ||
      (pendingAction
        ? t("실행할 내용을 확인해 주세요.")
        : phase === "connecting"
          ? t("음성 연결을 준비하고 있어요…")
          : working
            ? t("화면을 확인하고 작업하고 있어요…")
            : latestReply || t("무엇을 도와드릴까요?"));
  const showConversation =
    !voiceEnabled ||
    chatVisibility === "always" ||
    phase !== "idle" ||
    busy ||
    !!pendingAction ||
    !!visibleVoiceError;
  return (
    <div
      style={{ pointerEvents: "auto" }}
      className={embedded ? "relative w-full p-2" : "relative z-[2147483647]"}
    >
      {showConversation && (expanded || pendingAction) && (
        <section
          id="assistant-conversation"
          aria-label={expanded ? t("대화 내용") : t("실행 확인")}
          style={{
            border: "1px solid #e2e8f0",
            boxShadow:
              "0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.08)",
          }}
          className={
            (embedded
              ? "mb-3 max-h-[min(45dvh,420px)] w-full"
              : voiceEnabled
                ? "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 max-h-[min(65dvh,640px)] w-[420px] max-w-[calc(100vw-2rem)] [transform:translateX(-50%)]"
                : "fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-h-[min(65dvh,640px)] w-[420px] max-w-[calc(100vw-2rem)]") +
            " flex flex-col overflow-hidden rounded-2xl bg-white text-slate-800"
          }
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-slate-100 p-3">
            <strong className="flex-1 text-sm">
              {title ?? t("사이트 도우미")}
            </strong>
            <button
              type="button"
              className={button}
              aria-label={t("실행 중지")}
              onClick={cancelRun}
            >
              {t("중지")}
            </button>
            {expanded && (
              <button
                type="button"
                className={button}
                aria-label={t("대화 내용 접기")}
                onClick={toggleConversation}
              >
                {t("접기")}
              </button>
            )}
          </header>
          {expanded && (
            <div
              ref={transcript}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3"
              aria-live="polite"
            >
              {!messages.length && (
                <p className="text-sm text-slate-500">
                  {t("이 화면에서 하고 싶은 일을 알려주세요.")}
                </p>
              )}
              {messages.map((message) =>
                message.role === "assistant" ? (
                  <MarkdownMessage
                    key={message.id}
                    className="mr-3 text-sm text-slate-800"
                    text={message.text}
                  />
                ) : (
                  <p
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "ml-6 whitespace-pre-wrap break-words rounded-xl bg-emerald-50 p-3 text-sm"
                        : "text-xs text-slate-500"
                    }
                  >
                    {message.text}
                  </p>
                ),
              )}
              {working && (
                <p role="status" className="text-xs text-emerald-700">
                  {t("화면을 확인하고 작업하고 있습니다…")}
                </p>
              )}
              {(error || visibleVoiceError) && (
                <p
                  role="alert"
                  className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
                >
                  {error || visibleVoiceError}
                </p>
              )}
            </div>
          )}
          {pendingAction}
          {expanded && (
            <form
              className="flex shrink-0 gap-2 border-t border-slate-100 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <input
                ref={inputRef}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-emerald-600"
                aria-label={t("도우미에게 요청")}
                placeholder={t("어떤 일을 도와드릴까요?")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={4000}
              />
              <button
                type="submit"
                className={button}
                aria-label={t("메시지 보내기")}
                disabled={busy || !input.trim()}
              >
                {t("보내기")}
              </button>
            </form>
          )}
        </section>
      )}
      <div className={embedded ? "flex items-end gap-2" : ""}>
        {voiceEnabled && showConversation && (
          <div
            className={
              (embedded
                ? "min-w-0 flex-1"
                : "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 w-[min(34rem,calc(100vw-10rem))] [transform:translateX(-50%)]") +
              " flex min-h-14 items-center overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 text-slate-700 shadow-lg backdrop-blur-sm"
            }
          >
            <button
              type="button"
              aria-label={t("대화 펼치기 또는 접기")}
              aria-expanded={expanded}
              aria-controls="assistant-conversation"
              onClick={toggleConversation}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span
                data-floating-response
                role="status"
                aria-live="polite"
                className="line-clamp-2 min-w-0 flex-1 break-words"
              >
                {floatingText}
              </span>
              <svg
                aria-hidden="true"
                className={
                  "size-4 shrink-0 text-slate-400 " +
                  (expanded ? "rotate-180" : "")
                }
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
            {(working || phase === "ready") && !expanded && (
              <button
                type="button"
                aria-label={t("실행 중지")}
                onClick={cancelRun}
                className="mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                <svg
                  aria-hidden="true"
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="5" y="5" width="14" height="14" rx="3" />
                </svg>
              </button>
            )}
          </div>
        )}
        {voiceEnabled ? (
          <button
            type="button"
            data-voice-fab
            aria-label={
              recording ? t("녹음 중 · 놓으면 마이크 끄기") : t("누르고 말하기")
            }
            aria-pressed={recording}
            aria-describedby="assistant-voice-hint"
            disabled={busy}
            className={
              (embedded
                ? "relative size-12"
                : "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] size-14") +
              " flex shrink-0 touch-none select-none items-center justify-center rounded-full text-white shadow-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 " +
              (recording
                ? "bg-red-600 ring-4 ring-red-200"
                : "bg-emerald-700 hover:bg-emerald-800")
            }
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              void beginHold();
            }}
            onPointerUp={() => endHold(true)}
            onPointerCancel={() => endHold(false)}
            onLostPointerCapture={() => {
              if (held.current) endHold(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") endHold(false);
              if ([" ", "Enter"].includes(e.key)) {
                e.preventDefault();
                if (!e.repeat) void beginHold();
              }
            }}
            onKeyUp={(e) => {
              if ([" ", "Enter"].includes(e.key)) {
                e.preventDefault();
                endHold(true);
              }
            }}
            onBlur={() => {
              if (held.current) endHold(false);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {phase === "connecting" ? (
              <svg
                aria-hidden="true"
                className="size-6 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 3a9 9 0 1 1-9 9" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                className="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
              </svg>
            )}
          </button>
        ) : (
          <button
            type="button"
            data-chat-fab
            aria-label={expanded ? t("대화 닫기") : t("대화 열기")}
            aria-expanded={expanded}
            aria-controls="assistant-conversation"
            className={
              (embedded
                ? "relative size-12"
                : "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] size-14") +
              " flex shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            }
            onClick={toggleChatComposer}
          >
            <svg
              aria-hidden="true"
              className="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
        {voiceEnabled && (
          <span id="assistant-voice-hint" className="sr-only">
            {t(
              "버튼을 누르는 동안만 음성이 전달됩니다. 놓으면 마이크가 꺼집니다. 전체 대화는 옆의 응답을 눌러 펼칠 수 있습니다.",
            )}
          </span>
        )}
      </div>
    </div>
  );
}
