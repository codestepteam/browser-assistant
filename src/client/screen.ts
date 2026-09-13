import { createTranslator, type Locale } from "../i18n.js";
export type ScreenActionPreview = {
  label: string;
  location: string;
  fields: { label: string; value: string }[];
};
export type ScreenOptions = {
  locale?: Locale;
  root?: () => HTMLElement;
  exclude?: string;
  requiresConfirmation?: (element: HTMLElement) => boolean;
};
export type ScreenNode = {
  role: string;
  ref?: string;
  name?: string;
  text?: string;
  children?: ScreenNode[];
  [key: string]: unknown;
};
const controlsSelector =
  'button,a[href],input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="option"],[role="combobox"],[role="checkbox"],[role="radio"],[contenteditable="true"]';
const excluded =
  '[hidden],[aria-hidden="true"],[inert],[data-agent-exclude],script,style,template,noscript,input[type="password"],input[type="hidden"],input[type="file"],[autocomplete="one-time-code"],[autocomplete^="cc-"]';
export const clean = (text: string) =>
  text.replace(/\d{6}[-\s]?[1-8]\d{6}/g, "[redacted]");
const roleFor = (el: HTMLElement) =>
  el.getAttribute("role") ||
  (el instanceof HTMLInputElement
    ? (
        {
          checkbox: "checkbox",
          radio: "radio",
          number: "spinbutton",
          range: "slider",
          button: "button",
          submit: "button",
          reset: "button",
          image: "button",
        } as Record<string, string>
      )[el.type]
    : undefined) ||
  (
    {
      H1: "heading",
      H2: "heading",
      H3: "heading",
      H4: "heading",
      H5: "heading",
      H6: "heading",
      NAV: "navigation",
      MAIN: "main",
      ASIDE: "complementary",
      FORM: "form",
      FIELDSET: "group",
      SECTION: "region",
      ARTICLE: "article",
      TABLE: "table",
      THEAD: "rowgroup",
      TBODY: "rowgroup",
      TR: "row",
      TH: "columnheader",
      TD: "cell",
      UL: "list",
      OL: "list",
      LI: "listitem",
      DL: "list",
      DT: "term",
      DD: "definition",
      DIALOG: "dialog",
      BUTTON: "button",
      A: "link",
      INPUT: "textbox",
      TEXTAREA: "textbox",
      SELECT: "combobox",
      SUMMARY: "button",
    } as Record<string, string>
  )[el.tagName] ||
  "group";
const disabled = (el: HTMLElement) =>
  el.matches(':disabled,[aria-disabled="true"]');

