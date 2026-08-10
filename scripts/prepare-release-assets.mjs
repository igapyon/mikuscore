import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PRODUCT = "miku-score";
const ROOT = process.cwd();
const RELEASE_DIR = "release-assets";
const CLI_BUNDLE = `bundle/${PRODUCT}.mjs`;
const BROWSER_RUNTIME_BUNDLE = `bundle/${PRODUCT}-runtime.mjs`;

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

const releaseCliName = `${PRODUCT}-${version}.mjs`;
const releaseRuntimeName = `${PRODUCT}-runtime-${version}.mjs`;
const releaseManifestName = `${PRODUCT}-runtime-${version}.json`;
const releaseSourcesName = `${PRODUCT}-sources-${version}.tgz`;
const releaseChecksumsName = `${PRODUCT}-SHA256SUMS-${version}.txt`;

copyFileSync(path.join(ROOT, CLI_BUNDLE), path.join(ROOT, RELEASE_DIR, releaseCliName));
copyFileSync(path.join(ROOT, BROWSER_RUNTIME_BUNDLE), path.join(ROOT, RELEASE_DIR, releaseRuntimeName));

const excludedSources = new Set([
  "bundle/miku-score.mjs",
  "index.html",
  "miku-score.html",
  "src/js/main.js",
]);
const sourceFiles = [...new Set(
  run("git", ["ls-files", "--cached", "--modified", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(
      (entry) =>
        entry &&
        !excludedSources.has(entry) &&
        !entry.startsWith("release-assets/") &&
        existsSync(path.join(ROOT, entry))
    )
)].sort();

const tempDir = mkdtempSync(path.join(os.tmpdir(), `${PRODUCT}-release-`));
try {
  const fileListPath = path.join(tempDir, "sources.txt");
  writeFileSync(fileListPath, `${sourceFiles.join("\n")}\n`, "utf8");
  run(
    "tar",
    [
      "-czf",
      path.join(ROOT, RELEASE_DIR, releaseSourcesName),
      "-T",
      fileListPath,
    ],
    { stdio: "inherit" }
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

run("node", [
  "scripts/create-browser-runtime-manifest.mjs",
  path.join(RELEASE_DIR, releaseRuntimeName),
  "--release-tag",
  tagName,
  "--out",
  path.join(RELEASE_DIR, releaseManifestName),
]);

const checksumNames = [
  releaseCliName,
  releaseRuntimeName,
  releaseManifestName,
  releaseSourcesName,
];
const checksumText = checksumNames
  .map((assetName) => `${sha256File(path.join(ROOT, RELEASE_DIR, assetName))}  ${assetName}`)
  .join("\n");
writeFileSync(path.join(ROOT, RELEASE_DIR, releaseChecksumsName), `${checksumText}\n`, "utf8");

for (const assetName of [...checksumNames, releaseChecksumsName]) {
  console.log(`Prepared ${RELEASE_DIR}/${assetName}`);
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}
