# Diagnostics Catalog (MVP)

## Purpose

Single source of truth for diagnostics emitted by core.

## Error Diagnostics

1. `MEASURE_OVERFULL`
- Severity: error
- Trigger: command would cause `occupiedTime > measureCapacity` in the command voice lane.
- Required behavior:
  - command result `ok=false`
  - DOM unchanged
  - dirty unchanged
  - save rejection when current state is overfull

2. `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`
- Severity: error
- Trigger: command voice mismatches target voice, or edit would require unsupported lane/boundary restructuring.
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

4. `MVP_SCORE_NOT_LOADED`
- Severity: error
- Trigger: command/save requested before a score is loaded.

5. `MVP_COMMAND_TARGET_MISSING`
- Severity: error
- Trigger: command payload does not provide a target node identifier where required.

6. `MVP_TARGET_NOT_FOUND`
- Severity: error
- Trigger: command target nodeId is not resolvable in current session.

7. `MVP_COMMAND_EXECUTION_FAILED`
- Severity: error
- Trigger: unexpected runtime failure while applying a command.

8. `MVP_INVALID_COMMAND_PAYLOAD`
- Severity: error
- Trigger: command payload has invalid values (e.g. non-positive duration, invalid pitch fields).

9. `MVP_INVALID_NOTE_DURATION`
- Severity: error
- Trigger: save-time validation finds missing/non-positive/non-numeric `<duration>`.
- Required behavior:
  - `save()` returns `ok=false`

10. `MVP_INVALID_NOTE_VOICE`
- Severity: error
- Trigger: save-time validation finds missing/invalid `<voice>`.
- Required behavior:
  - `save()` returns `ok=false`

11. `MVP_INVALID_NOTE_PITCH`
- Severity: error
- Trigger: save-time validation finds invalid/missing `<pitch>` for non-rest notes, invalid rest+pitch, or chord without pitch.
- Required behavior:
  - `save()` returns `ok=false`

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
