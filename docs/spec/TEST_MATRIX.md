# MVP Test Matrix

## Purpose

Executable test planning mapped from `SPEC.md` requirements.

## Test Runner Baseline

- Unit test runner: `Vitest`
- Unit scope: deterministic behavior and contract checks in `tests/unit/*`
- Property scope: randomized invariant checks in `tests/property/*`

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

9. `DR-1 Dirty not set by UI-only action`
- Given: loaded XML
- When: `dispatch({ type: "ui_noop", ... })`
- Then:
  - result `ok=true`
  - `dirtyChanged=false`
  - core dirty remains false

10. `SV-2 Save rejected when state is overfull`
- Given: loaded XML already overfull
- When: `save()`
- Then:
  - result `ok=false`
  - diagnostic `MEASURE_OVERFULL`

11. `BF-2 Structural edit across backup/forward boundary rejected`
- Given: measure containing `<backup>`/`<forward>`
- When: structural command (`insert_note_after` or `delete_note`)
- Then:
  - result `ok=false`
  - diagnostic `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`

12. `BF-3 Insert anchor voice mismatch rejected`
- Given: insert anchor note voice differs from command voice
- When: `insert_note_after`
- Then:
  - result `ok=false`
  - diagnostic `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`

13. `BF-4 Insert crossing interleaved voice lane rejected`
- Given: next note after anchor is a different voice
- When: `insert_note_after` on editable voice
- Then:
  - result `ok=false`
  - diagnostic `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`

14. `IN-2 Insert overfull rejected`
- Given: full measure
- When: `insert_note_after` increases occupied time beyond capacity
- Then:
  - result `ok=false`
  - diagnostic `MEASURE_OVERFULL`
  - dirty unchanged

15. `AT-1 Atomic failure preserves prior successful edits`
- Given: one successful edit then one failing edit
- When: `save()`
- Then:
  - prior successful edit remains
  - failed edit side effect is absent

16. `TI-3 Overfull validation with inherited attributes`
- Given: current measure omits `<attributes>` but previous measure defines them
- When: edit would overfill current measure
- Then:
  - result `ok=false`
  - diagnostic `MEASURE_OVERFULL`

17. `TI-4 Overfull validation with updated divisions`
- Given: current measure updates `<divisions>` only
- When: edit would exceed capacity under new divisions
- Then:
  - result `ok=false`
  - diagnostic `MEASURE_OVERFULL`

18. `TI-5 Overfull validation with updated time`
- Given: current measure updates `<time>` only
- When: edit would exceed capacity under new time
- Then:
  - result `ok=false`
  - diagnostic `MEASURE_OVERFULL`

19. `BF-5 Structural edit away from backup/forward boundary allowed`
- Given: measure contains backup/forward but edit point is not adjacent
- When: structural edit command
- Then:
  - result may be `ok=true` if other constraints pass

20. `BF-6 Delete away from backup/forward boundary allowed`
- Given: delete target not adjacent to backup/forward
- When: `delete_note`
- Then:
  - result may be `ok=true` if other constraints pass

21. `MP-1 Insert minimal patch`
- Given: insert command succeeds
- Then:
  - unrelated attributes and surviving notes remain stable

22. `MP-2 Delete minimal patch`
- Given: delete command succeeds
- Then:
  - unrelated attributes and surviving notes remain stable

23. `ID-1 NodeId stability after insert`
- Given: session with assigned nodeIds
- When: insert succeeds
- Then:
  - existing nodeIds remain resolvable

24. `ID-2 NodeId stability after delete`
- Given: session with assigned nodeIds
- When: delete succeeds
- Then:
  - removed nodeId disappears
  - surviving nodeIds remain resolvable

25. `SV-3 Save rejects invalid duration`
- Given: loaded score includes invalid/non-positive/missing duration
- When: `save()`
- Then:
  - result `ok=false`
  - diagnostic `MVP_INVALID_NOTE_DURATION`

26. `SV-4 Save rejects invalid voice`
- Given: loaded score includes invalid/missing voice
- When: `save()`
- Then:
  - result `ok=false`
  - diagnostic `MVP_INVALID_NOTE_VOICE`

27. `SV-5 Save rejects invalid pitch`
- Given: loaded non-rest note includes invalid/missing pitch
- When: `save()`
- Then:
  - result `ok=false`
  - diagnostic `MVP_INVALID_NOTE_PITCH`

28. `SV-6 Save rejects rest note with pitch`
- Given: loaded rest note includes `<pitch>`
- When: `save()`
- Then:
  - result `ok=false`
  - diagnostic `MVP_INVALID_NOTE_PITCH`

29. `SV-7 Save rejects chord note without pitch`
- Given: loaded chord note has `<chord/>` but no valid `<pitch>`
- When: `save()`
- Then:
  - result `ok=false`
  - diagnostic `MVP_INVALID_NOTE_PITCH`

30. `PL-1 Dispatch rejects invalid duration payload`
- Given: command payload with non-positive or non-integer duration
- When: `dispatch(change_duration|insert_note_after)`
- Then:
  - result `ok=false`
  - diagnostic `MVP_INVALID_COMMAND_PAYLOAD`
  - DOM unchanged

31. `PL-2 Dispatch rejects invalid pitch payload`
- Given: command payload with invalid pitch fields
- When: `dispatch(change_to_pitch|insert_note_after)`
- Then:
  - result `ok=false`
  - diagnostic `MVP_INVALID_COMMAND_PAYLOAD`
  - DOM unchanged

## Additional Recommended Tests

1. `SV-1 No pretty-print artifacts in save output`
2. `IN-1 Insert success in underfull local lane`
