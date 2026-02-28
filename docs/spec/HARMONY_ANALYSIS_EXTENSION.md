# Harmony Analysis Extension Spec (v1 Draft)

## 1. Scope

This document defines harmonization analysis and performance-expression extensions for mikuscore.

- Target: MusicXML import/export and in-app playback expression control.
- Non-target: Rewriting existing note structures for analysis.

## 2. Goals

1. Add functional harmony analysis for classical harmony (learning to conservatory assignment level).
2. Drive playback expression from harmony analysis (intonation and dynamics adjustments).
3. Preserve MusicXML interoperability by keeping standard data in standard elements and advanced data in `mks:*` extensions.

## 3. Principles

### 3.1 Standards First

- The implementation MUST store base harmony information in MusicXML `<harmony>`.
- Roman-numeral related data SHOULD use `<numeral>` and child elements where possible.
- The implementation MUST NOT mutate existing note semantics only for analysis tagging.
- Standard-only readers SHOULD still read meaningful harmony information.

### 3.2 Extension Isolation

- Advanced/non-standard metadata MUST be stored under `mks:*` in extension containers.
- The implementation MUST confine harmony extensions to `<other-harmony>`.
- The implementation MUST confine playback extensions to `<other-play>`.
- Unknown extension fields MUST be preserved (round-trip safe).

## 4. Namespace and Versioning

- Namespace URI (v1): `https://mikuscore.org/ns/analysis`
- Prefix example: `xmlns:mks="https://mikuscore.org/ns/analysis"`
- `mks:analysis` MUST include `version` attribute.

Example:

```xml
<mks:analysis version="1" xmlns:mks="https://mikuscore.org/ns/analysis">
  ...
</mks:analysis>
```

## 5. Data Model

### 5.1 Standard Harmony Block (Required)

The implementation MUST write base harmonic identity using `<harmony>`.

Recommended elements:

- `<numeral-root>` (1..7)
- `<numeral-alter>` (for altered scale degrees)
- `<numeral-key>` (for local key context)
- `<kind>` (major/minor/dominant/etc.)
- `<inversion>`

Example:

```xml
<harmony>
  <numeral>
    <numeral-root text="V">5</numeral-root>
  </numeral>
  <kind>dominant</kind>
  <inversion>1</inversion>
</harmony>
```

### 5.2 `mks:analysis` Block (Advanced)

The implementation MUST place advanced analysis metadata in `<other-harmony>`.

Cardinality (v1):

- One `<mks:analysis>` per `<other-harmony>`.
- One `<mks:function>` per `<mks:analysis>`.
- Optional fields MAY be omitted.

Fields (v1):

- `mks:function`: `T | S | D`
- `mks:secondary-of`: denominator degree for secondary dominants (for example V/V => `5`)
- `mks:borrowed`: `true | false`
- `mks:cadence`: `PAC | IAC | HC`
- `mks:confidence`: decimal `0.0..1.0`
- `mks:source`: `rule | ai | manual`
- `mks:harmony-id`: unique harmony anchor id
- `mks:special-chord`: `It6 | Fr6 | Gr6 | N6` (for sonorities not cleanly expressible by `<kind>` alone)

Forward-compatibility note:

- In v1, `mks:secondary-of` is degree-based (`1..7`) for simplicity.
- v2 MAY introduce richer representations (for example `mks:secondary-chain` or altered-degree text forms) for cases such as `V/V/V` or `V/bII`.

`mks:harmony-id` constraints (v1):

- MUST be unique per score document.
- MUST match pattern `[A-Za-z0-9_-]+`.
- UUID format MAY be used but is not required.

Example:

```xml
<other-harmony>
  <mks:analysis version="1" xmlns:mks="https://mikuscore.org/ns/analysis">
    <mks:harmony-id>h23</mks:harmony-id>
    <mks:function>D</mks:function>
    <mks:secondary-of>5</mks:secondary-of>
    <mks:borrowed>false</mks:borrowed>
    <mks:cadence>HC</mks:cadence>
    <mks:confidence>0.93</mks:confidence>
    <mks:source>rule</mks:source>
  </mks:analysis>
</other-harmony>
```

