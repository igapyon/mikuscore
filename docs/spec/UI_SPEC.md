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

4. Verification / Output Panel
- Playback controls
- Save mode display (`original_noop` / `serialized_dirty`)
- Output XML textarea (read-only in MVP)
- Download button

5. Preview Panel
- Lightweight preview for fast edit feedback
- Verovio confirmation preview for final visual check
- Click selection on rendered notes for edit target picking

6. Detail Panel (collapsible)
- Detailed diagnostics
- Supplemental technical information

## UX Flow (Recommended)

UI should be organized in this order:

1. Input
2. Edit
3. Verify / Save

Developer-only controls should be separated from primary flow using a collapsed section (e.g. `details`).

## Preview Policy (MVP)

- UI SHOULD support two preview modes:
  - `quick` (fast feedback while editing)
  - `verovio_confirm` (ground-truth visual confirmation)
- `quick` preview SHOULD update after dispatch-level edits.
- `verovio_confirm` preview SHOULD update on successful save and MAY be manually refreshed.
- Verovio preview data source MUST be current in-memory score XML (serialized from core), not stale source text.

## Verovio Integration Policy

- Verovio runtime initialization MUST be guarded (runtime-ready check + timeout handling).
- On render failure, UI MUST show explicit error text in preview metadata area.
- Long-horizontal confirmation mode (no page breaks) MAY be provided as a fixed debug option.

## Verovio Click-Edit Mapping Policy

Goal: Enable direct editing from rendered notation:

`click note on SVG -> resolve element id -> map to editable nodeId -> dispatch core command`

Current scope (agreed):

- First release targets `change_pitch` only.
- Selection model is single-note only.
- Click action is selection only; edit execution remains explicit via existing UI controls.
- Mapping failure behavior is warning/diagnostics only (no mutation, no implicit fallback edit).

- Verovio-rendered SVG MUST expose element identifiers (`id`) for note elements.
- Editable MusicXML notes SHOULD have stable IDs (prefer `xml:id`) before rendering.
- UI click handler SHOULD use DOM traversal (e.g. `closest('[id]')`) to capture target element id.
- UI click handler SHOULD try multiple hit-testing paths:
  - DOM traversal from click target (`closest('[id]')`)
  - `elementsFromPoint(clientX, clientY)` fallback when target id is non-note/container
- UI MUST convert SVG element id into core target (`nodeId`) through a deterministic mapping layer.
- After mapping, UI MUST invoke core command APIs only (`dispatch(change_pitch, ...)`, etc.).
- After successful dispatch, UI MUST re-render both quick preview and Verovio confirmation preview.

Implementation notes:

- If note-level stable IDs are missing, mapping may become unreliable across re-layout; assign stable IDs during load/normalize phase.
- For MVP click-edit, note IDs SHOULD be session-scoped temporary IDs and SHOULD NOT be persisted to saved XML.
- Verovio toolkit helper APIs (e.g. `getElementAttr`, `getPageWithElement`, `getTimeForElement`) MAY be used for fallback lookup/debugging.
- Mapping failures MUST be surfaced in diagnostics (do not silently ignore).
- Mapping failures SHOULD be visible in both UI diagnostics and browser console log for troubleshooting.

## Save/Download/Playback Policy

- Playback path SHOULD validate score via `save()` before playing.
- Playback is a primary user feature (not developer-only debug functionality).
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

- Advanced keyboard editing model
- Undo/redo history
- Multi-voice editing workflow
- Pretty-print or XML text formatting features
