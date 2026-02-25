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
- [ ] Reduce MuseScore MIDI parity gap (`moonlight` baseline, 2026-02-25):
  - `safe (cand(midi)) practical diff = 307`
  - `musescore_parity (cand(parity)) practical diff = 172`
  - `playback practical diff = 183` (reference only; different path from export)
  - `musescore_parity raw-on practical diff = 172` (was `378`; stabilized by FIFO note pairing on MIDI import)
  - `onset-strict + durationRatio[1/2..2] (cand(parity)) = 167` (reference metric for MIDI->MusicXML practical restoration)
  - Add focused fixes so export parity (`safe`/`musescore_parity`) improves without semantic regressions.
- [ ] MIDI -> MusicXML improvement pack (next 6 items):
  - 1. Auto-select quantize grid (`1/8`,`1/16`,`1/32`) from note timing evidence (started).
  - 2. Add section-aware quantize fallback (allow local grid override by measure window).
  - 3. Strengthen same-tick same-pitch retrigger pairing policy with explicit mode switch and diagnostics.
  - 4. Improve voice/staff reconstruction using register continuity and overlap minimization.
  - 5. Keep onset-strict comparator as primary metric and duration-ratio metric as secondary gate in spot runs.
  - 6. Add import preset profiles (`safe` / `musescore_parity`) for MIDI->MusicXML and document default intent.
- [ ] Investigate MuseScore OSS MIDI export implementation files and map transferable diff points for mikuscore:
  - Identify concrete source files/functions for `MSCX/MSCZ -> MIDI` in MuseScore.
  - Compare note event ordering, tie/retrigger handling, and quantization/rounding policies against mikuscore.
  - Extract only implementable deltas and track expected parity impact per delta.

#### P3: Feature expansion
- [ ] Decide whether to reintroduce `insert_note_after` in UI.
- [ ] Reconfirm in-session `xml:id` strategy and operation rules.
- [ ] Add chord editing support in core/editor commands (currently chord targets are read/play only in MVP).
- [ ] Add WAV export support (aligned with current quick-playback synth path).
- [ ] Add measure-level copy/paste feature.
- [ ] Add note-level copy/paste feature.
- [ ] Add functionality to create/add parts (staff/part insertion with basic setup flow).
- [ ] Verify and strengthen measure-level editing functionality.
- [ ] Fix unintended pinch-in (gesture zoom) behavior during score editing on touch devices.
- [ ] Add support for mid-song double barlines.
- [ ] Add support for multiple simultaneous notes at the same timing (same onset polyphony/chords where applicable).
- [ ] Investigate and fix the issue where triplet notation cannot be selected in the UI.
- [ ] Add functionality to merge/consolidate rests for cleanup.
- [ ] Add cross-measure tie handling in core/editor (logic independent from UI visibility).
- [ ] Define and implement UI rule for tie editing that may require showing the next measure (always preview or on-demand reveal).
- [ ] Add slur/tie create, edit, and delete operations in editor/core with validation and undo-safe behavior.
- [ ] Add articulation input support (at least staccato and tenuto) in editor/core and preserve them across import/export.
- [ ] Expand articulation support beyond staccato/tenuto (e.g., accent, marcato) with clear per-format preserve/degrade rules.
- [ ] Add dynamics marking input support (`pp` to `ff`, including intermediate levels) and preserve semantics across import/export.
- [ ] Add band score workflow support (common band instrumentation templates, part handling, and layout defaults).
- [ ] Define measure clipboard payload as MusicXML `<measure>...</measure>` fragment (app-internal clipboard first).
- [ ] Implement measure copy/paste in core first (validation/compatibility), then connect UI and optional system clipboard API.
- [ ] Expand ABC compatibility for ornaments (`trill`, `turn`, grace variants) with explicit preserve/degrade rules.
- [ ] Add ABC import compatibility mode for overfull legacy exports and surface warning summary in UI.
- [ ] Add LilyPond (`.ly`) import/export support.
- [ ] Add MEI (Music Encoding Initiative) import/export support.
- [ ] Add MuseScore (`.mscz` / `.mscx`) import/export support.
- [ ] Add VSQX import/export support.
- [ ] Add lyrics support (import/edit/export with format-specific preserve/degrade rules).
- [ ] Improve functionality and reliability of import/export across supported formats (options, diagnostics, and roundtrip quality).
- [ ] Fix invalid data generation when exporting piano scores to ABC and add regression tests.
- [ ] Add input file size limit checks before import/load and provide clear UI errors when the limit is exceeded.
- [ ] MuseScore staged import roadmap:
  - [ ] Phase 1 (now): `.mscx` / `.mscz` load path, basic note/rest/chord import, and `diag` + `src:musescore:*` raw metadata preservation.
  - [ ] Phase 2: playback-rich metadata import (tempo map, repeat/jump semantics, dynamics/play-tech where mappable) with explicit `diag` for dropped items.
  - [ ] Phase 3: layout fidelity import (system/page breaks, spacing hints) as optional metadata and selective restoration.
  - [ ] Phase 4: notation extensions (ornaments, tuplet variants, articulations, technique text) with preserve/degrade policy per item.
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
- [ ] MuseScore MIDI パリティ差分の縮小（`moonlight` 実測, 2026-02-25）。
  - `safe (cand(midi)) practical diff = 307`
  - `musescore_parity (cand(parity)) practical diff = 172`
  - `playback practical diff = 183`（参考値。export とは別経路）
  - `musescore_parity raw-on practical diff = 172`（以前 `378`。MIDI import の FIFO ペアリングで安定化）
  - `onset厳格 + duration比率[1/2..2] (cand(parity)) = 167`（MIDI->MusicXML 復元品質の参照値）
  - 意味保存回帰を起こさない範囲で、export 側（`safe`/`musescore_parity`）の差分を段階的に削減する。