## 6. Performance Expression Control

### 6.1 Intonation Offset

- The implementation MUST NOT change notated pitch for intonation control.
- Playback intonation offsets MUST be stored as cents in `<other-play type="mks:intonation">`.
- `mks:unit="cent"` MUST be explicitly attached to `mks:intonation` records.
- `mks:scope` SHOULD be attached (`note | chord | voice | measure`).
- Value range SHOULD be `-100..+100` cents (integer).

Example:

```xml
<play>
  <other-play
    type="mks:intonation"
    mks:target-harmony-id="h23"
    mks:unit="cent"
    mks:scope="chord">-12</other-play>
</play>
```

### 6.2 Dynamics Offset

- Base dynamics MAY use standard `note@dynamics`.
- Relative harmonic dynamics control MUST be storable in `<other-play type="mks:dynamic-offset">`.
- Value unit in v1 MUST be additive MIDI velocity offset (integer).
- `mks:unit="velocity"` MUST be explicitly attached to `mks:dynamic-offset` records.
- `mks:scope` SHOULD be attached (`note | chord | voice | measure`).
- Value range SHOULD be `-32..+32`.

Example:

```xml
<play>
  <other-play
    type="mks:dynamic-offset"
    mks:target-harmony-id="h23"
    mks:unit="velocity"
    mks:scope="chord">-8</other-play>
</play>
```

## 7. Linkage Rules

- Harmony-level and playback-level extensions MUST be linkable by `mks:harmony-id` and `mks:target-harmony-id`.
- If linkage is missing, the implementation MAY fallback to measure-local nearest harmony.
- If fallback is ambiguous, the implementation SHOULD skip offset application and emit a warning diagnostic.

## 8. Validation and Diagnostics

Recommended diagnostics (v1):

- `HARMONY_PARSE_UNSUPPORTED`
- `HARMONY_EXTENSION_INVALID_VALUE`
- `HARMONY_LINKAGE_NOT_FOUND`
- `HARMONY_LINKAGE_AMBIGUOUS`

Recommended structured diagnostics payload:

```xml
<mks:diagnostics>
  <mks:issue
    type="parallel-5th"
    voices="S,A"
    severity="error"
    mks:measure="12"
    mks:tick="1440"
    location="measure:12,beat:3"/>
</mks:diagnostics>
```

Rules:

- Invalid extension values MUST NOT crash load flow.
- On invalid extensions, standard `<harmony>` data SHOULD remain usable.

## 9. Compatibility and Round-Trip Policy

- Standard-only consumers MUST be able to ignore `mks:*` safely.
- mikuscore MUST preserve `other-harmony` and `other-play` unknown fields during save.
- If `dirty === false`, XML text MUST remain byte-identical to input.
- If a third-party tool strips `other-*`, mikuscore SHOULD surface a non-fatal warning and MAY re-analyze.

## 10. Rollback and Failure Semantics

- Analysis application MUST be atomic.
- On analysis failure, the implementation MUST rollback to pre-analysis state.
- Partial write of analysis metadata MUST NOT occur.

## 11. Feature Levels

### Phase 1 (Learning level)

- Diatonic I..VII recognition
- Inversions
- Borrowed chords
- Secondary dominants
- Basic cadence tags

### Phase 2 (Conservatory assignment level)

- Augmented-sixth families (It+6 / Fr+6 / Gr+6)
- Neapolitan (bII)
- Substitute-function tags
- Rule-check diagnostics for prohibited voice-leading
- Voice-leading analysis tags

## 12. Future Extensions

- `mks:analysis` v2 with AI-generated explanation blocks
- Auto-generation mode for `mks:intonation`
- Educational export pipelines (analysis-enriched rendering)

--------

# 和声解析拡張 仕様（v1 ドラフト）

## 1. 対象範囲

本仕様は、mikuscore における和声解析と演奏表現拡張を定義する。

- 対象: MusicXML の入出力、およびアプリ内再生時の表現制御。
- 非対象: 解析付与のための既存ノート構造の改変。

