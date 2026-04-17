# Future Note: CLI Roadmap

## Status

- Step 1 first cut exists.
- CLI infrastructure hardening first cut now exists:
  - centralized help output
  - usage-error vs processing-error separation
  - `--out -`
  - `--diagnostics text|json`
- Initial Step 2 MIDI pairs now exist as a first cut.
- Initial Step 3 MuseScore pairs now exist as a first cut, including `.mscz` / `.mxl` file I/O support.
- Initial `render svg` support now exists as a first cut.
- Initial one-shot `render svg --from abc` support now exists as a first cut.
- Initial `state` family first cut now exists:
  - `state summarize`
  - `state inspect-measure`
  - `state validate-command`
  - `state apply-command`
  - `state diff`
- This file tracks likely next-step expansion only.
- This is a future note, not a current normative contract.

## Current Step 1

Current implemented Step 1 scope:

- `mikuscore convert --from abc --to musicxml`
- `mikuscore convert --from musicxml --to abc`
- `mikuscore convert --from midi --to musicxml`
- `mikuscore convert --from musicxml --to midi`
- `mikuscore convert --from musescore --to musicxml`
- `mikuscore convert --from musicxml --to musescore`
- `mikuscore render svg`
- `mikuscore render svg --from abc`
- `mikuscore state summarize`
- `mikuscore state inspect-measure`
- `mikuscore state validate-command`
- `mikuscore state apply-command`
- `mikuscore state diff`
- `mikuscore --help`
- `mikuscore convert --help`
- `mikuscore render --help`
- `mikuscore state --help`

Current Step 1 policy is defined in:

- `docs/spec/CLI_STEP1.md`

## Planned Direction

The current CLI is still `convert`-first, but the next taxonomy candidate is broader:

- `convert`
- `render`
- `state`

`MusicXML` remains canonical underneath.

This means:

- `convert` handles interchange with external formats
- `render` handles derived outputs such as SVG
- `state` handles canonical `MusicXML` state inspection, validation, patch-style mutation, and other light edit-oriented workflows

This is intentionally closer to the successful `mikuproject` style of separating command responsibility at the top level.

At the same time, `mikuscore` should keep `convert --from ... --to ...` for format-pair scaling, rather than exploding the command surface into one fixed command per format pair.

In other words:

- top-level command taxonomy should become more structured
- format-pair selection inside `convert` should likely stay option-based

## Shared CLI Pattern

The `mikuproject` CLI command family was developed in a shape that intentionally resembles `mikuscore`.

So the relationship here is not "import a foreign command system into `mikuscore`".

It is closer to:

- `mikuscore` established the early `convert`-first CLI pattern
- `mikuproject` expanded that style into a larger command tree
- `mikuproject` later evolved that pattern in ways that are often worth studying back in `mikuscore`
- `mikuscore` can reuse those infrastructure lessons without changing its product identity

For specification work, `mikuproject` should therefore be treated as an evolved sibling implementation of the same general CLI style.

The important nuance is:

- similarity alone does not mean `mikuscore` should copy the larger command surface
- but the direction of `mikuproject` evolution is strong evidence for which CLI infrastructure ideas scale well in practice

The most reusable infrastructure lessons are:

- separate usage failures from processing failures, with distinct exit-code policy
- centralize help text generation instead of scattering inline help branches
- support `--out -` explicitly as stdout, not only omitted `--out`
- add optional structured diagnostics such as `--diagnostics text|json`
- validate stdin/file input combinations consistently before command execution
- keep the main artifact on `stdout` and diagnostics on `stderr`, including machine-readable diagnostics when requested

For `mikuscore`, these are more urgent than broadening the command family again.

In other words, the next CLI step is likely infrastructure hardening before major surface expansion.

## Near-Term Candidate

The earlier CLI infrastructure pass has now landed as a first cut.

The next strongest near-term candidate is to deepen the current `state` family and tighten documentation/current-contract alignment around the now-implemented `convert` / `render` / `state` surface.

Likely next slices are:

- improve current-facing docs to reflect implemented behavior more directly
- decide whether `state inspect-measure` target identity should stay session-scoped `nodeId` based
- deepen `state diff` beyond the current shallow summary if clearer user value emerges
- decide when or whether to introduce patch envelopes after the single-command path has proven itself

## Candidate Top-Level Taxonomy

