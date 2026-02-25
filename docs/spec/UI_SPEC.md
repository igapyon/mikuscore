# UI Specification (MVP)

## English
## Purpose
This document defines current MVP UI behavior for `mikuscore`.

The UI is only an interaction layer; Core remains the single source of truth for score mutation.

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

## 日本語
## 目的
本ドキュメントは `mikuscore` の MVP UI 振る舞いを定義する。

UI は操作レイヤのみで、譜面変更の正本は Core とする。

## 非交渉ルール
- UI は XML DOM を直接変更しない。
- UI は Core API（`load(xml)`, `dispatch(command)`, `save()`）のみ呼ぶ。

## 画面構成
4ステップのタブ式ステッパー:
1. 入力 (`data-tab="input"`)
2. 譜面 (`data-tab="score"`)
3. 編集 (`data-tab="edit"`)
4. 出力 (`data-tab="save"`)

## 入力仕様
- 入力種別ラジオ:
  - `MusicXML入力`
  - `ABC入力`
  - `新規作成`
- 入力モードラジオ:
  - `ファイル読み込み`
  - `ソース入力`
- `ABC入力` の読み込み時:
  - ABC -> MusicXML へ変換
  - 後続処理は MusicXML DOM を正本として継続

## 譜面仕様
- Verovio SVG プレビューを操作対象とする。
- 音符クリックで `nodeId` を解決する。
- マッピングは以下の順で解決:
  - target/ancestor id 走査
  - `elementsFromPoint` フォールバック
- 再生コントロール（`再生`, `停止`）を提供。

## 再生仕様（iPhone Safari 配慮）
- iPhone Safari の autoplay 制約上、音の開始にはユーザー操作起点が必要。
- UI は `click` 前段の `pointerdown` / `touchstart` で先行アンロックを行う。
- シンセ再生前に、ユーザー操作に紐づく経路で `AudioContext.resume()` を実行する。
- `AudioContext` が無い実行環境では `webkitAudioContext` フォールバックを使う。
- 初回再生安定化のため、極短いほぼ無音バッファ再生でアンロックする。
- Web Audio 非対応や resume 失敗時は UI を壊さず、状態テキストで失敗を通知する。

## 編集仕様
- 小節未選択時は empty-state カードを表示し、`譜面へ移動` を提供。
- 小節選択時:
  - 小節プレビュー表示
  - 編集コントロール表示
- コマンド群:
  - `休符を音符化`
  - `音符分割`
  - `音符削除`
  - 音名 up/down
  - 臨時記号（`なし`, `♭♭`, `♭`, `♮`, `♯`, `♯♯`）
  - 音価ドロップダウン
- 診断メッセージは音価ドロップダウン直下（`#uiMessage`）に表示。

## 出力仕様
- 出力ボタン:
  - `MusicXML出力`
  - `ABC出力`
  - `MIDI出力`
- General Settings:
  - `Export MusicXML text as .xml extension`（デフォルト: OFF）
  - `Compress MusicXML / MuseScore export`
  - `Export MusicXML text as .xml extension` が ON の間は、圧縮出力は強制 OFF。
  - 圧縮出力を ON にした場合、`Export MusicXML text as .xml extension` は OFF になる。
- ファイル名は衝突緩和のためタイムスタンプを付与:
  - MusicXMLテキスト出力: デフォルト `mikuscore-YYYYMMDDhhmm.musicxml`、オプション有効時 `mikuscore-YYYYMMDDhhmm.xml`
  - `mikuscore-YYYYMMDDhhmm.abc`
  - `mikuscore-YYYYMMDDhhmm.mid`

## 選択・コマンド規則
- 選択キーは `nodeId`。
- コマンド後に選択ノードが消えた場合は選択解除。
- 診断情報は Core の結果を正とする。

## アクセシビリティ / UX
- ボタンラベルを明示する。
- empty/disabled 状態を視認可能にする。
- 編集操作は明示的に実行し、隠れた自動適用は行わない。