## 2. 目的

1. クラシック和声（学習教材〜音大課題レベル）の機能和声解析を追加する。
2. 和声解析に基づく演奏表現（音程・強弱補正）を追加する。
3. MusicXML 互換を維持しつつ、`mks:*` 拡張で高度情報を保持する。

## 3. 基本方針

### 3.1 標準優先

- 基本和声情報は MusicXML の `<harmony>` に格納しなければならない（MUST）。
- ローマ数字系情報は可能な限り `<numeral>` 系要素を使うべきである（SHOULD）。
- 解析タグ付与のために既存ノートの意味を変更してはならない（MUST NOT）。
- 標準要素のみの読取環境でも意味ある和声情報を読めるべきである（SHOULD）。

### 3.2 拡張分離

- 非標準の高度情報は `mks:*` で保持しなければならない（MUST）。
- 和声拡張は `<other-harmony>` 配下に限定しなければならない（MUST）。
- 演奏拡張は `<other-play>` 配下に限定しなければならない（MUST）。
- 未知の拡張フィールドは保存時に保持しなければならない（MUST）。

## 4. 名前空間とバージョニング

- 名前空間 URI（v1）: `https://mikuscore.org/ns/analysis`
- プレフィックス例: `xmlns:mks="https://mikuscore.org/ns/analysis"`
- `mks:analysis` は `version` 属性を持たなければならない（MUST）。

例:

```xml
<mks:analysis version="1" xmlns:mks="https://mikuscore.org/ns/analysis">
  ...
</mks:analysis>
```

## 5. データモデル

### 5.1 標準和声ブロック（必須）

基本和声同定情報は `<harmony>` に書き込まなければならない（MUST）。

推奨要素:

- `<numeral-root>`（1..7）
- `<numeral-alter>`（変位度数）
- `<numeral-key>`（局所調コンテキスト）
- `<kind>`（major/minor/dominant 等）
- `<inversion>`

例:

```xml
<harmony>
  <numeral>
    <numeral-root text="V">5</numeral-root>
  </numeral>
  <kind>dominant</kind>
  <inversion>1</inversion>
</harmony>
```

### 5.2 `mks:analysis` ブロック（高度情報）

高度解析メタデータは `<other-harmony>` に格納しなければならない（MUST）。

カーディナリティ（v1）:

- `<other-harmony>` あたり `<mks:analysis>` は1つ。
- `<mks:analysis>` あたり `<mks:function>` は1つ。
- 任意項目は省略可。

項目（v1）:

- `mks:function`: `T | S | D`
- `mks:secondary-of`: セカンダリードミナント分母度数（例: V/V => `5`）
- `mks:borrowed`: `true | false`
- `mks:cadence`: `PAC | IAC | HC`
- `mks:confidence`: 小数 `0.0..1.0`
- `mks:source`: `rule | ai | manual`
- `mks:harmony-id`: 和声アンカーID
- `mks:special-chord`: `It6 | Fr6 | Gr6 | N6`（`<kind>` だけでは厳密区別しづらい和音の識別用）

将来拡張の注記:

- v1 の `mks:secondary-of` は簡潔化のため度数（`1..7`）とする。
- `V/V/V` や `V/bII` などへ対応するため、v2 では `mks:secondary-chain` や変位付きテキスト表現の導入を許容してよい（MAY）。

`mks:harmony-id` 制約（v1）:

- スコア文書内で一意でなければならない（MUST）。
- 文字列は `[A-Za-z0-9_-]+` に一致しなければならない（MUST）。
- UUID形式は利用してよいが必須ではない（MAY）。

例:

```xml
<other-harmony>
  <mks:analysis version="1" xmlns:mks="https://mikuscore.org/ns/analysis">
    <mks:harmony-id>h23</mks:harmony-id>
    <mks:function>D</mks:function>
    <mks:secondary-of>5</mks:secondary-of>
    <mks:borrowed>false</mks:borrowed>
    <mks:cadence>HC</mks:cadence>
    <mks:confidence>0.93</mks:confidence>
    <mks:source>rule</mks:source>
  </mks:analysis>
</other-harmony>
```

