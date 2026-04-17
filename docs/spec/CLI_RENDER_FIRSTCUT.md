# CLI Render First Cut

## Purpose

This document defines the first candidate `render` command family for the future `mikuscore` CLI.

Scope note:

- this is a first-cut render workflow spec
- this is not yet the current implemented CLI contract
- it focuses on SVG-oriented rendering because that is the strongest current user-facing render need

## Positioning

The `render` family exists to generate derived artifacts from canonical score state.

For the current first cut, the primary target is:

- `svg`

`render` is not the same as external format interchange.

That means:

- `convert` is still the home for interchange such as `ABC <-> MusicXML`
- `render` is the home for user-facing outputs such as score SVG

## First-cut Command Shape

The strongest current candidate shape is:

- `mikuscore render svg [--from <format>] [--in <file>] [--out <file>]`

Examples:

- `mikuscore render svg --in score.musicxml`
- `mikuscore render svg --from abc --in score.abc`

## Render Target

### `render svg`

Purpose:

- emit score SVG for visual inspection or lightweight score sharing

Output:

- SVG text to `stdout` or `--out <file>`

Diagnostics:

- diagnostics MUST go to `stderr`
- `--diagnostics text|json` SHOULD be supported in the same style as other top-level command families

## Input Policy

### Canonical Direction

Internally, rendering SHOULD continue to treat `MusicXML` as canonical.

That means the internal pipeline for a direct ABC render MAY be:

```text
ABC -> MusicXML -> SVG
```

without exposing intermediate `MusicXML` to the user unless requested elsewhere.

### User-facing One-shot Direction

The current strongest product direction is:

- `render svg` SHOULD allow at least a direct `ABC -> SVG` path

Rationale:

- many users care about "turn this ABC into visible notation" rather than about explicitly seeing the intermediate canonical form
- the internal `MusicXML`-first architecture can remain intact while the CLI becomes more purpose-oriented

### First-cut Accepted Inputs

Strongest current candidate:

- default or explicit `--from musicxml`
- optional `--from abc` for one-shot rendering

Open question for later:

- whether first cut should accept additional non-`MusicXML` render inputs such as `midi` or `musescore`, or whether those should stay outside render until the direct value is clearer

## Shared I/O Direction

Input:

- `--in <file>` reads from file
- omitted `--in` reads from `stdin`
- `--in -` MAY be used as explicit stdin

Output:

- `--out <file>` writes the rendered artifact to file
- omitted `--out` writes to `stdout`
- `--out -` SHOULD be treated as explicit stdout

## Stage-awareness

One-shot render commands may cross more than one internal stage.

Example:

```text
render svg --from abc
```

may internally involve:

1. decode/read input
2. convert `ABC -> MusicXML`
3. render `MusicXML -> SVG`

First-cut rule:

- the main artifact MUST still be only the final SVG
- diagnostics MAY mention stage boundaries briefly
- machine-readable diagnostics SHOULD be able to represent that the command crossed multiple internal stages

## Relationship To `convert`

The future CLI SHOULD avoid forcing users to manually spell every internal step when the end goal is obvious.

So this is acceptable:

- user asks for score SVG from ABC
- CLI internally converts through canonical `MusicXML`

This does not weaken the canonical architecture.

It simply means:

- internal canonical flow remains `MusicXML`
- external user-facing CLI may be more task-oriented than the internal pipeline

## First-cut Non-Goals

The first render cut does not yet require:

- many render targets beyond SVG
- broad render-option surfaces such as layout tuning, page geometry, or engraving controls
- every supported input format to become a direct render source
- a separate batch render mode inside the CLI itself

## Relationship To Current Docs

- `docs/spec/CLI_TAXONOMY_FIRSTCUT.md` defines the top-level future CLI split
- this file defines the strongest current candidate first cut inside `render`
- current implemented CLI behavior remains defined by `docs/spec/CLI_STEP1.md`
