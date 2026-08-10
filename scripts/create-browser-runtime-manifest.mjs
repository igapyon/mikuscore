import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PRODUCT = "miku-score";
const LOCK_SCHEMA = "miku-score.browser-runtime-lock/v1";
const args = parseArgs(process.argv.slice(2));
const runtimePath = path.resolve(args.runtimePath);
const outPath = path.resolve(args.out);
const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
const packageVersion = String(packageJson.version || "");
const releaseVersion = validateReleaseTag(args.releaseTag, packageVersion);
const expectedAssetName = `${PRODUCT}-runtime-${releaseVersion}.mjs`;
const assetName = path.basename(runtimePath);

if (assetName !== expectedAssetName) {
  throw new Error(`runtime asset name mismatch: expected ${expectedAssetName}, actual ${assetName}`);
}

const manifest = {
  schema_version: LOCK_SCHEMA,
  release_tag: args.releaseTag,
  package_version: packageVersion,
  asset_name: assetName,
  sha256: sha256File(runtimePath),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[create:browser-runtime-manifest] generated ${outPath}`);

function parseArgs(argv) {
  if (argv.length === 0 || argv[0].startsWith("--")) {
    throw new Error("usage: node scripts/create-browser-runtime-manifest.mjs <runtime.mjs> --release-tag <tag> --out <manifest.json>");
  }
  const options = { runtimePath: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== "--release-tag" && token !== "--out") throw new Error(`unknown argument: ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${token} requires a value`);
    if (token === "--release-tag") options.releaseTag = value;
    if (token === "--out") options.out = value;
    index += 1;
  }
  if (!options.releaseTag || !options.out) throw new Error("--release-tag and --out are required");
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

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
