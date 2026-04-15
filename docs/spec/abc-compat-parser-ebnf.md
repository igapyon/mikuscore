# ABC Compat Parser EBNF

## English
This document defines the current grammar baseline for the project ABC parser.

It is based on ABC 2.1 and includes currently supported compatibility behavior observed in real-world `abcjs` / `abcm2ps` style inputs.

Warning:

- this document is a practical grammar baseline, not a fully synchronized dump of every parser helper and dispatch path in the current implementation
- when this document and implementation detail appear to diverge, treat implementation, regression tests, and `docs/spec/ABC_IO.md` as the more authoritative source for the currently supported bounded behavior
- update this document when the bounded grammar baseline changes materially, but do not assume every internal parser refactor requires line-by-line EBNF churn here

The parser should be understood in three layers:

- standard ABC surface
- compatibility behavior for real-world ABC variance
- `mikuscore` extension metadata comments (`%@mks ...`) used for roundtrip support

ABC is a supported format in `mikuscore`.
This grammar therefore documents the implemented compatibility baseline for supported import behavior, rather than an experimental parser sketch.

## Practical Interpretation

ABC interoperability is influenced not only by the narrow core grammar, but also by de facto conventions widely seen in tools such as `abcjs` and `abcm2ps`.

For that reason, this document should be read as:

- a grammar baseline for the standard ABC surface actually implemented by `mikuscore`
- a record of compatibility behavior accepted for common real-world inputs
- not a promise that every informal ABC variant in the wild is accepted

For `mikuscore`, `abcjs` / `abcm2ps` behavior is not itself the normative grammar.
Instead, it is evidence for de facto interoperability expectations that may justify explicit compatibility rules in this document.

De facto compatibility should therefore be understood as:

- acceptable to adopt when a pattern is common enough in practice
- acceptable to adopt when the intended musical meaning is sufficiently clear
- required to be documented in spec text and regression tests once adopted
- not a blanket reason to accept arbitrary malformed or ambiguous ABC

When extending compatibility, the preferred policy is:

- add support by recognizable pattern classes, not by one-off token hacks
- keep directive/context parsing separate from body note parsing
- fail clearly on input that is still structurally or musically uninterpretable after compatibility handling

## Scope
- Header: `X,T,C,M,L,K,U,V` and `%%score`
- Body: note/rest (`z/x`), accidentals, length, tie (`-`), broken rhythm (`>` `<`), barlines, chords, tuplets, overlay (`&`)
- Compatibility behavior: `M:C`, `M:C|`, inline text skip (`"..."`), standalone octave marker tolerance (`,` / `'`)
- `mikuscore` extension metadata comments: `%@mks ...`

## EBNF

```ebnf
abc              = { line } ;
line             = ws , ( score_directive | header | body | comment | empty ) ;

score_directive  = "%%" , ws* , "score" , ws+ , score_expr ;
score_expr       = { score_group | voice_id | ws } ;
score_group      = "(" , { ws | voice_id } , ")" ;

header           = header_key , ":" , ws* , header_value ;
header_key       = "X" | "T" | "C" | "M" | "L" | "K" | "U" | "V" | letter ;
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
- Support overlay marker `&` by splitting the body stream into synthetic overlay voices at measure boundaries.
- Support `U:` single-character user-defined decoration aliases on import by expanding them into regular decoration markers before parsing.
- Ignore `:` in barline variants (`:|`, `|:`, `||`) without parse failure.
- Ignore standalone `,` / `'` for compatibility.
- Allow recognized bare `V:` clef shorthands such as `V:2 bass`, `V:1 treble C D |`, `V:1 c3`, and `V:2 c4`.
- Prefer class-based compatibility rules derived from common `abcjs` / `abcm2ps` practice over one-off special cases.
- Do not let unknown directive-tail fragments silently fall through into body note parsing.
- Prefer warning on unsupported bare `V:` tail words over later note/rest parse failure caused by directive leftovers.

## `mikuscore` Extension Notes
- Accept `%@mks` metadata comments (`key`, `measure`, `transpose`) and feed roundtrip metadata when present.
- These comments are not part of the standard ABC musical surface.
- They are `mikuscore`-specific extension metadata used for restoration and roundtrip support.

## Growth Policy
- Parsing robustness first (warning-first policy).
- Add regression tests when extending duration/pitch semantics.
- Update this document’s compatibility notes whenever absorbing new real-world variance.

---

## 日本語（抄訳）

- 正本は上記 English セクションです。
- 本セクションは要点のみを示します。
- 例外として、未決定事項や検討中メモは日本語のみで記述する場合があります。

### 要点
- ABC 2.1 を基準に、実データ互換（`abcjs` / `abcm2ps` 系）を取り込みます。
- EBNF は English セクションを正本として扱います。
- 互換挙動（`M:C`, `M:C|`, standalone `,` / `'` など）を許容します。
- `%@mks` は `mikuscore` 独自拡張コメントとして扱います。
- 文法・意味解釈の拡張時は回帰テストを追加します。
