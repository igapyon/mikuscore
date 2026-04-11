import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT_DIR = path.resolve(__dirname, "../..");
const ENTRY_TS = "src/ts/cli-api.ts";
const VEROVIO_JS = "src/js/verovio.js";
const importRe = /(?:import|export)\s+[^"']*?from\s+["'](.+?)["']|import\s*\(\s*["'](.+?)["']\s*\)/g;

function normalizePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.resolve(rootDir, relativePath), "utf8");
}

function resolveTsModule(rootDir, fromId, specifier) {
  if (!specifier.startsWith(".")) return null;
  const fromDir = path.dirname(fromId);
  const candidateBase = normalizePath(path.join(fromDir, specifier));
  const tsFile = `${candidateBase}.ts`;
  const indexTs = `${candidateBase}/index.ts`;
  if (fs.existsSync(path.resolve(rootDir, tsFile))) return tsFile;
  if (fs.existsSync(path.resolve(rootDir, indexTs))) return indexTs;
  throw new Error(`Cannot resolve module: ${specifier} (from ${fromId})`);
}

function collectGraph(rootDir) {
  const queue = [ENTRY_TS];
  const seen = new Set();
  const order = [];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    order.push(current);

    const src = readText(rootDir, current);
    importRe.lastIndex = 0;
    for (;;) {
      const match = importRe.exec(src);
      if (!match) break;
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const resolved = resolveTsModule(rootDir, current, specifier);
      if (resolved) queue.push(resolved);
    }
  }

  return order;
}

function compileGraph(rootDir) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mikuscore-cli-api-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ type: "commonjs" }), "utf8");

  for (const tsId of collectGraph(rootDir)) {
    const src = readText(rootDir, tsId);
    const transpiled = ts.transpileModule(src, {
      fileName: tsId,
      compilerOptions: {
        target: ts.ScriptTarget.ES2018,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        lib: ["DOM", "DOM.Iterable", "ES2018"],
        esModuleInterop: true,
      },
    });
    const outPath = path.join(tempDir, tsId.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, transpiled.outputText, "utf8");
  }

  return tempDir;
}

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

function installVerovioRuntime(rootDir, tempDir) {
  const verovioSourcePath = path.resolve(rootDir, VEROVIO_JS);
  const verovioCjsPath = path.join(tempDir, "verovio.cjs");
  fs.copyFileSync(verovioSourcePath, verovioCjsPath);
  const requireFromTemp = createRequire(path.join(tempDir, "package.json"));
  const verovio = requireFromTemp(verovioCjsPath);
  const previous = globalThis.window?.verovio;
  globalThis.window.verovio = verovio;
  return () => {
    if (!globalThis.window) return;
    if (previous === undefined) {
      delete globalThis.window.verovio;
      return;
    }
    globalThis.window.verovio = previous;
  };
}

export function loadCliApi(options = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : DEFAULT_ROOT_DIR;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const restoreWindowGlobals = installWindowGlobals(dom.window);
  const tempDir = compileGraph(rootDir);
  const restoreVerovioRuntime = installVerovioRuntime(rootDir, tempDir);
  const requireFromTemp = createRequire(path.join(tempDir, "package.json"));

  try {
    const entryPath = path.join(tempDir, ENTRY_TS.replace(/\.ts$/, ".js"));
    const apiModule = requireFromTemp(entryPath);
    return {
      api: apiModule.cliApi,
      dispose() {
        restoreVerovioRuntime();
        restoreWindowGlobals();
        dom.window.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    restoreVerovioRuntime();
    restoreWindowGlobals();
    dom.window.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}
