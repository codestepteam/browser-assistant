import { z } from "zod";
import { redact, type ChatInput } from "./provider.js";

export const FAST_PATH_THRESHOLDS = {
  intentConfidence: 0.8,
  targetConfidence: 0.8,
  maxCommit: 0.2,
};
const COMMIT_GAP = 0.5;
const MAX_OPTIONS = 254;
// Keeps state + the longest question under jev-1.13's 32k-token budget, including CJK text.
const MAX_QUESTION_CHARS = 80000;
const NONE = "__none__";

export type ShadowControl = {
  ref: string;
  name: string;
  context: string;
  href?: string;
  requiresConfirmation: boolean;
};
export type ShadowRecord = {
  event: "jev_shadow";
  requestId?: string;
  model?: string;
  latencyMs?: number;
  controls?: number;
  skipped?: string;
  error?: string;
  jev?: {
    intent: string;
    intentConfidence: number;
    target: string | null;
    targetConfidence: number;
    targetCommit: number | null;
    fastPath: boolean;
  };
  llm?: {
    tool: string;
    action?: string;
    ref?: string;
    requireConfirmation?: boolean;
    commit?: number | null;
  };
  targetMatch?: boolean | null;
  confirmationGap?: boolean;
};
type ChatResult = {
  reply: string;
  calls: { name: string; argumentsJson: string }[];
};
type ViewNode = {
  role?: string;
  ref?: string;
  name?: string;
  text?: string;
  href?: string;
  actions?: string[];
  disabled?: boolean;
  requiresConfirmation?: boolean;
  children?: ViewNode[];
};

