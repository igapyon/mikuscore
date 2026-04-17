# CLI Rebuild Plan

## Purpose

This document defines the first implementation-oriented plan for rebuilding the `mikuscore` CLI around the future taxonomy.

Scope note:

- this is a planning and sequencing document
- it does not replace the current implemented CLI contract
- it exists to connect the future CLI specs to an execution order

## Target Shape

The current strongest future target is:

- `convert`
- `render`
- `state`

with shared CLI diagnostics and clearer help output.

The goal of this plan is not to deliver everything at once.

It is to move from the current `convert`-first CLI to the new shape in bounded slices.

## Guiding Constraints

- keep `MusicXML` canonical throughout
- avoid introducing a second edit model
- preserve composable CLI behavior: primary artifact on `stdout`, diagnostics on `stderr`
- reduce raw runtime exception leakage early
- sequence implementation so each slice produces usable value on its own

## Recommended Implementation Order

### Phase 1. CLI Infrastructure Hardening

Primary goal:

- improve the current CLI shell behavior before broadening the visible command surface

Work items:

- introduce centralized help output
- introduce usage-error vs processing-error separation
- add `--out -`
- add `--diagnostics text|json`
- define first-cut JSON diagnostics shape

Why first:

- this immediately improves failure UX
- later `render` and `state` work both depend on the same CLI contract quality

Related specs:

- `docs/spec/CLI_DIAGNOSTICS_FIRSTCUT.md`
- `docs/spec/CLI_HELP_FIRSTCUT.md`

### Phase 2. Render One-shot Improvement

Primary goal:

- expose a user-facing direct `ABC -> SVG` path while keeping the internal `MusicXML`-first pipeline

Work items:

- extend `render svg` input policy
- decide exact `--from` behavior for `render`
- ensure diagnostics can describe multi-stage render flows

Why second:

- this is high visible user value
- it reuses Phase 1 diagnostics and help work
- it does not yet require full `state` mutation machinery

Related specs:

- `docs/spec/CLI_RENDER_FIRSTCUT.md`
- `docs/spec/CLI_DIAGNOSTICS_FIRSTCUT.md`
- `docs/spec/CLI_HELP_FIRSTCUT.md`

### Phase 3. Reserve And Introduce `state`

Primary goal:

- add the first `state` family entrypoints for canonical `MusicXML` workflows

Strongest current initial scope:

- `state summarize`
- `state validate-command`
- `state apply-command`

Deferred until later in the same family if needed:

- `state inspect-measure`
- `state diff`
- patch envelopes

Why this order:

- `summarize` gives a low-risk first `state` surface
- `validate-command` and `apply-command` align directly with the existing core command catalog
- inspect/diff can be added after the first mutation path is proven

Related specs:

- `docs/spec/CLI_STATE_FIRSTCUT.md`
- `docs/spec/COMMAND_CATALOG.md`
- `docs/spec/DIAGNOSTICS.md`

### Phase 4. Refine State Inspection And Diff

Primary goal:

- make bounded edit workflows easier to drive for humans and tools

Work items:

- `state inspect-measure`
- `state diff`
- possible command/target selector refinement

Why later:

- these commands are useful, but they depend on decisions made in early `state` mutation work

### Phase 5. Revisit Patch Envelopes

Primary goal:

- decide whether `validate-patch` / `apply-patch` are needed after single-command workflows exist

Why last:

- first cut can prove the bounded mutation model without immediately committing to batch/patched mutation envelopes

## Recommended First-code Slice

If implementation starts now, the strongest initial code slice is:

1. centralize current help handling
2. add error classification
3. add `--diagnostics text|json`
4. add `--out -`
5. keep current `convert` / `render` behavior otherwise stable

This lets the current CLI improve materially without yet forcing the whole taxonomy rebuild in one patch.

## Migration Direction

Because current CLI usage is believed to be low, the project can tolerate a more direct rebuild than a high-adoption CLI could.

Still, migration should stay legible.

Recommended stance:

- keep migration messaging explicit in help/docs
- prefer one deliberate command-surface revision over long-lived half-compatible hybrids
- keep current specs and future specs both visible until the rebuild lands

## Deferred Items

The following remain intentionally out of the near-term rebuild plan:

- batch conversion as a built-in CLI feature
- lyrics/melody alignment diagnostics
- a broad AI-specific command family
- large MIDI-expression tuning surfaces ahead of canonical `MusicXML` state work

## Relationship To Other Specs

- `docs/spec/CLI_TAXONOMY_FIRSTCUT.md`
  - top-level future shape
- `docs/spec/CLI_RENDER_FIRSTCUT.md`
  - future `render` family
- `docs/spec/CLI_STATE_FIRSTCUT.md`
  - future `state` family
- `docs/spec/CLI_DIAGNOSTICS_FIRSTCUT.md`
  - shared CLI diagnostics contract
- `docs/spec/CLI_HELP_FIRSTCUT.md`
  - human-facing help surface
- current implemented CLI behavior remains defined by `docs/spec/CLI_STEP1.md`
