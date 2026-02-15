# Command Catalog (MVP)

## Purpose

This document defines the `dispatch(command)` boundary for MVP.

## Command Envelope

```ts
type NodeId = string;
type VoiceId = string;
type MeasureNumber = string;

type CoreCommand =
  | ChangePitchCommand
  | ChangeDurationCommand
  | InsertNoteAfterCommand
  | DeleteNoteCommand
  | SplitNoteCommand
  | UiNoopCommand;

type DispatchResult = {
  ok: boolean;
  dirtyChanged: boolean;
  changedNodeIds: NodeId[];
  affectedMeasureNumbers: MeasureNumber[];
  diagnostics: Array<{ code: DiagnosticCode; message: string }>;
  warnings: Array<{ code: WarningCode; message: string }>;
};
```

## Command Definitions

### 1. `change_to_pitch`

```ts
type ChangePitchCommand = {
  type: "change_to_pitch";
  targetNodeId: NodeId;
  voice: VoiceId;
  pitch: {
    step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
    alter?: -2 | -1 | 0 | 1 | 2;
    octave: number;
  };
};
```

Rules:

- MUST patch only the target note pitch-related fields.
- MUST validate payload before mutation.
- MUST reject command/target voice mismatch (`MVP_UNSUPPORTED_NON_EDITABLE_VOICE`).
- MUST reject `grace` / `cue` / `chord` targets (`MVP_UNSUPPORTED_NOTE_KIND`).
- Rest target is allowed in MVP for rest-to-note conversion.

### 2. `change_duration`

```ts
type ChangeDurationCommand = {
  type: "change_duration";
  targetNodeId: NodeId;
  voice: VoiceId;
  duration: number;
};
```

Rules:

- MUST patch only the target `<duration>` and required notation hints.
- MUST validate duration payload before mutation.
- MUST reject command/target voice mismatch (`MVP_UNSUPPORTED_NON_EDITABLE_VOICE`).
- MUST reject `grace` / `cue` / `chord` / `rest` targets (`MVP_UNSUPPORTED_NOTE_KIND`).
- MUST reject overfull (`MEASURE_OVERFULL`).
- If underfull, MAY succeed and MAY return `MEASURE_UNDERFULL` warning.
- Engine MAY consume nearby rests and/or fill underfull gap with rests to keep measure integrity.

### 3. `insert_note_after`

```ts
type InsertNoteAfterCommand = {
  type: "insert_note_after";
  anchorNodeId: NodeId;
  voice: VoiceId;
  note: {
    duration: number;
    pitch: {
      step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
      alter?: -2 | -1 | 0 | 1 | 2;
      octave: number;
    };
  };
};
```

Rules:

- MUST insert one note after anchor in same local voice lane.
- MUST reject cross-lane/cross-boundary insertion (`MVP_UNSUPPORTED_NON_EDITABLE_VOICE`).
- MUST reject overfull (`MEASURE_OVERFULL`).

### 4. `delete_note`

```ts
type DeleteNoteCommand = {
  type: "delete_note";
  targetNodeId: NodeId;
  voice: VoiceId;
};
```

Rules:

- MUST delete only target note.
- MUST reject command/target voice mismatch (`MVP_UNSUPPORTED_NON_EDITABLE_VOICE`).
- MUST reject `grace` / `cue` / `chord` / `rest` targets (`MVP_UNSUPPORTED_NOTE_KIND`).
- MUST reject structural delete at backup/forward boundary.
- For non-chord delete, implementation MAY replace target note with same-duration rest.

### 5. `split_note`

```ts
type SplitNoteCommand = {
  type: "split_note";
  targetNodeId: NodeId;
  voice: VoiceId;
};
```

Rules:

- MUST split one note into two adjacent notes.
- Current implementation requires even, integer duration >= 2.
- MUST reject boundary crossing (`MVP_UNSUPPORTED_NON_EDITABLE_VOICE`).

### 6. `ui_noop`

```ts
type UiNoopCommand = {
  type: "ui_noop";
  reason: "selection_change" | "cursor_move" | "viewport_change";
};
```

Rules:

- MUST succeed without DOM mutation.
- MUST NOT set dirty.

## Atomicity Contract

On command failure:

- return `ok=false`
- attach diagnostic(s)
- DOM MUST remain unchanged
- dirty MUST remain unchanged

## Save Boundary

- `dirty===false` -> `original_noop`
- `dirty===true` -> `serialized_dirty`
- pretty-printing is not applied
