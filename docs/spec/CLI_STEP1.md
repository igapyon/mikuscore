# CLI Step 1 Specification

## Purpose

This document defines the first-cut CLI scope for `mikuscore`.

Scope note:

- This file defines only the initial CLI contract.
- Current implementation has already grown beyond this initial contract.
- It does not define future AI JSON or patch-based workflows.
- It does not replace the canonical MusicXML-centered architecture.

For current repository-facing behavior, also see:

- `README.md`
- `docs/DEVELOPMENT.md`

## Positioning

The CLI is a thin external entrypoint for format conversion.

For Step 1:

- the CLI exposes one `convert` command with a small supported pair set
- canonical score representation remains `MusicXML`
- the CLI is not an editing surface
- the CLI is not a patch/state/report surface

## Design Principles

### 1. Thin Wrapper Rule

The CLI MUST remain a thin wrapper over existing conversion logic.

- CLI-specific business logic MUST be minimized
- UI and CLI SHOULD share the same import/export path where practical
- format validation and conversion behavior SHOULD live in reusable modules, not in the CLI script

### 2. Canonical Format Rule

- `MusicXML` remains canonical underneath
- `ABC` is the Step 1 external interface layer
- the CLI MUST NOT redefine a second canonical score model

### 3. Small Surface Rule

Step 1 MUST stay intentionally narrow.

The CLI MUST NOT include:

- AI JSON interface
- patch contract
- note-level edit commands
- partial local view export
- broad report/export families unrelated to `ABC`

## Step 1 Command Scope

The initial command family is:

- `mikuscore convert --from abc --to musicxml`
- `mikuscore convert --from musicxml --to abc`
- `mikuscore convert --help`
- `mikuscore --help`

Command naming is fixed for Step 1 as:

- `convert --from abc --to musicxml`
- `convert --from musicxml --to abc`

### `mikuscore convert --from abc --to musicxml`

Purpose:

- convert `ABC` text into `MusicXML`

Input:

- `ABC` text from `--in <file>` or `stdin`

Output:

- `MusicXML` text to `--out <file>` or `stdout`

Behavior:

- MUST use the same `ABC -> MusicXML` conversion path as the app where practical
- MUST fail with non-zero exit code on invalid or unsupported input that cannot be converted
- MAY emit warnings/diagnostics to `stderr`

### `mikuscore convert --from musicxml --to abc`

Purpose:

- convert `MusicXML` text into `ABC`

Input:

- `MusicXML` text from `--in <file>` or `stdin`

Output:

- `ABC` text to `--out <file>` or `stdout`

Behavior:

- MUST use the same `MusicXML -> ABC` conversion path as the app where practical
- MUST preserve current bounded `ABC` support policy
- MAY emit warnings/diagnostics to `stderr`

## CLI I/O Contract

### Input Rule

- `--in` specifies an input file path
- if `--in` is omitted, the CLI MUST read from `stdin`
- if neither file input nor `stdin` content is available, the CLI MUST fail clearly
- for file input only, `musicxml` MAY read `.musicxml`, `.xml`, or `.mxl`
- for file input only, `musescore` MAY read `.mscx` or `.mscz`

### Output Rule

- `--out` specifies an output file path
- if `--out` is omitted, the main result MUST be written to `stdout`
- for file output only, `--to musicxml` MAY write compressed `.mxl` when the output path ends with `.mxl`
- for file output only, `--to musescore` MAY write compressed `.mscz` when the output path ends with `.mscz`

### Help Rule

- `--help` is part of the Step 1 contract
- `mikuscore --help` MUST print top-level usage/help text
- `mikuscore convert --help` MUST print command-specific help text
- help output SHOULD go to `stdout`
- successful help output MUST exit with code `0`

### Help Text Baseline

The Step 1 help surface SHOULD stay compact and explicit.

Top-level help SHOULD communicate:

- available command family
- the fixed Step 1 command names
- `stdin` / `stdout` default behavior
- supported options for Step 1

Recommended first-cut top-level help shape:

```text
Usage:
  mikuscore convert --from abc --to musicxml [--in <file>] [--out <file>]
  mikuscore convert --from musicxml --to abc [--in <file>] [--out <file>]
  mikuscore convert --help
  mikuscore --help

Commands:
  convert   Convert score text between supported formats

Options:
  --from <format>  Source format
  --to <format>    Target format
  --in <file>   Read input from file instead of stdin
  --out <file>  Write output to file instead of stdout
  --help        Show help
```

Recommended first-cut command help shape for `convert`:

```text
Usage:
  mikuscore convert --from abc --to musicxml [--in <file>] [--out <file>]
  mikuscore convert --from musicxml --to abc [--in <file>] [--out <file>]
  mikuscore convert --help

Description:
  Convert score text between supported formats.

Supported pairs:
  --from abc --to musicxml
  --from musicxml --to abc

Input:
  --in <file>  Read source text from file
  stdin        Used when --in is omitted

Output:
  --out <file>  Write converted text to file
  stdout        Used when --out is omitted

Options:
  --from <format>  Source format
  --to <format>    Target format
  --help        Show help
```

### Stream Rule

- main conversion result MUST go to `stdout`
- warnings, diagnostics, and summary text SHOULD go to `stderr`
- binary output is out of Step 1 scope
- compressed `.mxl` / `.mscz` support is limited to file-path I/O; `stdin` / `stdout` remain text-only for `musicxml` and `musescore`
- plain-text decoding for `musicxml` / `musescore` CLI inputs SHOULD use UTF-8 decoding that is compatible with non-Node runtimes as well as Node-based execution

## Error Contract

On failure:

- process exit code MUST be non-zero
- human-readable error text MUST be written to `stderr`
- partial or mixed success text MUST NOT be written to `stdout` as if conversion succeeded

On success with warnings:

- process exit code SHOULD remain zero
- warnings MAY be written to `stderr`
- successful converted output MUST remain clean on `stdout`

On successful `--help`:

- process exit code MUST be zero
- help text MUST be written to `stdout`
- `stderr` SHOULD remain empty

## Non-Goals For Step 1

The following are explicitly out of scope:

- automatic input format detection
- multi-format export surface beyond the `ABC` interface target
- command-level score editing
- AI patch application
- JSON projection/export
- CLI parity with every UI button
- alternative Step 1 command naming beyond `convert --from/--to`

## Recommended Future Direction

If the CLI grows later, it SHOULD still preserve the same principles:

- thin wrapper design
- canonical `MusicXML` underneath
- reusable non-UI entrypoints
- narrowly scoped command families

Any later expansion beyond `ABC` SHOULD be justified by concrete workflow need, not by symmetry with another project.

Current future-facing first-cut notes are tracked separately in:

- `docs/spec/CLI_TAXONOMY_FIRSTCUT.md`
- `docs/spec/CLI_RENDER_FIRSTCUT.md`
- `docs/spec/CLI_STATE_FIRSTCUT.md`
- `docs/spec/CLI_DIAGNOSTICS_FIRSTCUT.md`
- `docs/spec/CLI_HELP_FIRSTCUT.md`
