# UI Specification (MVP)

## Purpose

This document defines MVP UI behavior for `mikuscore` while preserving core guarantees.

UI is an interaction layer only. Core remains the single source of truth for score mutation.

## Non-Negotiable Rule

- UI MUST NOT mutate XML DOM directly.
- UI MUST call core APIs only: `load(xml)`, `dispatch(command)`, `save()`.

## Screen Layout (MVP)

1. Input Panel
- Paste/import MusicXML text
- `Load` button

2. Editor Panel
- Note list (by `nodeId`, voice, pitch, duration)
- Selection state (`selectedNodeId`)
- Command controls:
  - change pitch
  - change duration
  - insert note after selected
  - delete selected note

3. Diagnostics Panel
- Last dispatch diagnostics/warnings
- Last save diagnostics

4. Output Panel
- Save mode display (`original_noop` / `serialized_dirty`)
- Output XML textarea (read-only in MVP)
- Download button

## Input Panel Pattern (Recommended)

Use the same interaction pattern as existing music tools:

- Input mode radio:
  - `file` (default)
  - `source`
- Two mutually exclusive blocks:
  - `sourceInputBlock`: textarea for MusicXML paste/edit
  - `fileInputBlock`: file selection UI + hidden file input

Recommended element IDs:

- `inputModeFile`
- `inputModeSource`
- `sourceInputBlock`
- `fileInputBlock`
- `xmlInput`
- `fileSelectBtn`
- `fileInput`
- `fileNameText`
- `loadBtn`

Recommended behavior:

1. On mode change, UI MUST toggle visibility between source/file blocks.
2. File mode:
- clicking `fileSelectBtn` opens hidden `fileInput`
- selected file name is shown in `fileNameText`
- file text is read as UTF-8 and copied to `xmlInput`
3. Source mode:
- `xmlInput` is the authoritative source text
4. `loadBtn` always calls `core.load(xmlInput.value)` after source text is prepared.

## UI State Model (MVP)

```ts
type UiState = {
  loaded: boolean;
  dirty: boolean;
  selectedNodeId: string | null;
  noteNodeIds: string[];
  lastDispatchResult: DispatchResult | null;
  lastSaveResult: SaveResult | null;
  sourceXmlText: string;
  outputXmlText: string;
};
```

## Core Integration Contract

1. `Load` action
- Input: raw XML text
- Effect:
  - call `core.load(xml)`
  - refresh `noteNodeIds = core.listNoteNodeIds()`
  - reset selection, dispatch/save results
  - set `dirty = core.isDirty()`

2. `Dispatch` action
- Preconditions:
  - score loaded
  - command payload built from current UI controls
- Effect:
  - call `core.dispatch(command)`
  - store `lastDispatchResult`
  - refresh `noteNodeIds`
  - set `dirty = core.isDirty()`
  - if selected node deleted, clear selection

3. `Save` action
- Effect:
  - call `core.save()`
  - store `lastSaveResult`
  - if `ok=true`, set `outputXmlText = result.xml`

## Selection and Command Rules

- Selection key is `nodeId` only.
- If `selectedNodeId` is missing from refreshed `noteNodeIds`, UI MUST clear selection.
- UI MAY pre-validate obvious required fields, but core validation is authoritative.

## Diagnostics Display Policy

- Display diagnostics/warnings in arrival order.
- Always show `code` and `message`.
- Error color and warning color MUST be visually distinct.
- UI MUST NOT hide core diagnostics.

## Dirty Display Policy

- Dirty indicator is derived from `core.isDirty()`.
- `ui_noop` operations MUST NOT change dirty indicator.

## Save/Download Policy

- Download uses the latest successful `save()` output only.
- If `save().ok=false`, download MUST be disabled until next successful save.

## Accessibility (MVP)

- Keyboard focus order across panels MUST be predictable.
- Buttons MUST have clear labels.
- Diagnostics area SHOULD be screen-reader friendly (live region recommended).

## Out of Scope (MVP UI)

- Notation rendering
- Advanced keyboard editing model
- Undo/redo history
- Multi-voice editing workflow
- Pretty-print or XML text formatting features
