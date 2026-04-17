# CLI Taxonomy First Cut

## Purpose

This document records the next candidate CLI taxonomy for `mikuscore`.

Scope note:

- this is a first-cut taxonomy and workflow note
- this is not yet the current implemented CLI contract
- detailed command payloads and diagnostics schemas may be defined later in separate specs

## Positioning

The current CLI is still centered on `convert --from ... --to ...`.

The strongest next candidate is to organize the CLI around three top-level families:

- `convert`
- `render`
- `state`

This keeps `MusicXML` canonical while making command responsibilities clearer.

## Top-level Families

### 1. `convert`

Purpose:

- interchange between external score formats

Examples:

- `mikuscore convert --from abc --to musicxml`
- `mikuscore convert --from musicxml --to abc`
- `mikuscore convert --from midi --to musicxml`

Rules:

- `convert` SHOULD keep format-pair selection option-based via `--from` / `--to`
- `convert` SHOULD NOT expand into one fixed command per format pair
- `convert` SHOULD focus on interchange rather than canonical-state mutation

### 2. `render`

Purpose:

- generate derived artifacts such as SVG

Examples:

- `mikuscore render svg --in score.musicxml`
- future one-shot example: `mikuscore render svg --from abc --in score.abc`

Rules:

- `render` SHOULD remain output-oriented
- internal canonical flow MAY still route through `MusicXML`
- a user-facing one-shot `ABC -> SVG` path is allowed even if the internal pipeline is `ABC -> MusicXML -> SVG`

### 3. `state`

Purpose:

- inspect, validate, compare, and mutate canonical `MusicXML` state

Candidate first-cut examples:

- `mikuscore state summarize`
- `mikuscore state inspect-measure`
- `mikuscore state validate-command`
- `mikuscore state apply-command`
- `mikuscore state diff`

Rules:

- `state` SHOULD be the natural home for bounded edit-oriented workflows
- `state` SHOULD treat `MusicXML` as canonical state, not introduce a second canonical score model
- `state` SHOULD support both human CLI use and tool-mediated callers

## Why This Taxonomy

This split aims to satisfy several constraints at once:

- preserve `MusicXML` as canonical
- keep format-pair growth manageable
- make user intent clearer at the top level
- give small edit workflows and diff-based mutation a natural home
- align better with Agent Skills and future tool-mediated AI workflows

## Relationship To Existing Core Commands

`mikuscore` already has a bounded internal command model:

- `change_to_pitch`
- `change_duration`
- `insert_note_after`
- `delete_note`
- `split_note`

Those command names describe mutation semantics well, but they do not need to become top-level CLI verbs.

Preferred direction:

- top-level CLI stays phase-oriented: `state inspect`, `state validate`, `state apply`, `state diff`
- machine-facing payloads inside those `state` commands SHOULD reuse the existing core command catalog

This means `mikuscore` SHOULD avoid a surface such as:

- `mikuscore change-to-pitch ...`
- `mikuscore change-duration ...`

and instead prefer workflow-oriented commands with bounded command payloads.

## Render Input Policy

One open first-cut question is how much non-`MusicXML` input `render` should accept directly.

Current strongest direction:

- user-facing CLI SHOULD allow at least a direct `ABC -> SVG` path
- internal implementation SHOULD still route through canonical `MusicXML`

This preserves the internal architecture while reducing user-visible friction.

## Diagnostics Direction

All three top-level families SHOULD converge on a shared diagnostics style.

First-cut direction:

- main artifact on `stdout`
- diagnostics on `stderr`
- human-readable text by default
- optional machine-readable form via `--diagnostics text|json`

This direction is especially important for:

- one-shot render flows that cross multiple internal stages
- `state` validation/apply workflows
- Agent Skills and other tool-mediated callers

## First-cut Non-Goals

This taxonomy note does not yet require:

- batch conversion inside the CLI itself
- lyrics/melody alignment diagnostics
- a broad AI-specific command family
- a top-level command per internal edit primitive

## Relationship To Current Docs

- current implemented CLI behavior remains defined by `docs/spec/CLI_STEP1.md`
- this file defines the most plausible next taxonomy after the current first cut
