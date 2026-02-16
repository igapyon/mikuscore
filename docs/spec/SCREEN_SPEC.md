# SCREEN_SPEC

## English
## Purpose
Define the current screen specification for `mikuscore`.

## Global Layout
- Single-page application layout.
- Top brand header (`mikuscore` title, info `(i)`, GitHub link).
- 4-step tab stepper below header.

## Stepper / Tabs
- Step 1: `Input`
- Step 2: `Score`
- Step 3: `Edit`
- Step 4: `Export`

### Interaction
- Clicking a step opens the corresponding panel.
- `is-active` indicates current tab.
- `is-complete` indicates completion state.

## Panel: Input
### Header tooltip `(i)`
- First step is to load score data here (file/source) or create a new score.
- After this step is completed, user proceeds to `Score` / `Edit` / `Export`.

### Input format radio
- `MusicXML input`
- `ABC input`
- `Create new`

### Input source radio
- `File load`
- `Source input`

### Blocks
- `fileInputBlock`
  - file picker button
  - selected file name
- `sourceXmlInputBlock`
  - MusicXML textarea
- `abcInputBlock`
  - ABC textarea
- `newInputBlock`
  - track/part count
  - time signature (beats / beat-unit)
  - key signature
  - clef settings per part

### Action
- `Load` button
- Imported data is unified into MusicXML DOM for all downstream flow.

## Panel: Score
### Header
- Title: `Score`
- `(i)` tooltip explains:
  - check loaded score
  - try quick playback
  - select target measure for editing
  - click note here first, then go to `Edit` to apply note changes in that selected measure

### Controls
- `Play`
- `Stop`

### Preview
- Verovio SVG rendering.
- Note click -> SVG id -> `nodeId` mapping.

## Panel: Edit
### Header tooltip `(i)`
- Editing starts from converting a rest to a note, then adjusts notes in the selected measure.
- Supported actions in this flow: split notes, change pitch, add accidentals, change duration, and quick playback.
- `Apply` reflects current measure edits back to `Score`; `Discard` cancels current measure edits.
- Arrow buttons are used for measure navigation.
- Editing scope is intentionally limited to reduce MusicXML structure breakage risk; complex editing is out of scope.

### Empty state
- Card with:
  - title: `No measure selected`
  - text: `Click a measure in the score to select it`
  - action: `Go to Score`

### Selected state
- Measure preview
- Status row (track label / selected part and measure)

### Edit controls
- Action buttons:
  - `Convert Rest to Note`
  - `Split Note`
  - `Delete Note`
- Pitch:
  - current step text
  - `↑` / `↓`
- Alter:
  - `None`, `♭♭`, `♭`, `♮`, `♯`, `♯♯`
- Duration:
  - preset dropdown
  - inline diagnostics below dropdown
- Measure actions:
  - `Apply`
  - `Discard`
  - `Play`

## Panel: Export
### Header tooltip `(i)`
- Export is the place to take work out of `mikuscore`.
- Main path is exporting edited result as MusicXML.
- `ABC` and lightweight `MIDI` export are available for quick checks.
- Complex production/export workflows are expected to be done in dedicated software.

### Buttons
- `MusicXML Export` (primary)
- `ABC Export`
- `MIDI Export`

### File naming policy
Use timestamp suffix to reduce conflicts:
- `mikuscore-YYYYMMDDhhmm.musicxml`
- `mikuscore-YYYYMMDDhhmm.abc`
- `mikuscore-YYYYMMDDhhmm.mid`

## Diagnostics placement
- Edit errors/warnings are shown below the duration dropdown.
- Preserve Core diagnostic code/message in UI output.

## Non-goals
- Complex score-authoring workflows
- Multi-layer modal workflows
- In-screen advanced history management (`undo`/`redo`)

---

## 日本語
## 目的
`mikuscore` の現行画面仕様を定義する。

## 全体レイアウト
- 単一ページ構成。
- 上部にブランドヘッダ（`mikuscore` タイトル、説明 `(i)`、GitHubリンク）。
- その下に 4 ステップのタブ式ステッパー。

