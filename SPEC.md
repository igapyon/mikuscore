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
load(xml) → edit → save()
```

The resulting MusicXML MUST preserve:

- Musical meaning
- Playback semantics
- Notational intent

---

## 2.2 Structural Identity (MUST)

The following MUST be preserved:

- part / measure / voice structure
- ordering of elements where possible
- unknown / unsupported elements
- existing `<backup>` and `<forward>`
- existing `<beam>`

Unknown elements MUST NOT be deleted.

---

## 2.3 Textual Identity (NON-GUARANTEED)

The system DOES NOT guarantee:

- identical whitespace
- identical attribute order
- identical indentation
- identical XML declaration formatting

Textual diff-zero is NOT required.

---

# 3. No-op Save Optimization

## 3.1 Definition

If no editing command has modified musical content:

```
dirty === false
```

Then:

- The original XML text MUST be returned unchanged.
- Output mode MUST be `"original_noop"`.

This guarantees diff-zero when no edit occurs.

---

# 4. Architecture Separation

## 4.1 Core Responsibilities

- DOM preservation
- Original XML retention
- Minimal patch updates
- Dirty tracking
- Command dispatch
- Measure integrity validation
- Beam policy enforcement
- Backup/forward preservation
- Serialization

## 4.2 UI Responsibilities

- Selection state
- Cursor management
- Input interpretation
- Rendering
- Displaying warnings/errors

UI MUST NOT modify DOM directly.

---

# 5. DOM Preservation Strategy

## 5.1 Node Identity

- Internal `nodeId` MUST be assigned.
- XML MUST NOT be modified to store nodeId.
- Mapping SHALL use WeakMap<Node, NodeId>.
- `nodeId` stability is required only within a loaded session.
- Cross-reload `nodeId` identity is NOT guaranteed in MVP.

## 5.2 Minimal Patch Rule

Edits MUST:

- Modify only required nodes.
- Not regenerate entire measures.
- Not reorder siblings.
- Not normalize unrelated elements.

---

# 6. Measure Time Integrity (MVP)

Definitions:

- measureCapacity = beats × divisions
- occupiedTime = sum of durations in editable voice

## 6.1 Overfull (MUST Reject)

If occupiedTime > measureCapacity:

- dispatch MUST return `ok=false`
- DOM MUST remain unchanged
- Diagnostic code: `MEASURE_OVERFULL`

Saving MUST be rejected.

## 6.2 Underfull (MAY Allow)

If occupiedTime < measureCapacity:

- Operation MAY succeed
- Warning MAY be issued
- No rest auto-fill allowed

Saving is allowed.

## 6.3 Automatic Corrections (FORBIDDEN)

The system MUST NOT automatically:

- Insert rests
- Split notes
- Add ties
- Modify `<divisions>`
- Recalculate `<backup>` / `<forward>`

---

# 7. Beam Policy

## 7.1 Preservation

- MUST NOT auto-normalize existing `<beam>` elements.

## 7.2 New Notes

- MAY assign `<beam>` to newly created notes.

## 7.3 Local Recalculation (Conditional)

Beam recalculation MAY occur ONLY within a "continuous region":

A continuous region is defined as:

- Same part
- Same measure
- Same voice
- Beam-eligible notes (flagged durations)
- Time-index continuous (no rest, no backup/forward boundary)

Beam recalculation MUST NOT:

- Cross measure boundaries
- Affect other voices
- Modify unrelated beams

---

# 8. Backup / Forward Policy (MVP)

## 8.1 Preservation

- `<backup>` and `<forward>` MUST be preserved.
- MUST NOT be auto-generated or removed.
- MUST NOT be normalized on save.

## 8.2 Editing Constraints

MVP supports editing only editable voices (default: voice=1).

- Editing non-editable voices MUST fail.
- Editing that requires restructuring backup/forward MUST fail.
- Diagnostic code: `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`
- Editing `grace`, `cue`, `chord`, and `rest` notes MUST fail in MVP.
- Diagnostic code: `MVP_UNSUPPORTED_NOTE_KIND`

---

# 9. Dirty State Definition

`dirty = true` ONLY when:

- A content-changing command succeeds.

UI-only actions MUST NOT set dirty.

---

# 10. Save Behavior

```
if dirty === false:
  return original XML text
else:
  return XMLSerializer output
```

Pretty-printing MUST NOT be applied.

---

# 11. Testing Requirements

The following MUST be covered by automated tests:

- RT-0: No-op save returns original text
- RT-1: Pitch change produces serialized output
- TI-1: Overfull is rejected
- TI-2: Underfull allowed with warning
- PT-1: Unknown elements preserved
- BM-1: Existing beam unchanged
- BF-1: Non-editable voice rejected
- NK-1: Unsupported note kind (`grace/cue/chord/rest`) rejected

---

# End of MVP Core Specification
