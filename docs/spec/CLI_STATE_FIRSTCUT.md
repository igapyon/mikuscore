# CLI State First Cut

## Purpose

This document defines the first candidate `state` command family for the future `mikuscore` CLI.

Scope note:

- this is a first-cut state workflow spec
- current CLI implementation now covers most of this first cut, though payload details may still evolve
- detailed payload schemas may be refined later

## Positioning

The `state` family exists to operate on canonical `MusicXML` state.

It is intended for workflows that are not just format interchange and not just derived rendering.

Typical use cases include:

- inspect the current score state briefly
- inspect a specific measure before making a bounded edit
- validate one bounded command before applying it
- apply one bounded command and write the next `MusicXML` state
- compare two `MusicXML` states

`state` MUST NOT introduce a second canonical score model.

## Relationship To Other Top-level Families

- `convert`
  - handles interchange with external formats
- `render`
  - handles derived artifacts such as SVG
- `state`
  - handles canonical `MusicXML` inspection, validation, diff, and bounded mutation

This means a flow such as:

```text
ABC -> MusicXML -> inspect/validate/apply -> SVG
```

may cross multiple top-level families, but `state` itself remains centered on canonical `MusicXML`.

## First-cut Command Set

The strongest current candidate first cut is:

- `mikuscore state summarize`
- `mikuscore state inspect-measure`
- `mikuscore state validate-command`
- `mikuscore state apply-command`
- `mikuscore state diff`

If patch envelopes become necessary later, likely additions are:

- `mikuscore state validate-patch`
- `mikuscore state apply-patch`

## Shared I/O Direction

Input:

- `state` commands SHOULD accept canonical `MusicXML` from `--in <file>` or `stdin`
- commands that compare two states MAY use paired options such as `--before` and `--after`

Output:

- the primary artifact MUST go to `stdout` unless `--out <file>` is used
- diagnostics MUST go to `stderr`
- `--out -` SHOULD be treated as explicit stdout

Diagnostics:

- first-cut direction is `--diagnostics text|json`
- text is the default human-facing mode
- json is the machine-facing mode for Agent Skills and other tool callers

## Command Semantics

### 1. `state summarize`

Purpose:

- provide a compact summary of canonical `MusicXML` state

Intended output shape:

- machine-readable summary
- enough information to confirm that the score loaded as expected
- not a full serialization of the whole score

Candidate summary fields:

- part count
- measure count
- available measure numbers
- available voices or lanes when cheaply derivable
- title / metadata when available

### 2. `state inspect-measure`

Purpose:

- inspect one target measure before a bounded edit

Input:

- canonical `MusicXML`
- a target selector such as measure number

Intended output shape:

- compact measure-focused view
- enough information to identify note targets for later bounded commands

First-cut design rule:

- inspect output SHOULD be smaller and easier to reason about than raw full-document `MusicXML`
- inspect output SHOULD still preserve enough identity information to target a later mutation reliably

Current first-cut direction:

- inspect output currently returns a hybrid targeting hint
- session-scoped `node_id` is preserved for direct command payload use
- selector metadata such as part, measure, and note position is also returned to make workflows easier to explain and debug

### 3. `state validate-command`

Purpose:

- validate one bounded mutation command against the current canonical `MusicXML` state without mutating output state

Input:

- canonical `MusicXML`
- one machine-facing bounded command payload

Behavior:

- MUST reuse the existing core command catalog semantics
- MUST NOT invent a separate whole-measure rewrite contract
- MUST return success or failure with diagnostics
- MUST keep mutation semantics aligned with `docs/spec/COMMAND_CATALOG.md`
- current CLI implementation may also accept selector-style targeting hints and resolve them to bounded core node ids before dispatch

Candidate command payloads include:

- `change_to_pitch`
- `change_duration`
- `insert_note_after`
- `delete_note`
- `split_note`

### 4. `state apply-command`

Purpose:

- apply one bounded mutation command to canonical `MusicXML` state and emit the next canonical `MusicXML`

Input:

- canonical `MusicXML`
- one machine-facing bounded command payload

Behavior:

- MUST reuse the same validation and command semantics as `state validate-command`
- MUST emit the next canonical `MusicXML` state on success
- MUST fail atomically when command execution fails
- MUST preserve the existing save/serialization policy defined in core specs
- current CLI implementation may also accept selector-style targeting hints and resolve them to bounded core node ids before dispatch

### 5. `state diff`

Purpose:

- compare two canonical `MusicXML` states in a bounded, workflow-friendly way

Input:

- `--before`
- `--after`

Behavior:

- SHOULD produce a compact difference summary rather than a raw textual XML diff
- SHOULD focus on user-relevant score changes when practical
- first cut may stay compact, but should still try to surface changed measure hints when they are cheap to derive

## Relationship To Core Command Catalog

`state` SHOULD expose workflow phases, not one top-level CLI verb per mutation primitive.

Preferred split:

- CLI surface:
  - `state summarize`
  - `state inspect-measure`
  - `state validate-command`
  - `state apply-command`
  - `state diff`
- payload layer:
  - `change_to_pitch`
  - `change_duration`
  - `insert_note_after`
  - `delete_note`
  - `split_note`

This preserves the current bounded edit semantics without making CLI command discovery noisy.

## Small-edit Direction

The first-cut `state` family is the natural home for the current "small edit" theme.

That theme includes:

- pitch change
- duration change
- note insertion
- note deletion
- note split
- likely future canonical-`MusicXML` light edits such as tempo-level changes

This means:

- "small edit feature"
- "`MusicXML`-centered light edit"
- "diff-based edit"

should be treated as the same direction seen from different layers.

## First-cut Non-Goals

The first `state` family does not yet require:

- patch envelopes containing many commands
- a broad AI-only command tree
- whole-measure rewrite as the primary mutation contract
- lyrics/melody alignment diagnostics
- batch orchestration inside the CLI itself

## Relationship To Current Docs

- `docs/spec/CLI_TAXONOMY_FIRSTCUT.md` defines the top-level future CLI split
- this file defines the strongest current candidate first cut inside `state`
- current implemented CLI behavior remains defined by `docs/spec/CLI_STEP1.md`