const clip = (value: unknown, max: number) =>
  redact(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** The screen the LLM is about to act on for the first time in this request, if any. */
export function firstScreen(input: ChatInput) {
  const calls = input.continuation.filter(
    (item) => item.type === "function_call",
  );
  if (calls.length !== 1 || calls[0].name !== "get_current_view") return;
  const output = input.continuation.find(
    (item) =>
      item.type === "function_call_output" && item.call_id === calls[0].call_id,
  );
  try {
    const result = JSON.parse(String(output?.output));
    return result?.ok && result.state?.view
      ? (result.state.view as {
          title?: string;
          url?: string;
          children?: ViewNode[];
        })
      : undefined;
  } catch {
    return;
  }
}

const textOf = (node: ViewNode): string =>
  node.ref
    ? ""
    : [node.text ?? "", ...(node.children ?? []).map(textOf)].join(" ");

/** Enabled click targets, each with the group/row/heading context that disambiguates duplicates. */
export function collectControls(view: { children?: ViewNode[] }) {
  const controls: ShadowControl[] = [];
  const walk = (nodes: ViewNode[] | undefined, context: string[]) => {
    let heading = "";
    for (const node of nodes ?? []) {
      if (node.role === "heading") {
        heading = clip(node.text ?? node.name, 80);
        continue;
      }
      const scope = heading ? [...context, heading] : context;
      if (node.ref && Array.isArray(node.actions)) {
        if (!node.disabled && node.actions.includes("click"))
          controls.push({
            ref: node.ref,
            name: clip(node.name, 120),
            context: scope.slice(-3).join(" > ").slice(0, 200),
            ...(node.href ? { href: clip(node.href, 160) } : {}),
            requiresConfirmation: node.requiresConfirmation === true,
          });
        continue;
      }
      const label =
        node.role === "row" ? clip(textOf(node), 120) : clip(node.name, 80);
      walk(node.children, label ? [...scope, label] : scope);
    }
  };
  walk(view.children, []);
  return controls;
}

function describe(control: ShadowControl) {
  return {
    name: control.name,
    ...(control.context ? { location: control.context } : {}),
    ...(control.href ? { link: control.href } : {}),
  };
}

export function buildQuestions(controls: ShadowControl[]) {
  const target: Record<string, unknown> = {};
  for (const control of controls) target[control.ref] = describe(control);
  target[NONE] = "None of the listed controls completes the request by itself.";
  const questions: Record<string, unknown> = {
    intent: {
      type: "choice",
      instructions: "What does fulfilling `request` on this page require?",
      criteria: {
        single_click:
          "Exactly one click on a visible button, link, tab, or menu item completes the whole request. No typing, choosing values, scrolling, or later steps are needed.",
        multi_step:
          "The request needs typing text, choosing values, scrolling, or more than one action.",
        answer_only:
          "The request only asks for information that can be read from the page. No action is needed.",
        unclear: "The request is ambiguous, or it cannot be done on this page.",
      },
    },
    target: {
      type: "choice",
      instructions:
        "Which listed control should be clicked to fulfill `request`?",
      criteria: target,
    },
  };
  controls.forEach((control, index) => {
    questions[`commit_${index}`] = {
      type: "noul",
      instructions: {
        control: describe(control),
        question:
          "Would clicking `control` commit data or cause an irreversible or external effect, such as a final save, submit, delete, payment, purchase, or sending a message?",
      },
      criteria: {
        true: "Saves, submits, deletes, pays, purchases, or sends.",
        false:
          "Only navigates, opens, expands, searches, filters, sorts, or cancels.",
      },
    };
  });
  return questions;
}

const answersSchema = z.object({
  model: z.string(),
  answers: z.record(
    z.string(),
    z.object({
      type: z.string(),
      choice: z.string().optional(),
      confidence: z.number().optional(),
      noul: z.number().optional(),
    }),
  ),
});

function llmDecision(
  result: ChatResult,
  commitOf: (ref: string) => number | null,
) {
  const call = result.calls[0];
  if (!call) return { tool: "reply" };
  if (call.name !== "use_element") return { tool: call.name };
  const args = JSON.parse(call.argumentsJson);
  return {
    tool: call.name,
    action: args.action,
    ref: args.ref,
    requireConfirmation: args.requireConfirmation,
    commit: args.action === "click" ? commitOf(args.ref) : null,
  };
}

/**
 * Asks Jev the same first-step question the LLM is answering and logs both decisions.
 * Never affects the chat response: all work happens after the caller's promise settles.
 */
export function createDecisionShadow(
  options: {
    fetch?: typeof fetch;
    apiKey?: () => string | undefined;
    model?: string;
    timeoutMs?: number;
    logger?: (record: ShadowRecord) => void;
  } = {},
) {
  const shadowFetch = options.fetch ?? fetch;
  const key = options.apiKey ?? (() => process.env.TYPESAFE_API_KEY);
  const model = options.model ?? process.env.TYPESAFE_MODEL ?? "jev-1.13.0";
  const log =
    options.logger ?? ((record) => console.log(JSON.stringify(record)));

  async function evaluate(
    input: ChatInput,
    view: NonNullable<ReturnType<typeof firstScreen>>,
    controls: ShadowControl[],
  ) {
    const questions = buildQuestions(controls);
    const started = Date.now();
    const response = await shadowFetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()!.trim()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      body: JSON.stringify({
        model,
        state: {
          request: clip(input.prompt, 4000),
          page: { title: clip(view.title, 200), url: clip(view.url, 300) },
        },
        questions,
      }),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok)
      throw Object.assign(new Error(), {
        code: `http_${response.status}`,
        latencyMs,
      });
    return { latencyMs, ...answersSchema.parse(await response.json()) };
  }

  return {
    configured: () => !!key()?.trim(),
    observe(
      input: ChatInput,
      pending: Promise<ChatResult>,
      requestId?: string,
    ) {
      if (!key()?.trim()) return;
      const view = firstScreen(input);
      if (!view) return;
      const base = { event: "jev_shadow" as const, requestId };
      const controls = collectControls(view);
      if (!controls.length) return log({ ...base, skipped: "no_controls" });
      if (controls.length > MAX_OPTIONS)
        return log({
          ...base,
          controls: controls.length,
          skipped: "too_many_controls",
        });
      if (
        JSON.stringify(buildQuestions(controls).target).length >
        MAX_QUESTION_CHARS
      )
        return log({
          ...base,
          controls: controls.length,
          skipped: "too_large",
        });
      const decision = evaluate(input, view, controls);
      void Promise.allSettled([decision, pending]).then(([jev, llm]) => {
        try {
          if (llm.status === "rejected") return;
          if (jev.status === "rejected")
            return log({
              ...base,
              controls: controls.length,
              error: jev.reason?.code ?? jev.reason?.name ?? "failed",
              latencyMs: jev.reason?.latencyMs,
            });
          const { answers } = jev.value;
          const commitOf = (ref: string) => {
            const index = controls.findIndex((control) => control.ref === ref);
            return index < 0
              ? null
              : (answers[`commit_${index}`]?.noul ?? null);
          };
          const intent = answers.intent,
            target = answers.target;
          const targetRef =
            target?.choice && target.choice !== NONE ? target.choice : null;
          const targetControl = controls.find((c) => c.ref === targetRef);
          const targetCommit = targetRef ? commitOf(targetRef) : null;
          const fastPath =
            intent?.choice === "single_click" &&
            (intent.confidence ?? 0) >= FAST_PATH_THRESHOLDS.intentConfidence &&
            !!targetControl &&
            !targetControl.requiresConfirmation &&
            (target.confidence ?? 0) >= FAST_PATH_THRESHOLDS.targetConfidence &&
            targetCommit !== null &&
            targetCommit < FAST_PATH_THRESHOLDS.maxCommit;
          const chosen = llmDecision(llm.value, commitOf);
          const llmControl = controls.find((c) => c.ref === chosen.ref);
          log({
            ...base,
            model: jev.value.model,
            latencyMs: jev.value.latencyMs,
            controls: controls.length,
            jev: {
              intent: intent?.choice ?? "missing",
              intentConfidence: intent?.confidence ?? 0,
              target: targetRef,
              targetConfidence: target?.confidence ?? 0,
              targetCommit,
              fastPath,
            },
            llm: chosen,
            targetMatch:
              chosen.action === "click" && targetRef
                ? chosen.ref === targetRef
                : null,
            confirmationGap:
              chosen.action === "click" &&
              chosen.requireConfirmation === false &&
              !!llmControl &&
              !llmControl.requiresConfirmation &&
              (chosen.commit ?? 0) >= COMMIT_GAP,
          });
        } catch {
          log({ ...base, error: "compare_failed" });
        }
      });
    },
  };
}
