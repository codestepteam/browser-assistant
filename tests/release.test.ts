import test from "node:test";
import assert from "node:assert/strict";
import { releaseVersion } from "../scripts/prepare-release.js";

test("release versions increase without duplicate publication or lexical ordering errors", () => {
  const sha = "a".repeat(40);
  assert.equal(releaseVersion("0.2.0", {}, sha), "0.2.0");
  assert.equal(
    releaseVersion("0.2.0", { "0.2.9": {}, "0.2.10": {} }, sha),
    "0.2.11",
  );
  assert.equal(releaseVersion("0.3.0", { "0.2.10": {} }, sha), "0.3.0");
  assert.equal(
    releaseVersion("0.2.0", { "0.2.0": { gitHead: sha } }, sha),
    null,
  );
  assert.equal(
    releaseVersion("0.2.0", { "0.2.0": {}, "1.0.0-beta.1": {} }, sha),
    "0.2.1",
  );
  assert.throws(() => releaseVersion("invalid", {}, sha));
  assert.throws(() => releaseVersion("0.2.0", {}, ""));
});
