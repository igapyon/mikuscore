# TODO

## CLI

- [ ] Add a CLI surface sync check whenever `src/ts/cli-api.ts` grows new or newly composable entry points.
  - Scope:
    - verify command/help/test coverage stays aligned across `src/ts/cli-api.ts`, `scripts/mikuscore-cli.mjs`, and `tests/unit/mikuscore-cli.spec.ts`
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
    - `scripts/mikuscore-cli.mjs`
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
    - `mikuscore convert --from midi --to musicxml`
    - `mikuscore convert --from musicxml --to midi`
  - Next checks:
    - keep MIDI export options internal for now; do not expose CLI flags yet
    - revisit CLI-level MIDI export options such as profile / metadata toggles only after the current fixed defaults prove insufficient

- [ ] Prepare VSQX CLI support by requesting upstream/integration-side changes to the vendored bridge first.
  - Current blocker:
    - current `vsqx` support depends on the vendored `utaformatix3-ts-plus` browser-oriented bridge shape, so the existing CLI cannot call it as a normal non-UI facade
  - Required external ask:
    - request a non-browser callable entrypoint or equivalent runtime shape from the integration/upstream side before wiring `musicxml <-> vsqx` into the CLI
  - Intended follow-up after that lands:
    - add `mikuscore convert --from vsqx --to musicxml`
    - add `mikuscore convert --from musicxml --to vsqx`
    - add matching CLI help and regression tests

- [ ] Add MEI CLI conversion pairs around the existing reusable format I/O.
  - Target pairs:
    - `mikuscore convert --from mei --to musicxml`
    - `mikuscore convert --from musicxml --to mei`
  - Implementation slices:
    - extend `src/ts/cli-api.ts` with `mei` facade entries
    - wire `scripts/mikuscore-cli.mjs` help and convert handlers
    - add CLI regression tests for stdin/file input, `--out`, and representative failures

- [ ] Add LilyPond CLI conversion pairs around the existing reusable format I/O.
  - Target pairs:
    - `mikuscore convert --from lilypond --to musicxml`
    - `mikuscore convert --from musicxml --to lilypond`
  - Implementation slices:
    - extend `src/ts/cli-api.ts` with `lilypond` facade entries
    - wire `scripts/mikuscore-cli.mjs` help and convert handlers
    - add CLI regression tests for stdin/file input, `--out`, and representative failures

- [x] Implement Step 3 conversion/render pairs.
  - Current first cut exists for:
    - `mikuscore convert --from musescore --to musicxml`
    - `mikuscore convert --from musicxml --to musescore`
    - `mikuscore render svg`
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
      - `mikuscore convert --from musicxml --in score.mxl ...`
      - `mikuscore convert --from musescore --in score.mscz ...`
      - keep stdin path on the current text-only reader
    - [x] Refactor the CLI script to route file output through extension-aware writers.
      - `mikuscore convert --to musicxml --out score.mxl ...`
      - `mikuscore convert --to musescore --out score.mscz ...`
      - keep stdout path on the current text/binary writer behavior
    - [x] Add focused facade/API coverage around reusable ZIP helpers if the seam moves into `src/ts`.
      - avoid pushing ZIP branching back into `scripts/mikuscore-cli.mjs`
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
  - Preserve these candidate principles for future `mikuscore` discussion:
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
    - `mikuscore` should keep `convert --from ... --to ...` inside `convert`, rather than multiplying fixed pair commands
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
    - `mikuscore` should strengthen canonical `MusicXML` editing before expanding MIDI-side tuning controls

## Facade

- [ ] Keep the non-UI CLI facade small and format-oriented.
  - Current Step 1 functions:
    - `importAbcToMusicXml(...)`
    - `exportMusicXmlToAbc(...)`
  - Planned next functions:
    - `importMuseScoreToMusicXml(...)`
    - `exportMusicXmlToMuseScore(...)`
    - `renderMusicXmlToSvg(...)`

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
    - `tests/unit/playback-flow.spec.ts` currently shows a 5-second timeout failure in the full path
    - heavy suites currently include `playback-flow`, `lilypond-io`, and `midi-roundtrip-golden`
    - `npm run test:all` also exposed a timeout in a heavy `musescore-io` roundtrip case under full-suite load
  - Next work:
    - profile `test:build:full` more deliberately and identify the longest suites/tests
    - decide whether more suites should move between `test:build`, `test:slow`, and `test:build:full`
    - investigate whether the `playback-flow` timeout is an actual regression, a flaky test, or a timeout-budget issue
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
    - further high-value additions would be grouped-staff lyrics and grouped key/meter/tempo changes

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
