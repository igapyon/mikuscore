# MVP Test Matrix

## Purpose

Executable test planning mapped from `SPEC.md` requirements.

## Test Runner Baseline

- Unit test runner: `Vitest`
- Scope: core behavior and invariants in `tests/unit/*`

## Required Automated Tests

1. `RT-0 No-op save returns original text`
- Given: loaded XML, no content-changing command
- When: `save()`
- Then:
  - `mode === "original_noop"`
  - output XML bytes/text equals original input text

2. `RT-1 Pitch change produces serialized output`
- Given: loaded XML
- When: successful pitch-changing command on editable voice
- Then:
  - `dirty === true`
  - `save().mode === "serialized_dirty"`
  - musical change reflected in output

3. `TI-1 Overfull is rejected`
- Given: measure at capacity
- When: command increases occupied time beyond capacity
- Then:
  - result `ok=false`
  - diagnostic `MEASURE_OVERFULL`
  - DOM unchanged
  - dirty unchanged

4. `TI-2 Underfull allowed with warning`
- Given: command reduces occupied time below capacity
- When: command applied on editable voice
- Then:
  - result may be `ok=true`
  - warning may include `MEASURE_UNDERFULL`
  - no rest auto-fill

5. `PT-1 Unknown elements preserved`
- Given: XML containing unsupported/unknown elements
- When: load -> supported edit -> save
- Then:
  - unknown elements still exist in output DOM/serialized output

6. `BM-1 Existing beam unchanged`
- Given: measure with existing `<beam>`
- When: edit outside beam-local recalculation scope
- Then:
  - existing unrelated beam markup remains unchanged

7. `BF-1 Non-editable voice rejected`
- Given: command targeting non-editable voice
- When: `dispatch`
- Then:
  - result `ok=false`
  - diagnostic `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`
  - DOM unchanged

8. `NK-1 Unsupported note kind rejected`
- Given: command targeting `grace`, `cue`, `chord`, or `rest`
- When: `dispatch`
- Then:
  - result `ok=false`
  - diagnostic `MVP_UNSUPPORTED_NOTE_KIND`
  - DOM unchanged

## Additional Recommended Tests

1. `DR-1 Dirty not set by UI-only action`
2. `SV-1 No pretty-print artifacts in save output`
3. `AT-1 Atomic failure leaves DOM byte-equivalent after serialize`
