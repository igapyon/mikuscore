# TODO

## Current First Focus

- [ ] Continue hardening TypeScript boundaries for the `miku-score` / `miku-score-web` split.
  - Completed value-based boundaries now cover new-score creation, MusicXML output filtering, render-document preparation, measure operations, load conversion, output encoding, and playback planning.
  - Browser-global capability extraction is complete for Verovio, MIDI writer, VSQX, and ABC compatibility publication; define the runtime facade next.
  - Keep the historical combined Web App operational until a versioned browser runtime and independently verified downstream application exist.

## Deferred ABC I/O Refactoring Focus

- [ ] Resume the ABC I/O refactoring pass after the current separation milestone.
  - Primary entry point:
    - `Refactor src/ts/abc-io.ts before continuing larger ABC layout expansion.`
  - Current stance:
    - the broad cross-format score feature model pass is complete enough for now
    - do not expand shared feature models further until a real duplication or test-surface problem appears
    - resume from ABC characterization coverage and small in-file helper ordering / section-boundary cleanup
    - keep public conversion entry points stable while moving internals
  - Current problem statement:
    - `src/ts/abc-io.ts` is no longer only ABC text I/O
    - it now carries ABC parsing, ABC metadata handling, ABC-to-MusicXML import, MusicXML-to-ABC export, MusicXML XML fragment generation, diagnostics, source/debug metadata, and feature-specific conversion rules
    - this is understandable historical growth from a working converter, but the file now hides too many decisions behind local `if` blocks and copied conversion patterns
  - Refactoring direction:
    - first keep reducing large conditional blocks into named, behavior-preserving helpers
    - treat those helpers as staging boundaries for structural cleanup, not as an end in themselves
    - keep `abc-io.ts` as the public facade while internals are reorganized gradually
    - avoid expanding `src/ts/score-features/` until repeated XML generation or test pressure proves the need
  - Likely later split candidates:
    - `abc-parse.ts` for ABC text parsing into the current internal representation
    - `abc-render.ts` for rendering internal ABC-oriented data back to ABC text
    - `abc-to-musicxml.ts` for building MusicXML from parsed ABC data
    - `musicxml-to-abc.ts` for deriving ABC output from MusicXML
    - `abc-io.ts` as the stable public entry point that delegates to those modules
  - Immediate next steps:
    - review the current helper clusters in `src/ts/abc-io.ts` for section ordering and naming consistency
    - add focused characterization coverage before any next behavior-bearing move
    - identify the first low-risk cleanup target, likely a dense MusicXML-to-ABC export helper cluster or ABC-to-MusicXML note XML cluster
    - only consider file splits after the related helper cluster has a clear name and focused tests

## Prepared Node/Web Separation Plan (miku-project Precedent)

This migration is now underway. The separate Web repository exists, and the
Main Application is being prepared through small value-based boundaries before
the browser-runtime contract and downstream bootstrap are implemented.

- Historical migration sequence consulted on 2026-08-10:
  1. `miku-project` first published and tested its browser runtime contract (`4183832`, `feat: publish browser runtime bundle`).
  2. `miku-project-web` then established its standalone application with a pinned runtime lock, runtime-first bootstrap, browser/UI tests, and offline smoke (`cb9a1a1`, `feat: establish standalone web application`).
  3. A Web-only timestamp portability failure was corrected before cutover (`e2158f8`, `test: make download timestamps timezone-independent`).
  4. Only after downstream verification did `miku-project` remove its Web assets and tests (`6818bf7`, `refactor: separate web application assets`).
  5. Remaining Web UI backlog moved downstream last (`b8485e6`, `docs: move web ui backlog`).
- Reuse these gates for `miku-score`: explicit module ownership, browser runtime before downstream bootstrap, tag/version/asset/SHA-256 lock, runtime initialization before UI, standalone browser/UI verification, offline single-file smoke, and upstream deletion last.
- Do not copy the historical commit size or module layout mechanically. The `miku-project-web` first cut added roughly 46,000 lines and the upstream cleanup removed roughly 44,000 lines in single commits. Stage `miku-score` by runtime contract, Web scaffold, behavior-preserving asset/test transfer, downstream verification, and final upstream cleanup.
- Do not inherit `miku-project` compatibility globals or its `main-*` decomposition unless `miku-score` has the same requirement. Verovio, MIDI writer, VSQX bridge, Web Audio, MusicXML DOM behavior, and score-format diagnostics require project-specific capability boundaries.

### Browser Runtime Execution WBS

