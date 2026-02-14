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
