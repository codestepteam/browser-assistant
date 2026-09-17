import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type Published = Record<string, { gitHead?: string }>;
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const parts = (version: string) => version.split(".").map(Number);
function compare(a: string, b: string) {
  const left = parts(a),
    right = parts(b);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}
export function releaseVersion(base: string, versions: Published, sha: string) {
  if (!stable.test(base) || !/^[a-f0-9]{40}$/.test(sha))
    throw Error("Invalid release version or commit SHA");
  if (Object.values(versions).some((entry) => entry.gitHead === sha))
    return null;
  const latest = Object.keys(versions)
    .filter((v) => stable.test(v))
    .sort(compare)
    .at(-1);
  if (!latest || compare(base, latest) > 0) return base;
  const [major, minor, patch] = parts(latest);
  return `${major}.${minor}.${patch + 1}`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok && response.status !== 404)
    throw Error(`Registry lookup failed: ${response.status}`);
  const metadata =
    response.status === 404 ? { versions: {} } : await response.json();
  if (!metadata.versions || typeof metadata.versions !== "object")
    throw Error("Invalid registry metadata");
  const version = releaseVersion(
    pkg.version,
    metadata.versions,
    process.env.GITHUB_SHA ?? "",
  );
  if (version)
    execFileSync(
      "npm",
      [
        "version",
        version,
        "--no-git-tag-version",
        "--ignore-scripts",
        "--allow-same-version",
      ],
      { stdio: "inherit" },
    );
  if (!process.env.GITHUB_OUTPUT) throw Error("GITHUB_OUTPUT is required");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `publish=${version !== null}\nversion=${version ?? ""}\n`,
  );
  console.log(
    version
      ? `Prepared ${pkg.name}@${version}`
      : "This commit is already published; skipping.",
  );
}
