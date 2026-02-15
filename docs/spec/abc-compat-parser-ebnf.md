# ABC Compat Parser EBNF (draft)

## English
This document defines the grammar baseline for the project ABC parser.

It is based on ABC 2.1 and includes currently supported compatibility behavior observed in real-world `abcjs` / `abcm2ps` style inputs.

## Scope
- Header: `X,T,C,M,L,K,V` and `%%score`
- Body: note/rest (`z/x`), accidentals, length, tie (`-`), broken rhythm (`>` `<`), barlines, chords, tuplets
- Compatibility extensions: `M:C`, `M:C|`, inline text skip (`"..."`), standalone octave marker tolerance (`,` / `'`)

## EBNF

```ebnf
abc              = { line } ;
line             = ws , ( score_directive | header | body | comment | empty ) ;

score_directive  = "%%" , ws* , "score" , ws+ , score_expr ;
score_expr       = { score_group | voice_id | ws } ;
score_group      = "(" , { ws | voice_id } , ")" ;

header           = header_key , ":" , ws* , header_value ;
header_key       = "X" | "T" | "C" | "M" | "L" | "K" | "V" | letter ;
header_value     = { any_char_except_newline } ;

body             = { body_token | ws } ;
body_token       = note_or_rest
                 | chord
                 | tuplet
                 | barline
                 | tie
                 | broken_rhythm
                 | inline_text
                 | decoration
                 | ignorable_symbol
                 | standalone_octave_mark ;

note_or_rest     = accidental? , pitch_or_rest , octave_marks? , length? , broken_rhythm? ;
chord            = "[" , chord_note , { chord_note } , "]" , length? , broken_rhythm? ;
chord_note       = accidental? , pitch , octave_marks? , length? ;
tuplet           = "(" , digit , [ ":" , digit ] , [ ":" , digit ] ;
accidental       = "=" | "^" , ["^"] | "_" , ["_"] ;
pitch_or_rest    = pitch | rest ;
pitch            = "A"|"B"|"C"|"D"|"E"|"F"|"G"
                 | "a"|"b"|"c"|"d"|"e"|"f"|"g" ;
rest             = "z" | "Z" | "x" | "X" ;

octave_marks     = { "'" | "," } ;
length           = integer [ "/" , integer ]
                 | "/" , [ integer ] ;

barline          = "|" | ":" ;
tie              = "-" ;
broken_rhythm    = ">" | "<" ;
standalone_octave_mark = "," | "'" ;
inline_text      = '"' , { any_char_except_quote } , '"' ;
decoration       = "!" , { any_char_except_bang } , "!"
                 | "+" , { any_char_except_plus } , "+" ;
ignorable_symbol = ")" | "{" | "}" ;

voice_id         = ( letter | digit | "_" | "." | "-" ) ,
                   { letter | digit | "_" | "." | "-" } ;

comment          = "%" , { any_char_except_newline } ;
empty            = "" ;

meter_value      = "C" | "C|" | integer , "/" , integer ;
length_value     = integer , "/" , integer ;
key_value        = key_token ;

ws               = " " | "\t" ;
integer          = digit , { digit } ;
letter           = "A".."Z" | "a".."z" ;
digit            = "0".."9" ;
```

## Compatibility Notes
- Allow broken rhythm with spaces (`A > B`).
- Skip inline chord symbols/annotations like `"D"A` for MusicXML generation (warn only).
- Treat `x` rest as `z` rest.
- Support chords (`[CEG]`, `[A,,CE]`).
- Support tuplets (`(3abc`, `(5:4:5abcde`) with duration scaling.
- Ignore `:` in barline variants (`:|`, `|:`, `||`) without parse failure.
- Ignore standalone `,` / `'` for compatibility.

## Growth Policy
- Parsing robustness first (warning-first policy).
- Add regression tests when extending duration/pitch semantics.
- Update this document’s compatibility notes whenever absorbing new real-world variance.

---

## 日本語
この文書は、プロジェクトの ABC パーサーにおける文法基準を定義する。

ABC 2.1 を土台とし、`abcjs` / `abcm2ps` 系の実データ差を現行実装で吸収している範囲を含む。

## Scope
- ヘッダ: `X,T,C,M,L,K,V` と `%%score`
- ボディ: 音符、休符(`z/x`)、臨時記号、長さ、タイ(`-`)、broken rhythm(`>` `<`)、小節線、和音、連符
- 許容拡張: `M:C`, `M:C|`, インライン文字列(`"..."`)のスキップ、単独オクターブ記号(`,`/`'`)の許容

## EBNF
上記 English セクションの EBNF を正本とする。

## Compatibility Notes
- `A > B` のような空白入り broken rhythm を許容。
- `"D"A` のような和音名/注釈は MusicXML 生成対象外としてスキップ（警告のみ）。
- `x` 休符を `z` と同様に扱う。
- chord (`[CEG]`, `[A,,CE]` など) を同時発音として扱う。
- tuplet (`(3abc`, `(5:4:5abcde` など) を音価スケーリングで扱う。
- `:|`, `|:`, `||` などの `:` は小節補助記号として無視（構文エラー化しない）。
- 単独の `,` / `'` は互換目的で無視して継続する。

## Growth Policy
- まず parse を落とさない（warning first）。
- 音価・音高の意味解釈を追加する時は回帰テストを同時追加。
- 実データ差分を吸収したら `Compatibility Notes` を更新する。
