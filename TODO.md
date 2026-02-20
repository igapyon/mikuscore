# TODO

## English
### Current Status (2026-02)

#### Done
- [x] Implemented core `ScoreCore` load/dispatch/save and key validations.
- [x] Prepared unit and property test baseline.
- [x] Reorganized UI flow for edit/check/export.
- [x] Promoted Verovio rendering to official path.
- [x] Implemented note click selection.
- [x] Improved SVG click -> `nodeId` resolution (`elementsFromPoint` fallback).
- [x] Implemented `change_to_pitch`.
- [x] Implemented `split_note`.
- [x] Implemented rest-to-note conversion.
- [x] Added playback path with `midi-writer.js`.
- [x] Fixed transpose behavior including Clarinet in A.
- [x] Improved iPhone Safari audio start stability (`pointerdown`/`touchstart` unlock, `AudioContext` resume flow, `webkitAudioContext` fallback).
- [x] Fixed ABC tuplet timing drift in playback-related roundtrip paths.
- [x] Added `%@mks` roundtrip support for measure metadata (`number` / `implicit` / `repeat` / `times`) and `transpose` (`chromatic` / `diatonic`).
- [x] Improved ABC accidental export rules (suppress redundant naturals, preserve required naturals per key/measure context).

#### Known Issues
- [ ] Verovio warning `slur ... could not be ended` may appear from input MusicXML; loading currently continues.
- [ ] Click mapping expects note-head/real note area click; staff/empty click can return `MVP_TARGET_NOT_FOUND`.
- [ ] Tuplet-like duration presets are currently restricted to measures/voices where compatible tuplet context already exists.

### Next Priorities
#### P1: Editing stability
- [ ] Improve selected-note highlight visibility.
- [ ] Unify failure message policy (UI + console wording).
- [ ] Add at least one E2E click-mapping test.

#### P2: Spec and tests sync
- [ ] Add save-XML/re-render consistency checks in `docs/spec`.
- [ ] Document and test selection retention rules across re-render.
- [ ] Add ABC roundtrip golden tests (`MusicXML -> ABC -> MusicXML`) for representative orchestral/piano scores.
- [ ] Define acceptable roundtrip delta policy for ABC path (what may change vs must be preserved).
- [ ] Add optional `%@mks ...` metadata compaction:
  - On `MusicXML -> ABC`, suppress consecutive `%@mks` comment lines when values are unchanged from the previous measure.
  - On `ABC -> MusicXML`, if `%@mks` metadata is omitted, inherit the previous measure's metadata for reconstruction.

#### P3: Feature expansion
- [ ] Decide whether to reintroduce `insert_note_after` in UI.
- [ ] Reconfirm in-session `xml:id` strategy and operation rules.
- [ ] Add chord editing support in core/editor commands (currently chord targets are read/play only in MVP).
- [ ] Add WAV export support (aligned with current quick-playback synth path).
- [ ] Add measure-level copy/paste feature.
- [ ] Define measure clipboard payload as MusicXML `<measure>...</measure>` fragment (app-internal clipboard first).
- [ ] Implement measure copy/paste in core first (validation/compatibility), then connect UI and optional system clipboard API.
- [ ] Expand ABC compatibility for ornaments (`trill`, `turn`, grace variants) with explicit preserve/degrade rules.
- [ ] Add ABC import compatibility mode for overfull legacy exports and surface warning summary in UI.
- [ ] Add LilyPond (`.ly`) import/export support.
- [ ] Add MEI (Music Encoding Initiative) import/export support.
- [ ] Add MuseScore (`.mscz` / `.mscx`) import/export support.
- [ ] Prevent exporting overfull measures to external formats (at minimum MEI/ABC); normalize or split at export time so invalid data is not emitted.
- [ ] Add a mandatory shared pre-export capacity check for all formats; if overfull is detected, emit `diag` and abort export.

### Resume Checklist
1. `npm run build`
2. Hard reload `mikuscore.html`
3. Confirm note click selection on score panel
4. Run `change_to_pitch` / `change_duration` / `split_note` -> save -> confirm re-render

---

## 日本語
### 現在地（2026-02 時点）

