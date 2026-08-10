import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

import {
  RUNTIME_MODULE_RELATIVE_PATHS,
  WEB_OR_CLI_MODULE_RELATIVE_PATHS,
} from "./lib/runtime-module-paths.mjs";

const ROOT = process.cwd();
const args = parseArgs(process.argv.slice(2));
const packageVersion = JSON.parse(readRepoFile("package.json")).version;
const runtimePath = path.resolve(args.runtimePath ?? path.join(ROOT, "bundle", "miku-score-runtime.mjs"));
const runtimeSource = fs.readFileSync(runtimePath, "utf8");

assertRuntimeBoundary(runtimeSource);

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
const restoreGlobals = installWindowGlobals(dom.window);

try {
  const runtimeModule = await import(`${pathToFileURL(runtimePath).href}?smoke=${Date.now()}`);
  assertPublicExports(runtimeModule, args.expectedVersion ?? packageVersion);
  assertVersionMismatch(runtimeModule);

  const runtime = runtimeModule.loadMikuScoreRuntime({ expectedVersion: runtimeModule.version });
  const created = runtime.score.createNewMusicXml();
  const xml = unwrap(created, "createNewMusicXml");
  const summary = unwrap(runtime.state.summarize(xml), "state.summarize");
  if (summary.kind !== "musicxml_state_summary" || summary.part_count < 1) {
    throw new Error("runtime state summary returned an unexpected value.");
  }

  const imported = await runtime.convert.importToMusicXml({
    format: "abc",
    data: "X:1\nT:Browser runtime smoke\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
  });
  const importedXml = unwrap(imported, "convert.importToMusicXml");
  const midi = await runtime.convert.exportFromMusicXml({ format: "midi", xml: importedXml });
  const midiBytes = unwrap(midi, "convert.exportFromMusicXml(midi)");
  if (!(midiBytes instanceof Uint8Array) || midiBytes[0] !== 0x4d || midiBytes[1] !== 0x54) {
    throw new Error("runtime MIDI export did not preserve Uint8Array bytes.");
  }

  const rejected = runtime.state.applyCommand(importedXml, {
    type: "change_to_pitch",
    targetNodeId: "missing-node",
    voice: "1",
    pitch: { step: "C", octave: 4 },
  });
  const rejection = unwrap(rejected, "state.applyCommand");
  if (rejection.ok || rejection.xml !== importedXml) {
    throw new Error("runtime command rejection was not non-destructive.");
  }

  const playback = runtime.playback.buildPlan(importedXml, {
    ticksPerQuarter: 480,
    useMidiLikePlayback: false,
    graceTimingMode: "before_beat",
    metricAccentEnabled: false,
    metricAccentProfile: "subtle",
  });
  unwrap(playback, "playback.buildPlan");

  assertUnavailableCapability(runtime.render.renderSvg(importedXml), "MKS_CAPABILITY_VEROVIO_UNAVAILABLE");
  assertUnavailableCapability(
    await runtime.convert.exportFromMusicXml({ format: "vsqx", xml: importedXml }),
    "MKS_CAPABILITY_VSQX_UNAVAILABLE"
  );
  console.log(`[smoke:browser-runtime] ok ${runtimeModule.version} ${path.basename(runtimePath)}`);
} finally {
  restoreGlobals();
  dom.window.close();
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== "--runtime" && token !== "--expected-version") {
      throw new Error(`unknown argument: ${token}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${token} requires a value`);
    }
    if (token === "--runtime") options.runtimePath = value;
    if (token === "--expected-version") options.expectedVersion = value;
    index += 1;
  }
  return options;
}

function assertRuntimeBoundary(source) {
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
  for (const forbidden of WEB_OR_CLI_MODULE_RELATIVE_PATHS) {
    if (source.includes(forbidden)) {
      throw new Error(`browser runtime contains Web/CLI module path: ${forbidden}`);
    }
  }
}

function assertPublicExports(runtimeModule, expectedVersion) {
  const actualExports = Object.keys(runtimeModule).sort();
  const expectedExports = [
    "default",
    "embeddedModulePaths",
    "loadMikuScoreRuntime",
    "runtimeApiVersion",
    "version",
  ];
  if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
    throw new Error(`unexpected runtime exports: ${actualExports.join(",")}`);
  }
  if (runtimeModule.version !== expectedVersion) {
    throw new Error(`runtime version mismatch: expected ${expectedVersion}, actual ${runtimeModule.version}`);
  }
  if (runtimeModule.runtimeApiVersion !== "miku-score/runtime-api@1") {
    throw new Error(`unexpected runtime API version: ${runtimeModule.runtimeApiVersion}`);
  }
  if (runtimeModule.default !== runtimeModule.loadMikuScoreRuntime) {
    throw new Error("runtime default export is not loadMikuScoreRuntime.");
  }
  if (JSON.stringify(runtimeModule.embeddedModulePaths) !== JSON.stringify(RUNTIME_MODULE_RELATIVE_PATHS)) {
    throw new Error("runtime embeddedModulePaths does not match the approved module inventory.");
  }
}

function assertVersionMismatch(runtimeModule) {
  try {
    runtimeModule.loadMikuScoreRuntime({ expectedVersion: "0.0.0" });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "MKS_RUNTIME_VERSION_MISMATCH") return;
    throw error;
  }
  throw new Error("runtime accepted a mismatched expectedVersion.");
}

function assertUnavailableCapability(result, code) {
  if (result.ok || !result.diagnostics.some((item) => item.code === code)) {
    throw new Error(`runtime did not return unavailable capability code ${code}.`);
  }
}

function unwrap(result, operation) {
  if (result.ok) return result.value;
  throw new Error(`${operation} failed: ${result.diagnostics.map((item) => item.message).join("; ")}`);
}

function installWindowGlobals(window) {
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
  const previous = new Map();
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
      const value = previous.get(key);
      if (value === undefined) {
        delete globalThis[key];
      } else {
        Object.defineProperty(globalThis, key, {
          configurable: true,
          writable: true,
          value,
        });
      }
    }
  };
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.resolve(ROOT, relativePath), "utf8");
}