## 6. 演奏表現制御

### 6.1 音程補正（イントネーション）

- 音程補正のために記譜音高を変更してはならない（MUST NOT）。
- 補正値は `<other-play type="mks:intonation">` に cents で格納しなければならない（MUST）。
- `mks:intonation` には `mks:unit="cent"` を明示しなければならない（MUST）。
- `mks:scope`（`note | chord | voice | measure`）を付与することを推奨する（SHOULD）。
- 値範囲は `-100..+100`（整数）を推奨する（SHOULD）。

例:

```xml
<play>
  <other-play
    type="mks:intonation"
    mks:target-harmony-id="h23"
    mks:unit="cent"
    mks:scope="chord">-12</other-play>
</play>
```

### 6.2 強弱補正

- 基本強弱は標準 `note@dynamics` を利用してよい（MAY）。
- 和声由来の相対強弱は `<other-play type="mks:dynamic-offset">` で保持できなければならない（MUST）。
- v1 の単位は MIDI velocity 加算オフセット（整数）とする（MUST）。
- `mks:dynamic-offset` には `mks:unit="velocity"` を明示しなければならない（MUST）。
- `mks:scope`（`note | chord | voice | measure`）を付与することを推奨する（SHOULD）。
- 値範囲は `-32..+32` を推奨する（SHOULD）。

例:

```xml
<play>
  <other-play
    type="mks:dynamic-offset"
    mks:target-harmony-id="h23"
    mks:unit="velocity"
    mks:scope="chord">-8</other-play>
</play>
```

## 7. リンク規則

- 和声拡張と演奏拡張は `mks:harmony-id` と `mks:target-harmony-id` で対応付け可能でなければならない（MUST）。
- 明示リンクがない場合、実装は同小節内の最寄り和声へフォールバックしてよい（MAY）。
- フォールバックが曖昧な場合、補正適用をスキップし警告診断を出すべきである（SHOULD）。

## 8. バリデーションと診断

推奨診断コード（v1）:

- `HARMONY_PARSE_UNSUPPORTED`
- `HARMONY_EXTENSION_INVALID_VALUE`
- `HARMONY_LINKAGE_NOT_FOUND`
- `HARMONY_LINKAGE_AMBIGUOUS`

推奨する構造化診断タグ:

```xml
<mks:diagnostics>
  <mks:issue
    type="parallel-5th"
    voices="S,A"
    severity="error"
    mks:measure="12"
    mks:tick="1440"
    location="measure:12,beat:3"/>
</mks:diagnostics>
```

規則:

- 拡張値が不正でもロード処理をクラッシュさせてはならない（MUST NOT）。
- 拡張値が不正でも標準 `<harmony>` 情報は利用可能であるべきである（SHOULD）。

## 9. 互換性とラウンドトリップ

- 標準のみを扱うツールは `mks:*` を安全に無視できなければならない（MUST）。
- mikuscore は未知の `other-harmony` / `other-play` フィールドを保持しなければならない（MUST）。
- `dirty === false` の場合、XML文字列は入力とバイト一致しなければならない（MUST）。
- 外部ツールで `other-*` が除去された場合、mikuscore は非致命警告を表示し、必要に応じて再解析してよい（SHOULD/MAY）。

## 10. ロールバックと失敗時動作

- 解析適用は原子的でなければならない（MUST）。
- 解析失敗時は解析適用前状態へロールバックしなければならない（MUST）。
- 部分書き込みは発生してはならない（MUST NOT）。

## 11. 機能レベル目標

### フェーズ1（学習教材レベル）

- I..VII の同定
- 転回形
- 借用和音
- セカンダリードミナント
- 基本終止タグ

### フェーズ2（音大課題レベル）

- 増六和音（It+6 / Fr+6 / Gr+6）
- ナポリのII（bII）
- 代理機能タグ
- 禁則系の診断タグ
- 声部進行解析タグ

## 12. 将来拡張

- `mks:analysis` v2（AI解析説明ブロック）
- `mks:intonation` の自動生成モード
- 解析情報付き教育出力パイプライン
