# CLI Diagnostics First Cut

## Purpose

This document defines the first candidate shared diagnostics contract for the future `mikuscore` CLI.

Scope note:

- this is a first-cut CLI diagnostics note
- this is distinct from the core diagnostics catalog in `docs/spec/DIAGNOSTICS.md`
- this document focuses on CLI-facing error/warning/result reporting

## Positioning

The CLI diagnostics contract should work across:

- `convert`
- `render`
- `state`

It should also serve multiple callers:

- human command-line users
- shell/script callers
- Agent Skills and other tool-mediated callers

## Main Stream Rule

Across all CLI families:

- the primary artifact MUST go to `stdout`
- diagnostics MUST go to `stderr`

Examples:

- converted `MusicXML` goes to `stdout`
- rendered `SVG` goes to `stdout`
- state summary JSON goes to `stdout`
- warnings/errors/status summaries go to `stderr`

This rule remains important even for multi-stage commands.

## Diagnostics Modes

The strongest current candidate is:

- `--diagnostics text`
- `--diagnostics json`

Default:

- text

Intended use:

- text: human-facing CLI use
- json: machine-facing CLI use

## Text Diagnostics

Text diagnostics SHOULD:

- stay short and readable
- preserve the current shell expectation that stderr contains concise warnings/errors
- avoid leaking raw JavaScript stack traces as the normal failure surface

Text diagnostics MAY include:

- warnings
- primary failure message
- short stage summary when a command spans multiple internal stages

## JSON Diagnostics

JSON diagnostics SHOULD provide a stable minimum shape across top-level families.

The strongest current candidate minimum fields are:

```json
{
  "ok": true,
  "diagnostics_version": 1,
  "command": "render svg",
  "context": "render svg",
  "status": "success",
  "exit_code": 0,
  "warning_count": 0,
  "error_count": 0,
  "io": {
    "inputs": [],
    "output": { "mode": "stdout" }
  },
  "warnings": [],
  "errors": []
}
```

Field intent:

- `ok`
  - overall success/failure boolean
- `diagnostics_version`
  - version marker for the CLI diagnostics contract
- `command`
  - compact command identity
- `context`
  - command context string; may equal `command` in first cut
- `status`
  - candidate values such as `success`, `warning`, `error`
- `exit_code`
  - actual CLI exit code
- `warning_count`
  - number of warnings
- `error_count`
  - number of errors
- `io`
  - summary of input/output locations
- `warnings`
  - warning list
- `errors`
  - error list

## Error Classification

The CLI SHOULD distinguish at least:

- usage error
- processing error

Candidate JSON fields for failure cases:

- `error_type`
  - `usage_error` or `processing_error`
- `error_code`
  - stable CLI-facing code when available
- `error_details`
  - optional machine-facing structured details

This distinction helps:

- human debugging
- shell automation
- Agent Skills retry/repair logic

## Relationship To Core Diagnostics

Core diagnostics such as:

- `MEASURE_OVERFULL`
- `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`
- `MVP_INVALID_COMMAND_PAYLOAD`

remain authoritative for bounded edit semantics.

The CLI diagnostics contract should wrap those diagnostics rather than replace them.

That means:

- CLI diagnostics describe command execution, I/O context, and exit semantics
- core diagnostics describe music-edit validity and execution outcomes inside the bounded command layer

## Multi-stage Commands

Some future CLI commands may cross multiple internal stages.

Example:

- `render svg --from abc`
  - read input
  - convert `ABC -> MusicXML`
  - render `MusicXML -> SVG`

First-cut rule:

- the primary artifact MUST still be only the final output
- diagnostics MAY summarize stages briefly in text mode
- JSON diagnostics SHOULD be able to expose stage-aware context when useful

Candidate optional JSON extension fields:

- `stages`
- `output_kind`
- `detected_input_kind`

These are optional first-cut extensions, not yet required minimum fields.

Current first-cut implementation note:

- one-shot `render svg --from abc` now emits `stages` in JSON diagnostics so tool callers can see the internal `ABC -> MusicXML -> SVG` path without changing the primary artifact contract

## "Kept vs Dropped" Direction

One important future diagnostics goal is to make `mikuscore` more trustworthy as a converter by making conversion loss easier to notice.

First-cut direction:

- diagnostics SHOULD eventually be able to summarize important warnings in short human-facing form
- diagnostics SHOULD avoid pretending to provide a complete musicological diff when they do not
- the first cut may remain conservative and surface only stable, bounded warnings

## Exit-code Direction

The strongest current candidate policy is:

- `0` for success, including success-with-warnings
- non-zero for failure
- usage failures and processing failures SHOULD be distinguishable by code path and, ideally, by exit-code policy

The exact exit-code split may be finalized later, but the category split should be designed early.

## First-cut Non-Goals

This diagnostics note does not yet require:

- exhaustive stage-by-stage trace output
- a complete diff of every preserved vs dropped notation feature
- parity with every diagnostics shape used in sibling projects
- broad AI-specific diagnostics fields beyond what helps generic tool callers

## Relationship To Current Docs

- `docs/spec/DIAGNOSTICS.md` remains the core diagnostics catalog
- this file defines the strongest current candidate shared CLI diagnostics contract
- current implemented CLI behavior remains defined by `docs/spec/CLI_STEP1.md`