If the CLI is rebuilt while compatibility cost is still low, the strongest current candidate is:

- `mikuscore convert ...`
- `mikuscore render ...`
- `mikuscore state ...`

Suggested role split:

- `convert`
  - external interchange only
  - example: `mikuscore convert --from abc --to musicxml`
- `render`
  - derived artifact generation
  - example: `mikuscore render svg --in score.musicxml`
  - a user-facing one-shot `ABC -> SVG` flow may still be offered here even if it internally routes through `ABC -> MusicXML -> SVG`
- `state`
  - canonical `MusicXML` inspection and mutation
  - future examples: `state summarize`, `state validate`, `state diff`, `state apply-patch`

This shape matches several goals at once:

- preserve `MusicXML` as the canonical state
- avoid multiplying fixed format-pair commands
- give small edit features and diff-based workflows a natural home
- align better with human CLI use, Agent Skills, and future tool-mediated AI workflows

The current first-cut specification notes for this direction are:

- `docs/spec/CLI_TAXONOMY_FIRSTCUT.md`
- `docs/spec/CLI_RENDER_FIRSTCUT.md`
- `docs/spec/CLI_STATE_FIRSTCUT.md`
- `docs/spec/CLI_DIAGNOSTICS_FIRSTCUT.md`
- `docs/spec/CLI_HELP_FIRSTCUT.md`
- `docs/spec/CLI_REBUILD_PLAN.md`

## State Family And Core Command Alignment

`mikuscore` already has an internal command model for bounded score edits:

- `change_to_pitch`
- `change_duration`
- `insert_note_after`
- `delete_note`
- `split_note`

So the CLI should not invent a second unrelated edit model.

At the same time, those command names do not need to become top-level CLI verbs.

The more coherent direction is:

- keep top-level CLI responsibility split as `convert` / `render` / `state`
- let `state` expose phase-oriented commands such as inspect, validate, diff, and apply
- let payloads inside those `state` commands carry the existing core command names

In practice, that suggests a shape such as:

- `mikuscore state summarize`
- `mikuscore state inspect-measure`
- `mikuscore state validate-command`
- `mikuscore state apply-command`
- `mikuscore state diff`

or, if batching several core commands together becomes useful:

- `mikuscore state validate-patch`
- `mikuscore state apply-patch`

with payloads that contain one or more existing core commands.

This keeps the command-line taxonomy consistent with the rest of the CLI while preserving the already-designed internal edit semantics.

In other words:

- the CLI surface should be organized around workflow phases
- the payload schema should reuse the current core command catalog
- `mikuscore` should avoid creating separate top-level verbs like `mikuscore change-to-pitch ...`

That separation is important because it keeps human-facing command discovery manageable while still giving agents and other tools a precise mutation contract.

## Step 2 Candidate Scope

Implemented first-cut Step 2 additions:

- `mikuscore convert --from midi --to musicxml`
- `mikuscore convert --from musicxml --to midi`

Rationale:

- `midi` is a practical exchange format already supported by the application
- Step 1 already makes `musicxml` explicit as the canonical endpoint in `convert`

## Step 3 Candidate Scope

Implemented first-cut Step 3 additions:

- `mikuscore convert --from musescore --to musicxml`
- `mikuscore convert --from musicxml --to musescore`

Rationale:

- CLI file I/O now accepts compressed `.mxl` / `.mscz` at the path boundary while keeping `stdin` / `stdout` text-only
- `svg` is better modeled as render output, not as the same class of interchange export as `abc` / `musicxml` / `midi`

## Facade Growth Path

The non-UI CLI facade is expected to grow in this order:

### Step 1

- `importAbcToMusicXml(...)`
- `exportMusicXmlToAbc(...)`

### Step 2

- `normalizeMusicXml(...)`
- `importMidiToMusicXml(...)`
- `exportMusicXmlToMidi(...)`
- `importMuseScoreToMusicXml(...)`
- `exportMusicXmlToMuseScore(...)`

### Step 3

- `renderMusicXmlToSvg(...)`

`renderMusicXmlToSvg(...)` should remain in a render-oriented group, not a convert-oriented group.

## Non-Goals

The roadmap above does not imply:

- AI JSON CLI support
- patch/state CLI workflows
- note-level editing CLI commands
- forced parity with every UI button
