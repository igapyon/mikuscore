import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PRODUCT = "mikuscore";
const ROOT = process.cwd();

const releaseDir = path.join(ROOT, "release-assets");
const stagedRuntime =
  existsSync(releaseDir)
    ? readdirSync(releaseDir)
        .filter((entry) => new RegExp(`^${PRODUCT}-[0-9].*\\.mjs$`).test(entry))
        .sort()
        .at(-1)
    : undefined;
const runtimePath = stagedRuntime ? path.join(releaseDir, stagedRuntime) : path.join(ROOT, "bundle", `${PRODUCT}.mjs`);

const runNode = (args) => {
  const result = spawnSync(process.execPath, [runtimePath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Bundle smoke failed for ${args.join(" ")}:\n${result.stderr || result.stdout}`);
  }
  return result;
};

const version = runNode(["--version"]);
if (!/^\d+\.\d+\.\d+(?:\.\d+)?\s*$/.test(version.stdout)) {
  throw new Error(`Unexpected --version output: ${JSON.stringify(version.stdout)}`);
}

const help = runNode(["--help"]);
if (!help.stdout.includes("mikuscore convert") || !help.stdout.includes("Options:")) {
  throw new Error("Unexpected --help output.");
}

console.log(`Smoke checked ${path.relative(ROOT, runtimePath)}`);
