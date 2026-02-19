# SCREEN_SPEC

## English
## Purpose
Define the current screen specification for `mikuscore` based on the actual UI text and tooltips in `mikuscore-src.html`.

## Global Layout
- Single-page application.
- Top brand header:
  - `mikuscore` title
  - `About mikuscore` info chip `(i)`
  - GitHub link
- 4-step tab navigation:
  - `Input`
  - `Score`
  - `Edit`
  - `Export`

### Brand Tooltip `(i)` (`About mikuscore`)
- Browser-based local score editor.
- Preserves existing MusicXML structure while editing.
- Supports loading MusicXML/ABC, score preview, note editing, playback, and export/download (`MusicXML`/`ABC`/`MIDI`) in one screen.
- Intentionally small feature set for practical, fast editing, especially on smartphones.
- Smartphone-centered, but usable on PCs as well.
- Workflow guidance:
  - `1) Choose input and load`
  - `2) Select from score preview`
  - `3) Edit notes`
  - `4) Verify by playback and export/download`
- Positioning guidance:
  - Use dedicated notation software for large-scale/complex work.
  - Use mikuscore for quick input or focused partial tasks.

## Tabs / Interaction
- Clicking a top tab opens the corresponding panel.
- Active tab is marked with `is-active`.
- Inactive panels use `hidden`.

## Panel: Input
### Section Title
- `1 Input`

### Header Tooltip `(i)` (`Input help`)
- Load score data first (from file/source) or create a new score.
- Move to `Score`/`Edit`/`Export` after this step.

### Input Type Radio
- `MusicXML Input`
- `ABC Input`
- `New Score`

### Import Mode Radio
- `File input`
- `Source input`

### Blocks
- `newInputBlock`
  - `Use Piano Grand Staff template (treble + bass, single part)`
  - `Track count (parts)`
  - `Time signature`
  - `Key signature`
  - Per-part clef selectors
- `fileInputBlock`
  - File picker (`Load from file`)
  - Selected file name text
- `sourceXmlInputBlock`
  - `MusicXML` textarea
- `abcInputBlock`
  - `ABC` textarea

### Actions
- `Load from file`
- `Load` (source mode)
- `Load sample 1`
- `Load sample 2`

### Messages
- `inputUiMessage` for inline status/error.
- `localDraftNotice` for local draft presence.

## Panel: Score
### Section Title
- `2 Score`

### Header Tooltip `(i)` (`Score preview help`)
- Check loaded score.
- Try quick playback.
- Select target measure for editing.
- Select a note in the target measure, then edit in `Edit`.

### Actions
- `Play`
- `Stop`
- `Add Measure (End)`

### Main Area
- `debugScoreArea` renders Verovio SVG score.
- Click handling maps SVG element id to internal `nodeId`.

### Status
- `playbackText` (default: `Playback: idle`).

## Panel: Edit
### Section Title
- `3 Edit`

### Header Tooltip `(i)` (`Edit help`)
- Start from converting a rest to a note.
- Adjust notes in the selected measure:
  - split
  - pitch
  - accidentals
  - duration
- Quick playback is available.
- `Apply` reflects edits back to `Score`.
- `Discard` cancels current measure edits.
- Arrow buttons move between measures.
- Editing scope is intentionally limited to avoid MusicXML structure breakage risk.

### Navigation / Context
- Selected part label (`measurePartNameText`).
- Measure navigation buttons:
  - previous in track (`←`)
  - next in track (`→`)
  - previous track same measure (`↑`)
  - next track same measure (`↓`)

### Empty State
- Title: `No measure selected`
- Body: `Click a measure in the score to select it`
- Action: `Go to Score`

### Selected Measure Area
- `measureEditorArea` Verovio preview for selected measure.
- Inline message area: `uiMessage`.

### Measure Commit Actions
- `Apply`
- `Discard`

### Note Editing Actions
- `Convert Rest to Note`
- `Split Note`
- `Delete Note`
- `Play` (measure playback)

### Pitch / Duration Controls
- Pitch step controls (`↑` / `↓`) with current step text.
- Accidental buttons:
  - `None`
  - `♭♭`
  - `♭`
  - `♮`
  - `♯`
  - `♯♯`
- Duration preset dropdown: `(Select duration)`

## Panel: Export
### Section Title
- `4 Export`

### Header Tooltip `(i)` (`Export help`)
- Take work out of mikuscore.
- Main flow is `MusicXML` export.
- `ABC` and lightweight `MIDI` export are for quick checks.
- Complex production/export should be handled in dedicated software.

### Export Actions
- `Export MusicXML` (primary)
- `Export ABC`
- `Export MIDI`
- `Discard Draft` (shown conditionally)

### Settings Card
- Accordion title: `MIDI & Playback Settings`

