import { createTranslator, type Locale } from "../i18n.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VoiceAssistant, type VoiceProps } from "./voice.js";
import {
  createScreenController,
  type ScreenOptions,
  type ScreenActionPreview,
} from "./screen.js";
import { createConversationTools } from "./tools.js";
import styles from "./styles.css?inline";
export type BrowserAssistantProps = Omit<
  VoiceProps,
  "onCommand" | "pendingAction" | "onInterrupt" | "embedded" | "sessionKey"
> & {
  sessionKey?: string;
  screen?: ScreenOptions;
  onReady?: (tools: ReturnType<typeof createConversationTools> | null) => void;
};
export function BrowserAssistant({
  sessionKey = "default",
  locale = "en-US",
  translations,
  screen: screenOptions,
  onReady,
  ...props
}: BrowserAssistantProps) {
  const t = createTranslator(locale, translations);
  const live = useRef(true),
    epoch = useRef(0),
    decision = useRef<((approved: boolean) => void) | null>(null);
  const [pending, setPending] = useState<ScreenActionPreview | null>(null),
    [embedded, setEmbedded] = useState(false);
  const [host] = useState(() => {
    const el = document.createElement("div");
    el.dataset.agentExclude = "";
    el.dataset.browserAssistant = "";
    el.attachShadow({ mode: "open" });
    return el;
  });
  const screen = useMemo(
    () => createScreenController({ ...screenOptions, locale }),
    [screenOptions, locale],
  );
  const decide = (approved: boolean) => {
    const resolve = decision.current;
    decision.current = null;
    setPending(null);
    resolve?.(approved);
  };
  const tools = useMemo(
    () =>
      createConversationTools({
        locale,
        active: () => live.current,
        signal: () => epoch.current,
        view: screen.view,
        operate: screen.operate,
        settled: screen.settled,
        confirmationState: screen.actionSignature,
        confirm: (input) =>
          new Promise<boolean>((resolve) => {
            const preview = screen.describeAction(input);
            decision.current?.(false);
            decision.current = resolve;
            setPending(preview);
          }),
      }),
    [screen, locale],
  );
  useLayoutEffect(() => {
    const attach = () => {
      const modal = [
        ...document.querySelectorAll<HTMLElement>(
          'dialog[open],[role="dialog"],[role="alertdialog"]',
        ),
      ]
        .filter(
          (el) =>
            !el.closest('[data-agent-exclude],[aria-hidden="true"],[hidden]') &&
            el.getClientRects().length,
        )
        .at(-1);
      const target =
        modal?.querySelector<HTMLElement>("[data-conversation-dock]") ??
        modal ??
        document.body;
      if (host.parentElement !== target) target.appendChild(host);
      host.removeAttribute("aria-hidden");
      host.removeAttribute("inert");
      host.style.pointerEvents = "auto";
      setEmbedded(!!modal);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open", "aria-hidden", "data-state"],
    });
    return () => {
      observer.disconnect();
      host.remove();
    };
  }, [host]);
  useEffect(() => {
    live.current = true;
    setPending(null);
    onReady?.(tools);
    return () => {
      live.current = false;
      epoch.current++;
      decision.current?.(false);
      decision.current = null;
      onReady?.(null);
    };
  }, [tools, onReady, sessionKey]);
  return createPortal(
    <>
      <style>{styles}</style>
      <VoiceAssistant
        {...props}
        locale={locale}
        translations={translations}
        sessionKey={sessionKey}
        embedded={embedded}
        onCommand={(call) =>
          tools.execute(call.name, JSON.parse(call.argumentsJson))
        }
        onInterrupt={() => {
          epoch.current++;
          decide(false);
        }}
        pendingAction={
          pending && (
            <div
              role="group"
              aria-label={t("화면 작업 실행 확인")}
              className="flex max-h-[30dvh] flex-col gap-2 overflow-y-auto border-t border-slate-200 bg-amber-50 p-3 text-sm"
            >
              <strong>
                {pending.label} · {t("실행 확인")}
              </strong>
              <p className="break-words text-xs">{pending.location}</p>
              {pending.fields.map((field, i) => (
                <p className="break-words text-xs" key={i}>
                  {field.label}: {field.value || t("미입력")}
                </p>
              ))}
              <div className="flex shrink-0 justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  onClick={() => decide(false)}
                >
                  {t("취소")}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-white"
                  onClick={() => decide(true)}
                >
                  {t("확인하고 실행")}
                </button>
              </div>
            </div>
          )
        }
      />
    </>,
    host.shadowRoot!,
  );
}
export { createScreenController, createConversationTools, VoiceAssistant };
export type { ScreenOptions };
