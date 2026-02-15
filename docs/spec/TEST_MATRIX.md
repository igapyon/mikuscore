# MVP Test Matrix

## Purpose

Executable test planning mapped from MVP requirements.

## Required Automated Tests

1. `RT-0 No-op save returns original text`
- Given: loaded XML, no content-changing command
- When: `save()`
- Then:
  - `mode === "original_noop"`
  - output equals original input

2. `RT-1 Pitch change produces serialized output`
- Given: loaded XML
- When: `change_to_pitch` succeeds
- Then:
  - dirty becomes true
  - `save().mode === "serialized_dirty"`

3. `TI-1 Overfull is rejected`
- Given: measure at capacity
- When: command increases occupied time beyond capacity
- Then:
  - `ok=false`
  - `MEASURE_OVERFULL`
  - DOM unchanged

4. `TI-2 Underfull handling`
- Given: command reduces occupied time below capacity
- Then:
  - command MAY succeed
  - warning MAY include `MEASURE_UNDERFULL`
  - implementation-dependent rest compensation behavior stays consistent

5. `BF-1 Voice mismatch rejected`
- Given: command voice does not match target note voice
- Then:
  - `ok=false`
  - `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`

6. `NK-1 Unsupported note kind rejected`
- Given: command targeting `grace`, `cue`, or `chord`
- Then:
  - `ok=false`
  - `MVP_UNSUPPORTED_NOTE_KIND`

7. `NK-2 Rest conversion allowed for change_to_pitch`
- Given: rest note target
- When: `change_to_pitch`
- Then:
  - MAY succeed
  - rest can be converted to pitched note

8. `DR-1 Dirty not set by ui_noop`
- Given: loaded XML
- When: `dispatch({ type: "ui_noop" })`
- Then:
  - `ok=true`
  - dirty unchanged

9. `BF-2 Structural boundary reject`
- Given: edit point at backup/forward boundary
- When: structural command (`insert_note_after` / `delete_note` / `split_note`)
- Then:
  - `ok=false`
  - `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`

10. `SP-1 split_note success`
- Given: editable note with even duration >= 2
- When: `split_note`
- Then:
  - target split into two notes with half duration each

11. `SP-2 split_note reject odd duration`
- Given: note with odd duration
- When: `split_note`
- Then:
  - `ok=false`
  - `MVP_INVALID_COMMAND_PAYLOAD`

12. `DL-1 delete_note handling`
- Given: non-chord target note
- When: `delete_note`
- Then:
  - target removed/replaced according to implementation
  - measure integrity rules preserved

13. `SV-1 Save rejects invalid score state`
- invalid duration -> `MVP_INVALID_NOTE_DURATION`
- invalid voice -> `MVP_INVALID_NOTE_VOICE`
- invalid pitch -> `MVP_INVALID_NOTE_PITCH`

14. `SV-2 Save rejects overfull`
- Given: current score overfull
- When: `save()`
- Then:
  - `ok=false`
  - `MEASURE_OVERFULL`
