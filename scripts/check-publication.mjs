import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n");
const problems = [];
for (const file of files) {
  if (
    /(^|\/)(node_modules|dist|\.local|test-results|playwright-report)(\/|$)|(^|\/)\.env$/.test(
      file,
    )
  )
    problems.push(`Private/generated file: ${file}`);
  if (!/\.(md|ts|tsx|js|mjs|cjs|json|yaml|yml|html|css)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  if (/\/Users\/|\/home\/[a-z]+\//.test(text))
    problems.push(`Personal absolute path: ${file}`);
  if (
    /sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/.test(
      text,
    )
  )
    problems.push(`Possible credential: ${file}`);
  if (file.endsWith(".md"))
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1].split("#")[0];
      if (!href || /^(https?:|mailto:)/.test(href)) continue;
      if (!existsSync(resolve(dirname(file), href)))
        problems.push(`Broken local link in ${file}: ${href}`);
    }
}
if (problems.length) throw Error(problems.join("\n"));
console.log(
  `Checked ${files.length} tracked files: no known credential patterns, personal paths or broken local documentation links.`,
);