Tracking Issue: [#201 miku-score-web 向けの upstream runtime bundle を整備する](https://github.com/igapyon/miku-score/issues/201)

Use the following phases as the execution order. A later phase may be prepared,
but it must not remove or replace the current combined Web surface before its
preceding gate succeeds.

- [x] Phase 0: make reusable TypeScript boundaries explicit.
  - Value-based score creation, MusicXML output, render preparation, measure operations, load conversion, output encoding, and playback planning are separated from page behavior.
  - Verovio, MIDI writer, VSQX, and ABC compatibility globals now enter through explicit capability or browser-adapter boundaries.
  - Gate P0: `midi-io.ts`, `abc-io.ts`, `vsqx-conversion.ts`, and `verovio-render.ts` contain no page-global discovery; focused tests and the current full build pass.

- [x] Phase 1: freeze the browser runtime contract before implementing its bundle.
  - Added `docs/browser-runtime.md` as the canonical contract document on 2026-08-10.
  - Define the public ESM exports before exposing implementation modules:
    - `version`: `package.json` version embedded at build time
    - `runtimeApiVersion`: independently versioned API schema identifier
    - `embeddedModulePaths`: frozen allowlisted module inventory for audit/debug use
    - `loadMikuScoreRuntime(options)`: validated, idempotent runtime loader
    - default export: `loadMikuScoreRuntime`
  - Define `options.expectedVersion` mismatch behavior and the capability object for optional Verovio toolkit/serializer, MIDI writer, and VSQX bridge support.
  - Prefer ESM return values over a new compatibility global. Introduce a global only when the current single-file bootstrap proves it is necessary, and document its ownership and collision behavior first.
  - Define one discriminated result contract for expected failures:
    - success: `{ ok: true, value, warnings }`
    - failure: `{ ok: false, diagnostics, warnings }`
    - diagnostics use stable `code` and `message` fields; binary values remain `Uint8Array`
    - expected parse/conversion/capability failures return results rather than throwing
  - Record the initial API inventory by responsibility, not by current filename:
    - `score`: new/load/save, summarize, inspect measure, validate/apply command, diff
    - `convert`: MusicXML, MXL, ABC, MIDI, MEI, LilyPond, MuseScore/MSCZ, and capability-gated VSQX
    - `output`: value-only text/byte encoders and archive assembly
    - `playback`: playback-plan generation only; no Web Audio controller
    - `render`: capability-gated SVG rendering; no preview DOM or click-map wiring
  - Gate P1 passed: the contract document makes the API inventory, result schema, capability-unavailable behavior, and compatibility/version rules reviewable without reading implementation code.

- [x] Phase 2: implement the runtime facade and make the CLI consume it.
  - Added `src/ts/runtime-api.ts` as the single browser-runtime entry surface, with the P1 export snapshot and version/capability initialization rules.
  - Extracted reusable state/command operations from `cli-api.ts` into `src/ts/musicxml-state.ts`; runtime operations are value based and retain non-destructive command rejection.
  - Bound the existing load, output, playback, Verovio, and VSQX value functions through the facade without duplicating their format conversion logic.
  - Kept Web-only adapters (`main.ts`, `*-flow.ts`, `abc-browser-compat.ts`, `midi-writer-browser.ts`, `verovio-out.ts`, `vsqx-io.ts`) out of the runtime entry graph. `verovio-out.ts` now provides only the CLI/browser adapter that creates and initializes an explicit runtime capability.
  - Reduced `cli-api.ts` to CLI path/extension interpretation, selector aliases, CLI diagnostic wording, the Verovio capability adapter, and delegation to the runtime facade.
  - Added direct contract coverage for the export snapshot, version mismatch, value conversion, `Uint8Array` preservation, non-destructive rejection, unavailable capability diagnostics, and an injected renderer capability.
  - Gate P2 passed: `npm run typecheck`, direct runtime/CLI unit tests, the 28-case CLI command suite, `npm run build:cli-runtime`, and `npm run smoke:bundle` pass through the facade.

- [x] Phase 3: build and statically police the standalone browser runtime.
  - Added `scripts/lib/runtime-module-paths.mjs` with an exact reviewed upstream allowlist and Web/CLI denylist.
  - Added `scripts/build-browser-runtime.mjs` using `src/ts/runtime-api.ts` and an ESM browser target; it emits the ignored build artifact `bundle/miku-score-runtime.mjs` independently of the tracked CLI bundle.
  - The builder rejects Node.js, `jsdom`, CLI, source-tree-relative import, network-dependency, and unexpected graph references. Package-version injection replaces the runtime source placeholder at build time.
  - The esbuild metafile must exactly match the allowlist, so any dependency change becomes an explicit ownership review; the final artifact also receives textual boundary checks.
  - Added `scripts/smoke-browser-runtime.mjs`, exposed through `npm run smoke:browser-runtime`. It dynamically imports the artifact, verifies public exports/version mismatch/module inventory, runs score/state/ABC/MIDI/playback operations, verifies `Uint8Array` output and non-destructive command rejection, and tests unavailable Verovio/VSQX capabilities. Unit coverage supplies an injected renderer capability.
  - Added `build:browser-runtime` and `smoke:browser-runtime` scripts; `build:dist` now builds the runtime with the existing HTML and CLI artifacts.
  - Gate P3 passed: isolated runtime build/smoke and `npm run build:full` pass without importing current Web assets or the CLI bundle.

- [x] Phase 4: create version/digest metadata and Release staging.
  - Added `scripts/create-browser-runtime-manifest.mjs` and `scripts/verify-browser-runtime-manifest.mjs` following the `miku-project` lock shape.
  - The schema is `miku-score.browser-runtime-lock/v1` with `release_tag`, `package_version`, `asset_name`, and lowercase SHA-256.
  - The JSON manifest is a first-class Release asset, superseding the older Issue #201 local-only wording.
  - Extended `prepare:release-assets` to stage the CLI bundle, browser runtime, runtime manifest, source archive, and deterministic SHA-256 list. Added `verify:release-assets` to verify all five assets and the runtime export version locally.
  - Added tests for release-tag, package-version, asset-name, and runtime-tampering rejection before any Release workflow modification.
  - Gate P4 passed: `TAG_NAME=v0.7.0 npm run prepare:release-assets` and `npm run verify:release-assets -- --release-tag v0.7.0` reproduce and verify all five ignored local staging assets without publishing a Release.

- [ ] Phase 5: bootstrap `miku-score-web` from the verified runtime.
  - Add a repository-local `runtime/miku-score-runtime.lock.json`; do not commit the downloaded runtime itself.
  - Implement cache/local-file/Release fetch paths that all enforce lock schema, version export, asset name, and SHA-256.
  - Embed the verified runtime before Web-owned modules in one inline module; the deployed application must not fetch runtime code at browser startup.
  - Move browser UI, CSS, `lht-cmn`, samples, screenshots, download/file adapters, preview/click mapping, and Web tests in behavior-preserving slices.
  - Gate P5: the downstream repository independently builds and tests representative input, edit/state, preview, playback, and download flows using only the pinned runtime plus Web-owned sources.
  - [x] Initial downstream bootstrap (2026-08-10): created the pinned `v0.7.0` runtime lock, SHA-256 verified cache/Release fetch script, runtime-first single-file builder, and offline asset smoke in `miku-score-web`.
    - Before the first public Release exists, `miku-score-web` accepts an explicit local runtime file for development; verified the P4 staging asset through that path without committing it downstream.
    - The initial standalone shell exercises ABC import, new-score creation, raw MIDI download, and playback-plan generation. Full preview/Verovio, bounded editing, format UI, samples, styles, and parity/browser tests remain P5 migration slices; do not call the P5 gate complete yet.

- [ ] Phase 6: prove offline behavior and cut over ownership.
  - Add an offline single-file smoke that rejects request-generating runtime/script/stylesheet/media references and verifies runtime provenance.
  - Compare representative generated output and diagnostics between the historical combined Web App and `miku-score-web`; document intentional differences.
  - Only after downstream evidence passes, remove confirmed Web-owned paths and Web-only tests from `miku-score`.
  - Update README, development/release docs, GitHub About/Pages/Release ownership, and remaining Web backlog references.
  - Gate P6: both repositories build independently, the downstream offline smoke passes, and the Main Application still passes runtime, CLI, core/format, and Release-staging verification after Web deletion.

- Rollback rule:
  - Until P4 succeeds, keep the current combined Web App buildable and do not publish the browser runtime as a stable downstream contract.
  - Until P5 succeeds, do not remove the current combined Web surface from `miku-score`.
  - Never overwrite a published runtime asset in place. A contract change after publication requires a new version and an explicit migration note.

- [ ] Establish the `miku-score` Main Application / `miku-score-web` ownership boundary.
  - Research finding: `miku-project` now keeps its domain core, CLI, versioned browser runtime, runtime Release assets, and core/CLI tests in the Main Application. `miku-project-web` pins and verifies a released runtime, then owns its single-file HTML, browser adapter, UI, CSS, `lht-cmn`, browser/UI tests, screenshots, and Web publication.
  - Keep the same direction for `miku-score`: canonical MusicXML semantics, format conversion, diagnostics, bounded editing, CLI, reusable runtime, and domain tests remain in the Main Application. Browser file/input handling, UI state and DOM wiring, preview presentation, download interaction, CSS, `lht-cmn`, screenshots, single-file HTML generation, and Web publication belong in `miku-score-web`.
  - Write a path-level inventory before moving files. `src/ts/main.ts` is currently a large mixed UI entrypoint; do not classify files solely by their current directory or filename.

- [ ] Harden the TypeScript function boundaries before the repository split.
  - Research checkpoint (2026-08-10): most format and MusicXML modules are already reusable, but several browser-facing flow modules combine reusable product decisions with `File`, `Blob`, `document`, `window`, `localStorage`, Web Audio, or browser-global vendor access. A repository move before these functions are separated would either duplicate product logic in `miku-score-web` or accidentally pull Web behavior into the Main Application runtime.
  - Use an explicit ownership manifest, analogous to the `miku-project` core/Web module lists, so the browser-runtime build rejects Web modules and Web entrypoints reject source-tree imports that bypass the public runtime.
  - Treat the following classification as provisional until focused tests prove each extraction:

    | Boundary | Current modules | Target and required work |
    | --- | --- | --- |
    | Main Application, low boundary risk | `core/`, `src/ts/score-features/`, `new-score.ts`, `musicxml-output.ts`, `render-document.ts`, `measure-operations.ts`, `load-input.ts`, `output-encoding.ts`, `playback-model.ts`, `verovio-render.ts`, `vsqx-conversion.ts`, `abc-lexer.ts`, `abc-parser.ts`, `abc-layout.ts`, `beam-common.ts`, `midi-musescore-io.ts`, `mxl-io.ts`, `zip-io.ts` | Keep upstream. These are domain, parsing, model, bounded editing, value-based input/output conversion, render/playback preparation, or archive functions and have no page wiring. Preserve their focused tests as Main Application tests. |
    | Main Application, large but conceptually reusable | `abc-io.ts`, `midi-io.ts`, `mei-io.ts`, `lilypond-io.ts`, `musescore-io.ts`, `musicxml-io.ts` | Keep upstream. Remove the legacy `window.AbcCommon` / `window.AbcCompatParser` registration from the core module path or isolate it in a compatibility bootstrap. Record the DOM implementation required by MusicXML helpers without treating DOM use as UI ownership. Keep MIDI writer selection explicit through the runtime options. |
    | Web App or runtime adapter after extraction | `main.ts`, `load-flow.ts`, `download-flow.ts`, `playback-flow.ts`, `preview-flow.ts`, `abc-browser-compat.ts`, `verovio-out.ts`, `midi-writer-browser.ts`, `vsqx-io.ts`, built-in `sampleXml*.ts` modules when samples remain UI-only | Move DOM lookup, event wiring, `File` / `FileReader`, `Blob`, browser download delivery, `AudioContext`, browser-global ABC/Verovio/MIDI-writer/VSQX publication or discovery, `localStorage`, tab/form state, rendered-SVG click mapping, UI messages, and sample-button behavior downstream or into a capability adapter that is excluded from the pure runtime surface. |
    | Mixed, must split first | `cli-api.ts` | Introduce a stable runtime facade and leave only CLI policy in this file. Do not assign the file wholesale based on its present name. |

  - [x] Extract product operations currently trapped in `src/ts/main.ts`.
    - [x] Move metadata filtering and imported-diagnostic summarization behind upstream functions that accept values rather than reading checkboxes or page state.
      - Added `src/ts/musicxml-output.ts`; UI code now supplies explicit keep/remove settings.
      - Preserved exact no-op output when all metadata families are retained, selective `mks:meta:*` / `mks:src:*` / `mks:dbg:*` removal, empty-container pruning, and the existing ABC warning summary.
    - [x] Split new-score generation into a pure `options -> MusicXML` operation and a Web function that reads the form controls.
      - Added `src/ts/new-score.ts` with bounded options and no page-state dependency.
      - Added characterization coverage for the existing multi-part and piano grand-staff output shapes.
      - Kept the current eight-measure, `divisions=480`, MusicXML `3.1` behavior while removing the new-score path's dependency on ABC I/O.
    - [x] Move render-document preparation, including global tempo-direction deduplication, into the upstream render path; keep SVG DOM click mapping in the Web App.
      - Added `src/ts/render-document.ts` with explicit MusicXML text, node IDs, and ID-prefix inputs instead of page-state access.
      - Preserved the existing multi-part tempo-direction key and first-occurrence policy, including offset-sensitive matching and the single-part no-op behavior.
      - Kept rendered-SVG inspection, fallback click-map construction, highlighting, and DOM updates in the Web flow.
    - [x] Move measure extraction, replacement, and append-at-end MusicXML operations upstream; keep selection, confirmation, tab switching, and UI diagnostics downstream.
      - Added `src/ts/measure-operations.ts` with explicit MusicXML text and measure-location inputs.
      - Preserved inherited editor attributes without persisting preview-only attributes, full-measure rest duration, numeric/fallback measure numbering, and treble-bass grand-staff lane construction.
    - [x] Add focused characterization tests for each extracted `main.ts` product operation before continuing into mixed flow modules.
      - Covered render preparation, editor extraction/replacement, and single-/grand-staff append behavior at the upstream function boundary.

  - [x] Split `src/ts/load-flow.ts` into input decoding/conversion and browser file handling.
    - Main Application side: accept a declared format plus `string` or `Uint8Array`, perform archive decoding and format conversion, and return structured output/diagnostics.
    - Web side: read `File`, handle `FileReader` fallback, choose the selected source mode, and update fields/tabs after a successful result.
    - Reuse the same upstream decode/import operation from CLI and Web where their format behavior is intended to match; keep CLI path/stdio policy and Web form policy in their adapters.
    - Added `src/ts/load-input.ts` as the value-based Main Application boundary for MusicXML/MXL, ABC, MIDI, VSQX, MEI, LilyPond, and MuseScore/MSCZ input.
    - Kept filename-extension selection, `File` / `FileReader`, missing-file messages, and form-field result mapping in `src/ts/load-flow.ts`.
    - Preserved the MSCZ-first MSCX lookup and MusicXML archive fallback while exposing converter diagnostics and warnings structurally.
    - Added direct upstream tests for text, binary, archive, structured-diagnostic, and payload-kind behavior, plus Web-adapter direct-input and extension-policy coverage.

  - [x] Split `src/ts/download-flow.ts` into output encoding and browser download delivery.
    - Main Application side: produce text or `Uint8Array` for MusicXML/MXL, MIDI, VSQX, ABC, MEI, LilyPond, MuseScore/MSCZ, SVG, and ZIP bundle operations, with structured diagnostics.
    - Web side: choose timestamped filenames and MIME types, wrap results in `Blob`, call `URL.createObjectURL`, create/click the anchor, and revoke the URL.
    - Consolidate the duplicated MIDI export assembly now present in `download-flow.ts` and `cli-api.ts` before exposing a browser runtime API.
    - Added `src/ts/output-encoding.ts` as the value-based Main Application boundary for plain and compressed score outputs, MIDI, text formats, SVG/JSON, and ZIP bundles.
    - Reduced `src/ts/download-flow.ts` to timestamped filename/MIME policy, `Blob` wrapping, archive-entry Blob reads, and browser delivery.
    - Reused the same MIDI assembly from `cli-api.ts`, with an explicit raw-writer override preserving the existing CLI policy.
    - Preserved the existing nullable conversion-failure contract for Web callers; convert this to stable structured runtime diagnostics when the runtime facade is introduced.
    - Added direct encoder tests proving text/byte output and ZIP/MXL/MSCZ behavior without `Blob` or browser download APIs.

  - [x] Split `src/ts/playback-flow.ts` into a playback model and Web Audio controller.
    - Main Application side: keep event extraction, schedule compaction, measure timeline calculation, start-tick trimming, and other deterministic score-to-playback calculations.
    - Web side: keep `AudioContext` / `webkitAudioContext`, oscillator scheduling, user-gesture unlock, timers, playback UI text, active-measure highlighting, and render callbacks.
    - Keep `src/ts/playback.ts` as an upstream compatibility facade only if a real consumer still needs it after the new runtime API is defined.
    - Added `src/ts/playback-model.ts` with typed playback-plan results, value schedules, dense-schedule compaction, pickup-aware measure timelines, selected-measure trimming, tempo/pedal mapping, and optional MIDI byte validation.
    - Reduced `src/ts/playback-flow.ts` to save/UI orchestration and the Web Audio controller; it now consumes a complete playback plan instead of parsing or transforming MusicXML itself.
    - Removed the playback-start dependency on the browser-global MIDI writer by using the built-in raw MIDI writer for model-side byte validation.
    - Added focused model tests for ordinary scheduling, selected-measure starts, MIDI-like tempo output, raw MIDI validation, and stable invalid/silent-input failures; retained Web Audio and controller regression coverage separately.

  - [x] Replace implicit browser globals in renderer and format adapters with explicit runtime capabilities.
    - [x] `verovio-out.ts`: separate render-document sanitization from Verovio toolkit discovery, timer waiting, and toolkit caching. Inject a renderer/toolkit capability so the same public render operation works in the browser runtime and the Node.js CLI loader.
      - Added `src/ts/verovio-render.ts` with cloned-document slur sanitization and explicit toolkit/serializer inputs.
      - Reduced `src/ts/verovio-out.ts` to browser-global runtime discovery, initialization waiting, toolkit caching, and XML serializer adaptation.
      - Added direct tests proving source-document preservation, deterministic slur repair, injected toolkit calls, and stable toolkit failure handling; retained preview and CLI regression coverage.
    - [x] `midi-io.ts`: prefer the built-in raw writer for the stable upstream runtime path where behavior permits it, or inject the `MidiWriter` capability explicitly. Do not make core export behavior depend silently on `window.MidiWriter`.
      - Removed browser-global discovery from `src/ts/midi-io.ts`; non-raw export now receives an explicit typed `MidiWriterRuntime` capability.
      - Added `src/ts/midi-writer-browser.ts` as the thin `window.MidiWriter` adapter and wired only the Web download flow to it.
      - Kept CLI and playback-model validation on the built-in raw writer, and updated parity/roundtrip tests to pass the loaded vendor runtime explicitly.
      - Verified the focused MIDI, golden roundtrip, CFFP, output-encoding, and Web download suites together (185 tests).
    - [x] `vsqx-io.ts`: keep diagnostic mapping and conversion result policy upstream, but inject the bridge capability. Keep browser-global bridge discovery in a thin Web compatibility adapter until a non-browser upstream bridge exists.
      - Added `src/ts/vsqx-conversion.ts` with an explicit `VsqxConversionBridge` and value-based import/export functions.
      - Reduced `src/ts/vsqx-io.ts` to browser-global bridge discovery, normalization-hook installation, and compatibility wrappers.
      - Added direct capability-injection tests while retaining the existing browser-global diagnostic regression suite.
    - [x] `abc-io.ts`: keep parsing and conversion upstream; move compatibility-global publication out of the conversion module.
      - Removed automatic `window.AbcCommon` and `window.AbcCompatParser` writes from `src/ts/abc-io.ts`.
      - Added `src/ts/abc-browser-compat.ts` with explicit target/window installers, invoked only by the current Web entrypoint.
      - Added adapter tests proving that publishing to a supplied target does not mutate `window`, while the explicit window installer preserves the legacy names.

  - [ ] Separate the product runtime facade from CLI policy.
    - Execute Browser Runtime WBS Phases 1-2 and keep Issue #201 as the external tracker.
    - Introduce a runtime-facing facade with stable structured diagnostics and `string` / `Uint8Array` results for conversion, state, archive, and optional render capabilities.
    - Keep `cli-api.ts` responsible only for CLI-specific file-extension interpretation, selector aliases if they remain CLI-only, error text/exit behavior, and delegation to the shared runtime facade.
    - Preserve the existing CLI command and bundle behavior with regression tests while Web switches from direct source imports to the released runtime.

- [ ] Decide and document the browser-runtime contract before moving Web code.
  - Execute Browser Runtime WBS Phase 1.
  - Publish a browser-specific runtime separately from the Node.js CLI bundle, following the shape `miku-score-runtime-<release-version>.mjs` alongside `miku-score-<release-version>.mjs`.
  - Define the public module exports, initialization behavior, version compatibility check, stable API name, diagnostics/result shapes, and whether an intentional browser global is needed for legacy bootstrap.
  - Start the API inventory from the existing reusable conversion/state functions in `src/ts/cli-api.ts`, but do not expose that file unchanged merely because it is named `cli-api`.
  - Keep the runtime free of DOM event wiring, file-picker behavior, download triggering, and page initialization. It must load in a browser without Node.js or CLI references.
  - Decide the ownership and injection/loading contract for `src/js/verovio.js`, `src/js/midi-writer.js`, and `src/vendor/utaformatix3/utaformatix3-ts-plus.mikuscore.iife.js` before moving any of them. They are not ordinary UI-only files: SVG rendering, MIDI export, VSQX conversion, and the current CLI runtime each depend on parts of this surface.
  - Preserve the current VSQX constraint: its bridge is browser-global. The separation must not claim that VSQX becomes available to the CLI without a separate non-browser bridge contract.

- [ ] Add Main Application runtime build, contract tests, and Release metadata.
  - Execute Browser Runtime WBS Phases 3-4.
  - Implement a dedicated browser-runtime build and smoke test, separate from the existing `build:cli-runtime` path.
  - Verify the runtime public exports, version check, representative MusicXML conversion/state operations, and the absence of Node.js, CLI entrypoint, and Web-surface modules.
  - Generate a machine-readable runtime manifest that binds release tag, package version, asset name, and SHA-256. Release assets should include the CLI bundle, browser runtime, runtime manifest, source archive, and checksums.
  - Keep current CLI behavior and the tracked `bundle/miku-score.mjs` contract intact throughout this stage.

- [ ] Bootstrap `miku-score-web` as a standalone downstream repository.
  - Execute Browser Runtime WBS Phase 5 only after gate P4 succeeds.
  - [x] Create the separate Web repository before moving Main Application paths.
    - Confirmed the sibling repository at `../miku-score-web` on 2026-08-10.
    - Confirmed `https://github.com/igapyon/miku-score-web` as `origin`, with the same `main` / `devel` and work-branch model used by `miku-project-web`.
    - The initial repository currently contains only `LICENSE`; runtime intake and Web application files remain to be bootstrapped.
  - Pin the Main Application runtime with a repository-local lock containing the release tag, version, asset name, and SHA-256.
  - Fetch and validate the pinned runtime at build time only; cache it locally for development, but embed the validated runtime in the generated single-file Web App.
  - Initialize the verified runtime before starting UI modules. The deployed Web App must not download a runtime or other required asset while running in the browser.
  - Create the repository independently first; do not delete or move Main Application Web paths until its build, tests, and offline smoke are reproducible.

- [ ] Move Web-owned assets in a staged, test-preserving migration.
  - Execute Browser Runtime WBS Phases 5-6; upstream deletion belongs only to Phase 6.
  - Candidate Web paths include `miku-score-src.html`, `index-src.html`, generated HTML outputs, `src/css/`, `lht-cmn/`, `src/ts/main.ts`, browser UI helpers, Web-specific tests, screenshots, and the single-file build/release workflow.
  - Split mixed helpers where required: for example, retain reusable conversion/ZIP logic in the Main Application while placing browser download triggering, page wiring, and UI state in the Web App.
  - Transfer or rewrite tests by responsibility: retain core/format/CLI/runtime-contract assertions upstream; put DOM wiring, browser input/download, preview presentation, single-file composition, and offline Web behavior downstream.

- [ ] Require cutover evidence before removing the historical combined Web surface from `miku-score`.
  - `miku-score-web` independently builds from its pinned runtime and rejects a SHA-256 mismatch.
  - Its tests prove runtime-first bootstrap and the representative input, score/preview, edit, and output/download flows.
  - An offline smoke proves that the generated single-file Web App makes no runtime network request.
  - After the Web evidence is complete, remove only confirmed Web-owned paths from `miku-score`; then rerun Main Application browser-runtime, CLI bundle, core/format, and relevant full tests.
  - Update README, build/release documentation, publication workflows, and related-project references so the Web App's canonical repository and artifact ownership are unambiguous.

## Maintenance Record

- 2026-08-05 | miku-score | Node.js main application with historical Web surface | routine repository hygiene
  - Applied: aligned local-output ignore rules while retaining the tracked CLI runtime bundle as an explicit distribution exception.
  - Confirmed: existing `docs/.DS_Store` is ignored local Finder metadata and was left untouched.
  - Verification: `git check-ignore` coverage and final Git diff/status review.
  - Next action: resume the ABC I/O refactoring pass with focused characterization coverage.

- 2026-08-05 | miku-score | miku-soft standardization baseline
  - Applied: replaced copied shared miku-soft design documents with `docs/miku-soft-reference.md`.
  - Current state: this repository remains a historical combined `10 Main Application` and `11 Web App` layout.
  - Pending decisions: create `miku-score-web`; choose its upstream browser-compatible API/runtime contract; decide whether the main application publishes separate CLI and runtime bundles.
  - Deferred follow-up: after those decisions, perform the Node/Web separation workflow before changing release assets or GitHub Actions.

- 2026-08-05 | miku-score | Issue #198 Main Application rename
  - Applied: migrated the local product, package, CLI, Web App, Node.js runtime bundle, Release asset naming, generated files, and current documentation to `miku-score`.
  - Compatibility: the private package exposes only the canonical `miku-score` CLI; existing `mks:` metadata, the v1 analysis namespace, MIDI SysEx `app=mikuscore`, and the published utaformatix3 vendor API remain unchanged.
  - Verification: `npm run build`, CLI help/version, `npm run smoke:bundle`, and versioned Release-asset preparation all succeeded under the canonical name.
  - External repository step: a human maintainer renamed `igapyon/mikuscore` to `igapyon/miku-score`; this checkout's `origin` remote now uses the canonical URL.
  - Next action: create `miku-score-web` only after the repository rename, with the browser-compatible Main Application contract decided before moving Web files.

- 2026-08-06 | miku-score | Rename release recovery and family follow-up
  - Applied: prepared version `0.6.1`, regenerated the tracked CLI runtime bundle, and aligned CLI version coverage.
  - Applied: raised the stdin-to-stdout CLI test timeout to 10 seconds so the first heavy CLI runtime load does not fail under CI startup contention.
  - Verification: `npm run build`, versioned Release-asset preparation, and bundle smoke succeeded for `0.6.1`.
  - Release recovery order:
    1. recommit, publish, and merge the `0.6.1` change;
    2. a human creates the `v0.6.1` GitHub Release tag;
    3. verify that the Release workflow uploads `miku-score-0.6.1.mjs` and `miku-score-sources-0.6.1.tgz`.
  - Human GitHub setting: update the repository Homepage from `https://igapyon.github.io/mikuscore/` to `https://igapyon.github.io/miku-score/`.
  - Family follow-up: keep Issue #198 open until the Java repository, Agent Skills repository, and downstream `igapyon-agent-skills` references adopt the `miku-score` naming system.
  - Next phase: after the Release and Homepage work above, create `miku-score-web` with the browser-compatible Main Application contract decided before moving Web files.

## Specification

- [x] Create the first cross-format mapping table from the MusicXML canonical-state policy.
  - Current source of truth:
    - `docs/spec/CANONICAL_MUSICXML.md`
    - `docs/spec/FORMAT_MAPPING.md`
    - `docs/FORMAT_COVERAGE.md`
    - `docs/spec/FORMAT_IO_CHECKLIST.md`

- [x] Add current-boundary specs for MEI, LilyPond, and VSQX.
  - Added:
    - `docs/spec/MEI_IO.md`
    - `docs/spec/LILYPOND_IO.md`
    - `docs/spec/VSQX_IO.md`

- [x] Add explicit mapping sections to existing ABC, MIDI, and MuseScore specs.
  - Updated:
    - `docs/spec/ABC_IO.md`
    - `docs/spec/MIDI_IO.md`
    - `docs/spec/MUSESCORE_IO.md`

- [x] Align CFFP policy with the cross-format mapping table.
  - Source of truth:
    - `docs/spec/CANONICAL_MUSICXML.md`
    - `docs/spec/FORMAT_MAPPING.md`
    - `docs/FORMAT_COVERAGE.md`
    - `docs/spec/FORMAT_IO_CHECKLIST.md`
    - `docs/spec/TEST_CFFP.md`
  - Result:
    - documented how broad mapping categories relate to focused CFFP policy
    - recorded current notable exceptions such as MIDI `CFFP-ACCIDENTAL-RESET`
    - clarified that VSQX has no current notation-feature `must-preserve` CFFP claims

- [x] Document current stable conversion diagnostic codes.
  - Source of truth:
    - `docs/spec/DIAGNOSTICS.md`
    - `docs/spec/CONVERSION_DIAGNOSTICS.md`
    - `docs/spec/CLI_DIAGNOSTICS_FIRSTCUT.md`
    - `docs/spec/FORMAT_MAPPING.md`
    - format-specific I/O specs
  - Result:
    - separated core edit diagnostics from conversion import/export diagnostics
    - documented current stable ABC, MIDI, MuseScore, MEI, LilyPond, and VSQX conversion codes
    - recorded promotion rules for broad warning codes

- [ ] Promote broad conversion warnings into narrower stable codes only where callers need them.
  - Source of truth:
    - `docs/spec/CONVERSION_DIAGNOSTICS.md`
    - format-specific I/O specs
  - Scope:
    - split broad codes such as `ABC_IMPORT_WARNING`, `MUSESCORE_IMPORT_WARNING`, and `LILYPOND_IMPORT_WARNING` only for real tool-caller needs
    - keep message text human-readable but non-normative
    - add tests when a new stable code becomes part of public behavior

## CLI

- [ ] Add a CLI surface sync check whenever `src/ts/cli-api.ts` grows new or newly composable entry points.
  - Scope:
    - verify command/help/test coverage stays aligned across `src/ts/cli-api.ts`, `scripts/miku-score-cli.mjs`, and `tests/unit/miku-score-cli.spec.ts`
    - explicitly review newly composable one-shot routes such as `abc -> midi`, not only direct one-function facade additions
  - Expected follow-up:
    - add a lightweight maintenance checklist or coverage table so CLI-exposed routes do not get missed during future facade expansion

- [ ] Upstream the remaining downstream compatibility adjustments around `src/ts/cli-api.ts`.
  - Scope:
    - stabilize CLI selector resolution behavior so downstream-specific guard code is no longer needed
    - remove `Array.prototype.flatMap` usage from indexed measure-note building so the current `ES2018`-based isolated bundle path remains compatible
  - Expected follow-up:
    - add focused regression coverage for selector resolution edge cases

- [x] Document `convert`-first CLI naming consistently in all current-facing docs.
  - Recheck `README.md`, `docs/spec/CLI_STEP1.md`, and future notes after the command surface stabilizes.
  - Keep `import/export` as internal facade wording only, not CLI wording.

- [ ] Decide whether to keep the current local TypeScript-on-demand loader as the long-term CLI bootstrap.
  - Current path:
    - `scripts/miku-score-cli.mjs`
    - `scripts/lib/load-cli-api.mjs`
  - Re-evaluate whether Step 2 should keep this loader or move to a build-produced CLI entry.

- [ ] Investigate the root cause of `load-cli-api.mjs` runtime fragility before changing its compilation strategy.
  - Scope:
    - `scripts/lib/load-cli-api.mjs`
  - Current stance:
    - do not switch to a `tsc` CLI subprocess workaround without a clearer root-cause explanation
    - prefer understanding why direct runtime TypeScript loading fails in some environments before accepting a different bootstrap path

- [ ] Harden Step 2 MIDI conversion pairs.
  - Current first cut exists for:
    - `miku-score convert --from midi --to musicxml`
    - `miku-score convert --from musicxml --to midi`
  - Next checks:
    - keep MIDI export options internal for now; do not expose CLI flags yet
    - revisit CLI-level MIDI export options such as profile / metadata toggles only after the current fixed defaults prove insufficient

- [ ] Prepare VSQX CLI support by requesting upstream/integration-side changes to the vendored bridge first.
  - Current blocker:
    - current `vsqx` support depends on the vendored `utaformatix3-ts-plus` browser-oriented bridge shape, so the existing CLI cannot call it as a normal non-UI facade
  - Required external ask:
    - request a non-browser callable entrypoint or equivalent runtime shape from the integration/upstream side before wiring `musicxml <-> vsqx` into the CLI
  - Intended follow-up after that lands:
    - add `miku-score convert --from vsqx --to musicxml`
    - add `miku-score convert --from musicxml --to vsqx`
    - add matching CLI help and regression tests

- [x] Add MEI CLI conversion pairs around the existing reusable format I/O.
  - Target pairs:
    - `miku-score convert --from mei --to musicxml`
    - `miku-score convert --from musicxml --to mei`
  - Result:
    - extend `src/ts/cli-api.ts` with `mei` facade entries
    - wire `scripts/miku-score-cli.mjs` help and convert handlers
    - add CLI regression tests for stdin/file input, `--out`, and representative failures

- [x] Add LilyPond CLI conversion pairs around the existing reusable format I/O.
  - Target pairs:
    - `miku-score convert --from lilypond --to musicxml`
    - `miku-score convert --from musicxml --to lilypond`
  - Result:
    - extend `src/ts/cli-api.ts` with `lilypond` facade entries
    - wire `scripts/miku-score-cli.mjs` help and convert handlers
    - add CLI regression tests for stdin/file input, `--out`, and representative failures

- [x] Implement Step 3 conversion/render pairs.
  - Current first cut exists for:
    - `miku-score convert --from musescore --to musicxml`
    - `miku-score convert --from musicxml --to musescore`
    - `miku-score render svg`
  - Next checks:
    - expand file I/O support so `--from musicxml` can read `.mxl`
    - expand file I/O support so `--from musescore` can read `.mscz`
    - expand file I/O support so `--to musicxml` can write `.mxl` when `--out` ends with `.mxl`
    - expand file I/O support so `--to musescore` can write `.mscz` when `--out` ends with `.mscz`
    - keep `stdin` / `stdout` text-only for `musicxml` and `musescore`; ZIP support should apply to file paths only
    - move ZIP read/write behavior into reusable non-CLI helpers instead of adding ad hoc CLI-only logic
    - decide whether render options such as scale / page size should become CLI flags

- [x] Formalize CLI ZIP file I/O support for MusicXML and MuseScore.
  - Goal:
    - support `.mxl` and `.mscz` in CLI file input/output without changing the text-only `stdin` / `stdout` contract
  - Work breakdown:
    - [x] Freeze the CLI ZIP I/O contract in docs/TODO notes before code movement.
      - ZIP behavior applies only when `--in` / `--out` are file paths.
      - `stdin` / `stdout` stay text-only for `musicxml` and `musescore`.
      - extension-based handling is limited to `.mxl` and `.mscz`, not generic format auto-detection.
    - [x] Extract ZIP container primitives from UI-oriented code into reusable helpers.
      - split reusable ZIP read/write logic away from browser/download-specific payload code
      - keep helpers suitable for both app-side and CLI-side callers
    - [x] Make ZIP import helpers explicitly reusable for CLI file reads.
      - cover `.mxl -> MusicXML text`
      - cover `.mscz -> MuseScore text`
      - keep plain `.musicxml` / `.xml` / `.mscx` reads unchanged
    - [x] Make ZIP export helpers explicitly reusable for CLI file writes.
      - cover `MusicXML text -> .mxl bytes`
      - cover `MuseScore text -> .mscz bytes`
      - keep plain `.musicxml` / `.xml` / `.mscx` writes unchanged
    - [x] Refactor the CLI script to route file input through extension-aware readers.
      - `miku-score convert --from musicxml --in score.mxl ...`
      - `miku-score convert --from musescore --in score.mscz ...`
      - keep stdin path on the current text-only reader
    - [x] Refactor the CLI script to route file output through extension-aware writers.
      - `miku-score convert --to musicxml --out score.mxl ...`
      - `miku-score convert --to musescore --out score.mscz ...`
      - keep stdout path on the current text/binary writer behavior
    - [x] Add focused facade/API coverage around reusable ZIP helpers if the seam moves into `src/ts`.
      - avoid pushing ZIP branching back into `scripts/miku-score-cli.mjs`
      - keep conversion/business logic in reusable modules, not in the shell entrypoint
    - [x] Add CLI regression tests for ZIP file input.
      - `.mxl -> musicxml`
      - `.mscz -> musicxml`
      - representative invalid ZIP / missing entry failure cases if practical
    - [x] Add CLI regression tests for ZIP file output.
      - `musicxml -> .mxl`
      - `musicxml -> .mscz`
      - verify archive contents, not only file extension
    - [ ] Add bounded roundtrip checks where they provide signal without making the suite too heavy.
      - `musicxml -> .mxl -> musicxml`
      - `musicxml -> .mscz -> musicxml`
    - [x] Align current-facing docs after behavior lands.
      - `docs/spec/CLI_STEP1.md`
      - `docs/DEVELOPMENT.md`
      - `docs/future/CLI_ROADMAP.md`
      - `README.md`

- [x] Expand CLI tests together with each new conversion pair.
  - Cover file input, `stdin`, `--out`, and representative failure cases.
  - Keep `stdout` for payload and `stderr` for diagnostics only.

- [x] Record a future-facing CLI design note for AI-mediated workflows.
  - Motivation:
    - `mikuproject` shows that a CLI can be designed simultaneously for human operators, Agent Skills, and the downstream generative-AI interaction layer
    - the valuable lesson is not only "add AI commands", but "design the CLI contract so each layer can use it safely"
  - Preserve these candidate principles for future `miku-score` discussion:
    - keep human-readable command naming and composable stdio behavior
    - keep the main artifact on `stdout` and diagnostics on `stderr`
    - support machine-readable diagnostics when the caller is an agent or another tool
    - prefer bounded export / validate / apply-style phases over direct opaque mutation
    - design payload units that are small enough for AI handoff, not only for human CLI use
  - Likely document homes:
    - `docs/future/CLI_ROADMAP.md`
    - `docs/future/AI_JSON_INTERFACE.md`

- [x] Rebuild CLI taxonomy around `convert` / `render` / `state` while compatibility cost is still low.
  - Rationale:
    - current real-world CLI usage appears low enough that command-surface reconstruction is still feasible
    - `mikuproject` suggests that clearer top-level responsibility split can scale well
    - `miku-score` should keep `convert --from ... --to ...` inside `convert`, rather than multiplying fixed pair commands
  - Intended role split:
    - `convert`: interchange with external formats
    - `render`: derived outputs such as SVG, including user-facing one-shot flows like `ABC -> SVG` even if implemented internally as `ABC -> MusicXML -> SVG`
    - `state`: canonical `MusicXML` inspection, validation, patch-style mutation, and other light edit-oriented workflows
  - First specification questions:
    - whether `state summarize` / `state validate` / `state diff` / `state apply-patch` should be the initial reserved names
    - whether `render` should accept non-MusicXML user input and absorb internal conversion stages
    - how `--diagnostics text|json` should be shared consistently across all three families
  - Concrete next slices:
    - write a first-cut CLI taxonomy spec under `docs/spec/`
    - define help-text shape for top-level `convert` / `render` / `state`
    - decide migration wording from the current `convert`-first CLI to the rebuilt taxonomy

- [x] Add a user-facing one-shot `ABC -> SVG` CLI flow without breaking the internal `MusicXML`-first pipeline.
  - Intended shape:
    - external UX should allow a direct score-rendering path for ABC input
    - internal flow should still remain `ABC -> MusicXML -> SVG`
  - Specification questions:
    - whether this belongs under `render svg` with `--from abc`
    - whether `render` should accept only selected non-MusicXML inputs or remain narrow
    - how diagnostics should describe both the conversion and render stages when one-shot mode is used

- [x] Improve CLI failure handling so uncaught runtime errors stop leaking as raw JavaScript failures.
  - Goal:
    - turn current unhandled exception behavior into stable CLI-facing usage/processing failures
  - First slices:
    - define exit-code policy for usage error vs processing error
    - ensure stderr messages are human-readable by default
    - ensure `--diagnostics json` can still describe failure cases structurally

- [x] Define a first-cut CLI diagnostics contract modeled after the successful direction proven in `mikuproject`.
  - Scope:
    - `convert`
    - `render`
    - future `state`
  - First slices:
    - define the minimum shared JSON fields
    - decide how warnings vs errors appear in text mode
    - define whether multi-stage commands such as one-shot `ABC -> SVG` should report stage summaries
    - decide how much "kept vs dropped" conversion information can be surfaced briefly without becoming noisy

- [x] Align future `state` CLI naming with the existing core command catalog instead of inventing a second edit model.
  - Preserve:
    - existing bounded core commands such as `change_to_pitch`, `change_duration`, `insert_note_after`, `delete_note`, and `split_note`
  - Prefer:
    - workflow-phase CLI names like `state inspect-*`, `state validate-command`, `state apply-command`, `state diff`
    - optional patch envelopes if multiple core commands should be validated/applied together
  - Avoid:
    - exposing each core command as its own top-level CLI verb
    - introducing a whole-measure rewrite contract when a bounded command contract is sufficient

- [x] Define the `state` first cut around canonical `MusicXML` inspection and bounded mutation.
  - Candidate initial commands:
    - `state summarize`
    - `state inspect-measure`
    - `state validate-command`
    - `state apply-command`
    - `state diff`
  - First specification questions:
    - whether first cut should expose single-command apply before patch envelopes
    - what minimum inspect output is needed to support note-targeted edits reliably
    - whether tempo-level light edits should enter through the same bounded command path

- [x] Preserve "small edit" work as `MusicXML`-centered bounded mutation, not as a separate editing product line.
  - Scope:
    - pitch change
    - duration change
    - note insertion / deletion / split
    - likely future tempo-level light edits on canonical `MusicXML`
  - Editorial note:
    - treat "small edit feature", "`MusicXML`-centered light edit", and "diff-based edit" as the same theme seen from different layers

- [x] Explicitly keep some user suggestions out of near-term CLI scope.
  - Defer or omit for now:
    - batch conversion in CLI itself
    - lyrics/melody alignment diagnostics
    - MIDI-expression-specific CLI expansion as a priority over `MusicXML`-centered light edits
  - Rationale:
    - batch orchestration can live outside the CLI if single-shot behavior is composable
    - lyrics diagnostics is interesting but currently too heavy for the current first-cut scope
    - `miku-score` should strengthen canonical `MusicXML` editing before expanding MIDI-side tuning controls

## Facade

- [x] Establish the interim non-UI CLI facade and its format/state regression coverage.
  - Current facade functions include:
    - `importAbcToMusicXml(...)`
    - `exportMusicXmlToAbc(...)`
    - `importMidiToMusicXml(...)`
    - `exportMusicXmlToMidi(...)`
    - `importMuseScoreToMusicXml(...)`
    - `exportMusicXmlToMuseScore(...)`
    - `importMeiToMusicXml(...)`
    - `exportMusicXmlToMei(...)`
    - `importLilyPondToMusicXml(...)`
    - `exportMusicXmlToLilyPond(...)`
    - `renderMusicXmlToSvg(...)`
  - Result:
    - treat `src/ts/cli-api.ts` as the current compatibility surface, not the browser runtime contract
    - keep command routing, file I/O, and CLI diagnostics in `scripts/miku-score-cli.mjs`

- [ ] Move reusable product operations from the interim CLI facade to `runtime-api.ts`.
  - Follow Browser Runtime WBS Phase 2 and keep existing CLI wording and exit behavior stable through delegation.

- [ ] Re-evaluate `core/` boundaries only if reuse pressure becomes real.
  - Do not move conversion facade code into `core/` without a concrete need.

## Build

- [ ] Keep landing page CLI wording aligned with the current `convert` / `render` / `state` command split.
  - Current source of truth:
    - `index-src.html`
    - generated `index.html`
  - Remove stale `convert-first` wording from current-facing landing-page copy.

- [ ] Shorten and stabilize `npm run build:full`.
  - Current observation:
    - `typecheck` and `build:dist` are relatively small, but `test:build:full` dominates total time
    - the 2026-08-10 separation checkpoint completed `test:build:full` with 45 files / 823 tests; `tests/unit/playback-flow.spec.ts` completed in about 0.65 seconds, so the earlier 5-second timeout is not currently reproducible
    - heavy suites currently include `playback-flow`, `lilypond-io`, and `midi-roundtrip-golden`
    - `npm run test:all` also exposed a timeout in a heavy `musescore-io` roundtrip case under full-suite load
  - Next work:
    - profile `test:build:full` more deliberately and identify the longest suites/tests
    - decide whether more suites should move between `test:build`, `test:slow`, and `test:build:full`
    - continue monitoring the earlier `playback-flow` timeout rather than treating it as a current regression
    - consider Vitest worker/timeout settings only after the heavy-suite split is reasonably settled

- [ ] Re-evaluate heavy `musescore-io` roundtrip tests for full-suite runtime stability.
  - Current observation:
    - `tests/unit/musescore-io.spec.ts` roundtrip case `keeps sample7 measure 3-4 pitch spelling and accidentals on roundtrip` passed in isolation at about 6.6s but timed out at 10s during `npm run test:all`
    - the neighboring `sample7` roundtrip case also takes about 6.6s in isolation
    - recent CLI ZIP coverage increases total suite load, which may make marginal `musescore-io` tests fail under parallel contention
  - Next work:
    - first check whether the assertion can be narrowed so the test keeps its signal with less end-to-end work
    - consider moving the heaviest `sample7` roundtrip cases to a slower lane if they remain expensive
    - only raise per-test timeout after checking whether the case can be made cheaper or better isolated

## Refactoring Priorities

- [x] Introduce small cross-format score feature models where they reduce format-local branching.
  - Current observation:
    - `src/ts/abc-io.ts`, `src/ts/mei-io.ts`, `src/ts/lilypond-io.ts`, `src/ts/midi-io.ts`, and `src/ts/musescore-io.ts` each contain local handling for recurring score concepts such as dynamics, wedges, articulations, ornaments, slurs, ties, tempo, repeats, and barlines
    - tests currently verify many of these behaviors inside format-specific suites, which makes cross-format semantics harder to compare directly
    - ABC parsing already has `src/ts/abc-parser.ts` and `docs/spec/abc-compat-parser-ebnf.md`, so grammar-oriented cleanup is plausible, but parse output, semantic mapping, and MusicXML emission are still too entangled in `src/ts/abc-io.ts`
  - Direction:
    - move from format-local giant conditionals toward format adapters plus small feature-specific models
    - do not create one large generic score IR; MusicXML remains the canonical score state
    - introduce only narrow feature models when they simplify duplicated mapping and enable feature-level tests
  - Design note from the first implementation slice:
    - this direction worked best when the abstraction stayed small
    - keep `MusicXML` as the canonical score state and use feature models only as narrow adapters for repeated concepts such as dynamics and wedges
    - avoid turning feature models into a second canonical representation of the whole score
    - a feature model is justified when it removes duplicated format-local branching and gives the project a focused test surface
  - Implemented slices:
    - dynamics and wedges:
      - added a narrow feature vocabulary for dynamic marks and wedge directions
      - rewired ABC, MEI, LilyPond, MIDI, and MuseScore paths where the mapping was already local and low-risk
      - added feature-level coverage in `tests/unit/score-dynamics.spec.ts`
    - articulations:
      - added a narrow feature vocabulary for common MusicXML articulation elements
      - rewired ABC, MEI, LilyPond, and MuseScore paths without replacing format-specific parsing or non-articulation notation handling
      - added feature-level coverage in `tests/unit/score-articulations.spec.ts`
    - ornaments:
      - added a narrow feature vocabulary for simple MusicXML ornament elements and tremolo
      - rewired ABC, MEI, LilyPond, MIDI playback ornament detection, and MuseScore trill-mark paths where the mapping was already local
      - kept wavy-line spanner state and trill accidental details format-local
      - added feature-level coverage in `tests/unit/score-ornaments.spec.ts`
    - slurs:
      - added a narrow feature vocabulary for MusicXML slur start/stop, number, and placement
      - rewired ABC, MEI, LilyPond, MIDI slur detection, and MuseScore slur emission/extraction where the mapping was local
      - kept broader spanner state format-local
      - added feature-level coverage in `tests/unit/score-slurs.spec.ts`
    - ties:
      - added a narrow feature vocabulary for MusicXML `<tie>` sound ties and `<tied>` notation ties
      - rewired ABC, MEI, LilyPond, MIDI tie detection/emission, and MuseScore tie emission/extraction where the mapping was local
      - kept tie carry, pitch matching, and format-specific tie inference in the adapters
      - added feature-level coverage in `tests/unit/score-ties.spec.ts`
    - tempo and direction text:
      - added a narrow feature vocabulary for MusicXML direction words and `sound tempo`
      - rewired ABC, MEI, LilyPond, MIDI tempo emission, and MuseScore words/tempo extraction where the mapping was local
      - kept metronome beat-unit interpretation, jumps, markers, and format-specific direction semantics in the adapters
      - added feature-level coverage in `tests/unit/score-direction-text.spec.ts`
    - repeat and barline semantics:
      - added a narrow feature vocabulary for simple MusicXML barline location, bar-style, repeat directions, and ending markers
      - rewired MuseScore mid-measure repeat barline handling and LilyPond simple repeat/ending generation where the mapping was local
      - kept ABC `winged` / repeat `times` metadata and broader measure-level repeat policy format-local
      - added feature-level coverage in `tests/unit/score-barlines.spec.ts`
    - tuplets:
      - added a narrow feature vocabulary for MusicXML `<time-modification>` actual/normal note ratios
      - rewired ABC, MEI, LilyPond, and MuseScore time-modification XML generation where the mapping was local
      - kept tuplet start/stop notation state, numbering, bracket policy, and source-format tuplet interpretation in the adapters
      - added feature-level coverage in `tests/unit/score-tuplets.spec.ts`
    - clefs:
      - added a narrow feature vocabulary for MusicXML clef sign, line, and optional number
      - rewired ABC, MEI, LilyPond, MIDI, and MuseScore clef XML generation where the mapping was local
      - kept source-format clef inference, percussion policy, staff selection, and MuseScore-native clef tags in the adapters
      - added feature-level coverage in `tests/unit/score-clefs.spec.ts`
    - time signatures:
      - added a narrow feature vocabulary for MusicXML beats, beat-type, and optional symbol
      - rewired ABC, MEI, LilyPond, MIDI, and MuseScore time signature XML generation where the mapping was local
      - kept source-format meter parsing, time-change detection, and cut/common-time policy in the adapters
      - added feature-level coverage in `tests/unit/score-time-signatures.spec.ts`
    - key signatures:
      - added a narrow feature vocabulary for MusicXML fifths and optional mode
      - rewired ABC, MEI, LilyPond, MIDI, and MuseScore key signature XML generation where the mapping was local
      - kept source-format key parsing, key-change detection, and transposition policy in the adapters
      - added feature-level coverage in `tests/unit/score-key-signatures.spec.ts`
    - transposition:
      - added a narrow feature vocabulary for MusicXML diatonic/chromatic transpose values
      - rewired ABC, MEI, LilyPond, and MuseScore MusicXML transpose XML generation where the mapping was local
      - kept source-format transposition parsing and MuseScore-native transpose tags in the adapters
      - added feature-level coverage in `tests/unit/score-transposition.spec.ts`
    - duration dots:
      - added a small duration helper for MusicXML `<dot/>` item generation and counting
      - rewired MEI, LilyPond, MIDI, and MuseScore dot XML generation where the mapping was local
      - kept duration quantization, type selection, tuplet ratios, and source-format duration policy in the adapters
      - added feature-level coverage in `tests/unit/score-durations.spec.ts`
    - note elements:
      - added small helpers for MusicXML accidental, grace, lyric, stem, fingering, string, and technical item generation
      - rewired ABC, MEI, LilyPond, MIDI, and MuseScore accidental XML generation where the mapping was local
      - rewired ABC, MEI, LilyPond, and MuseScore MusicXML grace item generation where the mapping was local
      - rewired ABC, MEI, and LilyPond lyric XML generation where the mapping was local
      - rewired MEI stem XML generation where the mapping was local
      - rewired ABC and MuseScore fingering/string/technical XML generation where the mapping was local
      - kept MuseScore-native grace tags, MEI grace groups, trill accidental marks, and source-format grace interpretation in the adapters
      - added feature-level coverage in `tests/unit/score-note-elements.spec.ts`
    - measure flow controls:
      - added small helpers for MusicXML `<backup>` and `<forward>` controls
      - rewired MEI, LilyPond, MIDI, and MuseScore backup/forward XML generation where the mapping was local
      - kept layer/voice/staff timing calculations in the adapters
      - added feature-level coverage in `tests/unit/score-measure-flow.spec.ts`
    - pitches:
      - added a narrow feature vocabulary for MusicXML pitch step, alter, and octave
      - rewired ABC, MEI, LilyPond, MIDI, and MuseScore pitch XML generation where the mapping was local
      - kept source-format pitch parsing, accidental spelling policy, carried alter state, and rest/chord decisions in the adapters
      - added feature-level coverage in `tests/unit/score-pitches.spec.ts`
    - beam items:
      - added MusicXML beam item generation to the existing `src/ts/beam-common.ts` helper module
      - rewired ABC, MIDI, and MuseScore beam XML generation where the mapping was local
      - kept beam assignment, explicit beam mode handling, and beat-boundary policy in the existing beam computation path
      - added focused coverage in `tests/unit/beam-common.spec.ts`
  - Model examples:
    - dynamics and wedges:
      - dynamic marks such as `pp`, `p`, `mp`, `mf`, `f`, `ff`, `sfz`
      - wedge controls such as crescendo, diminuendo, and stop with measure offset / staff context where available
    - articulations:
      - common MusicXML articulation tags such as `staccato`, `accent`, `tenuto`, `strong-accent`, `breath-mark`, and `caesura`
    - ornaments:
      - common MusicXML ornament tags such as `trill-mark`, `turn`, `inverted-turn`, `mordent`, `inverted-mordent`, `shake`, `schleifer`, and `tremolo`
    - slurs:
      - MusicXML slur controls with `type`, `number`, and start placement
    - ties:
      - MusicXML tie controls that preserve the distinction between direct `<tie>` and notation `<tied>`
    - tempo and direction text:
      - MusicXML direction words, optional font style, placement, and `sound tempo`
    - repeat and barline semantics:
      - simple MusicXML barline controls with location, bar-style, repeat directions, and ending markers
    - tuplets:
      - MusicXML time-modification controls with positive rounded `actual-notes` and `normal-notes`
    - clefs:
      - MusicXML clef controls with `sign`, `line`, and optional staff `number`
    - time signatures:
      - MusicXML time signature controls with positive rounded `beats`, `beat-type`, and optional `symbol`
    - key signatures:
      - MusicXML key signature controls with rounded `fifths` and optional `mode`
    - transposition:
      - MusicXML transpose controls with rounded optional `diatonic` and `chromatic` values
    - duration dots:
      - MusicXML dot items from normalized dot counts
    - note elements:
      - MusicXML accidental, grace, lyric, stem, fingering, string, and technical items
    - measure flow controls:
      - MusicXML backup/forward controls with normalized durations and optional voice/staff context
    - pitches:
      - MusicXML pitch controls with normalized `step`, optional nonzero `alter`, and bounded `octave`
    - beam items:
      - MusicXML beam item controls from existing beam assignments
  - Follow-up stance:
    - keep reviewing the feature-model slices during nearby changes
    - a first cleanup pass removed additional local words/tempo and simple barline XML generation where it was clearly equivalent
    - remaining direct XML assembly is mostly format-specific wrapping, wavy-line/trill detail, ABC repeat metadata, MEI measure policy, or notation container composition
    - avoid expanding the shared models further until a real duplication or test-surface problem appears
  - Test direction:
    - add feature-level unit tests next to the new model before rewiring multiple formats
    - keep existing format-specific regression tests as safety coverage
    - compare equivalent feature extraction/emission across formats where behavior is intentionally shared
  - Constraints:
    - preserve current public entry points such as `convertAbcToMusicXml(...)`, `exportMusicXmlDomToAbc(...)`, `convertMeiToMusicXml(...)`, and related CLI facade calls
    - extract one feature at a time; do not redesign every format module in one pass
    - avoid hiding format-specific loss, approximation, or unsupported behavior behind an over-general abstraction

- [ ] Long-range: revisit the large format I/O modules with a review-first pass, not an immediate rewrite.
  - Target modules:
    - `src/ts/musescore-io.ts`
    - `src/ts/musicxml-io.ts`
  - Intended first step:
    - map public entry points, responsibility blocks, and current test coverage before changing structure
    - classify findings into low-risk cleanup, characterization-test-first work, and intentionally deferred ideas
  - Current stance:
    - do not start a broad split while the current ZIP / MXL cleanup is still being finalized
    - treat this as a distant refactoring theme to return to when there is a concrete format-coverage or maintenance need

- [ ] Start the next refactoring pass from the format I/O modules before expanding format coverage.
  - Priority order:
    - `src/ts/abc-io.ts`: highest priority because ABC layout work is already waiting on cleaner parse/layout/emission boundaries.
    - `src/ts/musescore-io.ts`: next priority because MuseScore import/export/helper logic is still concentrated in one large module.
    - `src/ts/musicxml-io.ts`: watch only; keep it under light review unless helper growth accelerates.
  - Explicit non-targets for this pass:
    - `bundle/miku-score.mjs` is a generated bundle and should not be refactored directly.
    - `src/js/main.js` is generated output; change TypeScript sources instead.
  - Start checklist:
    - run `npm run typecheck` and `npm run test:unit` before structural edits to establish the baseline
    - keep public conversion entry points stable while moving internals
    - move one responsibility boundary at a time, then rerun focused tests for that format
    - prefer characterization coverage before moving behavior that is not already covered

## ABC

- [ ] Refactor `src/ts/abc-io.ts` before continuing larger ABC layout expansion.
  - Current concern:
    - recent `%%score` / grouped-staff work was implemented as a bounded first cut
    - behavior now works for the targeted case, but the code shape is still too incremental
  - Current status:
    - the first in-file staged cleanup is well underway
    - `parseForMusicXml(...)` is now much closer to orchestration, with line parsing, layout derivation, body entry dispatch, and post-processing split into helpers
    - pending note-state application and playable-event/body-token dispatch have also been thinned substantially
    - export-side grouped-staff measure rendering, header generation, repeat/ending barline assembly, note serialization, note-level precomputation, measure-note rendering, top-level part rendering, document-shell assembly, and export-context calculation are now also partially helperized
    - MusicXML-to-ABC export-side clef resolution, key-signature accidental lookup, accidental-text mapping, and optional-number parsing have also been pulled out of the main export function
    - MusicXML-to-ABC export-side part-name lookup and lane definition / lane-name construction have also been pulled out of the main export function
    - MusicXML-to-ABC export-side transpose and diagnostic meta-line construction have also been pulled out of the main export function
    - MusicXML-to-ABC export-side measure meta-line construction has also been pulled out of the main export function
    - MusicXML-to-ABC export-side direction pending-word / decoration handling has also been pulled out of the main export function
    - MusicXML-to-ABC export-side staff/voice lane note filtering has also been pulled out of the main export function
    - MusicXML-to-ABC export-side pitch / accidental token construction has also been pulled out of the main export function
    - MusicXML-to-ABC export-side grace-token pending updates have also been pulled out of the main export function
    - MusicXML-to-ABC export-side time-modification reading and note length-token construction have also been pulled out of the main export function
    - MusicXML-to-ABC export-side active tuplet prefix / remaining-count updates have also been pulled out of the main export function
    - MusicXML-to-ABC export-side queued harmony / words / direction / grace event-prefix handling has also been pulled out of the main export function
    - MusicXML-to-ABC export-side trill accidental meta-line construction has also been pulled out of the main export function
    - MusicXML-to-ABC export-side technical decoration prefix construction has also been pulled out of the main export function
    - MusicXML-to-ABC export-side fermata decoration prefix construction has also been pulled out of the main export function
    - MusicXML-to-ABC export-side articulation decoration prefix construction has also been pulled out of the main export function
    - MusicXML-to-ABC export-side ornament / glissando / slide / arpeggiate prefix construction has also been pulled out of the main export function
    - MusicXML-to-ABC export-side lyric token / extension updates have also been pulled out of the main export function
    - MusicXML-to-ABC export-side pending note/chord event token serialization has also been pulled out of the main export function
    - MusicXML-to-ABC export-side pending note/chord event creation and chord-pitch updates have also been pulled out of the main export function
    - MusicXML-to-ABC export-side note event derived-value reading has also been pulled out of the main export function
    - MusicXML-to-ABC export-side note event-prefix assembly has also been pulled out of the main export function
    - MusicXML-to-ABC export-side trailing grace, empty-measure rest, and measure text finalization have also been pulled out of the main export function
    - MusicXML-to-ABC export-side measure repeat / ending boundary reading has also been pulled out of the main export function
    - MusicXML-to-ABC export-side measure divisions / key / time state updates have also been pulled out of the main export function
    - MusicXML-to-ABC export-side measure meta / diagnostic meta-line appending has also been pulled out of the main export function
    - MusicXML-to-ABC export-side note event number / pending-event updates have also been pulled out of the main export function
    - MusicXML-to-ABC export-side harmony / direction child dispatch has also been pulled out of the main export function
    - MusicXML-to-ABC export-side grace-note child dispatch has also been pulled out of the main export function
    - MusicXML-to-ABC export-side note event tuplet / lyric state updates have also been pulled out of the main export function
    - MusicXML-to-ABC export-side note child processing has also been pulled out of the main export function
    - MusicXML-to-ABC export-side measure child-loop processing has also been pulled out of the main export function
    - MusicXML-to-ABC export-side measure rendering has also been pulled out of the main export function
    - MusicXML-to-ABC export-side lane rendering has also been pulled out of the main export function
    - MusicXML-to-ABC export-side part rendering has also been pulled out of the main export function
    - MusicXML-to-ABC export-side document context creation and final document assembly have also been pulled out of the main export function
    - MusicXML-to-ABC export-side part iteration has also been pulled out of the main export function
    - MusicXML-to-ABC export-side lane header and lane body appending have also been split inside lane rendering
    - MusicXML-to-ABC export-side lane initial key and measure-state creation have also been pulled out of lane body appending
    - MusicXML-to-ABC export-side lane body rendering has also been split from appending rendered lane lines
    - MusicXML-to-ABC export-side rendered lane line appending has also been pulled out of lane body appending
    - MusicXML-to-ABC export-side part render-info creation has also been pulled out of part rendering
    - MusicXML-to-ABC export-side part lane appending has also been pulled out of part rendering
    - MusicXML-to-ABC export-side document header-info creation and header-line assembly have also been split from document context creation
    - MusicXML-to-ABC export-side tempo header construction has also been pulled out of document header-info creation
    - MusicXML-to-ABC export-side document credit and meter/key reading have also been pulled out of document header-info creation
    - MusicXML-to-ABC export-side initial document-context assembly has also been pulled out of document context creation
    - MusicXML-to-ABC export-side final document text assembly now consumes the export document context directly
    - MusicXML-to-ABC export-side part render-context creation has also been pulled out of part iteration
    - MusicXML-to-ABC export-side part element reading has also been pulled out of part iteration
    - MusicXML-to-ABC export-side rendered document-context creation has also been pulled out of the public export function
    - MusicXML-to-ABC export-side part appending now consumes pre-read part elements
    - MusicXML-to-ABC export-side final meta-block assembly has also been pulled out of document text assembly
    - MusicXML-to-ABC export-side first-measure reading has also been pulled out of document header-info creation
    - MusicXML-to-ABC export-side title and composer reading have also been pulled out of document credit reading
    - MusicXML-to-ABC export-side document meter and key reading have also been split inside document meter/key reading
    - MusicXML-to-ABC export-side document key-name conversion has also been pulled out of document key reading
    - MusicXML-to-ABC export-side raw header-line assembly has also been split from final header-line filtering
    - MusicXML-to-ABC export-side tempo-header formatting has also been split from initial tempo reading
    - MusicXML-to-ABC export-side unit tempo and fallback tempo header formatting have also been split
    - MusicXML-to-ABC export-side unit tempo-header eligibility has also been pulled out of unit tempo formatting
    - MusicXML-to-ABC export-side document header-info assembly has also been split from document DOM reading
    - MusicXML-to-ABC export-side document meter beats and beat-type reading have also been pulled out of document meter reading
    - MusicXML-to-ABC export-side document key fifths and mode reading have also been pulled out of document key reading
    - MusicXML-to-ABC export-side document meter/key info assembly has also been split from document meter/key reading
    - MusicXML-to-ABC export-side document header unit length and export unit length now share the same default unit constant
    - MusicXML-to-ABC export-side harmony pitch-token construction has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side harmony kind suffix conversion has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side harmony pitch-token node reading has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side harmony kind text override handling has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side harmony pitch XML construction has also been pulled out of ABC chord-symbol-to-harmony conversion
    - MusicXML-to-ABC export-side ABC chord-symbol parsing has also been pulled out of chord-symbol-to-harmony conversion
    - MusicXML-to-ABC export-side harmony kind XML construction has also been pulled out of chord-symbol-to-harmony conversion
    - MusicXML-to-ABC export-side ABC chord-symbol matching now uses a shared pattern for likelihood checks and parsing
    - MusicXML-to-ABC export-side harmony bass-token construction has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side harmony kind-value reading has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side final harmony chord-symbol assembly has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side harmony pitch DOM reading has also been split from harmony pitch-token construction
    - MusicXML-to-ABC export-side harmony suffix reading from kind nodes has also been pulled out of harmony-to-ABC chord-symbol conversion
    - MusicXML-to-ABC export-side final harmony XML assembly has also been pulled out of ABC chord-symbol-to-harmony conversion
    - MusicXML-to-ABC export-side harmony pitch typing is now shared between chord-symbol parsing and MusicXML harmony reading
    - MusicXML-to-ABC export-side ABC harmony suffix normalization has also been split from suffix-to-kind conversion
    - MusicXML-to-ABC export-side MusicXML harmony kind-value normalization has also been split from kind-node reading
    - MusicXML-to-ABC export-side lyric text normalization has also been pulled out of MusicXML lyric-token conversion
    - MusicXML-to-ABC export-side lyric syllabic-mode normalization has also been pulled out of MusicXML lyric-token conversion
    - MusicXML-to-ABC export-side lyric continuation-hyphen decision has also been pulled out of MusicXML lyric-token conversion
    - MusicXML-to-ABC export-side final lyric text-token assembly has also been pulled out of MusicXML lyric-token conversion
    - MusicXML-to-ABC export-side MusicXML type-name normalization has also been pulled out of type fallback handling
    - MusicXML-to-ABC export-side MusicXML type-name support checks have also been pulled out of type fallback handling
    - MusicXML-to-ABC export-side MusicXML voice text normalization has also been pulled out of voice fallback handling
    - MusicXML-to-ABC export-side MusicXML voice positive-integer checks have also been pulled out of voice fallback handling
    - MusicXML-to-ABC export-side MusicXML voice number-text extraction has also been pulled out of voice fallback handling
    - MusicXML-to-ABC export-side MusicXML voice number-text normalization has also been pulled out of voice fallback handling
    - ABC import-side clef inference step normalization has also been pulled out of note-to-MIDI conversion
    - ABC import-side clef inference octave normalization has also been pulled out of note-to-MIDI conversion
    - ABC import-side clef inference alter normalization has also been pulled out of note-to-MIDI conversion
    - ABC import-side clef inference MIDI pitch assembly has also been pulled out of note-to-MIDI conversion
    - ABC import-side explicit clef-name normalization has also been pulled out of clef inference
    - ABC import-side clef inference MIDI-key collection has also been pulled out of clef resolution
    - ABC import-side inferred clef-name selection has also been pulled out of clef resolution
    - ABC import-side clef XML conversion now reuses the shared clef-name normalization
    - ABC import-side clef-name-to-feature mapping has also been pulled out of clef XML conversion
    - ABC import-side debug metadata step normalization has also been pulled out of debug misc XML assembly
    - ABC import-side debug metadata octave normalization has also been pulled out of debug misc XML assembly
    - ABC import-side debug metadata alter normalization has also been pulled out of debug misc XML assembly
    - ABC import-side debug metadata payload assembly has also been pulled out of debug misc XML assembly
    - ABC import-side debug metadata core-field assembly has also been pulled out of debug metadata payload assembly
    - ABC import-side debug metadata count-field assembly has also been pulled out of debug misc XML assembly
    - ABC import-side ABC source misc XML chunk-field assembly has also been pulled out of source misc XML assembly
    - ABC import-side ABC source misc XML header-field assembly has also been pulled out of source misc XML assembly
    - ABC import-side ABC source misc XML encoding has also been pulled out of source misc XML assembly
    - ABC import-side ABC source misc XML chunking has also been pulled out of source misc XML assembly
    - ABC import-side ABC source misc XML metrics assembly has also been pulled out of source misc XML header assembly
    - ABC import-side ABC source misc XML length-field assembly has also been pulled out of source misc XML metrics assembly
    - ABC import-side ABC source misc XML raw-length field assembly has also been pulled out of source misc XML length-field assembly
    - ABC import-side ABC source misc XML raw-encoded-length field assembly has also been pulled out of source misc XML length-field assembly
    - ABC import-side ABC source misc XML state-field assembly has also been pulled out of source misc XML metrics assembly
    - ABC import-side ABC source misc XML chunk-count field assembly has also been pulled out of source misc XML state-field assembly
    - ABC import-side ABC source misc XML truncated field assembly has also been pulled out of source misc XML state-field assembly
    - ABC import-side ABC source misc XML body assembly has also been pulled out of source misc XML assembly
    - ABC import-side ABC source misc XML body field list assembly has also been pulled out of source misc XML body assembly
    - ABC import-side ABC source misc XML body header field items assembly has also been pulled out of source misc XML body field list assembly
    - ABC import-side ABC source misc XML body chunk field parts assembly has also been pulled out of source misc XML body field list assembly
    - ABC import-side ABC source misc XML chunk-entry assembly has also been pulled out of source misc XML body assembly
    - ABC import-side ABC source misc XML chunk entry parts assembly has also been pulled out of source misc XML chunk-entry assembly
    - ABC import-side ABC source misc XML chunk entry assembly has also been pulled out of source misc XML chunk entry parts assembly
    - ABC import-side ABC source misc XML chunk fields XML assembly has also been pulled out of source misc XML chunk-field assembly
    - ABC import-side ABC diagnostic misc XML payload assembly has also been pulled out of diagnostic misc XML assembly
    - ABC import-side ABC diagnostic misc XML core field parts assembly has also been pulled out of diagnostic misc XML payload assembly
    - ABC import-side ABC diagnostic misc XML optional-field assembly has also been pulled out of diagnostic misc XML payload assembly
    - ABC import-side ABC diagnostic misc XML optional-field parts assembly has also been pulled out of diagnostic misc XML optional-field assembly
    - ABC import-side ABC diagnostic misc XML numeric optional-field assembly has also been pulled out of diagnostic misc XML optional-field assembly
    - ABC import-side ABC diagnostic misc XML numeric optional-field parts assembly has also been pulled out of diagnostic misc XML numeric optional-field assembly
    - ABC import-side ABC diagnostic misc XML measure optional-field assembly has also been pulled out of diagnostic misc XML numeric optional-field assembly
    - ABC import-side ABC diagnostic misc XML measure optional-field parts assembly has also been pulled out of diagnostic misc XML measure optional-field assembly
    - ABC import-side ABC diagnostic misc XML moved-events optional-field assembly has also been pulled out of diagnostic misc XML numeric optional-field assembly
    - ABC import-side ABC diagnostic misc XML moved-events optional-field parts assembly has also been pulled out of diagnostic misc XML moved-events optional-field assembly
    - ABC import-side ABC diagnostic misc XML text optional-field assembly has also been pulled out of diagnostic misc XML optional-field assembly
    - ABC import-side ABC diagnostic misc XML text optional-field parts assembly has also been pulled out of diagnostic misc XML text optional-field assembly
    - ABC import-side ABC diagnostic misc XML count field assembly has also been pulled out of diagnostic misc XML assembly
    - ABC import-side ABC diagnostic misc XML entry list assembly has also been pulled out of diagnostic misc XML assembly
    - ABC import-side ABC diagnostic misc XML entry list item assembly has also been pulled out of diagnostic misc XML entry list assembly
    - ABC import-side ABC diagnostic misc XML entry list parts assembly has also been pulled out of diagnostic misc XML entry list assembly
    - ABC import-side ABC diagnostic misc XML entry name assembly has also been pulled out of diagnostic misc XML entry assembly
    - ABC import-side ABC diagnostic misc XML entry payload assembly has also been pulled out of diagnostic misc XML entry assembly
    - ABC import-side ABC diagnostic misc XML core-field assembly has also been pulled out of diagnostic misc XML payload assembly
    - ABC import-side ABC measure debug misc XML entry parts assembly has also been pulled out of measure debug misc XML assembly
    - ABC import-side ABC diagnostic misc XML entry assembly has also been pulled out of diagnostic misc XML assembly
    - ABC import-side note notations guard evaluation has also been pulled out of note notations assembly
    - ABC import-side note notations feature chunk assembly has also been pulled out of note notations assembly
    - ABC import-side note articulations feature-kind assembly has also been pulled out of note articulations assembly
    - ABC import-side note articulations feature items assembly has also been pulled out of note articulations assembly
    - ABC import-side note technical collection assembly has also been pulled out of note technical assembly
    - ABC import-side note technical collection item assembly has also been pulled out of note technical collection assembly
    - ABC import-side note technical flag assembly has also been pulled out of note technical assembly
    - ABC import-side note technical plain-parts assembly has also been pulled out of note technical assembly
    - ABC import-side note core open-parts assembly has also been pulled out of note core assembly
    - ABC import-side note core tail modifier assembly has also been pulled out of note core assembly
    - ABC import-side note ornaments feature assembly has also been pulled out of note ornaments assembly
    - ABC import-side note ornaments motion item assembly has also been pulled out of note ornaments assembly
    - ABC import-side rendered measure misc selector assembly has also been pulled out of rendered measure misc assembly
    - ABC import-side rendered measure diag misc selection has also been pulled out of rendered measure misc assembly
    - ABC import-side measure header initial/update assembly has also been pulled out of measure header assembly
    - ABC import-side measure header update key/time field assembly has also been pulled out of measure header update assembly
    - ABC import-side measure header update key/time XML assembly has also been pulled out of measure header update field assembly
    - ABC import-side part wrapper and body parts assembly has also been pulled out of part XML assembly
    - ABC import-side part body part entry assembly has also been pulled out of part body assembly
    - ABC import-side part body part items assembly has also been pulled out of part body part entry assembly
    - ABC import-side part measure entry assembly has also been pulled out of part XML measures assembly
    - ABC import-side part measure entry parts assembly has also been pulled out of part XML measure entries assembly
    - ABC import-side part list entry assembly has also been pulled out of part list XML assembly
    - focused characterization coverage now also includes grouped `%%score` multi-measure backup emission and grouped repeat/ending restoration
    - the file is much more segmented than before, but it is still not yet at a split-ready boundary
  - Use the same staged refactoring pattern proven in `src/ts/musicxml-io.ts`:
    - first make responsibility blocks explicit inside the current file
    - then extract small document/part/measure helpers with stable behavior
    - only after the internal seams are clear, re-evaluate file splits
  - Refactor goals:
    - separate ABC parse / compatibility / intermediate-model / MusicXML-render responsibilities more clearly
    - reduce the amount of layout-specific branching embedded directly in MusicXML emission
    - avoid continuing to grow the current `optional field on existing structure` pattern without a cleaner model
  - Immediate start:
    - focused characterization coverage for grouped-staff lyrics and grouped key/meter/tempo changes is now present in `tests/unit/abc-io.spec.ts`
    - continue the existing in-file cleanup around export helper ordering / section boundaries
    - after the next cleanup slice, re-evaluate whether the first small helper module can be extracted safely
  - Focused verification:
    - `npm run typecheck`
    - `npx vitest run tests/unit/abc-io.spec.ts tests/unit/abc-roundtrip-golden.spec.ts tests/unit/abc-inline-voice-switch.spec.ts`

- [ ] Refactoring series 1: freeze current ABC behavior with characterization coverage before moving code.
  - Expand focused tests around:
    - `%%score` grouped import
    - plain multi-voice import without grouping
    - inline `[V:...]` switching
    - existing export behavior for multi-staff MusicXML parts
  - Goal:
    - make current bounded behavior explicit before reshaping internals
  - Current status:
    - inline `[V:...]` switching and bounded `%%score` grouped import are already covered
    - grouped-staff characterization now also covers multi-measure `<backup>` emission and grouped repeat/ending restoration
    - grouped-staff lyrics and grouped key/meter/tempo changes are also covered in `tests/unit/abc-io.spec.ts`

- [ ] Refactoring series 2: isolate score-layout parsing from the rest of ABC import.
  - Split out the logic that currently derives:
    - declared voice ids
    - `%%score` ordering/grouping
    - grouped-staff layout decisions
  - Target result:
    - a small layout-oriented helper/module with narrow inputs/outputs
  - First slice:
    - identify the current boundary between ABC document parsing and score-layout derivation
    - extract only the layout-reading path first, without changing current grouped import behavior
  - Current status:
    - the initial slice is already started in-file via `parseAbcScoreLayout(...)`, `parseAbcScoreVoiceOrder(...)`, and related voice-registry/body-entry helpers
    - document parsing and layout derivation are clearer than before
    - normalized voice data, primary voice resolution, grouped part naming, and `staffVoices` construction are also now more explicit
    - grouped-staff layout decisions are still partially entangled with later part construction, so this series is progressing but not complete

- [ ] Refactoring series 3: introduce a clearer intermediate layout model for ABC import.
  - Replace or normalize the current `voice -> optional grouped staff` flow into an explicit model for:
    - score order
    - grouped parts
    - staves
    - voices / lanes
  - Do this before adding broader multi-staff semantics.
  - Constraint:
    - avoid expanding ABC layout semantics during this step; keep the current bounded behavior and make the model clearer first

- [ ] Refactoring series 4: split MusicXML emission into smaller helpers with stable boundaries.
  - Separate:
    - part-list generation
    - per-measure attribute generation
    - note serialization
    - grouped-staff measure emission with `<backup>`
  - Keep output stable while reducing the size of the current monolithic emitter.
  - Current status:
    - this has advanced through helper extraction around normalized voice data, part construction, body event rendering, grouped-staff note emission, measure header generation, repeat/ending barline generation, `buildMeasureNotesXml(...)` decomposition, beam/empty-measure note precomputation, top-level measure-note rendering, and top-level part-list / part-body / document / export-context orchestration
    - per-part state initialization, per-measure misc assembly, note leading-direction grouping, note core subfragments, and note-notations subgroups are also now helperized
    - grouped-staff MusicXML emission and note serialization are much clearer than before, but the exporter is still not fully separated into stable module-sized boundaries
  - Resume here next time:
    - continue from the remaining seams around export helper ordering / section boundaries in `src/ts/abc-io.ts`, or decide this series is "good enough" and switch effort to characterization coverage
    - if one more refactor slice is desired, the remaining candidates are mostly helper grouping/ordering rather than large logic blocks
    - if pausing the refactor, the most valuable immediate follow-up is focused characterization coverage for grouped-staff lyrics and grouped key/meter/tempo changes

- [ ] Refactoring series 5: make grouped-staff emission follow the same model as ordinary part emission.
  - Goal:
    - grouped staff should not feel like a special-case appendage
    - single-part and grouped-part rendering should share a normal pipeline as much as possible
  - Re-evaluate whether `staffVoices` remains the right structure after series 3 and 4.

- [ ] Refactoring series 6: move policy decisions out of ad hoc implementation details.
  - Decide and document separately:
    - grouped part naming policy
    - import-only vs export policy for bounded `%%score (...)`
    - relationship between bounded `%%score` support and still-unsupported `V:` properties
  - Avoid burying those decisions only in serializer code.

- [ ] Refactoring series 7: prune and simplify `src/ts/abc-io.ts` after the new structure lands.
  - Remove transitional helpers and compatibility glue that were only needed during the migration.
  - Re-check whether some code should remain in `abc-io.ts` or move into narrower files.

- [ ] Refactoring series 8: only after the structural cleanup, resume larger ABC layout expansion.
  - Candidate follow-ups after the refactor series:
    - broader `%%score` patterns
    - clearer export behavior for grouped staves
    - any future decision on `brace` / `bracket` / `staves`
  - Do not expand semantics first and refactor later again.

- [ ] Design a clearer ABC internal layout model before expanding multi-staff support further.
  - Re-evaluate whether the current `AbcParsedPart` shape should be replaced or normalized into something closer to:
    - score layout groups
    - parts
    - staves
    - voices / lanes
  - Aim:
    - make `single part`, `multi-part`, and bounded `multi-staff` import paths look like normal cases of one model instead of ad hoc branches

- [ ] Extract or reorganize MusicXML emission helpers in `src/ts/abc-io.ts`.
  - Candidate split points:
    - part-list generation
    - measure attribute generation
    - note serialization
    - grouped-staff / backup emission
  - Keep behavior unchanged while making later ABC layout work easier to reason about.

- [ ] Finish bounded grand-staff import support around `%%score`.
  - Current first cut exists for:
    - `%%score (1 2)` grouped voices importing as `1 part + multiple staves`
    - emitting `<staves>`, staff-numbered clefs, per-note `<staff>`, and `<backup>` between grouped staves
    - regression coverage for the minimal grouped-two-staff case
  - Keep current scope clear:
    - this is bounded `%%score (...)` grouping support
    - this is not yet full ABC multi-staff layout parity
    - broader `V:` properties such as `staves`, `brace`, and `bracket` remain unsupported

- [ ] Audit `%%score` parsing against common practical patterns before expanding semantics.
  - Check:
    - multiple grouped blocks such as `%%score (1 2) (3 4)`
    - mixed grouped + ungrouped order such as `%%score (1 2) 3`
    - repeated / malformed ids and current fallback behavior
  - Add focused tests for accepted and intentionally rejected forms.

- [ ] Decide the bounded naming policy for grouped-part import from ABC.
  - Current first cut joins grouped voice names as `Upper / Lower`.
  - Re-evaluate whether grouped import should:
    - keep the first voice name only
    - join names
    - prefer an explicit future grouping label if one is introduced

- [ ] Strengthen grouped-staff MusicXML emission for non-trivial measures.
  - Verify and test:
    - underfull / overfull handling per grouped staff
    - lyrics on grouped staves
    - tempo / key / meter changes while grouped
    - tuplets / beams / ornaments with grouped staff output
    - pickup measures and repeat-ending metadata in grouped parts

- [ ] Revisit ABC export policy for multi-staff MusicXML parts.
  - Current export still splits MusicXML lanes into separate `V:` sections.
  - Decide whether MusicXML multi-staff parts should:
    - remain exported as separate `V:` lanes only
    - emit bounded `%%score (...)` grouping on export
    - later emit additional grouping hints while still avoiding unsupported `V:` properties

- [ ] Decide whether bounded `%%score` grouping should remain compatibility-only or be promoted in spec wording.
  - Align:
    - `docs/spec/ABC_IO.md`
    - `docs/spec/ABC_STANDARD_COVERAGE.md`
    - `README.md`
  - Keep the wording precise about what is and is not supported.

## MuseScore

- [ ] Refactor `src/ts/musescore-io.ts` before further expanding MuseScore format coverage.
  - Current concern:
    - import, export, and many format-specific helpers are concentrated in one large file
    - future behavior changes will get harder to reason about if the file keeps growing in place
  - Current status:
    - the first in-file staged refactor pass has been completed
    - MuseScore export now has clearer metadata / part scaffold / measure context / staff state / voice rendering seams
    - import-side and export-side responsibility blocks are more explicit than before, but they still live in one file
  - Use the same staged refactoring pattern proven in `src/ts/musicxml-io.ts`:
    - first make responsibility blocks explicit inside the current file
    - then extract stable import/export/helper seams before any module split
    - keep public entry points stable while reshaping internals
  - Refactor goals:
    - separate MuseScore import, MuseScore export, and shared helper responsibilities more clearly
    - reduce the amount of deeply interleaved notation/duration/direction logic in one module
  - Immediate start:
    - first freeze or confirm characterization coverage around multi-staff parts, tuplets/beams/slurs, tempo/directions, and clef/key handling
    - then split import-side parsing helpers from export-side generation helpers inside the current file
    - only extract new files after the shared helper boundaries are simple enough to avoid circular dependencies
  - Focused verification:
    - `npm run typecheck`
    - `npx vitest run tests/unit/musescore-io.spec.ts`

- [ ] MuseScore refactoring series 1: freeze current behavior with characterization coverage around fragile areas.
  - Focus especially on:
    - multi-staff parts
    - tuplets / beams / slurs / trills
    - tempo and direction mapping
    - transpose / key / clef handling
  - Goal:
    - make structural cleanup safer before moving code

- [ ] MuseScore refactoring series 2: split import-side parsing helpers from export-side generation helpers.
  - Candidate split:
    - MuseScore -> MusicXML import module
    - MusicXML -> MuseScore export module
    - shared utilities for duration, pitch, and XML fragments
  - Current status:
    - export-side seams are now much clearer inside `src/ts/musescore-io.ts`
    - do not split files yet until the remaining shared helper boundaries are simpler

- [ ] MuseScore refactoring series 3: isolate direction / spanner / notation translation logic.
  - Candidate areas:
    - dynamics and text directions
    - tuplets
    - slurs / trills / ottava and related spanners
    - articulations / technical markings
  - Aim:
    - reduce the need to touch one giant code path for every notation feature

- [ ] MuseScore refactoring series 4: normalize internal measure / lane data flow.
  - Re-evaluate whether current parsed event and measure structures are the best boundary for both import and export work.
  - Aim:
    - make staff / voice / timing handling easier to reuse and test
  - Current status:
    - export-side measure context and staff state are now more explicit
    - note/event child dispatch has been decomposed, but import/export still do not share a common internal lane model yet

- [ ] MuseScore refactoring series 5: prune transitional helpers after the split lands.
  - Remove duplication that only existed to support the migration.
  - Re-check file boundaries after the first pass instead of locking them too early.

## MusicXML

- [ ] Keep `src/ts/musicxml-io.ts` under light refactoring review.
  - Current stance:
    - this file is much smaller than `abc-io.ts` and `musescore-io.ts`
    - it does not currently look like the highest-priority large refactor target
  - Still worth watching:
    - helper growth
    - normalization responsibilities
    - render-doc / beam / part-list fixup responsibilities accumulating in one place

- [ ] MusicXML refactoring series 1: clarify module boundaries before adding more utility behavior.
  - Separate mentally and, if needed, physically:
    - parse / serialize helpers
    - normalization/fixup helpers
    - render-oriented helpers
  - Goal:
    - avoid slow drift into another oversized mixed-responsibility file

- [ ] MusicXML first-pass refactoring plan: start here before touching larger I/O modules.
  - Step 1:
    - mark the current responsibility blocks clearly inside `src/ts/musicxml-io.ts`
    - identify which helpers are parse/serialize, normalization/fixup, and render-related
  - Step 2:
    - extract normalization/fixup helpers into clearer internal sections without changing behavior
  - Step 3:
    - only after the internal sections are clearer, decide whether any helpers should move to separate files
  - Rationale:
    - use `musicxml-io.ts` as the lowest-risk refactoring warm-up before `abc-io.ts` or `musescore-io.ts`

- [ ] MusicXML first-pass refactoring task A: stabilize the current helper grouping in `src/ts/musicxml-io.ts`.
  - Create an explicit grouping for:
    - parse / serialize
    - document normalization
    - render-doc preparation
  - Keep behavior unchanged.

- [ ] MusicXML first-pass refactoring task B: extract normalization helpers in the safest order.
  - Recommended order:
    - tuplet enrichment
    - part-list / part-id normalization
    - final barline insertion
    - beam-related normalization
  - Run existing tests after each extraction step.

- [ ] MusicXML first-pass refactoring task C: re-evaluate file splits after helper extraction.
  - Only split files if the boundary becomes obviously cleaner after task A and B.
  - Avoid splitting too early while responsibilities are still being discovered.

- [ ] MusicXML refactoring series 2: extract normalization/fixup helpers only when reuse or complexity justifies it.
  - Candidate areas:
    - tuplet enrichment
    - part-list / part-id normalization
    - final barline insertion
    - beam-related normalization
  - Do this conservatively; do not create abstraction noise without payoff.

- [ ] MusicXML refactoring series 3: re-evaluate after ABC and MuseScore refactors settle.
  - Once larger I/O modules are cleaner, revisit whether `musicxml-io.ts` still feels appropriately scoped.
  - Do not over-rotate on this module before the higher-pressure files are addressed.

## Cleanup

- [ ] Add the standard file header to source files as needed.
  - Target header:
    ```text
    /*
     * Copyright 2026 Toshiki Iga
     * SPDX-License-Identifier: Apache-2.0
     */
    ```

- [ ] Make MuseScore export fully 4.0+-native where compatibility fallback is not required.
  - Keep compatibility fallbacks on import.
  - Remove any remaining import-side fallback for former custom MuseScore transpose helper tags after related roundtrip/tests are updated.
  - Raise exported `museScore/@version` from `4.0` only after the emitted XML is confirmed to match the expected newer 4.x save-format behavior closely enough (e.g. `4.60`).
  - Define a clearer general policy for MuseScore files that carry multiple co-located tempo representations (e.g. visible tempo text plus hidden metronome/playback tempo), instead of relying only on the current first-measure/last-candidate heuristic.

- [ ] After the current CLI series settles, prune this file again.
  - Remove items that have become fully implemented.
  - Keep only active backlog and intentionally retained long-term notes.
