---
title: miku-score browser runtime contract
description: Public API, capability, verification, and downstream-intake rules for the browser runtime bundle.
topics:
  - miku-score
  - browser-runtime
  - miku-score-web
  - release
category: reference
status: draft
audience:
  - developer
  - downstream-maintainer
  - agent
created: 2026-08-10
updated: 2026-08-12
---

# Browser Runtime Contract

`miku-score-runtime-<version>.mjs` is the browser-compatible, importable
runtime consumed by `miku-score-web` at build time. It is a different release
asset from the Node.js CLI bundle, `miku-score-<version>.mjs`.

This is the contract for runtime API version `miku-score/runtime-api@2`.
Phase 2 implements the facade defined here; no downstream code may import
unpublished `src/ts/` modules as a substitute for this API.

## Public ESM exports and initialization

```js
import loadMikuScoreRuntime, {
  embeddedModulePaths,
  runtimeApiVersion,
  version,
} from "./miku-score-runtime-<version>.mjs";

const runtime = loadMikuScoreRuntime({
  expectedVersion: version,
  capabilities: {
    // Optional explicit capabilities are supplied by the downstream.
  },
});
```

The runtime exposes only the following value exports.

- `version`: the source `package.json` version embedded at build time.
- `runtimeApiVersion`: the string `miku-score/runtime-api@2`.
- `embeddedModulePaths`: a frozen, read-only, normalized list of source-module
  paths embedded in the bundle. It is for audit and debugging, not a secondary
  import API.
- `loadMikuScoreRuntime(options)`: validates the version and initialization
  options, then returns the public runtime API object.
- default export: `loadMikuScoreRuntime`.

`expectedVersion` is optional. When supplied, it must exactly equal `version`.
A mismatch throws a `RuntimeConfigurationError` with code
`MKS_RUNTIME_VERSION_MISMATCH` before an API object is returned. Configuration
errors are the only normal reason for the loader to throw.

The first successful call initializes one immutable, module-local runtime API.
Subsequent calls validate their `expectedVersion` and return that same object.
They must not replace or augment its capabilities. A later call that supplies a
different capability configuration throws `RuntimeConfigurationError` with
code `MKS_RUNTIME_CAPABILITIES_FIXED`. This makes initialization idempotent and
prevents a page from silently changing score-conversion behavior partway
through a session.

The runtime does not publish a compatibility global in API version 2. If a
single-file bootstrap later proves that a global is necessary, it must be added
in a new documented contract revision with an owner, exact property name, and
collision rule. Browser globals provided by vendor libraries are likewise not
read by this runtime.

## Explicit capabilities

Optional integrations enter only through `RuntimeLoadOptions.capabilities`.
The initial shape is:

```ts
type RuntimeCapabilities = {
  midiWriterRuntime?: MidiWriterRuntime | null;
  vsqxBridge?: VsqxConversionBridge | null;
  verovio?: {
    toolkit: VerovioToolkitApi;
    serializeDocument: XmlDocumentSerializer;
  } | null;
};
```

The named types are public type-only exports from the runtime facade; their
implementations remain internal. `miku-score-web` is responsible for adapting
its owned browser/vendor assets to these values before calling the loader.

- VSQX import and export require `vsqxBridge`. Without it, the operation
  returns `MKS_CAPABILITY_VSQX_UNAVAILABLE`.
- SVG rendering requires the complete `verovio` capability. Without it, the
  operation returns `MKS_CAPABILITY_VEROVIO_UNAVAILABLE`.
- MIDI export uses the explicitly supplied writer only when the selected export
  profile needs it. A request that needs a writer but has none returns
  `MKS_CAPABILITY_MIDI_WRITER_UNAVAILABLE`. The raw MIDI writer remains an
  upstream implementation choice and never discovers a browser global.

Capability absence, parsing failure, conversion failure, and unsupported input
are expected product outcomes. They return a result value rather than throwing.
Malformed loader options and a version/capability reinitialization conflict are
configuration errors and throw as described above.

## Result and diagnostic contract

All public operations return `RuntimeResult<T>` directly or through a
`Promise`. `Uint8Array` values remain `Uint8Array`; callers must not expect a
base64 or JSON-array conversion.

