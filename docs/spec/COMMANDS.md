# Command and Save Contract (MVP)

## Purpose

This document defines the minimum command interface contract for core implementation.

## Suggested Core API (MVP)

```ts
type DiagnosticCode =
  | "MEASURE_OVERFULL"
  | "MVP_UNSUPPORTED_NON_EDITABLE_VOICE";

type WarningCode =
  | "MEASURE_UNDERFULL";

type DispatchResult = {
  ok: boolean;
  dirtyChanged: boolean;
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
- MUST reject overfull measure with `MEASURE_OVERFULL`.
- MUST leave DOM unchanged on reject.
- MUST set `dirty=true` only when a content-changing command succeeds.
- UI-only commands MUST NOT set dirty.

2. `save()`:
- If `dirty === false`, MUST return original input XML text with `mode="original_noop"`.
- If `dirty === true`, MUST return `XMLSerializer` output with `mode="serialized_dirty"`.
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
