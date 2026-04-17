# CLI Help First Cut

## Purpose

This document defines the first candidate help-text surface for the future `mikuscore` CLI.

Scope note:

- this is a first-cut help and discoverability note
- it does not lock the exact final wording
- it is intended to keep the rebuilt CLI understandable to human operators

## Positioning

The future CLI is expected to be organized around:

- `convert`
- `render`
- `state`

The help surface should reflect that split directly.

The goal is:

- clear top-level discovery for humans
- stable enough wording for docs and examples
- no need to understand internal canonical routing before basic use

## Top-level Help Direction

The strongest current candidate top-level help shape is:

```text
Usage:
  mikuscore convert --from <format> --to <format> [--in <file>|-] [--out <file>|-] [--diagnostics text|json]
  mikuscore render svg [--from <format>] [--in <file>|-] [--out <file>|-] [--diagnostics text|json]
  mikuscore state summarize [--in <file>|-] [--diagnostics text|json]
  mikuscore state inspect-measure --measure <number> [--in <file>|-] [--diagnostics text|json]
  mikuscore state validate-command [--in <file>|-] [--command <json>|--command-file <file>] [--diagnostics text|json]
  mikuscore state apply-command [--in <file>|-] [--command <json>|--command-file <file>] [--out <file>|-] [--diagnostics text|json]
  mikuscore state diff --before <file> --after <file> [--diagnostics text|json]
  mikuscore <command> --help
  mikuscore --help

Commands:
  convert   Convert score data between external formats
  render    Generate derived outputs such as SVG
  state     Inspect, validate, diff, and mutate canonical MusicXML state
```

## Design Rules For Help Text

Top-level help SHOULD:

- expose the three top-level families directly
- show one strong example for each family
- reveal `--diagnostics text|json` early because it affects both humans and tool callers
- make `stdin` / `stdout` behavior visible

Top-level help SHOULD NOT:

- list every future command possibility
- expose internal implementation detail such as forced intermediate `MusicXML` routing
- turn into a long command catalog dump

## `convert --help` Direction

The strongest current candidate command help shape is:

```text
Usage:
  mikuscore convert --from <format> --to <format> [--in <file>|-] [--out <file>|-] [--diagnostics text|json]
  mikuscore convert --help

Description:
  Convert score data between supported external formats.

Examples:
  mikuscore convert --from abc --to musicxml --in score.abc --out score.musicxml
  mikuscore convert --from musicxml --to abc --in score.musicxml --out score.abc

Notes:
  MusicXML remains canonical internally.
  Main output goes to stdout unless --out is used.
  Diagnostics go to stderr.
```

## `render --help` Direction

The strongest current candidate command help shape is:

```text
Usage:
  mikuscore render svg [--from <format>] [--in <file>|-] [--out <file>|-] [--diagnostics text|json]
  mikuscore render --help

Description:
  Generate derived outputs such as SVG from canonical score state.

Examples:
  mikuscore render svg --in score.musicxml --out score.svg
  mikuscore render svg --from abc --in score.abc --out score.svg

Notes:
  A one-shot ABC -> SVG path may internally route through MusicXML.
  Main output goes to stdout unless --out is used.
  Diagnostics go to stderr.
```

## `state --help` Direction

The strongest current candidate command help shape is:

```text
Usage:
  mikuscore state summarize [--in <file>|-] [--diagnostics text|json]
  mikuscore state inspect-measure --measure <number> [--in <file>|-] [--diagnostics text|json]
  mikuscore state validate-command [--in <file>|-] [--command <json>|--command-file <file>] [--diagnostics text|json]
  mikuscore state apply-command [--in <file>|-] [--command <json>|--command-file <file>] [--out <file>|-] [--diagnostics text|json]
  mikuscore state diff --before <file> --after <file> [--diagnostics text|json]
  mikuscore state --help

Description:
  Inspect, validate, compare, and mutate canonical MusicXML state.

Examples:
  mikuscore state summarize --in score.musicxml
  mikuscore state inspect-measure --measure 12 --in score.musicxml
  mikuscore state validate-command --in score.musicxml --command-file command.json
  mikuscore state apply-command --in score.musicxml --command-file command.json --out score.next.musicxml
  mikuscore state diff --before score.before.musicxml --after score.after.musicxml

Notes:
  Command payloads may target notes either by targetNodeId/anchorNodeId
  or by selector/anchor_selector values derived from state inspect-measure.
```

## Help Tone

Help text SHOULD:

- be compact
- be explicit
- favor example-driven understanding
- name the top-level family responsibility in plain terms

Help text SHOULD NOT:

- assume the user already knows the internal data model
- over-explain architectural background inside the help output itself
- mix human-readable examples with large schema dumps

## Relationship To Diagnostics

Because diagnostics are now part of the CLI direction, help text SHOULD make this visible early.

At minimum:

- `--diagnostics text|json` SHOULD appear in usage lines where supported
- help SHOULD reinforce that the main artifact goes to `stdout` and diagnostics go to `stderr`

## Relationship To Current Docs

- `docs/spec/CLI_TAXONOMY_FIRSTCUT.md` defines the top-level future split
- `docs/spec/CLI_RENDER_FIRSTCUT.md` defines the current render first cut
- `docs/spec/CLI_STATE_FIRSTCUT.md` defines the current state first cut
- this file defines the strongest current candidate help-text surface for those command families
- current implemented CLI behavior remains defined by `docs/spec/CLI_STEP1.md`