```ts
type RuntimeDiagnostic = {
  code: string;
  message: string;
};

type RuntimeSuccess<T> = {
  ok: true;
  value: T;
  warnings: RuntimeDiagnostic[];
};

type RuntimeFailure = {
  ok: false;
  diagnostics: RuntimeDiagnostic[];
  warnings: RuntimeDiagnostic[];
};

type RuntimeResult<T> = RuntimeSuccess<T> | RuntimeFailure;
```

`diagnostics` and `warnings` are always arrays. New facade-originated
diagnostic codes use the `MKS_` prefix. The first implementation uses these
codes where applicable:

- `MKS_INPUT_INVALID`
- `MKS_MUSICXML_INVALID`
- `MKS_CONVERSION_FAILED`
- `MKS_OUTPUT_FAILED`
- `MKS_ARCHIVE_INVALID`
- `MKS_CAPABILITY_VSQX_UNAVAILABLE`
- `MKS_CAPABILITY_VEROVIO_UNAVAILABLE`
- `MKS_CAPABILITY_MIDI_WRITER_UNAVAILABLE`

Existing format-specific diagnostics retain their stable code when they are
more precise than a facade-level code. Human-readable CLI wording is not part
of this contract.

Command rejection is not an exception and must not mutate the source score.
`state.validateCommand` and `state.applyCommand` return a successful outer
`RuntimeResult` when they complete normally; their `value` contains the
existing command outcome (`ok`, changed node IDs, affected measure numbers,
warnings, and diagnostics). A rejected `applyCommand` returns the original XML
in its value. A failure to parse or load the score is an outer failure.

## API inventory

API version 2 presents responsibilities through the following namespace tree.
Names and value shapes listed here are the public surface; direct imports of
the current implementation modules are not supported downstream.

```ts
type MikuScoreRuntimeApi = {
  score: {
    createNewMusicXml(options?: CreateNewScoreOptions): RuntimeResult<string>;
    loadMusicXml(xml: string): RuntimeResult<string>;
    saveMusicXml(xml: string): RuntimeResult<string>;
  };
  state: {
    summarize(xml: string): RuntimeResult<MusicXmlStateSummary>;
    inspectMeasure(xml: string, measureNumber: string): RuntimeResult<MusicXmlMeasureInspection>;
    validateCommand(xml: string, command: CoreCommand): RuntimeResult<MusicXmlCommandOutcome>;
    applyCommand(xml: string, command: CoreCommand): RuntimeResult<MusicXmlCommandApplication>;
    diff(beforeXml: string, afterXml: string): RuntimeResult<MusicXmlStateDiff>;
  };
  measure: {
    extractEditorMusicXml(xml: string, location: RuntimeMeasureLocation): RuntimeResult<string>;
    replaceEditorMusicXml(xml: string, request: RuntimeReplaceMeasureRequest): RuntimeResult<string>;
    appendMeasure(xml: string): RuntimeResult<string>;
  };
  convert: {
    importToMusicXml(request: RuntimeImportRequest): Promise<RuntimeResult<string>>;
    exportFromMusicXml(request: RuntimeExportRequest): Promise<RuntimeResult<string | Uint8Array>>;
  };
  output: {
    encodeMusicXml(xml: string, options?: { compressed?: boolean }): Promise<RuntimeResult<string | Uint8Array>>;
    encodeZipBundle(entries: RuntimeArchiveEntry[], options?: { compressed?: boolean }): Promise<RuntimeResult<Uint8Array>>;
    encodeSvg(svg: string): RuntimeResult<string>;
    encodeJson(json: string): RuntimeResult<string>;
    encodeVsqx(vsqx: string): RuntimeResult<string>;
  };
  archive: {
    listRootEntryPaths(bytes: Uint8Array, options: RuntimeArchiveListOptions): Promise<RuntimeResult<string[]>>;
    extractEntryBytes(bytes: Uint8Array, options: { path: string }): Promise<RuntimeResult<Uint8Array>>;
  };
  playback: {
    buildPlan(xml: string, options?: PlaybackPlanOptions): RuntimeResult<PlaybackPlan>;
  };
  render: {
    renderSvg(xml: string, options?: RuntimeSvgRenderOptions): RuntimeResult<string>;
  };
};
```

