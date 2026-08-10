import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PRODUCT = "miku-score";
const LOCK_SCHEMA = "miku-score.browser-runtime-lock/v1";
const ROOT = process.cwd();
const args = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
const releaseVersion = validateReleaseTag(args.releaseTag, String(packageJson.version));
const releaseDir = path.resolve(args.releaseDir ?? path.join(ROOT, "release-assets"));
const assetNames = [
  `${PRODUCT}-${releaseVersion}.mjs`,
  `${PRODUCT}-runtime-${releaseVersion}.mjs`,
  `${PRODUCT}-runtime-${releaseVersion}.json`,
  `${PRODUCT}-sources-${releaseVersion}.tgz`,
];
const checksumName = `${PRODUCT}-SHA256SUMS-${releaseVersion}.txt`;

for (const assetName of [...assetNames, checksumName]) {
  if (!fs.existsSync(path.join(releaseDir, assetName))) {
    throw new Error(`release asset is missing: ${assetName}`);
  }
}

const checksums = parseChecksums(fs.readFileSync(path.join(releaseDir, checksumName), "utf8"));
if (checksums.size !== assetNames.length) {
  throw new Error(`checksum asset count mismatch: expected ${assetNames.length}, actual ${checksums.size}`);
}
for (const assetName of assetNames) {
  const expected = checksums.get(assetName);
  if (!expected) throw new Error(`checksum is missing: ${assetName}`);
  const actual = sha256File(path.join(releaseDir, assetName));
  if (actual !== expected) throw new Error(`checksum mismatch: ${assetName}`);
}

const runtimeName = `${PRODUCT}-runtime-${releaseVersion}.mjs`;
const manifestName = `${PRODUCT}-runtime-${releaseVersion}.json`;
const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, manifestName), "utf8"));
if (manifest.schema_version !== LOCK_SCHEMA) {
  throw new Error(`unsupported browser runtime lock schema: ${manifest.schema_version}`);
}
if (manifest.release_tag !== args.releaseTag) {
  throw new Error(`release tag mismatch: expected ${args.releaseTag}, actual ${manifest.release_tag}`);
}
if (manifest.package_version !== packageJson.version) {
  throw new Error(`package version mismatch: expected ${packageJson.version}, actual ${manifest.package_version}`);
}
if (manifest.asset_name !== runtimeName) {
  throw new Error(`runtime asset name mismatch: expected ${runtimeName}, actual ${manifest.asset_name}`);
}
if (manifest.sha256 !== sha256File(path.join(releaseDir, runtimeName))) {
  throw new Error("runtime manifest sha256 does not match the runtime asset.");
}

const runtimeModule = await import(`${pathToFileURL(path.join(releaseDir, runtimeName)).href}?verify=${Date.now()}`);
if (runtimeModule.version !== packageJson.version) {
  throw new Error(`runtime export version mismatch: expected ${packageJson.version}, actual ${runtimeModule.version}`);
}

console.log(`[verify:release-assets] ok ${args.releaseTag} ${path.basename(releaseDir)}`);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== "--release-tag" && token !== "--release-dir") throw new Error(`unknown argument: ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${token} requires a value`);
    if (token === "--release-tag") options.releaseTag = value;
    if (token === "--release-dir") options.releaseDir = value;
    index += 1;
  }
  if (!options.releaseTag) throw new Error("--release-tag is required");
  return options;
}

function validateReleaseTag(releaseTag, packageVersion) {
  if (!releaseTag.startsWith("v")) throw new Error(`release tag must start with v: ${releaseTag}`);
  const releaseVersion = releaseTag.slice(1);
  if (releaseVersion !== packageVersion && !releaseVersion.startsWith(`${packageVersion}.`)) {
    throw new Error(`release tag version ${releaseVersion} does not match package version ${packageVersion}`);
  }
  return releaseVersion;
}

function parseChecksums(source) {
  const result = new Map();
  for (const line of source.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`invalid checksum line: ${line}`);
    if (result.has(match[2])) throw new Error(`duplicate checksum asset: ${match[2]}`);
    result.set(match[2], match[1]);
  }
  return result;
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
