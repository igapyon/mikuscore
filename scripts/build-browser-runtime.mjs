import fs from "node:fs";
import path from "node:path";

import * as esbuild from "esbuild";

import {
  RUNTIME_ENTRY_RELATIVE_PATH,
  RUNTIME_MODULE_RELATIVE_PATHS,
  WEB_OR_CLI_MODULE_RELATIVE_PATHS,
} from "./lib/runtime-module-paths.mjs";

const ROOT = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outFile = path.resolve(args.out ?? path.join(ROOT, "bundle", "miku-score-runtime.mjs"));
const packageJson = JSON.parse(readRepoFile("package.json"));
const packageVersion = String(packageJson.version || "").trim();
if (!packageVersion) throw new Error("package.json version is required for the browser runtime.");

const result = await esbuild.build({
  absWorkingDir: ROOT,
  entryPoints: [RUNTIME_ENTRY_RELATIVE_PATH],
  bundle: true,
  format: "esm",
  metafile: true,
  platform: "browser",
  plugins: [packageVersionPlugin(packageVersion)],
  sourcemap: false,
  target: "es2018",
  write: false,
});

assertRuntimeInputPaths(result.metafile.inputs);
const output = result.outputFiles.find((file) => file.path === outFile) ?? result.outputFiles[0];
if (!output) throw new Error("browser runtime build did not produce an output file.");
const runtimeSource = output.text;
assertBrowserRuntimeBoundary(runtimeSource, packageVersion);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, runtimeSource, "utf8");
console.log(`[build:browser-runtime] generated ${path.relative(ROOT, outFile)}`);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== "--out") throw new Error(`unknown argument: ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${token} requires a value`);
    }
    options.out = value;
    index += 1;
  }
  return options;
}

function assertRuntimeInputPaths(inputs) {
  const actual = Object.keys(inputs).sort();
  const expected = [...RUNTIME_MODULE_RELATIVE_PATHS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const unexpected = actual.filter((item) => !expected.includes(item));
    const missing = expected.filter((item) => !actual.includes(item));
    throw new Error(
      `browser runtime module graph changed; unexpected=${unexpected.join(",") || "none"}; missing=${missing.join(",") || "none"}`
    );
  }
  for (const forbidden of WEB_OR_CLI_MODULE_RELATIVE_PATHS) {
    if (actual.includes(forbidden)) {
      throw new Error(`browser runtime includes forbidden Web/CLI module: ${forbidden}`);
    }
  }
}

function packageVersionPlugin(version) {
  return {
    name: "miku-score-runtime-package-version",
    setup(build) {
      build.onLoad({ filter: /[/\\]src[/\\]ts[/\\]runtime-api\.ts$/ }, (args) => {
        const source = fs.readFileSync(args.path, "utf8");
        const placeholder = 'export const version = "__MIKU_SCORE_PACKAGE_VERSION__";';
        if (!source.includes(placeholder)) {
          throw new Error("runtime-api.ts package version placeholder was not found.");
        }
        return {
          contents: source.replace(placeholder, `export const version = ${JSON.stringify(version)};`),
          loader: "ts",
          resolveDir: path.dirname(args.path),
        };
      });
    },
  };
}

function assertBrowserRuntimeBoundary(source, packageVersion) {
  const checks = [
    ["Node.js module reference", /node:/],
    ["process reference", /(^|[^A-Za-z0-9_$])process([^A-Za-z0-9_$]|$)/m],
    ["jsdom reference", /jsdom/],
    ["CLI entrypoint", /miku-score-cli\.mjs/],
    ["source-tree relative import", /from\s*["'][.]{1,2}\//],
    ["runtime network dependency", /\bfetch\s*\(|\bXMLHttpRequest\b|import\s*\(\s*["']https?:/],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(source)) throw new Error(`browser runtime contains forbidden ${label}`);
  }
  if (!source.includes(JSON.stringify(packageVersion))) {
    throw new Error("browser runtime version is not embedded from package.json.");
  }
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.resolve(ROOT, relativePath), "utf8");
}