`RuntimeImportRequest.format` accepts `musicxml`, `mxl`, `abc`, `midi`,
`vsqx`, `mei`, `lilypond`, `musescore`, and `mscz`; its `data` is `string` or
`Uint8Array` according to that format. `RuntimeExportRequest.format` accepts
MusicXML, MXL, ABC, MIDI, VSQX, MEI, LilyPond, MuseScore/MSCZ, and SVG, and
carries the explicit format options needed by that operation. JSON is a raw
value encoder under `output`, not a MusicXML conversion target.

`score.loadMusicXml` and `score.saveMusicXml` operate on MusicXML values only.
Format detection, filename extension handling, `File`/`Blob` conversion, and
download delivery remain adapter responsibilities. `convert.importToMusicXml`
is the format-conversion entry point for non-MusicXML input.

`RuntimeImportRequest.options` is deliberately format-scoped. `importMetadata`
accepts optional `source` and `debug` booleans only for ABC, MIDI, MEI,
LilyPond, MuseScore, and compressed MuseScore input. `midi` accepts
`quantizeGrid` (`auto`, `1/8`, `1/16`, `1/32`, or `1/64`) and
`tripletAwareQuantize` only for MIDI input.
`vsqx.defaultLyric` is accepted only for VSQX input. Unsupported or malformed
options return `MKS_INPUT_INVALID`; downstream code must not rewrite imported
MusicXML to emulate these policies.

`RuntimeExportRequest.options.musicXml.metadata` applies before every output
converter. Its optional `roundTrip`, `source`, and `debug` booleans control
the corresponding `mks:meta:*`, `mks:src:*`, and `mks:dbg:*` fields. Omitted
values preserve the existing metadata. The `measure` namespace returns only
MusicXML values and has no DOM or selection state. Replacement and append
results are validated through `ScoreCore`; an invalid merged score returns
`MKS_MUSICXML_INVALID` without changing either input string. The `archive`
namespace lists supported root entries and extracts selected ZIP bytes without
exposing ZIP parser internals. Unknown export-option properties are rejected
with `MKS_INPUT_INVALID` rather than ignored.

`playback.buildPlan` only produces deterministic schedules, measure timelines,
and related playback data. It does not create an `AudioContext`, schedule
oscillators, alter the DOM, or control playback UI. `render.renderSvg` returns
SVG text only; preview insertion, click-map wiring, selection highlighting,
and page layout are outside the runtime.

## Runtime boundary

The browser runtime must not include or reference:

- Node.js built-ins, `process`, or CLI entrypoints;
- page initialization, event handlers, browser download/file adapters, or Web
  Audio control;
- `main.ts`, `*-flow.ts`, `abc-browser-compat.ts`,
  `midi-writer-browser.ts`, `verovio-out.ts`, or `vsqx-io.ts`;
- source-tree-relative imports from a downstream application; or
- network/CDN runtime loading.

DOM parsing required by MusicXML value operations is permitted. DOM preview
behavior is not. The build graph, not a filename convention, is the authority
for this boundary.

## Build, verification, and downstream intake

Phase 3 adds `npm run build:browser-runtime`, which writes
`bundle/miku-score-runtime.mjs`, and `npm run smoke:browser-runtime`, which
dynamically imports that artifact. The smoke verifies the export snapshot,
version mismatch behavior, representative conversion/state/playback operations,
and the denylist above. Capability tests cover both absence diagnostics and
explicitly injected mock capabilities.

Phase 4 publishes these separate assets from one tag:

- `miku-score-<version>.mjs`: Node.js CLI bundle
- `miku-score-runtime-<version>.mjs`: browser runtime
- `miku-score-runtime-<version>.json`: runtime manifest
- `miku-score-sources-<version>.tgz`: source archive
- `miku-score-SHA256SUMS-<version>.txt`: checksum list

The runtime manifest schema is `miku-score.browser-runtime-lock/v1` and binds
`release_tag`, `package_version`, `asset_name`, and a lowercase SHA-256 digest.
`miku-score-web` commits a copy as its runtime lock, verifies the downloaded
asset at build time, and embeds the verified bytes in its deployable artifact.
The deployed browser must not fetch the runtime from the network.

Do not remove the historical combined Web application from `miku-score` until
the downstream repository has independently passed its build, browser/UI, and
offline single-file verification using this released runtime.