#### 完了済み
- [x] Core（`ScoreCore`）の load / dispatch / save と主要バリデーションを実装済み。
- [x] 単体テスト + property test の基盤を整備済み。
- [x] UI の編集・確認・出力導線を再配置済み。
- [x] Verovio レンダリングを正式採用済み。
- [x] ノートクリック選択を実装済み。
- [x] SVG 上クリック -> `nodeId` 解決を改善済み（`elementsFromPoint` フォールバック）。
- [x] `change_to_pitch` を実装済み。
- [x] `split_note` を実装済み。
- [x] 休符の音符化（rest -> pitched note）を実装済み。
- [x] `midi-writer.js` を使った再生経路を導入済み。
- [x] Clarinet in A 含む `transpose` 反映を修正済み。
- [x] iPhone Safari での音出し安定性を改善済み（`pointerdown`/`touchstart` 先行アンロック、`AudioContext` resume 経路、`webkitAudioContext` フォールバック）。
- [x] ABC の連符（tuplet）往復時に発生していた再生タイミングずれを修正済み。
- [x] `%@mks` の小節メタ（`number` / `implicit` / `repeat` / `times`）と `transpose`（`chromatic` / `diatonic`）の往復保持を実装済み。
- [x] ABC 出力の臨時記号ルールを改善済み（不要なナチュラル抑制、必要なナチュラルは保持）。

#### 既知事項
- [ ] Verovio 警告 `slur ... could not be ended` は入力 MusicXML 由来で表示されることがある。現状は読み込み継続。
- [ ] クリック選択は音符クリック前提。五線や空白クリックは `MVP_TARGET_NOT_FOUND` になりうる。
- [ ] 音価ドロップダウンの 3 連系は、現状「同小節/同 voice に既存 tuplet がある場合のみ許可」の暫定制約。

### 次にやること
#### P1: 編集体験の安定化
- [ ] 選択ノートの視覚ハイライトを強化。
- [ ] 失敗時メッセージを統一（UI表示と console 文面）。
- [ ] クリックマッピングの E2E テストを追加（最低 1 ケース）。

#### P2: 仕様とテストの同期
- [ ] 保存 XML と再レンダリング結果の整合チェック手順を `docs/spec` に追記。
- [ ] レンダリング更新時の選択維持ルールを明文化しテスト化。
- [ ] 代表的なオーケストラ譜/ピアノ譜で `MusicXML -> ABC -> MusicXML` のゴールデン往復テストを追加。
- [ ] ABC経由での往復差分ポリシー（許容差分/非許容差分）を明文化。
- [ ] `%@mks ...` メタコメントの省略最適化を追加。
  - `MusicXML -> ABC` では、前小節と同一内容が連続する場合、後続の `%@mks` コメント行を省略可能にする。
  - `ABC -> MusicXML` では、省略により不足した `%@mks` 情報を前小節の値で継承して復元する。

#### P3: 仕様拡張
- [ ] `insert_note_after` の UI 再導入可否を仕様確定。
- [ ] セッション内 `xml:id` 付与戦略を再確認（永続化しない方針の運用ルール化）。
- [ ] 和音編集（chord）対応を core/editor コマンドに追加（現状はMVPで「読み込み/再生は可・直接編集は不可」）。
- [ ] WAV 出力対応を追加（現行の簡易再生シンセ経路に沿う形）。
- [ ] 小節単位のコピー/ペースト機能を追加。
- [ ] 小節クリップボードのペイロードを MusicXML の `<measure>...</measure>` 断片として定義（まずはアプリ内クリップボード）。
- [ ] 実装順を「core先行（整合チェック含む） -> UI接続 -> 必要ならシステム Clipboard API 連携」に固定。
- [ ] ABCの装飾記号（`trill`/`turn`/前打音バリエーション）の互換対応を拡張し、保持/劣化ルールを規定。
- [ ] 旧ABC由来の小節過充填に対する互換モードを整備し、UIに警告サマリを表示。
- [ ] LilyPond（`.ly`）の入出力対応を追加。
- [ ] MEI（Music Encoding Initiative）の入出力対応を追加。
- [ ] MuseScore形式（`.mscz` / `.mscx`）の入出力対応を追加。
- [ ] 外部形式（最低でも MEI/ABC）への出力時に overfull 小節を生成しない。エクスポート時に正規化または分割して不正データを出さない。
- [ ] 全エクスポート形式の直前に共通の容量チェックを必須化し、overfull 検知時は `diag` を出してエクスポートを中止する。

### 次回の再開手順
1. `npm run build`
2. `mikuscore.html` をハードリロードして動作確認
3. 譜面でノートクリック -> 選択状態更新を確認
4. `change_to_pitch` / `change_duration` / `split_note` 実行 -> 保存 -> 再レンダリングで反映確認
