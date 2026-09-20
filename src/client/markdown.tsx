import { type ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0,
    n = 0;
  const emit = (node: ReactNode) => {
    nodes.push(node);
  };
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        emit(
          <code
            key={`${keyPrefix}-c${n++}`}
            className="rounded bg-slate-100 px-1 py-px font-mono text-[0.9em]"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("**", i) || text.startsWith("__", i)) {
      const mark = text.slice(i, i + 2);
      const end = text.indexOf(mark, i + 2);
      if (end > i + 2) {
        emit(
          <strong key={`${keyPrefix}-b${n++}`} className="font-semibold">
            {renderInline(text.slice(i + 2, end), `${keyPrefix}-b${n}`)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1 && text[end + 1] !== "*") {
        emit(
          <em key={`${keyPrefix}-e${n++}`}>
            {renderInline(text.slice(i + 1, end), `${keyPrefix}-e${n}`)}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }
    let next = text.length;
    for (const mark of ["`", "**", "__", "*"] as const) {
      const at = text.indexOf(mark, i + 1);
      if (at >= 0 && at < next) next = at;
    }
    emit(text.slice(i, next));
    i = next;
  }
  return nodes;
}

function flushParagraph(lines: string[], blocks: ReactNode[], key: string) {
  if (!lines.length) return;
  const parts: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i) parts.push(<br key={`${key}-br-${i}`} />);
    parts.push(...renderInline(line, `${key}-l${i}`));
  });
  blocks.push(
    <p key={key} className="break-words">
      {parts}
    </p>,
  );
}

function flushList(
  kind: "ul" | "ol",
  items: string[],
  blocks: ReactNode[],
  key: string,
) {
  if (!items.length) return;
  const List = kind;
  blocks.push(
    <List
      key={key}
      className={
        (kind === "ol" ? "list-decimal" : "list-disc") +
        " my-1 space-y-1 pl-5 marker:text-slate-400"
      }
    >
      {items.map((item, i) => (
        <li key={`${key}-${i}`} className="break-words">
          {renderInline(item, `${key}-${i}`)}
        </li>
      ))}
    </List>,
  );
}

export function MarkdownMessage({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  let n = 0;
  const endParagraph = () => {
    flushParagraph(paragraph, blocks, `p${n++}`);
    paragraph = [];
  };
  const endList = () => {
    if (list) flushList(list.kind, list.items, blocks, `l${n++}`);
    list = null;
  };
  for (const line of lines) {
    const unordered = /^(?:[-*+])\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (unordered) {
      endParagraph();
      if (list?.kind !== "ul") {
        endList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }
    if (ordered) {
      endParagraph();
      if (list?.kind !== "ol") {
        endList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    if (!line.trim()) {
      endParagraph();
      endList();
      continue;
    }
    endList();
    paragraph.push(line);
  }
  endParagraph();
  endList();
  return <div className={"space-y-2 " + (className ?? "")}>{blocks}</div>;
}
