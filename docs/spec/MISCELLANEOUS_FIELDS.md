# miscellaneous-field Metadata (mikuscore)

このドキュメントは、mikuscore が MusicXML の
`attributes > miscellaneous > miscellaneous-field` に付与する情報を整理したものです。

## Scope

- 対象: mikuscore が生成・追記する `miscellaneous-field`
- 非対象: 外部ツールが独自に付与したフィールド仕様

## Namespace Policy

新規実装の目標は、mikuscore 付与情報を `mks:` 配下に集約すること。

- `mks:meta:*`: ラウンドトリップ復元に使う安定メタデータ
- `mks:diag:*`: 変換時の警告/劣化情報
- `mks:src:*`: 元データ退避（raw payload 断片や由来情報。`mks:dbg:*` に位置付けが近い）
- `mks:dbg:*`: 調査用デバッグ情報（変更されやすい）

補足:

- 出力時の `miscellaneous-field` は本ドキュメントの `mks:*` 命名を基準とする。

## mks:dbg:* Fields (Target)

### MEI import debug

- `mks:dbg:mei:notes:count`
- `mks:dbg:mei:notes:0001` ... `mks:dbg:mei:notes:####`

Payload keys:

- 共通: `idx,m,stf,ly,li,k,du,dt`
- `note` のとき: `pn,oc`（必要時 `ac`）
- `chord` のとき: `cn`

### ABC import debug

- `mks:dbg:abc:meta:count`
- `mks:dbg:abc:meta:0001` ... `mks:dbg:abc:meta:####`

Payload keys:

- `idx,m,v,r,g,ch,st,al,oc,dd,tp`

### MIDI import debug

- `mks:dbg:midi:meta:count`
- `mks:dbg:midi:meta:0001` ... `mks:dbg:midi:meta:####`

Payload keys:

- `idx,tr,ch,v,stf,key,vel,sd,dd,tk0,tk1`

## mks:meta:* Fields (Target)

### MIDI SysEx metadata (roundtrip restore)

- `mks:meta:midi:sysex:count`
- `mks:meta:midi:sysex:0001` ... `mks:meta:midi:sysex:####`
- `mks:meta:midi:sysex:<key>`（要約キー）

代表的な `<key>`:

- `schema,namespace,app,source,tpq`
- `track-count,event-count,tempo-event-count,timesig-event-count`
- `keysig-event-count,control-event-count,channel-count`
- `fingerprint-fnv1a32`

## mks:src:* Fields (Target)

### ABC raw source

- `mks:src:abc:raw-encoding`
- `mks:src:abc:raw-length`
- `mks:src:abc:raw-encoded-length`
- `mks:src:abc:raw-chunks`
- `mks:src:abc:raw-truncated`
- `mks:src:abc:raw-0001` ... `mks:src:abc:raw-####`

### MIDI raw bytes

- `mks:src:midi:raw-encoding`
- `mks:src:midi:raw-bytes`
- `mks:src:midi:raw-hex-length`
- `mks:src:midi:raw-chunks`
- `mks:src:midi:raw-truncated`
- `mks:src:midi:raw-0001` ... `mks:src:midi:raw-####`

### MuseScore raw source

- `mks:src:musescore:raw-encoding`
- `mks:src:musescore:raw-length`
- `mks:src:musescore:raw-encoded-length`
- `mks:src:musescore:raw-chunks`
- `mks:src:musescore:raw-0001` ... `mks:src:musescore:raw-####`
- `mks:src:musescore:version`

### MEI-derived source annotations

- `mks:src:mei:*`
  - MEI 側 annot から取り込まれた名称を `mks:src:mei:` プレフィクス化

## mks:diag:* Fields (Target)

- `mks:diag:count`
- `mks:diag:0001` ... `mks:diag:####`

`mks:diag:0001` 以降は `;` 区切りの構造化文字列。
例:

- `level=warn;code=OVERFULL_CLAMPED;fmt=mei;...`
- `level=warn;code=...;fmt=abc;...`
- `level=warn;code=...;fmt=midi;...`
- `level=warn;code=...;fmt=lilypond;...`
- `level=warn;code=...;fmt=musescore;...`

## Notes

- `*-count` は対応する連番フィールド数を示す。
- 連番は `0001` 形式（4桁ゼロ埋め）。
- `mks:meta:*` は長期互換を優先する。
- `mks:dbg:*` は将来変更される可能性がある。