export function createScreenController(options: ScreenOptions = {}) {
  const t = createTranslator(options.locale);
  const ids = new WeakMap<Element, string>(),
    instance = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  let sequence = 0,
    revision = 0,
    signature = "",
    elements = new Map<string, HTMLElement>(),
    observed = new Map<string, ScreenNode>();
  const root = () => options.root?.() ?? document.body;
  const skip = `${excluded}${options.exclude ? "," + options.exclude : ""}`;
  const visible = (el: HTMLElement) =>
    !el.closest(skip) &&
    !!el.getClientRects().length &&
    !["hidden", "collapse"].includes(getComputedStyle(el).visibility) &&
    getComputedStyle(el).display !== "none";
  function textOf(el: HTMLElement, max = 800): string {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    let node: Node | null,
      length = 0;
    while ((node = walker.nextNode()) && length < max) {
      const parent = node.parentElement;
      if (parent && visible(parent)) {
        const value = node.textContent?.trim() ?? "";
        texts.push(value);
        length += value.length;
      }
    }
    return clean(texts.join(" ").replace(/\s+/g, " ")).slice(0, max);
  }
  const label = (el: HTMLElement) =>
    clean(
      el.getAttribute("aria-label") ||
        (el.getAttribute("aria-labelledby") ?? "")
          .split(" ")
          .map((id) => {
            const target = document.getElementById(id);
            return target && visible(target) ? textOf(target, 180) : "";
          })
          .join(" ")
          .trim() ||
        Array.from((el as HTMLInputElement).labels ?? [])
          .filter(visible)
          .map((el) => textOf(el, 180))
          .join(" ") ||
        (el.matches("input,textarea,select") ? "" : textOf(el, 180)) ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        el.tagName.toLowerCase(),
    )
      .trim()
      .slice(0, 180);
  const ref = (el: HTMLElement) => {
    if (!ids.has(el)) ids.set(el, `e${++sequence}`);
    const id = ids.get(el)!;
    elements.set(id, el);
    return id;
  };
  const dialog = () =>
    [
      ...root().querySelectorAll<HTMLElement>(
        'dialog[open],[role="dialog"],[role="alertdialog"]',
      ),
    ]
      .filter(visible)
      .at(-1);
  const scrollable = (el: HTMLElement) =>
    el.scrollHeight > el.clientHeight + 2 &&
    /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  const area = (region: string): HTMLElement | undefined => {
    if (!["page", "dialog", "detail"].includes(region))
      return elements.get(region);
    const target =
      region === "dialog"
        ? dialog()
        : region === "detail"
          ? root().querySelector<HTMLElement>('[data-agent-scroll="detail"]')
          : root().querySelector<HTMLElement>("main");
    if (target)
      return (
        (scrollable(target)
          ? target
          : [...target.querySelectorAll<HTMLElement>("*")].find(
              (el) => visible(el) && scrollable(el),
            )) ?? target
      );
    return region === "page"
      ? (document.scrollingElement as HTMLElement)
      : undefined;
  };
  function requiresConfirmation(el: HTMLElement) {
    if (options.requiresConfirmation) return options.requiresConfirmation(el);
    if (el.closest('[data-agent-action="confirm"]')) return true;
    if (
      (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) &&
      el.type === "submit" &&
      el.form
    )
      return true;
    if (el instanceof HTMLAnchorElement) {
      const url = new URL(el.href);
      return (
        url.origin !== location.origin ||
        !["http:", "https:"].includes(url.protocol) ||
        !!el.download ||
        (!!el.target && el.target !== "_self")
      );
    }
    return !(
      el.closest(
        '[data-agent-action="safe"],[data-agent-action="preview"],[data-agent-view]',
      ) ||
      el.matches(
        'summary,[role="tab"],[role="option"],[role="combobox"],[role="checkbox"],[role="radio"],[data-slot="dialog-close"],[data-slot="sheet-close"]',
      )
    );
  }
  const valueOf = (el: HTMLElement) =>
    el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)
      ? String(el.checked)
      : el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement
        ? clean(el.value)
        : textOf(el);
  function view() {
    elements = new Map();
    observed = new Map();
    const modal = dialog();
    let visited = 0,
      emitted = 0,
      textBudget = 30000,
      truncated = false;
    const clip = (value: string, max = 800) => {
      const text = clean(value).slice(
        0,
        Math.max(0, Math.min(max, textBudget)),
      );
      textBudget -= text.length;
      if (text.length < value.length) truncated = true;
      return text;
    };
    const controls: ScreenNode[] = [];
    function visit(el: HTMLElement, depth: number): ScreenNode[] {
      if (el.matches(skip)) return [];
      if (++visited > 8000 || emitted >= 350 || depth > 60 || textBudget <= 0) {
        truncated = true;
        return [];
      }
      const style = getComputedStyle(el);
      if (
        style.display === "none" ||
        ["hidden", "collapse"].includes(style.visibility)
      )
        return [];
      const rect = el.getBoundingClientRect();
      const inViewport =
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        rect.right > 0 &&
        rect.left < innerWidth;
      if (style.display !== "contents" && !el.getClientRects().length)
        return [];
      // Skip offscreen rows; scrolling discovers the next rendered slice.
      if (el.matches('tr,[role="row"]') && !inViewport) {
        truncated = true;
        return [];
      }
      const role = roleFor(el),
        interactive = el.matches(controlsSelector),
        canScroll = scrollable(el);
      const node: ScreenNode = { role };
      if (interactive || canScroll) node.ref = ref(el);
      if (interactive) {
        node.name = clip(label(el), 180);
        node.label = node.name;
        node.disabled = disabled(el);
        node.readOnly = el.matches("[readonly]");
        node.actions =
          el.matches('input,textarea,[contenteditable="true"]') &&
          !el.matches(
            'input[type="checkbox"],input[type="radio"],input[type="submit"],input[type="button"],input[type="reset"],input[type="image"]',
          )
            ? ["fill"]
            : el.matches("select")
              ? ["select"]
              : el.matches('input[type="checkbox"],[role="checkbox"]')
                ? ["check"]
                : ["click"];
        if (el.matches('input,textarea,select,[contenteditable="true"]')) {
          const value = valueOf(el);
          node.value = clip(value, 2000);
          if (node.value !== value) node.valueTruncated = true;
        }
        if (el instanceof HTMLInputElement) node.inputType = el.type;
        if (el.matches('input[type="checkbox"],[role="checkbox"]'))
          node.checked =
            el instanceof HTMLInputElement
              ? el.checked
              : el.getAttribute("aria-checked") === "true";
        for (const key of ["expanded", "selected"])
          if (el.hasAttribute(`aria-${key}`))
            node[key] = el.getAttribute(`aria-${key}`) === "true";
        if (el instanceof HTMLSelectElement) {
          const available = [...el.options]
            .filter((o) => o.value.length <= 2000)
            .slice(0, 80);
          const choices = [];
          for (const o of available) {
            if (textBudget < o.value.length + o.label.length) {
              truncated = true;
              break;
            }
            textBudget -= o.value.length;
            choices.push({
              value: o.value,
              label: clip(o.label, 180),
              disabled:
                o.disabled ||
                (o.parentElement instanceof HTMLOptGroupElement &&
                  o.parentElement.disabled),
            });
          }
          node.options = choices;
          node.moreOptions = el.options.length > choices.length;
        }
        if (el instanceof HTMLAnchorElement) {
          const url = new URL(el.href);
          node.href = url.origin + url.pathname;
        }
        node.requiresConfirmation = requiresConfirmation(el);
        controls.push(node);
        observed.set(node.ref!, node);
        emitted++;
        return [node];
      }
      if (canScroll) {
        node.scrollable = true;
        node.scrollTop = el.scrollTop;
        node.scrollHeight = el.scrollHeight;
        node.clientHeight = el.clientHeight;
      }
      if (role === "heading") {
        node.level =
          Number(el.getAttribute("aria-level") || el.tagName.slice(1)) ||
          undefined;
        node.text = clip(textOf(el));
      }
      const children: ScreenNode[] = [];
      if (role !== "heading")
        for (const child of el.childNodes) {
          if (emitted >= 350 || textBudget <= 0) {
            truncated = true;
            break;
          }
          if (child instanceof HTMLElement)
            children.push(...visit(child, depth + 1));
          else if (
            child.nodeType === Node.TEXT_NODE &&
            child.textContent?.trim()
          ) {
            children.push({
              role: "text",
              text: clip(child.textContent.trim()),
            });
            emitted++;
          }
        }
      if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"))
        node.name = label(el);
      if (children.length) node.children = children;
      if (!children.length && !node.text && !node.ref) return [];
      // Flatten only unnamed wrappers with no grouping to preserve.
      if (role === "group" && !node.name && !canScroll && children.length === 1)
        return children;
      emitted++;
      return [node];
    }
    const roots = [modal ?? root()];
    if (modal)
      roots.push(
        ...[
          ...root().querySelectorAll<HTMLElement>(
            '[role="listbox"],[role="menu"]',
          ),
        ].filter((el) => visible(el) && !modal.contains(el)),
      );
    const children = roots.flatMap((el) => visit(el, 0));
    const state = {
      title: document.title,
      url: (() => {
        const params = new URLSearchParams(location.search);
        for (const key of [...params.keys()])
          if (/token|secret|password|api.?key|authorization|code/i.test(key))
            params.delete(key);
        const query = params.toString();
        return location.pathname + (query ? "?" + query : "");
      })(),
      children,
      truncated,
      loading: [
        ...root().querySelectorAll<HTMLElement>(
          '[aria-busy="true"],button:disabled',
        ),
      ].some(
        (el) =>
          visible(el) &&
          (el.getAttribute("aria-busy") === "true" ||
            !!el.querySelector(".animate-spin")),
      ),
      alerts: [
        ...root().querySelectorAll<HTMLElement>(
          '[role="alert"],[role="status"],[data-sonner-toast]',
        ),
      ]
        .filter(visible)
        .slice(0, 10)
        .map((el) => textOf(el)),
      scroll: {
        page: area("page")?.scrollTop ?? 0,
        dialog: area("dialog")?.scrollTop ?? 0,
      },
    };
    const next = JSON.stringify(state);
    if (next !== signature) {
      signature = next;
      revision++;
    }
    // Flat index is local compatibility only; the model receives the nested tree.
    return Object.defineProperty(
      { ...state, revision: `${instance}:${revision}` },
      "controls",
      { value: controls },
    ) as typeof state & { revision: string; controls: ScreenNode[] };
  }
  function describeAction(input: { ref: string }): ScreenActionPreview {
    const el = elements.get(input.ref);
    if (!el || !visible(el))
      throw new Error(t("확인할 요소가 변경되었습니다."));
    const container =
      (el instanceof HTMLButtonElement || el instanceof HTMLInputElement
        ? el.form
        : el.closest("form")) ??
      el.closest<HTMLElement>(
        'dialog,[role="dialog"],section,tr,[role="row"]',
      ) ??
      el;
    const fields = [
      ...container.querySelectorAll<HTMLElement>(
        'input,textarea,select,[role="combobox"],[role="checkbox"]',
      ),
    ]
      .filter(visible)
      .map((field) => ({ label: label(field), value: valueOf(field) }));
    if (el instanceof HTMLAnchorElement)
      fields.push({ label: t("이동 주소"), value: el.href });
    return { label: label(el), location: textOf(container, 300), fields };
  }
  function actionSignature(input: { ref: string }) {
    const el = elements.get(input.ref);
    if (!el || !el.isConnected || !visible(el) || disabled(el))
      throw new Error(t("확인할 요소가 변경되었습니다."));
    const container =
      (el instanceof HTMLButtonElement || el instanceof HTMLInputElement
        ? el.form
        : el.closest("form")) ??
      el.closest<HTMLElement>(
        'dialog,[role="dialog"],section,tr,[role="row"]',
      ) ??
      el;
    // Compare hidden fields locally as well; never expose these values to the model.
    return JSON.stringify({
      url: location.href,
      preview: describeAction(input),
      fields: [
        ...container.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input,select,textarea"),
      ].map((field) => [
        field.id,
        field.value,
        field instanceof HTMLInputElement ? field.checked : null,
        field.disabled,
      ]),
    });
  }
  async function settled() {
    let previous = "",
      stableAt = performance.now();
    // ponytail: bounded DOM stability polling; sites should expose aria-busy for long asynchronous work.
    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      const current = view();
      if (current.revision !== previous || current.loading)
        stableAt = performance.now();
      else if (performance.now() - stableAt >= 320) return;
      previous = current.revision;
    }
  }
  function operate(
    name: "use_element" | "scroll_view",
    input: any,
    confirmed = false,
  ) {
    if (name === "scroll_view") {
      const el = area(input.region);
      if (!el || !visible(el))
        throw new Error(t("스크롤 영역을 다시 확인해 주세요."));
      el.scrollTo({
        top:
          input.direction === "top"
            ? 0
            : input.direction === "bottom"
              ? el.scrollHeight
              : el.scrollTop +
                (input.direction === "down" ? 1 : -1) * el.clientHeight * 0.8,
        behavior: "instant",
      });
      return;
    }
    const el = elements.get(input.ref);
    if (
      !el ||
      !el.isConnected ||
      !visible(el) ||
      disabled(el) ||
      (dialog() &&
        !dialog()!.contains(el) &&
        !el.closest('[role="listbox"],[role="menu"]'))
    )
      throw new Error("지금 조작할 수 없는 요소입니다. 화면을 다시 읽으세요.");
    if (
      requiresConfirmation(el) &&
      ["click", "check"].includes(input.action) &&
      !confirmed
    )
      throw Object.assign(new Error(t("실행 전에 사용자 확인이 필요합니다.")), {
        code: "NEEDS_CONFIRMATION",
      });
    if (
      !(observed.get(input.ref)?.actions as string[] | undefined)?.includes(
        input.action,
      )
    )
      throw new Error(t("지원하지 않는 입력창입니다."));
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (input.action === "click") {
      if (
        el instanceof HTMLAnchorElement &&
        !["http:", "https:"].includes(new URL(el.href).protocol)
      )
        throw new Error(t("지원하지 않는 링크입니다."));
      el.click();
    } else if (input.action === "fill") {
      if (el.matches("[readonly]"))
        throw new Error(t("읽기 전용 입력창입니다."));
      if (
        !(
          el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ) &&
        !el.isContentEditable
      )
        throw new Error(t("텍스트 입력창이 아닙니다."));
      if (
        el instanceof HTMLInputElement &&
        [
          "password",
          "hidden",
          "file",
          "checkbox",
          "radio",
          "submit",
          "button",
          "reset",
          "image",
        ].includes(el.type)
      )
        throw new Error(t("지원하지 않는 입력창입니다."));
      if (!["string", "number"].includes(typeof input.value))
        throw new Error(t("입력값이 필요합니다."));
      const value = String(input.value);
      if (clean(value) !== value)
        throw new Error(t("주민등록번호는 입력할 수 없습니다."));
      if (el.isContentEditable) el.textContent = value;
      else {
        const field = el as HTMLInputElement | HTMLTextAreaElement;
        if (field.maxLength >= 0 && value.length > field.maxLength)
          throw new Error(t("최대 입력 길이를 초과했습니다."));
        const setter = Object.getOwnPropertyDescriptor(
          el instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype,
          "value",
        )!.set!;
        const before = field.value;
        setter.call(field, value);
        if (value && !field.value) {
          setter.call(field, before);
          throw new Error(t("입력 형식을 확인해 주세요."));
        }
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (input.action === "select") {
      if (
        !(el instanceof HTMLSelectElement) ||
        !(
          observed.get(input.ref)?.options as { value: string }[] | undefined
        )?.some((option) => option.value === input.value) ||
        ![...el.options]
          .slice(0, 80)
          .some(
            (o) =>
              o.value === input.value &&
              !o.disabled &&
              !(
                o.parentElement instanceof HTMLOptGroupElement &&
                o.parentElement.disabled
              ),
          )
      )
        throw new Error(t("현재 표시된 선택지를 지정하세요."));
      el.value = input.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      if (
        typeof input.value !== "boolean" ||
        !el.matches('input[type="checkbox"],[role="checkbox"]')
      )
        throw new Error("체크 여부를 지정하세요.");
      const checked =
        el instanceof HTMLInputElement
          ? el.checked
          : el.getAttribute("aria-checked") === "true";
      if (checked !== input.value) el.click();
    }
  }
  return { view, operate, settled, describeAction, actionSignature };
}
