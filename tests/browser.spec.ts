import { test, expect } from "@playwright/test";
test("semantic extraction, private fields, native input, confirmation and replay", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  const result = await page.evaluate(async () => {
    const module = await import("/tests/screen.browser.ts" as string);
    return module.checkScreen();
  });
  expect(result.ok).toBe(true);
});
test("press-to-talk reuses permission, mutes on release, and runs only while authorized", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  const result = await page.evaluate(async () => {
    const module = await import("/tests/voice.browser.ts" as string);
    return module.checkVoiceHold();
  });
  expect(result.ok).toBe(true);
  expect(result.initialPermissionRequests).toBe(1);
});
test("pending tasks resume from a new snapshot and stop rejects late tools", async ({
  page,
}) => {
  await page.goto("/tests/browser.html");
  const result = await page.evaluate(async () => {
    const module = await import("/tests/session.browser.ts" as string);
    return module.checkSessionResume();
  });
  expect(result.ok).toBe(true);
});
test("English and Korean UI, collapsed transcript and responsive placement", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/assistant/health", (route) =>
    route.fulfill({ json: { configured: false, protocolVersion: 1 } }),
  );
  await page.goto("/tests/browser.html");
  await page.evaluate(async () => {
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({
      serverUrl: "/assistant",
      locale: "en-US",
      sessionKey: "english",
    });
  });
  await expect(
    page.getByRole("button", { name: "Hold to talk", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Conversation", exact: true }),
  ).toHaveCount(0);
  const fab = await page.locator("[data-voice-fab]").boundingBox(),
    strip = await page.locator("[data-floating-response]").boundingBox();
  expect(fab).not.toBeNull();
  expect(strip!.x + strip!.width).toBeLessThan(fab!.x);
  await page
    .getByRole("button", { name: "Expand or collapse conversation" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const m = await import("/src/client/widget.tsx" as string);
    m.mount({ serverUrl: "/assistant", locale: "ko-KR", sessionKey: "korean" });
  });
  await expect(
    page.getByRole("button", { name: "누르고 말하기", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
