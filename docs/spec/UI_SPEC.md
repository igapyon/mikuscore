# UI Specification (MVP)

## English
## Purpose
This document defines current MVP UI behavior for `mikuscore`.

The UI is only an interaction layer; Core remains the single source of truth for score mutation.

Scope note:

- This file is the normative UI behavior specification.
- Screen text inventory and tooltip copy are maintained in `docs/spec/SCREEN_SPEC.md`.

## Non-Negotiable Rule
- UI MUST NOT mutate XML DOM directly.
- UI MUST call core APIs only: `load(xml)`, `dispatch(command)`, `save()`.

## Current Screen Structure
Top-level flow is a 4-step tabbed stepper:
1. Input (`data-tab="input"`)
2. Score (`data-tab="score"`)
3. Edit (`data-tab="edit"`)
4. Export (`data-tab="save"`)

## Input Behavior
- Input type radio:
  - `MusicXML input`
  - `ABC input`
  - `Create new`
- Input mode radio:
  - `File load`
  - `Source input`
- When loading from `ABC input`:
  - Convert ABC -> MusicXML
  - Continue all downstream flow using MusicXML DOM as source of truth

## Score Behavior
- Verovio SVG preview is the interaction target.
- Clicking a note resolves to core `nodeId` through mapping layer.
- Mapping strategy:
  - target/ancestor id traversal
  - `elementsFromPoint` fallback
- Playback controls are provided (`Play`, `Stop`).

## Playback Behavior (iPhone Safari Considerations)
- iPhone Safari autoplay policy requires user gesture for sound start.
- UI SHOULD unlock audio on early gesture events (`pointerdown` / `touchstart`) before `click`.
- Synth engine MUST resume `AudioContext` in gesture-linked flow before scheduling notes.
- Runtime SHOULD fallback to `webkitAudioContext` when `AudioContext` is unavailable.
- Unlock SHOULD use a very short near-silent buffer playback to stabilize first audible playback.
- Playback failure (no Web Audio API / resume failure) MUST NOT crash UI and SHOULD surface status text.

## Edit Behavior
- If no measure selected, show empty-state card with `Go to Score` action.
- If selected:
  - show measure preview
  - show edit controls
- Command controls:
  - `Convert Rest to Note`
  - `Split Note`
  - `Delete Note`
  - pitch up/down
  - alter buttons (`None`, `♭♭`, `♭`, `♮`, `♯`, `♯♯`)
  - duration dropdown
- Command diagnostics are shown inline under duration selector (`#uiMessage`).

## Output Behavior
- Download buttons:
  - `MusicXML Export`
  - `ABC Export`
  - `MIDI Export`
- General settings:
  - `Export MusicXML text as .xml extension` (default: OFF)
  - `Compress MusicXML / MuseScore export`
  - If `Export MusicXML text as .xml extension` is ON, compression is forced OFF.
  - If compression is turned ON, `Export MusicXML text as .xml extension` is turned OFF.
- Download names include timestamp suffix:
  - MusicXML text export: `mikuscore-YYYYMMDDhhmm.musicxml` (default) or `mikuscore-YYYYMMDDhhmm.xml` (when enabled)
  - `mikuscore-YYYYMMDDhhmm.abc`
  - `mikuscore-YYYYMMDDhhmm.mid`

## Selection / Command Rules
- Selection key is `nodeId`.
- If selected node disappears after command, selection is cleared.
- Core diagnostics are authoritative.

## Accessibility / UX Notes
- Buttons have explicit labels.
- Empty/disabled states are visually distinct.
- Editing actions stay explicit (no hidden auto-apply beyond defined control events).

---

## 日本語（抄訳）

- 正本は上記 English セクションです。
- 本セクションは要点のみを示します。
- 例外として、未決定事項や検討中メモは日本語のみで記述する場合があります。

### 要点
- UI は操作レイヤであり、Core が唯一の変更主体です。
- UI は `load(xml)` / `dispatch(command)` / `save()` 以外で XML DOM を直接変更しません。
- 画面は `Input -> Score -> Edit -> Export` の4段構成です。
- 詳細な挙動・制約は English セクションを参照してください。
