# MuseScore Export Parity Test Strategy

## Positioning

- This document is a parity verification strategy document (test/operation policy).
- It is not the converter behavior specification.
- Converter I/O behavior is defined in:
  - `docs/spec/MUSESCORE_IO.md`

## 背景
- mikuscore の内部正本は MusicXML とする。
- 一方、配布元が MuseScore の曲データでは、作者の実質原本は MuseScore 形式（`.mscz/.mscx`）である可能性が高い。
- したがって、`MuseScore -> mikuscore変換 -> MusicXML` の結果が、MuseScore公式の `MusicXMLエクスポート` と意味的に同等かを継続確認する価値が高い。

## 目的
- mikuscore の MuseScore インポート機能が、MuseScore公式エクスポート相当の再現力を持つか検証する。
- 仕様上の表現差（XML順序やID差）ではなく、楽譜意味（記譜意味）の一致を評価する。

## 運用レベル（必須/任意）
- 本戦略は **オプショナル検証** として扱う（通常の最小品質ゲート外）。
- 目的は、回帰テストで見えにくい「実データ由来の差分」をトレースし、改善優先度を決めること。
- 日常の必須ゲートは `docs/spec/LOCAL_WORKFLOW.md` の `typecheck + test:all` を優先する。

## テスト基本フロー
1. 同一曲について以下を準備する。
   - `source.mscz`（または `source.mscx`）
   - MuseScore公式エクスポート `reference.musicxml`（または `.mxl`）
2. mikuscore 変換で `source.mscz/.mscx -> candidate.musicxml` を生成する。
3. `candidate.musicxml` と `reference.musicxml` を正規化して比較する。

## 比較ポリシー
- 文字列完全一致は要求しない。
- 次を優先比較する（意味比較）:
  - 音高（step/alter/octave）
  - 音価・拍充足（duration/time-modification/backup/forward整合）
  - 小節属性（拍子・調号・弱起）
  - 記号（スラー、タイ、連符、トリル、オッターヴァ、反復記号、終止線）
  - 発想・アーティキュレーション（対応対象のみ）
- 次は差分許容（ノイズ扱い）:
  - 要素順序の揺れ
  - 空白・インデント
  - 付加IDや内部メタ情報

## 正規化ルール（例）
- XMLの空白と改行差を除去（pretty-print差を吸収）
- 比較に不要な属性やメタデータを除外
- `.mxl` は展開して `score.xml` を比較対象に統一
- ノート単位で lane（voice/staff）と時間位置にマッピングして比較

## 合否判定
- `P0`: 音高・音価・拍構造が一致
- `P1`: 連符/スラー/タイ/反復/終止線など主要記譜が一致
- `P2`: 表示寄り情報（配置、細かな見た目）は差分許容
- リグレッション時は「差分カテゴリ」と「影響小節」を必ず記録する

## 運用ルール
- MusicXMLに明示される指定は尊重する（推測上書きしない）。
- MuseScore固有情報は、MusicXMLで表現不能な場合に限り
  - 警告
  - または `miscellaneous-field` への退避
  を行う。
- 例外的補完（欠損補完）は、MIDIなど情報欠落前提の入力でのみ積極適用する。

## CIへの組み込み案
- `tests/golden/musescore-parity/` に fixture を配置
  - `source.mscz`
  - `reference.musicxml`
  - `expected-diff-policy.json`（必要なら）
- テスト実行時に
  - 変換実行
  - 正規化比較
  - 差分レポート出力
- PRでは「新規差分の有無」と「既知許容差分のみか」をゲートにする。

## 当面の運用（CI未導入・repo外）
- ライセンスや再配布条件が未確定な間は、実曲fixtureをリポジトリに置かない。
- 比較データは Git 非管理ディレクトリで管理する（例: `tests/local-data/roundtrip/musescore/` または `~/mikuscore-private-fixtures/`）。
- 当面はローカル実行で次を行う。
  1. `MuseScore -> candidate_from_musescore.musicxml`
  2. `MIDI -> candidate_from_midi.musicxml`
  3. `reference.musicxml` との正規化差分と意味差分を生成
- 差分の解釈は生成AIレビューを併用し、以下に分類する。
  - 実装バグの疑い
  - 仕様限界（対応不要）
  - 優先度低の見た目差
- リポジトリには実データを含めず、知見のみを記録する。
  - 差分カテゴリ
  - 影響小節/記譜要素
  - 対応方針（fix / wontfix / backlog）

### ローカル実行例（Git非管理 fixture）

- 例: `tests/local-data/roundtrip/musescore/paganini/` に `source.mscx` と `reference.musicxml` を置く。
- 実行コマンド:
  - `npm run test:all -- tests/spot/local-musescore-reference-parity.spot.spec.ts`
  - `npm run test:all -- tests/spot/local-musicxml-reference-to-musescore.spot.spec.ts`
- 出力:
  - `tests/artifacts/roundtrip/musescore/paganini/candidate.musicxml`
  - `tests/artifacts/roundtrip/musescore/paganini/candidate-from-reference.mscx`
- pitch-only / pitch+accidental の差分件数とサンプル差分
- 現在の同梱 spot テストでは、`diff pitch-only=0` かつ `diff pitch+acc=0` を成功条件とする。

### 逆方向 spot（MusicXML -> MuseScore）判定

- 対象テスト:
  - `tests/spot/local-musicxml-reference-to-musescore.spot.spec.ts`
- 目的:
  - `reference.musicxml` から生成した `candidate-from-reference.mscx` が、主要意味要素を保持できることを確認する。
- 判定:
  - 全体件数一致:
    - `technical/stopped` -> `articLhPizzicatoAbove`
    - dynamics
    - trill start/stop
    - octave-shift start/stop
    - marker, jump
  - 位置一致（小節単位）:
    - marker
    - jump
    - `Tema`（Tempo text）
    - `sempre legato`（Expression text）

## 期待効果
- 「MuseScoreでは出るのにmikuscoreでは欠ける」不具合を早期検出できる。
- 仕様変更時に、どの記譜要素へ影響したかを定量的に追跡できる。
- MusicXML正本方針を維持したまま、MuseScore互換品質を継続改善できる。

## MIDI parity note

- MIDI parity policy is intentionally managed outside this document.
- For MIDI import/export behavior and constraints, refer to:
  - `docs/spec/MIDI_IO.md`

## 生成AIレビュー運用メモ
- 生成AIに渡す入力は「正規化済みdiff」と「小節/声部インデックス付きの意味差分」を優先する。
- 生の楽譜ファイル全文を毎回渡すより、差分抽出結果を渡すほうが精度と再現性が高い。
- AI判定結果はそのまま採用せず、最終判断は実装者が行う。

## TODO
- `importOptions.parityMode` を追加する。
- `parityMode: "off"`（既定）
  - 可読性優先。必要最小限の属性のみ出力する。
- `parityMode: "musescore"`
  - MuseScoreエクスポート寄りの保持を優先する。
  - 対象例: `show-number` / `bracket` / grace / tuplet丸め補正。
- 上記2モードを分離し、通常利用と厳密比較を両立する。
