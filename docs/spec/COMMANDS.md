# Command and Save Contract (MVP)

## Purpose

This document defines the minimum command/save contract for core.

## Core API Shape

```ts
type DispatchResult = {
  ok: boolean;
  dirtyChanged: boolean;
  changedNodeIds: NodeId[];
  affectedMeasureNumbers: string[];
  diagnostics: Array<{ code: DiagnosticCode; message: string }>;
  warnings: Array<{ code: WarningCode; message: string }>;
};

type SaveResult = {
  ok: boolean;
  mode: "original_noop" | "serialized_dirty";
  xml: string;
  diagnostics: Array<{ code: DiagnosticCode; message: string }>;
};
```

## Required Behavior

1. `dispatch(command)`
- MUST reject non-editable voice with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.
- MUST reject malformed payload with `MVP_INVALID_COMMAND_PAYLOAD`.
- MUST reject overfull with `MEASURE_OVERFULL`.
- MUST be atomic on failure (DOM unchanged, dirty unchanged).
- MUST set `dirty=true` only when content-changing command succeeds.

2. Supported command family (MVP)
- `change_to_pitch`
- `change_duration`
- `insert_note_after`
- `delete_note`
- `split_note`
- `ui_noop`

3. Note-kind rule
- `grace` / `cue` / `chord` are unsupported for direct edit and SHOULD fail with `MVP_UNSUPPORTED_NOTE_KIND`.
- `rest` is unsupported for most commands, but `change_to_pitch` MAY target rest for rest-to-note conversion.

4. `save()`
- `dirty === false` -> MUST return original XML (`mode="original_noop"`).
- `dirty === true` -> MUST return serialized current DOM (`mode="serialized_dirty"`).
- MUST reject invalid score state (overfull / invalid duration / invalid voice / invalid pitch).

5. Serialization policy
- MUST preserve unknown/unsupported elements.
- MUST NOT normalize unrelated `<backup>`, `<forward>`, existing `<beam>`.
- pretty-printing MUST NOT be applied.
