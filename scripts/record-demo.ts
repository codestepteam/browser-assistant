import { chromium } from "@playwright/test";
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const base = process.env.DEMO_URL || "http://localhost:4188";
const password = process.env.DEMO_LOGIN_PASSWORD;
if (!password)
  throw Error(
    "Set DEMO_LOGIN_PASSWORD; start the backend and authentication gateway first.",
  );
mkdirSync(".local/recording", { recursive: true });
mkdirSync("docs/media", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: ".local/recording", size: { width: 1280, height: 800 } },
});
const login = await context.request.post(base + "/login", {
  data: { password },
});
if (!login.ok()) throw Error("Demo sign-in failed.");
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const caption = async (text: string) =>
  page.evaluate((text) => {
    let el = document.getElementById("recording-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "recording-caption";
      el.dataset.agentExclude = "";
      el.style.cssText =
        "position:fixed;left:0;right:0;top:0;z-index:2147483646;padding:10px 24px;background:#064e3b;color:white;font:14px system-ui;text-align:center;";
      document.body.append(el);
    }
    el.textContent = text;
  }, text);
try {
  await page.goto(base + "/demo");
  await page.getByRole("heading", { name: "Customer workspace" }).waitFor();
  await caption(
    "Self-hosted Browser Assistant · real AI requests · fictional customer data",
  );
  await page.waitForTimeout(1500);
  await page
    .getByRole("button", { name: "Expand or collapse conversation" })
    .click();
  await page
    .getByRole("textbox", { name: "Message the assistant" })
    .fill(
      "Find Mina, open her profile, and change the note to Follow up Friday. Do not save yet.",
    );
  await caption(
    "1 / Ask in natural language. The assistant reads and operates the actual page.",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLTextAreaElement>("#edit-note")?.value ===
      "Follow up Friday",
    {},
    { timeout: 150000 },
  );
  await page.waitForFunction(
    () =>
      !document
        .querySelector("[data-browser-assistant]")
        ?.shadowRoot?.querySelector<HTMLButtonElement>("[data-voice-fab]")
        ?.disabled,
    {},
    { timeout: 150000 },
  );
  await caption("2 / The note is edited. Nothing has been saved yet.");
  await page.waitForTimeout(1500);
  await page
    .getByRole("textbox", { name: "Message the assistant" })
    .fill("Save the change.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm and run", exact: true })
    .waitFor({ timeout: 150000 });
  await caption("3 / Review the target and values before approving the save.");
  await page.waitForTimeout(2000);
  await page
    .getByRole("button", { name: "Confirm and run", exact: true })
    .click();
  await page
    .getByText("Saved for Mina Kim. Changes are local to this page.", {
      exact: true,
    })
    .waitFor({ timeout: 150000 });
  await page.waitForFunction(
    () =>
      !document
        .querySelector("[data-browser-assistant]")
        ?.shadowRoot?.querySelector<HTMLButtonElement>("[data-voice-fab]")
        ?.disabled,
    {},
    { timeout: 150000 },
  );
  await page
    .getByRole("button", { name: "Collapse conversation", exact: true })
    .click();
  await caption(
    "4 / The saved result is verified. Only the compact response stays visible.",
  );
  await page.screenshot({ path: "docs/media/preview.png" });
  await page.waitForTimeout(2000);
  if (errors.length)
    throw Error("Browser errors occurred: " + errors.join(";"));
} finally {
  const video = page.video();
  await context.close();
  if (video) copyFileSync(await video.path(), ".local/recording/demo.webm");
  await browser.close();
}
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    ".local/recording/demo.webm",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "docs/media/demo.mp4",
  ],
  { stdio: "pipe" },
);
writeFileSync(
  "docs/media/README.md",
  `# Execution recording\n\nRecorded ${new Date().toISOString().slice(0, 10)} with Chromium using real AI requests through the self-hosted authentication gateway. Fictional customer data only. Credentials are submitted through an API request before navigation and are not shown. This is a silent text-workflow recording, not a physical-device microphone test.\n\nThe video shows search, edit without saving, user confirmation, save and visible outcome verification. Timing and model wording are not scripted or replaced. FFmpeg compresses the original recording without changing its speed.\n\n[MP4 video](demo.mp4) · [Preview](preview.png)\n\nReproduce with \`npm run record:demo\`; see the [tutorial](../tutorial.md).\n\n## 한국어\n\n실제 AI 요청과 자체 운영 인증 연결 예제로 녹화했습니다. 가상 고객 데이터만 사용하며 비밀번호나 API 키를 표시하지 않습니다. 글로 요청하는 무음 영상이며 실제 기기 음성 검사는 아닙니다. 검색 → 저장 전 입력 → 사용자 확인 → 저장 결과 확인을 보여줍니다. 응답을 가짜로 바꾸거나 재생 속도를 변경하지 않았습니다.\n`,
);
console.log("Recorded docs/media/demo.mp4 and docs/media/preview.png.");
