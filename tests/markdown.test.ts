import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { MarkdownMessage } from "../src/client/markdown.js";

function html(text: string) {
  return renderToStaticMarkup(
    createElement(MarkdownMessage, { text, className: "msg" }),
  );
}

test("assistant markdown renders bold, italic, lists, line breaks and code", () => {
  const markup = html(
    "**장재휴**는 *고객*입니다.\n\n- 누적 구매액: **₩1,000**\n- 코드: `AB12`\n\n1. 첫 단계\n2. 둘째 단계\n\n다음 줄\n이어짐",
  );
  assert.match(markup, /<strong class="font-semibold">장재휴<\/strong>/);
  assert.match(markup, /<em>고객<\/em>/);
  assert.match(markup, /<ul class="list-disc/);
  assert.match(markup, /<li class="break-words">[\s\S]*₩1,000/);
  assert.match(markup, /<strong class="font-semibold">₩1,000<\/strong>/);
  assert.match(markup, /<code[^>]*>AB12<\/code>/);
  assert.match(markup, /<ol class="list-decimal/);
  assert.match(markup, /첫 단계/);
  assert.match(markup, /다음 줄<br\/>이어짐/);
  assert.doesNotMatch(markup, /\*\*장재휴\*\*/);
  assert.doesNotMatch(markup, /- 누적 구매액/);
});

test("markdown output is React-escaped and never injects HTML", () => {
  const markup = html(
    '<script>alert(1)</script>\n\n<img onerror="alert(1)">\n\n[bad](javascript:alert(1))',
  );
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.doesNotMatch(markup, /<img /);
  assert.match(markup, /\[bad\]\(javascript:alert\(1\)\)/);
});

test("plain captions stay a single paragraph", () => {
  const markup = html("공실만 모아뒀어요.");
  assert.match(markup, /<p class="break-words">공실만 모아뒀어요\.<\/p>/);
});
