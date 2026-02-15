# ABC Compat Parser EBNF (draft)

ABC 2.1 を土台にしつつ、`abcjs` / `abcm2ps` でよく見かける記法差のうち、現状実装で吸収している部分を含みます。

## Scope

- ヘッダ: `X,T,C,M,L,K,V` と `%%score`
- ボディ: 音符、休符(`z/x`)、臨時記号、長さ、タイ(`-`)、broken rhythm(`>` `<`)、小節線、和音、連符
- 許容拡張: `M:C`, `M:C|`, インライン文字列(`"..."`)のスキップ、単独オクターブ記号(`,`/`'`)の許容

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

- `A > B` のような空白入り broken rhythm を許容。
- `"D"A` のような和音名/注釈は MusicXML 生成対象外としてスキップ（警告のみ）。
- `x` 休符を `z` と同様に扱う。
- chord (`[CEG]`, `[A,,CE]` など) を同時発音として扱う。
- tuplet (`(3abc`, `(5:4:5abcde` など) を音価スケーリングで扱う。
- `:|`, `|:`, `||` などの `:` は小節補助記号として無視（構文エラー化しない）。
- 単独の `,` / `'` は互換目的で無視して継続する。

## Growth Policy

- まず parse を落とさない（warning first）
- 音価・音高の意味解釈を追加する時は回帰テストを同時追加
- 実データ差分を吸収したら、この文書の `Compatibility Notes` へ追記
