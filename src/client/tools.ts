import { createTranslator, type Locale } from "../i18n.js";
import { toolSchemas, type ToolName, type ToolResult } from "../protocol.js";

/** The agent can only read the rendered screen and operate its controls. */
export function createConversationTools(host: {
  locale?: Locale;
  active: () => boolean;
  view: () => Record<string, any>;
  operate: (
    name: "use_element" | "scroll_view",
    input: any,
    confirmed?: boolean,
  ) => void;
  confirm?: (input: any) => Promise<boolean>;
  confirmationState?: (input: any) => string;
  settled: () => Promise<void>;
  signal?: () => number;
}) {
  const t = createTranslator(host.locale);
  const completed = new Map<string, string>();
  const cancelled = new Set<string>();
  let tail: Promise<unknown> = Promise.resolve();
  async function run(
    name: ToolName,
    raw: unknown,
    epoch: number | undefined,
  ): Promise<ToolResult> {
    try {
      if (!host.active() || host.signal?.() !== epoch)
        throw new Error(
          t("사용자가 다른 화면으로 이동해 작업을 중단했습니다."),
        );
      const schema = toolSchemas[name];
      if (!schema)
        throw new Error(
          t(
            "화면 조작 도구만 사용할 수 있습니다. 현재 화면을 다시 읽어 주세요.",
          ),
        );
      const input: any = schema.parse(raw);
      if (name === "get_current_view") {
        await host.settled();
        if (!host.active() || host.signal?.() !== epoch)
          throw new Error(t("사용자 화면이 닫혀 작업을 중단했습니다."));
        return { ok: true, state: { view: host.view() } };
      }
      const key = `${name}:${input.requestId}`,
        serialized = JSON.stringify(input);
      if (completed.has(key)) {
        if (completed.get(key) !== serialized)
          throw new Error(t("같은 요청 ID의 내용을 바꿀 수 없습니다."));
        return { ok: true, state: { view: host.view(), replayed: true } };
      }
      if (cancelled.has(key))
        throw Object.assign(new Error(t("사용자가 취소한 요청입니다.")), {
          code: "USER_CANCELLED",
        });
      const current = host.view();
      if (current.loading)
        throw new Error(t("화면 전환 중입니다. 화면을 다시 읽어 주세요."));
      if (current.revision !== input.expectedRevision)
        throw new Error(
          t("화면이 바뀌었습니다. 최신 화면을 읽고 다시 조작해 주세요."),
        );
      let confirmed = false;
      if (
        name === "use_element" &&
        ["click", "check"].includes(input.action) &&
        current.controls?.find((control: any) => control.ref === input.ref)
          ?.requiresConfirmation
      ) {
        if (!host.confirm)
          throw Object.assign(
            new Error(t("실행 전에 사용자 확인이 필요합니다.")),
            { code: "NEEDS_CONFIRMATION" },
          );
        const approvalState = host.confirmationState?.(input);
        confirmed = await host.confirm(input);
        if (!confirmed) {
          cancelled.add(key);
          if (cancelled.size > 100)
            cancelled.delete(cancelled.values().next().value!);
          throw Object.assign(
            new Error(
              t(
                "사용자가 실행을 취소했습니다. 다시 요청하기 전에는 재시도하지 마세요.",
              ),
            ),
            { code: "USER_CANCELLED" },
          );
        }
        if (
          !host.active() ||
          host.signal?.() !== epoch ||
          (approvalState === undefined
            ? host.view().revision !== current.revision
            : host.confirmationState!(input) !== approvalState)
        )
          throw Object.assign(
            new Error(
              t(
                "확인 중 화면이나 입력값이 바뀌어 실행하지 않았습니다. 변경된 내용을 다시 확인해 주세요.",
              ),
            ),
            { code: "SCREEN_CHANGED" },
          );
      }
      if (confirmed) host.view();
      host.operate(name, input, confirmed);
      completed.set(key, serialized);
      if (completed.size > 100)
        completed.delete(completed.keys().next().value!);
      await host.settled();
      if (!host.active() || host.signal?.() !== epoch)
        throw new Error(t("사용자 화면이 닫혀 작업을 중단했습니다."));
      return { ok: true, state: { view: host.view() } };
    } catch (error) {
      return {
        ok: false,
        state: { view: host.view() },
        error: {
          code:
            (error as { code?: string }).code ??
            "SCREEN_CHANGED_OR_INVALID_INPUT",
          message:
            error instanceof Error
              ? error.message
              : t("화면을 조작하지 못했습니다."),
        },
      };
    }
  }
  return {
    execute(name: ToolName, input: unknown) {
      const epoch = host.signal?.();
      const next = tail.then(() => run(name, input, epoch));
      tail = next.catch(() => {});
      return next;
    },
  };
}
