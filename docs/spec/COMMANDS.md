# Command and Save Contract (MVP)

## Purpose

This document defines the minimum command/save contract for core.

Scope note:

- This file is a compact contract summary.
- Command-by-command normative rules are defined in `docs/spec/COMMAND_CATALOG.md`.
- Diagnostic code semantics are defined in `docs/spec/DIAGNOSTICS.md`.

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

## Required Behavior (Summary)

1. `dispatch(command)`
- MUST enforce command voice and structural constraints.
- MUST reject malformed payload and invalid target kind.
- MUST reject overfull mutations.
- MUST be atomic on failure (DOM unchanged, dirty unchanged).
- MUST set `dirty=true` only when a content-changing command succeeds.

2. Supported command family (MVP)
- `change_to_pitch`
- `change_duration`
- `insert_note_after`
- `delete_note`
- `split_note`
- `ui_noop`

3. `save()`
- `dirty === false` -> MUST return original XML (`mode="original_noop"`).
- `dirty === true` -> MUST return serialized current DOM (`mode="serialized_dirty"`).
- MUST reject invalid score state.

4. Serialization policy
- MUST preserve unknown/unsupported elements.
- MUST NOT normalize unrelated `<backup>`, `<forward>`, existing `<beam>`.
- pretty-printing MUST NOT be applied.

For detailed per-command rules, use `docs/spec/COMMAND_CATALOG.md` as the normative source.
