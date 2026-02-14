# mikuscore

ブラウザ上で完結する MusicXML スコアエディタのプロジェクトです。  
このアプリの主眼は「多機能化」ではなく、**既存 MusicXML を壊さずに編集する信頼性**です。  
MVP段階で機能を絞っているのは意図的で、まず「壊さない編集」を確実に成立させることを最優先にしています。
ただし実運用で最低限必要な編集体験を満たすため、MVPでも `insert` / `delete` は対象に含めます。

## このアプリの特徴

- 既存 MusicXML の保全を最優先
- 最小パッチ編集（必要なノードだけ変更）
- ラウンドトリップ安全性（`load -> edit -> save` の意味的同一性）
- unknown / unsupported 要素の保持
- `<backup>` / `<forward>` / 既存 `<beam>` の保持
- 失敗時は原子的にロールバック（DOM 不変）
- 将来 UI を差し替え可能な Core / UI 分離設計

## なぜ新規で作るのか

既存ツールでは、保存時の再整形や自動補正によって、意図しない差分が入りやすい課題があります。  
mikuscore は、MVPとして機能を最小限に絞る代わりに、以下を明示的に禁止・制約し、差分と破壊的変更を抑えます。  
つまり本プロジェクトの売りは、機能数ではなく「既存 MusicXML を壊さずに編集できること」です。

- 不要な正規化
- 無関係ノードの再生成
- 自動 rest 挿入 / tie 追加 / divisions 変更
- backup/forward の自動再計算

## 他ツールとの位置づけ（MuseScoreとの違い）

- MuseScore: 高機能な「作譜・編集」の統合環境
- mikuscore: 既存 MusicXML に安全に手を入れるための外科ツール

mikuscore は、高機能化よりも「壊さない保証」を優先します。  
MVPが尖って見えるのは、機能を削ってでも round-trip の信頼性と最小変更を先に成立させる設計だからです。

## 主要な仕様ハイライト（MVP）

- `dirty === false` の保存は入力 XML 文字列をそのまま返す（`original_noop`）
- 小節 overfull は `MEASURE_OVERFULL` で拒否
- 非編集対象 voice は `MVP_UNSUPPORTED_NON_EDITABLE_VOICE` で拒否
- 実用最低限として `change_pitch` / `change_duration` / `insert_note_after` / `delete_note` をMVPに含める
- `grace` / `cue` / `chord` / `rest` はMVPでは編集対象外（`MVP_UNSUPPORTED_NOTE_KIND`）
- underfull は許容可能（警告を出す場合あり）
- pretty-print なしでシリアライズ

詳細は `SPEC.md` と `docs/spec/` を参照してください。

## 対応する MusicXML バージョン

- 対象: **MusicXML 4.0**
- 位置づけ: 2026-02-14 時点の最新安定版（Final Community Group Report は 2021-06-01 公開）
- 方針: MVP実装とテストは 4.0 前提で設計する

## 配布と開発方針

- 配布形態: **Single-file Web App**（単一 HTML）
- 実行条件: オフライン動作、外部依存なし
- 開発形態: 分割 TypeScript ソース
- ビルド方針: `mikuscore-src.html` + `src/` から `mikuscore.html` を生成

## ドキュメント

- `SPEC.md`: MVP コア仕様
- `docs/spec/TERMS.md`: 用語とスコープ
- `docs/spec/COMMANDS.md`: dispatch/save 契約
- `docs/spec/COMMAND_CATALOG.md`: コマンド境界（payload/失敗条件）
- `docs/spec/DIAGNOSTICS.md`: 診断コード定義
- `docs/spec/TEST_MATRIX.md`: 必須テスト観点
- `docs/spec/BUILD_PROCESS.md`: 単一 HTML 配布向けビルド方針
- `docs/spec/ARCHITECTURE.md`: Core/UI分離とバージョン前提を含むアーキテクチャ方針
- `TODO.md`: 仕様・実装・テストのタスク管理

## 現在のステータス

現時点は仕様策定フェーズです。  
次の段階で Core 実装（TypeScript）とユニットテストを追加します。
