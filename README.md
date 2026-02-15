# mikuscore

ブラウザ上で完結する MusicXML スコアエディタのプロジェクトです。  
このアプリの主眼は「多機能化」ではなく、**既存 MusicXML を壊さずに編集する信頼性**です。  
MVP段階で機能を絞っているのは意図的で、まず「壊さない編集」を確実に成立させることを最優先にしています。

## このアプリの特徴

- 既存 MusicXML の保全を最優先
- 最小パッチ編集（必要なノードだけ変更）
- ラウンドトリップ安全性（`load -> edit -> save` の意味的同一性）
- unknown / unsupported 要素の保持
- `<backup>` / `<forward>` / 既存 `<beam>` の保持
- 失敗時は原子的にロールバック（DOM 不変）
- 将来 UI を差し替え可能な Core / UI 分離設計

## 主要な仕様ハイライト（MVP）

- `dirty === false` の保存は入力 XML 文字列をそのまま返す（`original_noop`）
- 小節 overfull は `MEASURE_OVERFULL` で拒否
- 非編集対象 voice は `MVP_UNSUPPORTED_NON_EDITABLE_VOICE` で拒否
- `change_to_pitch` / `change_duration` / `insert_note_after` / `delete_note` / `split_note` をMVPコマンドとして扱う
- 休符は通常の編集対象外だが、`change_to_pitch` による休符音符化は許可
- pretty-print なしでシリアライズ

## 対応する MusicXML バージョン

- 対象: **MusicXML 4.0**

## 配布と開発方針

- 配布形態: **Single-file Web App**（単一 HTML）
- 実行条件: オフライン動作、外部依存なし
- 開発形態: 分割 TypeScript ソース
- ビルド方針: `mikuscore-src.html` + `src/` から `mikuscore.html` を生成

## 開発コマンド

- `npm run build`: `mikuscore-src.html` と `src/` から `mikuscore.html`（配布物）を生成
- `npm run clean`: 生成物（`mikuscore.html`, `src/js/main.js`）を削除
- `npm run typecheck`: 型チェック
- `npm run test:unit`: ユニットテスト
- `npm run test:property`: propertyテスト
- `npm run test:all`: 全テスト

## ドキュメント

- `docs/spec/SPEC.md`: MVP コア仕様
- `docs/spec/TERMS.md`: 用語とスコープ
- `docs/spec/COMMANDS.md`: dispatch/save 契約
- `docs/spec/COMMAND_CATALOG.md`: コマンド境界（payload/失敗条件）
- `docs/spec/DIAGNOSTICS.md`: 診断コード定義
- `docs/spec/TEST_MATRIX.md`: 必須テスト観点
- `docs/spec/BUILD_PROCESS.md`: 単一 HTML 配布向けビルド方針
- `docs/spec/ARCHITECTURE.md`: Core/UI分離とバージョン前提を含むアーキテクチャ方針
- `docs/spec/UI_SPEC.md`: UI動作仕様
- `docs/spec/SCREEN_SPEC.md`: 画面仕様（レイアウト/文言/導線）
- `TODO.md`: 仕様・実装・テストのタスク管理

## 現在のステータス

仕様策定フェーズは完了し、Core 実装（TypeScript）とテスト基盤は稼働中です。  
UI 側では 4ステップ（入力/譜面/編集/出力）のタブ式フローを採用し、MusicXML入力/ABC入力/新規作成に対応しています。  
譜面クリック選択、休符音符化、音符分割、3形式（MusicXML/ABC/MIDI）の出力まで実装済みです。
