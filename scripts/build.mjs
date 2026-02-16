import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const ENTRY_TS = "src/ts/main.ts";
const ENTRY_JS = ENTRY_TS.replace(/\.ts$/, ".js");
const TEMPLATE = "mikuscore-src.html";
const DIST = "mikuscore.html";
const TOKEN_CSS_PATH = "src/css/md3/token-spec.css";
const CORE_CSS_PATH = "src/css/md3/core-spec.css";
const CSS_PATH = "src/css/app.css";
const VEROVIO_JS_PATH = "src/js/verovio.js";
const MIDI_WRITER_JS_PATH = "src/js/midi-writer.js";
const JS_OUT = "src/js/main.js";
const TMP_DIR = ".mikuscore-build";

const normalize = (p) => p.split(path.sep).join("/");
const toAbs = (relPath) => path.join(ROOT, relPath);
const readText = (relPath) => readFileSync(toAbs(relPath), "utf8");

const importRe = /(?:import|export)\s+[^"']*?from\s+["'](.+?)["']|import\s*\(\s*["'](.+?)["']\s*\)/g;

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
    const id = queue.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    order.push(id);

    const src = readText(id);
    importRe.lastIndex = 0;
    for (;;) {
      const m = importRe.exec(src);
      if (!m) break;
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      const resolved = resolveTsModule(id, spec);
      if (resolved) queue.push(resolved);
    }
  }

  return order;
};

const compileWithTsc = (tsModules) => {
  rmSync(toAbs(TMP_DIR), { recursive: true, force: true });
  mkdirSync(toAbs(TMP_DIR), { recursive: true });

  const args = [
    "--target",
    "ES2018",
    "--module",
    "CommonJS",
    "--lib",
    "DOM,DOM.Iterable,ES2018",
    "--strict",
    "--skipLibCheck",
    "--moduleResolution",
    "node",
    "--outDir",
    TMP_DIR,
    "--rootDir",
    ".",
    ...tsModules,
  ];

  execFileSync("tsc", args, { cwd: ROOT, stdio: "pipe" });
};

const bundle = (tsModules) => {
  const moduleEntries = tsModules
    .map((tsId) => {
      const jsId = tsId.replace(/\.ts$/, ".js");
      const compiled = normalize(path.join(TMP_DIR, jsId));
      const code = readText(compiled);
      return `  ${JSON.stringify(jsId)}: function (require, module, exports) {\n${code}\n  }`;
    })
    .join(",\n");

  return `(function () {\nconst modules = {\n${moduleEntries}\n};\n\nconst cache = {};\n\nfunction normalizePath(p) {\n  const parts = [];\n  for (const part of p.split('/')) {\n    if (!part || part === '.') continue;\n    if (part === '..') {\n      parts.pop();\n    } else {\n      parts.push(part);\n    }\n  }\n  return parts.join('/');\n}\n\nfunction resolve(fromId, specifier) {\n  if (!specifier.startsWith('.')) {\n    throw new Error('External module is not allowed in single-file build: ' + specifier);\n  }\n  const fromParts = fromId.split('/');\n  fromParts.pop();\n  const resolvedBase = normalizePath(fromParts.concat(specifier.split('/')).join('/'));\n  const candidates = [resolvedBase + '.js', resolvedBase + '/index.js'];\n  for (const c of candidates) {\n    if (Object.prototype.hasOwnProperty.call(modules, c)) return c;\n  }\n  throw new Error('Cannot resolve module at runtime: ' + specifier + ' from ' + fromId);\n}\n\nfunction load(id) {\n  if (cache[id]) return cache[id].exports;\n  const factory = modules[id];\n  if (!factory) throw new Error('Unknown module: ' + id);\n  const module = { exports: {} };\n  cache[id] = module;\n  const localRequire = function (specifier) {\n    return load(resolve(id, specifier));\n  };\n  factory(localRequire, module, module.exports);\n  return module.exports;\n}\n\nload(${JSON.stringify(ENTRY_JS)});\n})();\n`;
};

const inlineTemplate = (jsBundle) => {
  const template = readText(TEMPLATE);
  const tokenCss = readText(TOKEN_CSS_PATH);
  const coreCss = readText(CORE_CSS_PATH);
  const css = readText(CSS_PATH);
  const verovioJs = readText(VEROVIO_JS_PATH);
  const midiWriterJs = readText(MIDI_WRITER_JS_PATH);

  if (!template.includes("href=\"src/css/md3/token-spec.css\"")) {
    throw new Error("Template must include src/css/md3/token-spec.css link tag.");
  }
  if (!template.includes("href=\"src/css/md3/core-spec.css\"")) {
    throw new Error("Template must include src/css/md3/core-spec.css link tag.");
  }
  if (!template.includes("href=\"src/css/app.css\"")) {
    throw new Error("Template must include src/css/app.css link tag.");
  }
  if (!template.includes("src=\"src/js/main.js\"")) {
    throw new Error("Template must include src/js/main.js script tag.");
  }
  if (!template.includes("src=\"src/js/verovio.js\"")) {
    throw new Error("Template must include src/js/verovio.js script tag.");
  }
  if (!template.includes("src=\"src/js/midi-writer.js\"")) {
    throw new Error("Template must include src/js/midi-writer.js script tag.");
  }

  const withTokenCss = template.replace(
    /<link[^>]*href="src\/css\/md3\/token-spec\.css"[^>]*>/,
    `<style>\n${tokenCss}\n</style>`
  );

  const withCoreCss = withTokenCss.replace(
    /<link[^>]*href="src\/css\/md3\/core-spec\.css"[^>]*>/,
    `<style>\n${coreCss}\n</style>`
  );

  const withCss = withCoreCss.replace(
    /<link[^>]*href="src\/css\/app\.css"[^>]*>/,
    `<style>\n${css}\n</style>`
  );

  const withVerovioJs = withCss.replace(
    /<script\s+src="src\/js\/verovio\.js"><\/script>/,
    `<script>\n${verovioJs}\n</script>`
  );

  const withMidiWriterJs = withVerovioJs.replace(
    /<script\s+src="src\/js\/midi-writer\.js"><\/script>/,
    `<script>\n${midiWriterJs}\n</script>`
  );

  return withMidiWriterJs.replace(
    /<script\s+src="src\/js\/main\.js"><\/script>/,
    `<script>\n${jsBundle}\n</script>`
  );
};

const run = () => {
  const tsModules = collectGraph();
  compileWithTsc(tsModules);

  const jsBundle = bundle(tsModules);

  mkdirSync(toAbs("src/js"), { recursive: true });
  writeFileSync(toAbs(JS_OUT), jsBundle, "utf8");

  const distHtml = inlineTemplate(jsBundle);
  writeFileSync(toAbs(DIST), distHtml, "utf8");

  rmSync(toAbs(TMP_DIR), { recursive: true, force: true });

  process.stdout.write(`Built ${DIST} and ${JS_OUT}\n`);
};

run();
