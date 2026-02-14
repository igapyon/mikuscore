# Diagnostics Catalog (MVP)

## Purpose

Single source of truth for diagnostics emitted by core.

## Error Diagnostics

1. `MEASURE_OVERFULL`
- Severity: error
- Trigger: command would cause `occupiedTime > measureCapacity` in editable voice.
- Required behavior:
  - command result `ok=false`
  - DOM unchanged
  - dirty unchanged
  - save rejection when current state is overfull

2. `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`
- Severity: error
- Trigger: command targets non-editable voice, or would require backup/forward restructuring to realize edit.
- Required behavior:
  - command result `ok=false`
  - DOM unchanged
  - dirty unchanged

3. `MVP_UNSUPPORTED_NOTE_KIND`
- Severity: error
- Trigger: command targets unsupported note kinds in MVP (`grace`, `cue`, `chord`, `rest`).
- Required behavior:
  - command result `ok=false`
  - DOM unchanged
  - dirty unchanged

## Warning Diagnostics

1. `MEASURE_UNDERFULL`
- Severity: warning
- Trigger: command leaves `occupiedTime < measureCapacity`.
- Required behavior:
  - command MAY succeed
  - no automatic rest insertion
  - warning emitted

## Message Policy

- Human-readable `message` SHOULD be attached for UI display.
- `code` is normative and MUST be stable.
