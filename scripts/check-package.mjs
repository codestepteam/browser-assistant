import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packOutput = execFileSync(npm, ["pack", "--json", "--ignore-scripts"], {
  encoding: "utf8",
});
// Some npm versions print prepare-script output before the final JSON array.
const packed = JSON.parse(
  packOutput.slice(packOutput.lastIndexOf("\n[") + 1),
)[0];
const filename = resolve(packed.filename);
const temp = mkdtempSync(join(tmpdir(), "browser-assistant-package-"));
try {
  for (const file of packed.files)
    if (/(^|\/)\.env$|node_modules|^src\/|^tests\//.test(file.path))
      throw Error("Unexpected packaged file: " + file.path);
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    npm,
    ["install", "--ignore-scripts", filename, "react@19", "react-dom@19"],
    { cwd: temp, stdio: "pipe" },
  );
  const root = join(temp, "node_modules/@codestepteam/browser-assistant");
  const pkg = JSON.parse(readFileSync(join(root, "package.json")));
  for (const file of packed.files.filter((file) => file.path.endsWith(".md"))) {
    const content = readFileSync(join(root, file.path), "utf8");
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1].split("#")[0];
      if (!href || /^(https?:|mailto:)/.test(href)) continue;
      if (!existsSync(resolve(root, dirname(file.path), href)))
        throw Error(
          `Broken packaged documentation link: ${file.path} -> ${href}`,
        );
    }
  }

  for (const target of Object.values(pkg.exports))
    for (const file of Object.values(target)) readFileSync(join(root, file));
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('@codestepteam/browser-assistant'); await import('@codestepteam/browser-assistant/core'); const m=await import('@codestepteam/browser-assistant/server-app'); if((await m.createApp().request('/health')).status!==200)throw Error('Health failed');",
    ],
    { cwd: temp, stdio: "pipe" },
  );
  console.log(
    "Packed client, core, declarations and server load in a clean installation.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
  rmSync(filename, { force: true });
}