#### Block: `MIDI & Playback Shared Settings`
- `Grace Timing Mode`
  - options:
    - `Before beat (appoggiatura-like)`
    - `On beat (principal delayed)`
    - `Classical equal split`
  - tooltip: applies to MIDI-like playback and MIDI export.
- `Use metric beat accents` (switch)
  - tooltip:
    - adds subtle beat emphasis for MIDI-like playback/export
    - pattern examples:
      - `4/4: strong-weak-medium-weak`
      - `6/8: strong-weak-weak-medium-weak-weak`
      - `3-beat: strong-weak-weak`
      - `5-beat: strong-weak-medium-weak-weak`
      - `others: strong-weak-weak-...`
- `Accent amount`
  - options:
    - `Subtle`
    - `Balanced`
    - `Strong`
  - tooltip: controls velocity gap of metric accents when enabled.

#### Block: `MIDI Settings`
- `MIDI Export Instrument`
  - tooltip: used when MusicXML does not specify an instrument for the part.
- `Always override instrument` (switch)
  - tooltip: always override MusicXML instrument with selected export instrument.

#### Block: `Playback Settings`
- `Use MIDI-like playback` (switch)
  - tooltip: uses MIDI-style timing/expression in quick playback.
- `Quick Playback Tone`
  - options:
    - `Sine`
    - `Triangle`
    - `Square`

#### Settings Actions / Debug
- `Reset to defaults`
- Block: `MIDI Debug`
  - `Refresh MIDI Debug`
  - `midiDebugText` output area

### File Naming Policy
- `mikuscore-YYYYMMDDhhmm.musicxml`
- `mikuscore-YYYYMMDDhhmm.abc`
- `mikuscore-YYYYMMDDhhmm.mid`

## Diagnostics / UI Messaging
- `inputUiMessage` and `uiMessage` are used for inline feedback.
- Save/dispatch diagnostics are surfaced without rewriting core diagnostic code semantics.

## Non-goals
- Complex score-authoring workflows.
- Heavy multi-step modal workflows.
- Advanced history management in-screen (`undo`/`redo`).

---

## 日本語
## 目的
`mikuscore-src.html` の現行文言・ツールチップに合わせて、`mikuscore` の画面仕様を定義する。

## 全体レイアウト
- 単一ページ構成。
- 上部ブランドヘッダ:
  - `mikuscore` タイトル
  - `About mikuscore` 情報チップ `(i)`
  - GitHub リンク
- 4ステップのタブ導線:
  - `Input`
  - `Score`
  - `Edit`
  - `Export`

### ブランドツールチップ `(i)` (`About mikuscore`)
- ブラウザで動くローカル譜面エディタ。
- 編集時に既存 MusicXML 構造を極力維持。
- 1画面で `MusicXML/ABC` 読み込み、譜面プレビュー、ノート編集、再生、`MusicXML/ABC/MIDI` 出力に対応。
- 機能は意図的に絞り、特にスマホでの実用速度を優先。
- スマホ中心だが PC 利用も可能。
- ワークフロー案内:
  - `1) 入力して読み込む`
  - `2) 譜面で対象を選ぶ`
  - `3) ノート編集`
  - `4) 再生と出力で確認`
- 位置づけ:
  - 大規模・複雑作業は専用作譜ソフト。
  - mikuscore はクイック入力や部分作業。

## タブ / 操作
- 上部タブをクリックすると対応パネルを表示。
- 現在タブは `is-active`。
- 非表示パネルは `hidden`。

## パネル: Input
### セクションタイトル
- `1 Input`

### ヘッダツールチップ `(i)` (`Input help`)
- まずここで譜面を読み込む（file/source）か新規作成する。
- このステップ完了後に `Score` / `Edit` / `Export` へ進む。

### 入力形式ラジオ
- `MusicXML Input`
- `ABC Input`
- `New Score`

### 読み込みモードラジオ
- `File input`
- `Source input`

### ブロック
- `newInputBlock`
  - `Use Piano Grand Staff template (treble + bass, single part)`
  - `Track count (parts)`
  - `Time signature`
  - `Key signature`
  - partごとの clef 選択
- `fileInputBlock`
  - ファイル選択（`Load from file`）
  - 選択ファイル名表示
- `sourceXmlInputBlock`
  - `MusicXML` テキストエリア
- `abcInputBlock`
  - `ABC` テキストエリア

### アクション
- `Load from file`
- `Load`（source モード）
- `Load sample 1`
- `Load sample 2`

### メッセージ
- `inputUiMessage` に inline の状態/エラーを表示。
- `localDraftNotice` でローカルドラフトの有無を通知。

## パネル: Score
### セクションタイトル
- `2 Score`

### ヘッダツールチップ `(i)` (`Score preview help`)
- 読み込み済み譜面の確認。
- 簡易再生の試行。
- 編集対象小節の選択。
- 対象小節のノートを選んでから `Edit` で編集反映。

