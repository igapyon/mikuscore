# Command and Save Contract (MVP)

## Purpose

This document defines the minimum command interface contract for core implementation.

## Suggested Core API (MVP)

```ts
type DiagnosticCode =
  | "MEASURE_OVERFULL"
  | "MVP_UNSUPPORTED_NON_EDITABLE_VOICE"
  | "MVP_UNSUPPORTED_NOTE_KIND"
  | "MVP_SCORE_NOT_LOADED"
  | "MVP_COMMAND_TARGET_MISSING"
  | "MVP_TARGET_NOT_FOUND"
  | "MVP_COMMAND_EXECUTION_FAILED"
  | "MVP_INVALID_COMMAND_PAYLOAD"
  | "MVP_INVALID_NOTE_DURATION"
  | "MVP_INVALID_NOTE_VOICE"
  | "MVP_INVALID_NOTE_PITCH";

type WarningCode =
  | "MEASURE_UNDERFULL";

type DispatchResult = {
  ok: boolean;
  dirtyChanged: boolean;
  changedNodeIds: NodeId[];
  affectedMeasureNumbers: string[];
  diagnostics: Array<{ code: DiagnosticCode; message: string }>;
  warnings: Array<{ code: WarningCode; message: string }>;
};

type SaveMode = "original_noop" | "serialized_dirty";

type SaveResult = {
  ok: boolean;
  mode: SaveMode;
  xml: string;
  diagnostics: Array<{ code: DiagnosticCode; message: string }>;
};
```

## Required Behavior

1. `dispatch(command)`:
- MUST reject commands targeting non-editable voice with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.
- MUST reject commands targeting unsupported note kinds (`grace`, `cue`, `chord`, `rest`) with `MVP_UNSUPPORTED_NOTE_KIND`.
- MUST reject malformed command payloads with `MVP_INVALID_COMMAND_PAYLOAD`.
- MUST reject overfull measure with `MEASURE_OVERFULL`.
- MUST leave DOM unchanged on reject.
- MUST set `dirty=true` only when a content-changing command succeeds.
- On success, MUST return changed/affected node IDs in `changedNodeIds`.
- On success, SHOULD return affected measure numbers in `affectedMeasureNumbers`.
- UI-only commands MUST NOT set dirty.

2. `save()`:
- If `dirty === false`, MUST return original input XML text with `mode="original_noop"`.
- If `dirty === true`, MUST return `XMLSerializer` output with `mode="serialized_dirty"`.
- If current score state is overfull, save MUST be rejected with `ok=false` and diagnostic `MEASURE_OVERFULL`.
- If any note has invalid or missing duration, save MUST be rejected with `MVP_INVALID_NOTE_DURATION`.
- If any note has invalid or missing voice, save MUST be rejected with `MVP_INVALID_NOTE_VOICE`.
- If any non-rest note has invalid or missing pitch, save MUST be rejected with `MVP_INVALID_NOTE_PITCH`.
- If a rest note contains pitch, save MUST be rejected with `MVP_INVALID_NOTE_PITCH`.
- If a chord note lacks pitch, save MUST be rejected with `MVP_INVALID_NOTE_PITCH`.
- Pretty-printing MUST NOT be applied.

3. Serialization:
- MUST preserve unknown/unsupported elements in DOM.
- MUST NOT normalize `<backup>`, `<forward>`, existing `<beam>`.

## Command Categories (MVP)

- `Content-changing`: pitch edit, duration edit, note insertion/deletion (only if policy constraints pass).
- `UI-only`: selection move, cursor move, viewport changes (tracked outside core or no-op in core).

## Rejection Rule

- On any constraint violation, command MUST fail atomically:
  - no partial mutation
  - no dirty transition
  - diagnostic(s) attached
