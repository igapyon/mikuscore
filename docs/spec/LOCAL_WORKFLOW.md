# 開発ワークフロー（ローカル運用 / mikuscore）

この文書は `mikuscore` の日常開発フローを定義する。  
本リポジトリは、ローカルでの品質ゲートを中心に運用する。

## 1. ディレクトリ構成（運用上の要点）

- `src/ts/`
  - 変換・入出力ロジック本体（MusicXML / MIDI / ABC / MEI / MuseScore など）
- `core/`
  - コア編集モデルと検証ロジック
- `tests/unit/`
  - ユニットテスト、golden/roundtrip 系テスト
- `tests/property/`
  - プロパティテスト
- `tests/fixtures/`
  - ローカル検証用 fixture
- `src/vendor/utaformatix3/`
  - ベンダー取り込み済み参照コード（直接編集しない）
- `scripts/`
  - ビルド・同期補助スクリプト

## 2. 基本コマンド

- 型チェック:
  - `npm run typecheck`
- ユニットテスト:
  - `npm run test:unit`
- プロパティテスト:
  - `npm run test:property`
- 全テスト:
  - `npm run test:all`
- ビルド:
  - `npm run build`

## 3. 日常フロー

1. 仕様文書（`README.md` / `TODO.md` / `docs/spec/*`）を更新
2. 実装変更（`src/ts/` / `core/`）
3. fixture・テスト更新（必要時）
4. `npm run typecheck` 実行
5. `npm run test:all` 実行
6. 必要に応じて `npm run build` 実行
7. 差分確認

補足:

- 回帰不具合は、可能な限り最小 fixture を `tests/fixtures/` に固定する。
- 一時的な検証ファイルは恒久管理しない（調査完了後に除去する）。

## 4. 品質ゲート方針

- 最小品質ゲートは `typecheck + test:all` とする。
- 失敗時は修正完了まで次工程へ進まない。
- roundtrip 系テスト（例: `*-roundtrip-golden.spec.ts`）の失敗を放置しない。

## 5. テスト戦略（運用ルール）

本プロジェクトの品質は、次の3層テストで維持する。

1. 通常テスト:
   - 変換ロジック・API の仕様単位の正しさを確認する。
2. roundtrip / golden テスト:
   - 形式間変換の劣化を検出する。
   - テキスト完全一致だけでなく、楽譜情報（音高・長さ・歌詞・テンポ・拍子）の保持を重視する。
3. 最小回帰 fixture テスト:
   - 不具合発見時は現象を最小再現に圧縮し、fixture とテストで恒久回帰化する。

オプショナル運用:

- 手本付き変換比較（Reference-guided parity test）を任意で実施できる。
- 例: `source.mscx` と MuseScore公式 `reference.musicxml` を比較して、mikuscore 変換結果の差分を意味ベースで分類する。
- 実データがライセンス上コミット不可の場合は `tests/fixtures-local/` 配下で扱う。
- 詳細方針は `docs/spec/MUSESCORE_EXPORT_PARITY_TEST.md` を参照する。

## 6. 禁止事項（本運用）

- CI 依存を前提とした検証手順のみで品質保証しない。
- テスト失敗状態のまま、仕様変更や機能追加を進めない。
- vendor 参照コードへの直接改変を行わない（必要時は同期手順で反映）。
