import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as esbuild from "esbuild";

const ROOT = process.cwd();
const ENTRY_TS = "src/ts/cli-api.ts";
const ENTRY_JS = ENTRY_TS.replace(/\.ts$/, ".js");
const CLI_SOURCE = "scripts/mikuscore-cli.mjs";
const VEROVIO_JS = "src/js/verovio.js";
const OUT = "bundle/mikuscore.mjs";
const TMP_DIR = ".mikuscore-build";
const TMP_ENTRY = `${TMP_DIR}/cli-runtime-entry.mjs`;
const importRe = /(?:import|export)\s+[^"']*?from\s+["'](.+?)["']|import\s*\(\s*["'](.+?)["']\s*\)/g;

const normalize = (p) => p.split(path.sep).join("/");
const toAbs = (relPath) => path.resolve(ROOT, relPath);
const readText = (relPath) => readFileSync(toAbs(relPath), "utf8");

const resolveTsModule = (fromId, specifier) => {
  if (!specifier.startsWith(".")) return null;
  const fromDir = path.dirname(fromId);
  const candidateBase = normalize(path.join(fromDir, specifier));
  const tsFile = `${candidateBase}.ts`;
  const indexTs = `${candidateBase}/index.ts`;
  if (existsSync(toAbs(tsFile))) return tsFile;
  if (existsSync(toAbs(indexTs))) return indexTs;
  throw new Error(`Cannot resolve module: ${specifier} (from ${fromId})`);
};

const collectGraph = () => {
  const queue = [ENTRY_TS];
  const seen = new Set();
  const order = [];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    order.push(current);

    const src = readText(current);
    importRe.lastIndex = 0;
    for (;;) {
      const match = importRe.exec(src);
      if (!match) break;
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const resolved = resolveTsModule(current, specifier);
      if (resolved) queue.push(resolved);
    }
  }

  return order;
};

const compileModule = (tsId) => {
  const transpiled = ts.transpileModule(readText(tsId), {
    fileName: tsId,
    compilerOptions: {
      target: ts.ScriptTarget.ES2018,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      lib: ["DOM", "DOM.Iterable", "ES2018"],
      esModuleInterop: true,
    },
  });
  return transpiled.outputText;
};

const buildRuntimeLoader = (tsModules) => {
  const moduleEntries = tsModules
    .map((tsId) => {
      const jsId = tsId.replace(/\.ts$/, ".js");
      return `  ${JSON.stringify(jsId)}: function (require, module, exports) {\n${compileModule(tsId)}\n  }`;
    })
    .join(",\n");
  const verovioJs = readText(VEROVIO_JS);

  return `
const BUNDLED_CLI_ENTRY = ${JSON.stringify(ENTRY_JS)};
const BUNDLED_CLI_MODULES = {
${moduleEntries}
};
const BUNDLED_VEROVIO_JS = ${JSON.stringify(verovioJs)};

function installWindowGlobals(window) {
  const previous = new Map();
  const keys = [
    "window",
    "document",
    "navigator",
    "Node",
    "Element",
    "HTMLElement",
    "DOMParser",
    "XMLSerializer",
    "XMLDocument",
    "Blob",
    "File",
  ];

  for (const key of keys) {
    previous.set(key, globalThis[key]);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: window[key],
    });
  }

  return () => {
    for (const key of keys) {
      if (previous.get(key) === undefined) {
        delete globalThis[key];
        continue;
      }
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: previous.get(key),
      });
    }
  };
}

function normalizeBundledPath(p) {
  const parts = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function resolveBundledModule(fromId, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const fromParts = fromId.split("/");
  fromParts.pop();
  const resolvedBase = normalizeBundledPath(fromParts.concat(specifier.split("/")).join("/"));
  const candidates = [resolvedBase + ".js", resolvedBase + "/index.js"];
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(BUNDLED_CLI_MODULES, candidate)) return candidate;
  }
  throw new Error("Cannot resolve bundled CLI module: " + specifier + " from " + fromId);
}

function installBundledVerovio() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mikuscore-verovio-"));
  const verovioPath = path.join(tempDir, "verovio.cjs");
  fs.writeFileSync(verovioPath, BUNDLED_VEROVIO_JS, "utf8");
  const requireFromTemp = createRequire(path.join(tempDir, "package.json"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ type: "commonjs" }), "utf8");
  const previous = globalThis.window?.verovio;
  globalThis.window.verovio = requireFromTemp(verovioPath);
  return () => {
    if (globalThis.window) {
      if (previous === undefined) {
        delete globalThis.window.verovio;
      } else {
        globalThis.window.verovio = previous;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  };
}

function loadBundledCliApi() {
  const cache = {};
  const nodeRequire = createRequire(import.meta.url);

  function load(id) {
    if (cache[id]) return cache[id].exports;
    const factory = BUNDLED_CLI_MODULES[id];
    if (!factory) throw new Error("Unknown bundled CLI module: " + id);
    const module = { exports: {} };
    cache[id] = module;
    const localRequire = (specifier) => {
      const bundledId = resolveBundledModule(id, specifier);
      if (bundledId) return load(bundledId);
      return nodeRequire(specifier);
    };
    factory(localRequire, module, module.exports);
    return module.exports;
  }

  return load(BUNDLED_CLI_ENTRY).cliApi;
}

function loadCliApi() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const restoreWindowGlobals = installWindowGlobals(dom.window);
  const restoreVerovioRuntime = installBundledVerovio();

  try {
    const api = loadBundledCliApi();
    return {
      api,
      dispose() {
        restoreVerovioRuntime();
        restoreWindowGlobals();
        dom.window.close();
      },
    };
  } catch (error) {
    restoreVerovioRuntime();
    restoreWindowGlobals();
    dom.window.close();
    throw error;
  }
}
`;
};

const buildCliSource = (runtimeLoader) => {
  const source = readText(CLI_SOURCE);
  const withoutLoadImport = source.replace(/\nimport \{ loadCliApi \} from "\.\/lib\/load-cli-api\.mjs";\n/, "\n");
  const withRuntimeImports = withoutLoadImport.replace(
    /import fs from "node:fs";\n/,
    [
      "import fs from \"node:fs\";",
      "import os from \"node:os\";",
      "import { createRequire } from \"node:module\";",
      "import { JSDOM } from \"jsdom\";",
      "",
    ].join("\n")
  );
  const withRuntimeLoader = withRuntimeImports.replace(
    /\nmain\(\)\.catch\(\(error\) => \{/,
    `\n${runtimeLoader}\n\nmain().catch((error) => {`
  );
  return [
    "// AUTO-GENERATED by scripts/build-cli-runtime.mjs. Do not edit directly.",
    withRuntimeLoader.replace(/^#!\/usr\/bin\/env node\n/, ""),
  ].join("\n");
};

const run = async () => {
  const tsModules = collectGraph();
  const runtimeLoader = buildRuntimeLoader(tsModules);
  const intermediate = buildCliSource(runtimeLoader);
  mkdirSync(toAbs(TMP_DIR), { recursive: true });
  writeFileSync(toAbs(TMP_ENTRY), intermediate, "utf8");
  mkdirSync(path.dirname(toAbs(OUT)), { recursive: true });
  const jsdomXhrImplPath = path.resolve(ROOT, "node_modules/jsdom/lib/jsdom/living/xhr/XMLHttpRequest-impl.js");
  await esbuild.build({
    entryPoints: [toAbs(TMP_ENTRY)],
    outfile: toAbs(OUT),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    banner: {
      js: [
        "#!/usr/bin/env node",
        "import { createRequire as __mksCreateRequire } from \"node:module\";",
        "const require = __mksCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    external: ["canvas"],
    plugins: [
      {
        name: "mikuscore-jsdom-single-file-patches",
        setup(build) {
          build.onLoad({ filter: /XMLHttpRequest-impl\.js$/ }, (args) => {
            if (path.resolve(args.path) !== jsdomXhrImplPath) return undefined;
            const source = readFileSync(args.path, "utf8").replace(
              'const syncWorkerFile = require.resolve ? require.resolve("./xhr-sync-worker.js") : null;',
              "const syncWorkerFile = null;"
            );
            return {
              contents: source,
              loader: "js",
            };
          });
        },
      },
    ],
    logLevel: "silent",
  });
  chmodSync(toAbs(OUT), 0o755);
  rmSync(toAbs(TMP_ENTRY), { force: true });
  process.stdout.write(`Built ${OUT}\n`);
};

await run();
