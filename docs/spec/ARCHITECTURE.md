# Architecture (MVP)

## Purpose

This document defines high-level architecture boundaries for mikuscore MVP.

## MusicXML Version Baseline

- Baseline format: **MusicXML 4.0**
- Stability note: as of 2026-02-14, MusicXML 4.0 is treated as the latest stable baseline for this project
- Rule: core interfaces, validators, and fixtures MUST be authored against 4.0 semantics

## Architectural Separation

- `Core`:
  - load / dispatch / save
  - DOM preservation and minimal patch edits
  - dirty tracking
  - measure integrity checks
  - diagnostics
- `UI`:
  - selection state
  - cursor and input handling
  - rendering
  - warning/error display

UI MUST NOT mutate XML DOM directly.

## Rendering Boundary (Verovio)

- `Verovio` is the ground-truth notation renderer in UI layer.
- `Core` remains the only mutation authority for MusicXML (`load/dispatch/save`).
- `UI` bridges Core and Verovio by:
  - serializing current in-memory XML from Core
  - rendering confirmation preview via Verovio
  - routing click interactions to Core commands

### Click-Edit Mapping Contract

- Initial click-edit scope is `change_pitch` on a single selected note.
- Click operation selects target note only; command execution is explicit via UI action.
- For clickable note editing, MusicXML notes SHOULD expose stable identifiers (prefer `xml:id`).
- For MVP, identifiers SHOULD be session-scoped temporary IDs and SHOULD NOT be written to final saved XML.
- Verovio SVG element `id` MUST be mapped deterministically to Core `nodeId`.
- Mapping resolution SHOULD use layered lookup:
  - primary: clicked target / ancestor id traversal
  - fallback: point-based hit test (`elementsFromPoint`) to recover note ids when container/root ids are clicked
- Command execution path MUST be:
  - `SVG click -> resolve id -> map to nodeId -> core.dispatch(...)`
- Mapping failure MUST surface diagnostics in UI and MUST NOT mutate XML.

## Runtime and Build Model

- Runtime distribution: single self-contained HTML (`mikuscore.html`)
- Development model: split TypeScript source files
- Build model: compile TS and inline local CSS/JS into one HTML
- Runtime dependency rule: no external CDN/API required

## Language and Runtime Baseline

- TypeScript baseline: `5.9.x` (verified with `5.9.3`)
- Emitted JavaScript baseline: `ES2018`
- Browser baseline: latest Chrome / Edge / Safari, with ES2018 output policy for better compatibility headroom on older Android environments

## Core Invariants

- unknown / unsupported elements MUST be preserved
- existing `<backup>`, `<forward>`, and unrelated `<beam>` MUST be preserved
- failed command MUST be atomic (DOM unchanged, dirty unchanged)
- no-op save (`dirty=false`) MUST return original XML text unchanged

## References

- `SPEC.md`
- `docs/spec/TERMS.md`
- `docs/spec/COMMANDS.md`
- `docs/spec/COMMAND_CATALOG.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/TEST_MATRIX.md`
- `docs/spec/BUILD_PROCESS.md`