## ステッパー / タブ
- Step 1: `入力`
- Step 2: `譜面`
- Step 3: `編集`
- Step 4: `出力`

### 操作
- ステッパー選択で対応パネルへ遷移。
- `is-active` が現在タブ。
- `is-complete` は完了状態の表示。

## パネル: 入力
### ヘッダツールチップ `(i)`
- 最初にここで譜面データを読み込み（file/source）または新規作成する。
- このステップ完了後に `譜面` / `編集` / `出力` へ進む。

### 入力形式ラジオ
- `MusicXML入力`
- `ABC入力`
- `新規作成`

### 入力ソースラジオ
- `ファイル読み込み`
- `ソース入力`

### ブロック
- `fileInputBlock`
  - ファイル選択ボタン
  - 選択ファイル名表示
- `sourceXmlInputBlock`
  - MusicXML textarea
- `abcInputBlock`
  - ABC textarea
- `newInputBlock`
  - トラック/パート数
  - 拍子（拍数/拍の単位）
  - 調号
  - 各パートの記号設定

### アクション
- `読み込み` ボタン
- 取り込んだ内容は MusicXML DOM に統一して後続処理へ渡す。

## パネル: 譜面
### ヘッダ
- タイトル: `譜面`
- `(i)` ツールチップ:
  - 読み込み済み譜面の確認
  - 簡易再生の試行
  - 編集対象小節の選択
  - ここで音符を選択してから `編集` で実際のノート変更を行う

### コントロール
- `再生`
- `停止`

### プレビュー
- Verovio SVG を表示。
- ノートクリック -> SVG id -> `nodeId` マッピング。

## パネル: 編集
### ヘッダツールチップ `(i)`
- 編集は「休符を音符化」から始め、選択中小節内で音符調整を行う。
- このフローで扱う操作: 音符分割、音高変更、臨時記号付与、音価変更、簡易再生。
- `確定` で譜面へ反映し、`破棄` で当該小節の編集中変更を取り消す。
- 小節移動は矢印ボタンで行う。
- MusicXML 構造破壊リスクを避けるため編集範囲は意図的に制限し、複雑編集は対象外とする。

### 未選択状態
- カード表示:
  - タイトル: `小節が未選択です`
  - 説明: `譜面から小節クリックして選択してください`
  - ボタン: `譜面へ移動`

### 選択状態
- 小節プレビュー表示。
- ステータス行表示（トラック名 / 選択中 part と measure）。

### 編集コントロール
- 操作ボタン:
  - `休符を音符化`
  - `音符分割`
  - `音符削除`
- 音名:
  - 現在 step 表示
  - `↑` / `↓`
- 変化記号:
  - `なし`, `♭♭`, `♭`, `♮`, `♯`, `♯♯`
- 音価:
  - プリセットドロップダウン
  - ドロップダウン下に inline 診断表示
- 小節操作:
  - `確定`
  - `破棄`
  - `再生`

## パネル: 出力
### ヘッダツールチップ `(i)`
- `mikuscore` から成果物を持ち出す場所。
- 主経路は編集結果の MusicXML 出力。
- `ABC` と軽量 `MIDI` 出力はクイック確認向けに提供。
- 本格的な制作/書き出しは専用ソフトで行う想定。

### ボタン
- `MusicXML出力`（primary）
- `ABC出力`
- `MIDI出力`

### ファイル名ポリシー
衝突緩和のためタイムスタンプを付与:
- `mikuscore-YYYYMMDDhhmm.musicxml`
- `mikuscore-YYYYMMDDhhmm.abc`
- `mikuscore-YYYYMMDDhhmm.mid`

## 診断表示配置
- 編集時のエラー/警告は音価ドロップダウン直下に表示。
- Core 診断コード/メッセージを保持して表示。

## 非対象
- 複雑な作譜ワークフロー
- 多段モーダル UI
- 画面内での高度な履歴管理（`undo`/`redo`）