### アクション
- `Play`
- `Stop`
- `Add Measure (End)`

### メイン表示
- `debugScoreArea` に Verovio SVG 譜面を描画。
- クリックで SVG 要素 id から内部 `nodeId` へ解決。

### ステータス
- `playbackText`（初期値: `Playback: idle`）。

## パネル: Edit
### セクションタイトル
- `3 Edit`

### ヘッダツールチップ `(i)` (`Edit help`)
- 編集は休符を音符化して始める。
- 選択小節内で次を調整:
  - 分割
  - 音高
  - 臨時記号
  - 音価
- 簡易再生に対応。
- `Apply` で `Score` へ反映。
- `Discard` で当該小節の編集中変更を破棄。
- 矢印ボタンで小節移動。
- MusicXML 構造破壊リスクを避けるため、編集範囲は意図的に限定。

### ナビゲーション / 文脈
- 選択パート名表示（`measurePartNameText`）。
- 小節移動ボタン:
  - 同一トラック前小節（`←`）
  - 同一トラック次小節（`→`）
  - 同小節の前トラック（`↑`）
  - 同小節の次トラック（`↓`）

### 未選択状態
- タイトル: `No measure selected`
- 本文: `Click a measure in the score to select it`
- ボタン: `Go to Score`

### 選択小節表示
- `measureEditorArea` に選択小節の Verovio プレビュー。
- `uiMessage` に inline メッセージを表示。

### 小節反映アクション
- `Apply`
- `Discard`

### ノート編集アクション
- `Convert Rest to Note`
- `Split Note`
- `Delete Note`
- `Play`（小節再生）

### 音高 / 音価コントロール
- ステップ上下（`↑` / `↓`）と現在 step 表示。
- 変化記号:
  - `None`
  - `♭♭`
  - `♭`
  - `♮`
  - `♯`
  - `♯♯`
- 音価プリセット:
  - `(Select duration)`

## パネル: Export
### セクションタイトル
- `4 Export`

### ヘッダツールチップ `(i)` (`Export help`)
- mikuscore から成果物を持ち出す場所。
- 主経路は `MusicXML` 出力。
- `ABC` と軽量 `MIDI` はクイック確認用途。
- 本格制作/書き出しは専用ソフトを想定。

### 出力アクション
- `Export MusicXML`（primary）
- `Export ABC`
- `Export MIDI`
- `Discard Draft`（条件付き表示）

### 設定カード
- アコーディオンタイトル: `MIDI & Playback Settings`

#### ブロック: `MIDI & Playback Shared Settings`
- `Grace Timing Mode`
  - 選択肢:
    - `Before beat (appoggiatura-like)`
    - `On beat (principal delayed)`
    - `Classical equal split`
  - ツールチップ: MIDI-like playback と MIDI export の両方に適用。
- `Use metric beat accents`（スイッチ）
  - ツールチップ:
    - MIDI-like playback / export で拍感の微小強調を付与。
    - パターン例:
      - `4/4: strong-weak-medium-weak`
      - `6/8: strong-weak-weak-medium-weak-weak`
      - `3-beat: strong-weak-weak`
      - `5-beat: strong-weak-medium-weak-weak`
      - `others: strong-weak-weak-...`
- `Accent amount`
  - 選択肢:
    - `Subtle`
    - `Balanced`
    - `Strong`
  - ツールチップ: アクセント有効時の velocity 差を調整。

#### ブロック: `MIDI Settings`
- `MIDI Export Instrument`
  - ツールチップ: MusicXML 側に楽器指定がない part で使用。
- `Always override instrument`（スイッチ）
  - ツールチップ: MusicXML 楽器指定より選択中出力楽器を常に優先。

#### ブロック: `Playback Settings`
- `Use MIDI-like playback`（スイッチ）
  - ツールチップ: 簡易再生で MIDI 風の timing/expression を使用。
- `Quick Playback Tone`
  - 選択肢:
    - `Sine`
    - `Triangle`
    - `Square`

#### 設定アクション / デバッグ
- `Reset to defaults`
- ブロック: `MIDI Debug`
  - `Refresh MIDI Debug`
  - `midiDebugText` 出力領域

### ファイル命名規則
- `mikuscore-YYYYMMDDhhmm.musicxml`
- `mikuscore-YYYYMMDDhhmm.abc`
- `mikuscore-YYYYMMDDhhmm.mid`

## 診断 / メッセージ表示
- `inputUiMessage` / `uiMessage` に inline フィードバックを表示。
- save/dispatch の診断は core の意味を保ったまま表示。

## 非対象
- 複雑な作譜ワークフロー。
- 多段モーダル中心の導線。
- 画面内高度履歴管理（`undo`/`redo`）。
