# UI Specification (MVP)

## Purpose

This document defines current MVP UI behavior for `mikuscore`.

UI is an interaction layer only. Core remains the single source of truth for score mutation.

## Non-Negotiable Rule

- UI MUST NOT mutate XML DOM directly.
- UI MUST call core APIs only: `load(xml)`, `dispatch(command)`, `save()`.

## Current Screen Structure

Top-level flow is a 4-step tabbed stepper:

1. 入力 (`data-tab="input"`)
2. 譜面 (`data-tab="score"`)
3. 編集 (`data-tab="edit"`)
4. 出力 (`data-tab="save"`)

## Input Behavior

- Input type radio:
  - `MusicXML入力`
  - `ABC入力`
  - `新規作成`
- Input mode radio:
  - `ファイル読み込み`
  - `ソース入力`
- `ABC入力` で読み込んだ場合:
  - ABC -> MusicXML に変換
  - 後続処理は MusicXML DOM を正本として進行

## Score (譜面) Behavior

- Verovio SVG preview is the interaction target.
- Click on note in SVG resolves to core `nodeId` via mapping layer.
- Mapping uses:
  - target/ancestor id traversal
  - `elementsFromPoint` fallback
- Playback controls (`再生`, `停止`) are provided in this panel.

## Edit (編集) Behavior

- If no measure selected, show empty state card (`小節が未選択です`) with `譜面へ移動` action.
- If selected:
  - show measure preview
  - show edit controls
- Command controls include:
  - `休符を音符化`
  - `音符分割`
  - `音符削除`
  - pitch up/down
  - alter buttons (`なし`, `♭♭`, `♭`, `♮`, `♯`, `♯♯`)
  - duration dropdown
- Command diagnostic messages are shown inline under duration selector (`#uiMessage`).

## Output (出力) Behavior

- Download buttons:
  - `MusicXML出力`
  - `ABC出力`
  - `MIDI出力`
- Download file names include timestamp suffix to reduce collisions:
  - `mikuscore-YYYYMMDDhhmm.musicxml`
  - `mikuscore-YYYYMMDDhhmm.abc`
  - `mikuscore-YYYYMMDDhhmm.mid`

## Selection / Command Rules

- Selection key is `nodeId`.
- If selected node disappears after command, UI clears selection.
- Core diagnostics are authoritative.

## Accessibility / UX Notes

- Buttons have explicit labels.
- Empty/disabled states are visibly distinct.
- Editing actions are explicit (no hidden auto-apply beyond defined control events).
