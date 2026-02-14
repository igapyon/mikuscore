# Command Catalog (MVP)

## Purpose

This document fixes the API boundary for `dispatch(command)` in MVP.
It complements:

- `docs/spec/COMMANDS.md` (result contract / save contract)
- `docs/spec/DIAGNOSTICS.md` (error and warning codes)
- `docs/spec/TEST_MATRIX.md` (required test coverage)

## Command Envelope

```ts
type NodeId = string;
type VoiceId = string;

type CoreCommand =
  | ChangePitchCommand
  | ChangeDurationCommand
  | InsertNoteAfterCommand
  | DeleteNoteCommand
  | UiNoopCommand;
```

## Command Definitions

### 1. `change_pitch`

```ts
type ChangePitchCommand = {
  type: "change_pitch";
  targetNodeId: NodeId; // note node
  voice: VoiceId; // must match editable voice in MVP
  pitch: {
    step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
    alter?: -2 | -1 | 0 | 1 | 2;
    octave: number;
  };
};
```

Rules:

- MUST only patch pitch-related children of the target note.
- MUST NOT rewrite sibling notes or measure structure.
- MUST reject when `voice` is non-editable (`MVP_UNSUPPORTED_NON_EDITABLE_VOICE`).
- On success: `dirty=true`.

### 2. `change_duration`

```ts
type ChangeDurationCommand = {
  type: "change_duration";
  targetNodeId: NodeId; // note node
  voice: VoiceId;
  duration: number; // MusicXML duration units
};
```

Rules:

- MUST modify only the target `<duration>` (minimal patch).
- MUST validate measure integrity after tentative change:
  - if overfull: reject with `MEASURE_OVERFULL`, no mutation
  - if underfull: MAY succeed, MAY emit `MEASURE_UNDERFULL`
- MUST reject non-editable voice with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.
- On success: `dirty=true`.

### 3. `insert_note_after`

```ts
type InsertNoteAfterCommand = {
  type: "insert_note_after";
  anchorNodeId: NodeId; // insert after this note in same voice lane
  voice: VoiceId;
  note: {
    duration: number;
    pitch?: {
      step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
      alter?: -2 | -1 | 0 | 1 | 2;
      octave: number;
    };
    isRest?: boolean;
  };
};
```

Rules:

- MUST insert only one note/rest node near anchor (no full-measure regeneration).
- Existing `<backup>/<forward>` MUST remain untouched.
- Existing unrelated `<beam>` MUST remain untouched.
- If insertion implies unsupported backup/forward restructuring: reject with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.
- If result is overfull: reject with `MEASURE_OVERFULL`, no mutation.
- If result is underfull: MAY succeed with warning.
- On success: `dirty=true`.

### 4. `delete_note`

```ts
type DeleteNoteCommand = {
  type: "delete_note";
  targetNodeId: NodeId;
  voice: VoiceId;
};
```

Rules:

- MUST delete only the target note node.
- MUST NOT auto-fill rests, split notes, add ties, or modify divisions.
- MUST reject non-editable voice with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.
- Underfull after deletion is allowed (warning optional).
- On success: `dirty=true`.

### 5. `ui_noop`

```ts
type UiNoopCommand = {
  type: "ui_noop";
  reason: "selection_change" | "cursor_move" | "viewport_change";
};
```

Rules:

- MUST produce `ok=true` without content mutation.
- MUST NOT set `dirty=true`.
- Useful for integration tests that verify dirty boundaries.

## Common Precondition Checks

For content-changing commands, core MUST evaluate in this order:

1. Resolve `targetNodeId` / `anchorNodeId` to an existing note node.
2. Verify target command voice equals editable voice (`voice=1` by default).
3. Verify operation does not require backup/forward restructuring.
4. Apply operation on a tentative basis and validate measure integrity.
5. Commit patch atomically only if constraints pass.

## Atomicity Contract

If command fails:

- return `ok=false`
- include diagnostic code(s)
- DOM MUST be unchanged
- dirty MUST be unchanged

This applies to all rejection paths, including overfull and non-editable voice.

## Save Boundary

Catalog commands do not change save behavior:

- `dirty===false` -> save mode `original_noop`, return original XML text
- `dirty===true` -> save mode `serialized_dirty`, return serializer output

No pretty-printing is allowed.