- [ ] MIDI -> MusicXML 改善パック（次の6項目）。
  - 1. 音価グリッド（`1/8`,`1/16`,`1/32`）をノート時刻の証拠から自動選択する（着手済み）。
  - 2. 小節単位で量子化を切り替えられる区間フォールバックを追加する。
  - 3. 同tick同pitchの再発音ペアリングをモード化し、診断と合わせて強化する。
  - 4. 音域連続性と重なり最小化に基づく voice/staff 再構成を改善する。
  - 5. spot 比較で onset 厳格一致を主指標、duration 比率許容を副指標として固定する。
  - 6. MIDI->MusicXML に `safe` / `musescore_parity` の入力プリセットを追加し、既定意図を明文化する。
- [ ] MuseScore OSS の MIDI export 実装ファイルを調査し、mikuscore に取り込める差分観点を一覧化する。
  - MuseScore 側の `MSCX/MSCZ -> MIDI` の具体ファイル/関数を特定する。
  - ノートイベント順序、tie/retrigger、量子化/丸め規則を mikuscore と比較する。
  - 実装可能な差分のみを抽出し、差分ごとの期待パリティ改善量を管理する。

#### P3: 仕様拡張
- [ ] `insert_note_after` の UI 再導入可否を仕様確定。
- [ ] セッション内 `xml:id` 付与戦略を再確認（永続化しない方針の運用ルール化）。
- [ ] 和音編集（chord）対応を core/editor コマンドに追加（現状はMVPで「読み込み/再生は可・直接編集は不可」）。
- [ ] WAV 出力対応を追加（現行の簡易再生シンセ経路に沿う形）。
- [ ] 小節単位のコピー/ペースト機能を追加。
- [ ] 音符単位のコピー/ペースト機能を追加。
- [ ] パートを追加する機能を追加（スタッフ/パート挿入と基本セットアップ導線）。
- [ ] 小節ごとの編集機能の確認・強化。
- [ ] タッチ端末で編集中に意図せずピンチイン（ジェスチャーズーム）が発生する不具合を修正。
- [ ] 曲途中の二重線に対応。
- [ ] 同じタイミングでの複数音（同時発音/必要に応じて和音）に対応。
- [ ] UIで3連譜を選べない事象を解析し、修正対応する。
- [ ] 休符を合体・整理する機能を追加。
- [ ] 小節跨ぎタイの処理を core/editor に追加（UI表示有無に依存しないロジック）。
- [ ] タイ編集時の UI 仕様を定義して実装（次小節の常時プレビューまたは操作時表示）。
- [ ] スラー/タイの入力・編集・削除機能を editor/core に追加（妥当性チェックと Undo 安全性を含む）。
- [ ] アーティキュレーション入力対応を追加（最低限スタッカート/テヌート）し、入出力で保持できるようにする。
- [ ] スタッカート/テヌート以外のアーティキュレーション（例: アクセント、マルカート）対応を拡張し、形式ごとの保持/劣化ルールを定義する。
- [ ] 強弱記号（`pp`-`ff` と中間段階）の記入機能を追加し、入出力で意味を保持できるようにする。
- [ ] バンド譜面への対応を追加（一般的な編成テンプレート、パート管理、レイアウト初期値を含む）。
- [ ] 小節クリップボードのペイロードを MusicXML の `<measure>...</measure>` 断片として定義（まずはアプリ内クリップボード）。
- [ ] 実装順を「core先行（整合チェック含む） -> UI接続 -> 必要ならシステム Clipboard API 連携」に固定。
- [ ] ABCの装飾記号（`trill`/`turn`/前打音バリエーション）の互換対応を拡張し、保持/劣化ルールを規定。
- [ ] 旧ABC由来の小節過充填に対する互換モードを整備し、UIに警告サマリを表示。
- [ ] LilyPond（`.ly`）の入出力対応を追加。
- [ ] MEI（Music Encoding Initiative）の入出力対応を追加。
- [ ] MuseScore形式（`.mscz` / `.mscx`）の入出力対応を追加。
- [ ] VSQX 形式の入出力対応を追加。
- [ ] 歌詞（lyrics）の対応を追加（取り込み/編集/出力と、形式ごとの保持/劣化ルール定義を含む）。
- [ ] 各種入出力フォーマットの機能性を向上（オプション、診断、往復品質を含む）。
- [ ] ピアノ譜を ABC 出力した際に不正データになる問題を修正し、回帰テストを追加する。
- [ ] 読み込み前に入力ファイルサイズ上限チェックを追加し、上限超過時は明確な UI エラーを表示する。
- [ ] MuseScore 段階対応ロードマップ:
  - [ ] フェーズ1（現状）: `.mscx` / `.mscz` の読込経路、基本音符/休符/和音の取り込み、`diag` と `src:musescore:*` で生データ退避。
  - [ ] フェーズ2: 再生系メタ（テンポ、リピート/ジャンプ、強弱・奏法のうち対応可能なもの）を優先対応し、欠落は `diag` 明示。
  - [ ] フェーズ3: レイアウト系（改行、ページ、間隔ヒント）をオプションメタとして保持・必要に応じて復元。
  - [ ] フェーズ4: 記譜拡張（装飾、連符バリエーション、アーティキュレーション、奏法テキスト）を保持/劣化ポリシー付きで拡充。
- [ ] 外部形式（最低でも MEI/ABC）への出力時に overfull 小節を生成しない。エクスポート時に正規化または分割して不正データを出さない。
- [ ] 全エクスポート形式の直前に共通の容量チェックを必須化し、overfull 検知時は `diag` を出してエクスポートを中止する。

### 次回の再開手順
1. `npm run build`
2. `mikuscore.html` をハードリロードして動作確認
3. 譜面でノートクリック -> 選択状態更新を確認
4. `change_to_pitch` / `change_duration` / `split_note` 実行 -> 保存 -> 再レンダリングで反映確認
