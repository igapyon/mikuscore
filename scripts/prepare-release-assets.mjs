import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PRODUCT = "mikuscore";
const ROOT = process.cwd();
const RELEASE_DIR = "release-assets";
const RUNTIME_BUNDLE = `bundle/${PRODUCT}.mjs`;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed.${stderr}`);
  }
  return result.stdout ?? "";
};

const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const tagName = process.env.TAG_NAME || "";
if (!tagName.startsWith("v")) {
  throw new Error("TAG_NAME must start with v.");
}

const version = tagName.slice(1);
const packageVersion = String(packageJson.version);
if (version !== packageVersion && !version.startsWith(`${packageVersion}.`)) {
  throw new Error(
    `Release tag version (${version}) must match package.json version (${packageVersion}) or add a dot suffix such as ${packageVersion}.2.`
  );
}

rmSync(path.join(ROOT, RELEASE_DIR), { recursive: true, force: true });
mkdirSync(path.join(ROOT, RELEASE_DIR), { recursive: true });

copyFileSync(path.join(ROOT, RUNTIME_BUNDLE), path.join(ROOT, RELEASE_DIR, `${PRODUCT}-${version}.mjs`));

const excludedSources = new Set([
  "bundle/mikuscore.mjs",
  "index.html",
  "mikuscore.html",
  "src/js/main.js",
]);
const sourceFiles = run("git", ["ls-files"])
  .split(/\r?\n/)
  .filter((entry) => entry && !excludedSources.has(entry) && !entry.startsWith("release-assets/"));

const tempDir = mkdtempSync(path.join(os.tmpdir(), `${PRODUCT}-release-`));
try {
  const fileListPath = path.join(tempDir, "sources.txt");
  writeFileSync(fileListPath, `${sourceFiles.join("\n")}\n`, "utf8");
  run(
    "tar",
    [
      "-czf",
      path.join(ROOT, RELEASE_DIR, `${PRODUCT}-sources-${version}.tgz`),
      "-T",
      fileListPath,
    ],
    { stdio: "inherit" }
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log(`Prepared ${RELEASE_DIR}/${PRODUCT}-${version}.mjs`);
console.log(`Prepared ${RELEASE_DIR}/${PRODUCT}-sources-${version}.tgz`);
