# SCREEN_SPEC

## Purpose

`mikuscore` の画面仕様（現行実装ベース）を定義する。

## Global Layout

- 画面は単一ページ構成。
- 上部にブランドヘッダ（`mikuscore` タイトル、説明 `(i)`、GitHubリンク）。
- その下に 4 ステップのタブ式ステッパー。

## Stepper / Tab Definition

- Step 1: `入力`
- Step 2: `譜面`
- Step 3: `編集`
- Step 4: `出力`

### Interaction

- ステッパー項目を押すと対応パネルに遷移。
- `is-active` が現在タブ。
- `is-complete` は完了ステータス表示用途。

## Panel: 入力

### Input Format Radio

- `MusicXML入力`
- `ABC入力`
- `新規作成`

### Input Source Radio

- `ファイル読み込み`
- `ソース入力`

### Blocks

- `fileInputBlock`
  - ファイル選択ボタン
  - 選択ファイル名表示
- `sourceXmlInputBlock`
  - MusicXML textarea
- `abcInputBlock`
  - ABC textarea
- `newInputBlock`
  - トラック数
  - 拍子（拍数/拍の単位）
  - 調号
  - 各パートの記号設定

### Action

- `読み込み` ボタン
- 取り込んだ内容は MusicXML DOM に統一して後続処理へ渡す。

## Panel: 譜面

### Header

- タイトル: `譜面`
- `(i)` ツールチップ: 音符クリックで編集対象選択する説明

### Controls

- `再生`
- `停止`

### Preview

- Verovio SVG を表示。
- ノートクリック -> SVG id -> nodeId マッピング。

## Panel: 編集

### Empty State (未選択時)

- カード表示
  - タイトル: `小節が未選択です`
  - 説明: `譜面から小節クリックして選択してください`
  - ボタン: `譜面へ移動`

### Selected State (選択時)

- 小節プレビュー表示
- ステータス行表示（トラック名 / 選択中 part, measure）

### Edit Controls

- 行動ボタン:
  - `休符を音符化`
  - `音符分割`
  - `音符削除`
- Pitch:
  - 現在 step 表示
  - `↑` / `↓` ボタン
- Alter:
  - `なし`, `♭♭`, `♭`, `♮`, `♯`, `♯♯`
- Duration:
  - プリセットドロップダウン
  - 直下に inline 診断メッセージ
- Measure action:
  - `確定`
  - `破棄`
  - `再生`

## Panel: 出力

### Buttons

- `MusicXML出力`（primary）
- `ABC出力`
- `MIDI出力`

### File Name Policy

タイムスタンプ付与で衝突緩和:

- `mikuscore-YYYYMMDDhhmm.musicxml`
- `mikuscore-YYYYMMDDhhmm.abc`
- `mikuscore-YYYYMMDDhhmm.mid`

## Diagnostics Placement

- 編集時のエラー/警告は duration ドロップダウン直下に表示。
- Core diagnostics code/message を保持したまま表示。

## Non-goals (Screen)

- 複雑な作譜ワークフロー
- 多段モーダル UI
- 画面内での高度な履歴管理（undo/redo）
