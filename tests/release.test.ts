import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertProductionRef,
  productionRef,
  releaseVersion,
} from "../scripts/prepare-release.js";

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

test("CI verifies both branches but publishes only the current production commit", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /branches: \[main, production\]/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/production'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /git ls-remote origin refs\/heads\/production/);
  assert.doesNotMatch(workflow, /github\.ref == 'refs\/heads\/main'/);
});

test("release preparation rejects non-production refs", () => {
  assert.equal(productionRef, "refs/heads/production");
  assert.throws(() => assertProductionRef("refs/heads/main"));
  assert.doesNotThrow(() => assertProductionRef(productionRef));
});
