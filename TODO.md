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

#### Known Issues
- [ ] Verovio warning `slur ... could not be ended` may appear from input MusicXML; loading currently continues.
- [ ] Click mapping expects note-head/real note area click; staff/empty click can return `MVP_TARGET_NOT_FOUND`.
- [ ] Tuplet-like duration presets are currently restricted to measures/voices where compatible tuplet context already exists.
- [ ] Some accidental rendering in `ABC export` is still incorrect (key/accidental precedence needs review).
- [ ] On iPhone SE3, tapping `Play` sometimes produces no sound. Investigate root cause (autoplay policy / AudioContext resume / user gesture handling) and implement a fix.

### Next Priorities
#### P1: Editing stability
- [ ] Improve selected-note highlight visibility.
- [ ] Unify failure message policy (UI + console wording).
- [ ] Add at least one E2E click-mapping test.

#### P2: Spec and tests sync
- [ ] Add save-XML/re-render consistency checks in `docs/spec`.
- [ ] Document and test selection retention rules across re-render.

#### P3: Feature expansion
- [ ] Decide whether to reintroduce `insert_note_after` in UI.
- [ ] Reconfirm in-session `xml:id` strategy and operation rules.

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

#### 既知事項
- [ ] Verovio 警告 `slur ... could not be ended` は入力 MusicXML 由来で表示されることがある。現状は読み込み継続。
- [ ] クリック選択は音符クリック前提。五線や空白クリックは `MVP_TARGET_NOT_FOUND` になりうる。
- [ ] 音価ドロップダウンの 3 連系は、現状「同小節/同 voice に既存 tuplet がある場合のみ許可」の暫定制約。
- [ ] `ABC出力` で一部臨時記号（alter/accidental）の表現が崩れる問題が残っている。
- [ ] iPhone SE3 で `再生` を押しても音が出ないことがある。原因（autoplay 制約 / AudioContext resume / ユーザー操作扱い）を調査し、改善を実装する。

### 次にやること
#### P1: 編集体験の安定化
- [ ] 選択ノートの視覚ハイライトを強化。
- [ ] 失敗時メッセージを統一（UI表示と console 文面）。
- [ ] クリックマッピングの E2E テストを追加（最低 1 ケース）。

#### P2: 仕様とテストの同期
- [ ] 保存 XML と再レンダリング結果の整合チェック手順を `docs/spec` に追記。
- [ ] レンダリング更新時の選択維持ルールを明文化しテスト化。

#### P3: 仕様拡張
- [ ] `insert_note_after` の UI 再導入可否を仕様確定。
- [ ] セッション内 `xml:id` 付与戦略を再確認（永続化しない方針の運用ルール化）。

### 次回の再開手順
1. `npm run build`
2. `mikuscore.html` をハードリロードして動作確認
3. 譜面でノートクリック -> 選択状態更新を確認
4. `change_to_pitch` / `change_duration` / `split_note` 実行 -> 保存 -> 再レンダリングで反映確認
