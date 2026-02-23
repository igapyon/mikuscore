# Browser-based MusicXML Score Editor
## Core Specification (MVP)

---

# 1. Design Principles

## 1.1 Primary Goal

The system MUST prioritize:

- Preservation of existing MusicXML
- Minimal structural modification
- Safe round-trip behavior

The architecture SHALL separate:

- Core (behavior / guarantees)
- UI (interaction / rendering)

---

# 2. Round-trip Guarantees

## 2.1 Semantic Identity (MUST)

After:

```
load(xml) -> edit -> save()
```

The resulting MusicXML MUST preserve:

- Musical meaning
- Playback semantics
- Notational intent

## 2.2 Structural Identity (MUST)

The following MUST be preserved:

- part / measure / voice structure
- ordering of elements where possible
- unknown / unsupported elements
- existing `<backup>` and `<forward>`
- existing `<beam>`

Unknown elements MUST NOT be deleted.

## 2.3 Textual Identity (NON-GUARANTEED)

The system DOES NOT guarantee:

- identical whitespace
- identical attribute order
- identical indentation
- identical XML declaration formatting

---

# 3. No-op Save Optimization

If no content-changing command succeeded (`dirty === false`):

- save MUST return original input XML text unchanged
- save mode MUST be `original_noop`
- save MUST allow missing `<voice>` values in no-op mode (original text pass-through)

If content changed (`dirty === true`):

- save MUST return serialized current DOM
- save mode MUST be `serialized_dirty`

Pretty-printing MUST NOT be applied.

---

# 4. Architecture Separation

## 4.1 Core Responsibilities

- DOM preservation
- Original XML retention
- Minimal patch updates
- Dirty tracking
- Command dispatch
- Measure integrity validation
- Backup/forward and beam preservation
- Serialization

## 4.2 UI Responsibilities

- Selection state
- Input interpretation
- Rendering / preview
- Diagnostics display
- Click-to-select mapping (`SVG id -> nodeId`)

UI MUST NOT mutate score DOM directly.

---

# 5. DOM Preservation Strategy

## 5.1 Node Identity

- Internal `nodeId` MUST be assigned.
- XML MUST NOT persist `nodeId` metadata.
- Mapping SHALL use in-memory identity maps (WeakMap-based strategy).
- `nodeId` stability is session-scoped only.

## 5.2 Minimal Patch Rule

Edits MUST:

- touch only required nodes
- avoid full-measure regeneration unless required by command semantics
- preserve unrelated siblings/elements
- avoid unrelated normalization

---

# 6. Measure Time Integrity

Definitions:

- `measureCapacity = beats x divisions`
- `occupiedTime = sum(duration) for target voice`

## 6.1 Overfull (MUST Reject)

If projected occupied time exceeds capacity:

- dispatch MUST return `ok=false`
- diagnostic code MUST be `MEASURE_OVERFULL`
- DOM MUST remain unchanged

save MUST also reject overfull state.

## 6.2 Underfull (MAY Allow)

If projected occupied time is below capacity:

- operation MAY succeed
- warning `MEASURE_UNDERFULL` MAY be emitted

Implementation MAY apply local rest compensation when needed for command consistency.

## 6.3 Automatic Corrections (Scope)

The system MUST NOT perform unrelated global repairs (e.g. cross-voice/global reflow).

The system MAY perform command-local, bounded adjustments required by command semantics
(e.g. local rest consumption/fill during duration operations).

---

# 7. Command Scope (MVP)

Core supports the following command family:

- `change_to_pitch`
- `change_duration`
- `insert_note_after`
- `delete_note`
- `split_note`
- `ui_noop`

## 7.1 Voice Match Restriction

- Command voice MUST match target note voice; mismatch MUST fail with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.

## 7.2 Note-kind Restriction

- `grace` / `cue` / `chord` are unsupported targets and MUST fail with `MVP_UNSUPPORTED_NOTE_KIND`.
- `rest` is unsupported for most commands, but `change_to_pitch` MAY target rest for rest-to-note conversion.

## 7.3 Structural Boundary Restriction

Structural operations at backup/forward boundaries MUST fail with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.

---

# 8. Backup / Forward and Beam Policy

- Existing `<backup>` / `<forward>` MUST be preserved.
- Existing unrelated `<beam>` MUST be preserved.
- save MUST NOT normalize these structures globally.

---

# 9. Atomicity and Dirty Rules

On command failure:

- `ok=false`
- diagnostics attached
- DOM unchanged
- dirty unchanged

On successful content-changing command:

- dirty becomes true

On `ui_noop`:

- dirty MUST NOT change

---

# 10. Validation on Save

save MUST reject invalid state with diagnostics:

- overfull (`MEASURE_OVERFULL`)
- invalid duration (`MVP_INVALID_NOTE_DURATION`)
- invalid voice (`MVP_INVALID_NOTE_VOICE`) for dirty-save path
- invalid pitch (`MVP_INVALID_NOTE_PITCH`)

For no-op save (`dirty === false`), missing `<voice>` in input MAY be accepted to preserve original XML text without mutation.

When a content-changing command targets a note with missing `<voice>`, implementation MAY apply a command-local voice patch only on the edited note.

---

# 11. Testing Requirements

Automated tests MUST cover:

- no-op save (`original_noop`)
- dirty save (`serialized_dirty`)
- overfull rejection
- underfull behavior
- voice mismatch rejection
- unsupported note-kind rejection rules
- split-note behavior
- rest-to-note conversion path
- atomicity on failure

---

# End of MVP Core Specification
