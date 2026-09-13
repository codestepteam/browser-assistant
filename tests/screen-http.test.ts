import test from "node:test";
import assert from "node:assert/strict";
import { createScreenController } from "../src/client/screen.js";

test("screen controllers initialize on HTTP where randomUUID is unavailable", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  const randomValues = crypto.getRandomValues.bind(crypto);
  let calls = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => {
        calls++;
        return randomValues(bytes);
      },
    },
  });
  try {
    assert.equal(typeof createScreenController().view, "function");
    assert.equal(typeof createScreenController().view, "function");
    assert.equal(calls, 2);
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});
