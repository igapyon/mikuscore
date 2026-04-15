# ABC I/O Specification

## Purpose

This document defines the behavior of `src/ts/abc-io.ts`.

The module is responsible for:

- parsing ABC text into an internal structure compatible with MusicXML generation
- converting ABC source to MusicXML
- exporting MusicXML DOM to ABC text
- providing reusable ABC utility functions

---

## Positioning

`mikuscore` handles ABC in three layers:

- **Standard ABC surface**
  - ordinary ABC headers, body tokens, and supported musical decorations
- **Compatibility behavior**
  - pragmatic parsing support for real-world ABC variants commonly seen in `abcjs` / `abcm2ps` style inputs
- **`mikuscore` extension metadata**
  - `%@mks ...` comment lines used to preserve roundtrip-relevant information that plain ABC cannot carry reliably

This distinction is important:

- compatibility behavior is about accepting real-world ABC variance without failing unnecessarily
- `mikuscore` extension metadata is not part of the standard ABC musical surface
- `%@mks ...` lines are `mikuscore`-specific comment hints for restoration and roundtrip support

`mikuscore` treats ABC as a supported score interchange format.
Compatibility behavior and extension metadata are support mechanisms for practical import/export and roundtrip stability, not an indication that ABC support is merely experimental.

### Practical ecosystem note

In practice, ABC support cannot be defined only by a narrow reading of the base grammar.
Real-world ABC interchange is also shaped by de facto ecosystem behavior, especially inputs and conventions commonly accepted by tools such as `abcjs` and `abcm2ps`.

For `mikuscore`, these ecosystems are not treated as normative specifications by themselves.
However, they are treated as important evidence for what counts as common, practical ABC interchange behavior in the wild.

This means:

- the formal ABC surface remains the baseline reference
- behavior widely accepted by `abcjs` / `abcm2ps` may be adopted as compatibility behavior even when it is better described as de facto practice than narrow core grammar
- such compatibility acceptance must still be documented explicitly in spec text and tests
- de facto compatibility is not the same thing as accepting arbitrary malformed input

Because of that, `mikuscore` uses the following stance:

- preserve a clear distinction between standard ABC surface syntax and compatibility-only behavior
- accept widely used real-world variants when their musical intent is clear enough
- avoid silently treating non-body directive leftovers as body note text
- reject or warn on inputs that remain structurally ambiguous or musically unclear

The goal is not "accept everything".
The goal is to accept broadly used ABC variants without unnecessary failure, while still failing clearly on genuinely broken or uninterpretable input.

---

## Public API

### Types

- `Fraction = { num: number; den: number }`

### Objects / Functions

- `AbcCommon`
- `AbcCompatParser` (`parseForMusicXml`)
- `exportMusicXmlDomToAbc(doc)`
- `clefXmlFromAbcClef(rawClef?)`
- `convertAbcToMusicXml(abcSource)`

---

## AbcCommon utilities

`AbcCommon` provides pure helpers:

- fraction arithmetic and normalization (`gcd`, `reduceFraction`, `multiplyFractions`, `divideFractions`)
- ABC length token parse/format
- pitch/accidental conversion helpers
- key conversion (`fifths <-> ABC key`)

`AbcCommon` is also exposed to `window` when running in browser.

---

## ABC -> internal parse (`AbcCompatParser.parseForMusicXml`)

### Accepted input layers

The parser accepts three categories of input:

#### 1. Standard ABC surface

- headers (`X:`, `T:`, `C:`, `M:`, `L:`, `K:`)
- user-defined decoration header (`U:`) for single-character decoration aliases on import
- voice directives (`V:` with optional `name`, `clef`, `transpose`)
- body note/rest/chord tokens

### Current information-field stance

`mikuscore` currently treats the following as the supported core ABC field subset:

- `X:`
- `T:`
- `C:`
- `M:`
- `L:`
- `K:`
- `Q:`
- `V:` (with the bounded voice-property subset documented separately)

Fields outside that core subset are not currently part of the supported ABC interchange target.
They may be lexically tolerated by the header scan, but they are not claimed as semantically supported import/export behavior.

### Current inline-field stance

`mikuscore` currently treats the following as the supported inline-field subset:

- `[K:...]`
- `[M:...]`
- `[L:...]`
- `[Q:...]`
- `[V:...]`

Inline fields outside that subset are not currently part of the supported ABC interchange target.
They are skipped with warnings rather than treated as semantically supported behavior.

### Current body-side standalone core-field compatibility

`mikuscore` also accepts a narrow compatibility subset where body-side standalone core field lines or tokens are treated like the corresponding inline fields after body parsing has begun:

- `K:...`
- `M:...`
- `L:...`
- `Q:...`

This is compatibility behavior, not a broad claim that arbitrary information fields may freely appear as standalone body syntax.

Body-side standalone single-letter fields outside that bounded compatibility subset are skipped with warnings rather than silently treated as supported body semantics.

### Current field-continuation stance

`mikuscore` does not currently treat continued information-field lines as part of the supported ABC interchange subset.

This means:

- field continuation is currently unsupported
- lexical tolerance of adjacent header text does not count as continuation support
- continuation support is intentionally deferred unless practical input evidence makes it necessary
- unsupported continued header-field text should be skipped with warnings rather than falling through into body note/rest parsing

However, `mikuscore` now applies one bounded compatibility rule for body parsing:

- a trailing body-line continuation marker `\` is stripped before body tokenization
- this avoids treating the continuation marker itself as note/rest text in the next parse stage
- this does not by itself promote full continued-information-field semantics to supported status

### Current symbol-line stance

`mikuscore` does not currently treat standard `s:` symbol lines as part of the supported ABC interchange subset.

This means:

- `s:` symbol lines are out of practical scope for the present bounded target
- there is no current import/export or roundtrip support claim for them
- this area stays out of scope unless practical input demand changes priority

#### 2. Compatibility behavior

- optional `%%score` voice ordering / staff-grouping directive
- unsupported `%%...` directives are skipped with warnings rather than silently treated as supported semantics
- partial/legacy patterns accepted for practical compatibility
- de facto ecosystem conventions commonly accepted by `abcjs` / `abcm2ps` may be supported when the intended musical meaning is clear and implementation behavior can be specified
- trailing body-line continuation marker `\` may be tolerated so it does not leak into note/rest parsing
- body-side standalone core field lines or tokens `K:` / `M:` / `L:` / `Q:` may be accepted as compatibility shorthand for the corresponding inline fields once body parsing has begun
- unsupported standalone body-side single-letter fields or tokens should be skipped with warnings rather than silently treated as supported body semantics
- `V:` directive tails may accept recognized bare clef names / aliases such as `bass`, `treble`, `alto`, `tenor`, `c3`, `c4` as compatibility shorthand for `clef=...`
- unsupported inline text / decoration forms may be skipped with warnings
- overlay marker `&` is imported by splitting one ABC body stream into synthetic overlay voices
- current overlay limitation: these synthetic overlay voices become separate MusicXML parts rather than one part with multiple synchronized voices
- standalone octave marks may be tolerated in unsupported positions

Current `%%score` handling is intentionally bounded:

- plain ordered ids continue to control voice order
- parenthesized groups such as `%%score (1 2)` are imported as one MusicXML part with multiple staves
- this currently targets practical multi-staff grouping, not full ABC staff-layout parity
- `brace` / `bracket` / `staves` and related broader `V:` property semantics remain outside the supported standard subset

#### 3. `mikuscore` extension metadata

- optional `mikuscore` metadata comments:
  - `%@mks key ...`
  - `%@mks measure ...`
  - `%@mks transpose ...`

These `%@mks ...` comments are not treated as standard ABC musical notation.
They are extension metadata used to improve roundtrip restoration.

### Compatibility behavior

Parser is intentionally lenient for real-world ABC:

- ignores standalone octave marks in unsupported positions
- strips trailing body-line continuation `\` before body tokenization
- accepts body-side standalone `K:` / `M:` / `L:` / `Q:` lines or tokens as compatibility shorthand for the corresponding inline fields
- skips stray body-side continuation markers `\` with warnings when they still appear in token flow
- skips unsupported body-side word-token leftovers with warnings when they are clearly not note/rest syntax, including bounded lower-case word leftovers
- skips stray body-side number tokens with warnings when they are clearly not attached note-length syntax
- skips notes/chord-notes/grace-notes with unsupported octave range using warnings rather than failing the whole tune parse
- skips notes/chords/grace-notes with invalid zero-length results using warnings rather than failing the whole tune parse
- skips malformed accidental leftovers with warnings when they do not lead into a valid note/rest token
- skips bounded stray body punctuation leftovers such as `;`, `` ` ``, `?`, `@`, `#`, `$`, and `*` with warnings rather than failing note/rest parsing
- skips unsupported decorations/inline strings with warnings
- accepts partial/legacy patterns where possible
- may accept de facto ecosystem forms seen in `abcjs` / `abcm2ps`-style inputs when they are structurally recognizable and musically interpretable
- should not pass unknown directive-tail fragments through as ordinary body note text
- should warn on unsupported bare `V:` tail words instead of letting them fail later as body note/rest parsing errors

### Current overlay policy

`mikuscore` currently treats ABC overlay syntax `&` as bounded import-side compatibility behavior:

- accepted on import
- preserved by expanding overlay material into synthetic overlay voices / parts
- not currently claimed as faithful one-part multi-voice preservation
- not currently claimed as exact standard ABC `&` roundtrip preservation

This is an intentional scope boundary, not an accidental gap.

### Current beam / whitespace policy

`mikuscore` currently uses a bounded beam policy:

- on import, inter-note whitespace between beamable notes is treated as an explicit beam-break hint
- this affects the current voice/measure parse stream and is used when forming MusicXML beam state
- beat boundaries still split implicit beam runs even when there is no whitespace
- on export, ABC is not currently generated with beam-specific spacing preservation; note tokens are emitted in ordinary measure text and original spacing is not replayed verbatim

This means:

- beam-break intent is preserved on ABC import into MusicXML
- exact source whitespace used for beam layout is not currently treated as canonical roundtrip data

### Current supported `V:` property subset

In the standard ABC path, `mikuscore` currently treats the following `V:` properties as the supported working subset:

- `name=...`
  - supported on import and export
- `clef=...`
  - supported on import and export for the common working subset: `treble`, `bass`, `alto`, `tenor`, `c3`, `c4`
- `transpose=...`
  - accepted on import as a bounded chromatic transpose value
  - not currently emitted back as standard `V:` metadata on export
  - roundtrip export currently relies on `%@mks transpose ...` extension metadata instead

In other words:

- standard `V:` transpose support is currently `import-partial`
- transpose-preserving roundtrip is currently `extension-assisted` through `%@mks transpose ...`

The following standard voice-property family is currently outside the supported standard subset and should be treated as unsupported unless documented otherwise:

- `staves`
- `brace`
- `bracket`
- `merge`
- `middle`
- `gchords`

Current handling for unsupported standard `V:` properties:

- unsupported `key=value` voice-property tokens are skipped in the standard path
- they should produce warnings rather than silently expanding the supported subset
- they should not be reinterpreted as body note text

Compatibility note:

- recognized bare clef shorthand such as `V:2 bass` is accepted as compatibility behavior, not as a separate standard property form

### Current clef / transposition stance

`mikuscore` currently uses a bounded clef / transposition policy:

- supported standard clef subset in `V:` metadata:
  - `treble`
  - `bass`
  - `alto`
  - `tenor`
  - `c3`
  - `c4`
- supported compatibility behavior:
  - recognized bare clef shorthand such as `V:2 bass`
- partial / extension-assisted:
  - standard `V:` transpose is currently import-partial
  - transpose-preserving roundtrip currently relies on `%@mks transpose ...`

Current limits:

- broader standard clef forms beyond the current recognized subset are not currently claimed
- full standard `V:` transpose export parity is not currently claimed

### Supported musical tokens

#### Standard musical content

- notes and rests
- accidentals (`^`, `_`, `=`)
- length tokens (`2`, `/`, `/2`, `3/2`, etc.)
- ties (`-`)
- chords (`[...]`)
- tuplets (`(n[:q][:r]`)
- broken rhythm (`>` / `<`)
- barlines

#### Current quoted chord-symbol subset

Quoted text attached to notes is split between:

- harmonic chord-symbol parsing into MusicXML `harmony`
- ordinary quoted annotation text into MusicXML direction words

Current supported harmonic quoted-chord subset:

- root / bass spelling
  - `A`-`G`
  - optional `#` / `b`
  - optional slash bass with the same spelling subset
- supported suffixes
  - ``
  - `m`, `min`
  - `6`, `m6`, `min6`
  - `7`, `9`, `11`, `13`
  - `maj7`, `maj9`
  - `m7`, `min7`, `m9`, `min9`
  - `7sus4`, `sus4`, `sus2`
  - `dim`, `dim7`, `aug`, `+`, `m7b5`, `min7b5`, `ø`

Current fallback rule:

- quoted text outside that inventory is treated as annotation/words, not forced into MusicXML `harmony`

### Current annotation stance

`mikuscore` currently uses a bounded annotation policy for quoted non-harmonic text:

- common quoted non-harmonic text attached to notes is supported as MusicXML direction words / annotations
- quoted text that does not fit the supported harmony inventory falls back to annotation/words rather than being forced into `harmony`
- this bounded subset is supported as practical interchange behavior

Current limits:

- broader annotation placement semantics are not currently claimed as preserved
- the current support target is ordinary quoted annotation text, not full ABC annotation behavior parity

### Current order-of-constructs stance

`mikuscore` currently uses a bounded practical-acceptance stance for ABC construct ordering:

- common construct orderings already handled by the parser are supported
- practical acceptance of structurally recognizable real-world ABC is preferred over strict rejection based only on narrower construct-order readings
- unsupported order cases should fail only when they become structurally ambiguous or break directive/body interpretation

Current limits:

- full formal conformance to every standard order-of-constructs nuance is not currently claimed
- exact acceptance parity with every ABC implementation is not currently claimed
- lexical tolerance of unusual ordering does not by itself widen the supported subset unless the behavior is documented

#### Supported decorations and grace forms

- decorations: `!trill!` (also accepts `!tr!` / `!triller!` on import), long-trill delimiters `!trill(!` / `!trill)!`, `!turn!` (also accepts `!lowerturn!` as inverted-turn on import), `!turnx!`, `!invertedturn!`, `!invertedturnx!`, `!mordent!`/`!pralltriller!` (including `!prall!`, `!pralltrill!`, `!uppermordent!`, `!lowermordent!`, `!invertedmordent!`, `!inverted-mordent!` aliases), `!schleifer!`, `!shake!`, `!roll!` (also accepts `!arpeggio!` / `!arpeggiate!` on import), `!slide!` (canonical import/export for MusicXML slide start; explicit stop still uses `mikuscore` extension `!slide-stop!`), phrase marks `!shortphrase!`, `!mediumphrase!`, `!longphrase!` (roundtrip via MusicXML `other-articulation`), `!staccato!` (also accepts `!stacc!` / `!stac!` on import), `!wedge!`/`!staccatissimo!` (also accepts `!spiccato!` on import), `!accent!` (also accepts `!>!` / `!emphasis!` on import), `!tenuto!`, `!stress!`, `!unstress!`, `!fermata!` / `!invertedfermata!` (also accepts `!inverted fermata!` on import), `!marcato!` (also accepts `!strong accent!` / `!strongaccent!` / `!strong-accent!` on import), `!breath!` (also accepts `!breathmark!` / `!breath mark!` / `!breath-mark!` on import), `!caesura!`, `!segno!`, `!coda!`, `!fine!`, `!dacapo!` (also accepts `!da capo!` / `!da-capo!` / `!D.C.!` on import), `!dalsegno!` (also accepts `!dal segno!` / `!dal-segno!` / `!D.S.!` on import), `!tocoda!` (also accepts `!to coda!` / `!to-coda!` on import), `!dacoda!`, fingering decorations `!0!`, `!1!`, `!2!`, `!3!`, `!4!`, `!5!` (single-digit technical fingering export prefers these standard forms over `!fingering:TEXT!`), wedge decorations `!crescendo(!`, `!crescendo)!`, `!diminuendo(!`, `!diminuendo)!` (also accepts aliases `!cresc(!`, `!cresc)!`, `!dim(!`, `!dim)!`, `!decresc(!`, `!decresc)!`, `!decrescendo(!`, `!decrescendo)!`, `!<(!`, `!<)!`, `!>(!`, `!>)!` on import), dynamics `!pppp!`, `!ppp!`, `!pp!`, `!p!`, `!mp!`, `!mf!`, `!f!`, `!ff!`, `!fff!`, `!ffff!`, `!fp!`, `!fz!`, `!rfz!`, `!sf!`, `!sfp!`, `!sfz!`, `!upbow!` / `!downbow!` (also accepts `!up bow!` / `!down bow!` / `!up-bow!` / `!down-bow!` on import), `!doubletongue!` / `!tripletongue!` (also accepts `!double tongue!` / `!triple tongue!` / `!double-tongue!` / `!triple-tongue!` on import), `!heel!` / `!toe!` (also accepts `!heel mark!` / `!toe mark!` on import), `!open!` (also accepts `!openstring!` / `!open string!` / `!open-string!` on import), `!snap!` (also accepts `!snappizzicato!` / `!snap pizzicato!` / `!snap-pizzicato!` on import), `!harmonic!`, `!stopped!` (including `!plus!`, `!stopped horn!`, `!stopped-horn!` aliases), `!thumb!` (also accepts `!thumbposition!` / `!thumb-position!` / `!thumbpos!` / `!thumb pos!` / `!thumb position!` on import)
- standard shorthand decoration symbols on import: `~` (roll), `H` (fermata), `L` (accent), `M` (lowermordent), `O` (coda), `P` (uppermordent), `S` (segno), `T` (trill), `u` (up-bow), `v` (down-bow)
- mikuscore extension decorations: `!delayedturn!`, `!delayedinvertedturn!`, `!tremolo-single-N!`, `!tremolo-start-N!`, `!tremolo-stop-N!`, `!gliss-start!`, `!gliss-stop!`, `!slide-start!` (legacy import alias for standard `!slide!`), `!slide-stop!`, `!rehearsal:TEXT!`, `!fingering:TEXT!`, `!string:TEXT!`, `!pluck:TEXT!`
- grace groups `{...}` including slash grace variant (`{/g}`)

#### Pending standard-decoration policy notes

- `!arpeggio!` and `!roll!`
  - import compatibility remains broad
  - canonical export should prefer `!arpeggio!` for the current MusicXML `<arpeggiate/>` carrier
  - `!roll!` remains an accepted compatibility alias on import unless a distinct roundtrip carrier is added
- `!+!` / `!plus!`
  - current support is a narrow technical/stopped-style interpretation
  - canonical export remains `!stopped!`, not `!+!` / `!plus!`
- mordent-family aliases
  - import aliases stay broad
  - canonical export remains `!mordent!` for lower mordent and `!pralltriller!` for upper/inverted mordent
- `!slide!`
  - current standard support is start-side only; explicit stop currently remains a `mikuscore` extension via `!slide-stop!`

### Parse result characteristics

Returned structure includes:

- `meta` (title/composer/meter/unit/key)
- `parts[]` with `partId`, `partName`, `clef`, optional `transpose`, `measures`
- per-measure metadata hints (measure number / implicit / repeat / repeat times)
- tuplet timing metadata (`timeModification`, tuplet start/stop markers)
- voice ordering based on `%%score` + declared fallback order
- `warnings[]` for non-fatal issues

Fatal parse failures (e.g., no body, no notes/rests, unrecoverable token parse) throw an error.

## Defaults and fallback policy

- meter fallback: `4/4`
- unit length fallback: `1/8`
- key fallback: `C`
- title/composer fallback comes from parser settings

---

## MusicXML -> ABC (`exportMusicXmlDomToAbc`)

### Standard ABC output

Exports:

- `X:1`
- `T:` from `work-title` or `movement-title` (fallback `mikuscore`)
- `C:` from composer creator if present
- `M:` from first measure time (fallback `4/4`)
- `L:1/8` (fixed)
- `K:` from key fifths/mode conversion

### Voice / part mapping

- each MusicXML `part` maps to `V:` section
- voice id is sanitized from part id
- part name exported as `name="..."`
- clef mapped to ABC clef suffix when recognized

### Standard musical export policy

- supports rests, pitch notes, chords, durations, ties
- supports tuplet roundtrip export (`(n:q:r` style) from MusicXML time-modification/tuplet notations
- supports ornament export/import mapping:
  - `trill-mark` / `wavy-line(start)` <-> `!trill!`
  - extended trill line start/stop via `trill-mark` + `wavy-line(type="start")` / `wavy-line(type="stop")` <-> `!trill(!` / `!trill)!`
  - `turn` <-> `!turn!`
  - `inverted-turn` <-> `!invertedturn!`
- supports grace slash mapping:
  - MusicXML `<grace slash="yes"/>` <-> ABC grace token with leading slash (e.g. `{/g}`)
- emits accidentals based on key signature + measure accidental memory
  - suppresses redundant naturals in-context
  - emits required naturals where key/measure context differs
- serializes each part as ABC measure stream (`|` separated)
- supported standard ornament/decorations now include `trill`, `turn`, `invertedturn`, `mordent`, `pralltriller`, `schleifer`, `shake`, `roll`, selected articulations/technicals/dynamics, and selected jump markers

### `mikuscore` extension metadata on export

For lossless or safer roundtrip behavior, `mikuscore` may emit extension comment lines after the ABC body:

- `%@mks key voice=... measure=... fifths=...` (legacy/import-compatibility path; standard export now prefers `K:` / inline `[K:...]`)
- `%@mks measure voice=... measure=... number=... implicit=... [times=...] [ending-stop=... ending-type=discontinue]`
- `%@mks transpose voice=... chromatic=... [diatonic=...]`

These lines are `mikuscore` extension metadata, not part of the standard ABC musical surface.

---

## ABC -> MusicXML (`convertAbcToMusicXml`)

`convertAbcToMusicXml` pipeline:

1. parse ABC via `AbcCompatParser.parseForMusicXml`
2. transform parsed result into MusicXML 4.0 document text

### Restoration policy

Generation policy:

- fixed divisions: `960`
- supports multi-part output
- writes part list + default midi-instrument tags
- writes first-measure attributes (key/time/clef and optional transpose)
- preserves tie semantics using both `<tie>` and `<notations><tied>`
- restores tuplet semantics using both `<time-modification>` and `<notations><tuplet>`
- restores standard repeat/ending barlines and key changes from ABC surface syntax, and restores non-standard measure metadata (`number`, `implicit`, extra repeat hints when needed) from `%@mks measure`

### Current repeat / ending policy

`mikuscore` currently uses this bounded repeat / ending policy:

- standard ABC surface is preferred for common cases:
  - `|:`
  - `:|`
  - `[1`, `[2`
  - `|1`, `:|2`
- `%@mks measure ...` is used only for edge semantics not directly represented in the current standard export path, including:
  - backward repeat counts beyond the ordinary case via `times=...`
  - ending stop type `discontinue` via `ending-stop=... ending-type=discontinue`

This means:

- common repeat / ending forms are standard-path behavior
- some edge semantics are currently extension-assisted rather than pure standard-surface roundtrip behavior

### Current slur policy

`mikuscore` currently uses a bounded slur policy:

- ABC `(` / `)` slur markers are supported in common note-to-note cases
- MusicXML note-level slur start/stop presence is exported/imported in simple cases
- slur handling is currently presence-based rather than identity-based

Current limits:

- slur numbering / nested-slur identity is not currently claimed as preserved
- a slur stop without a preceding non-rest note is treated as unsupported and yields a warning in the ABC import path
- ties are tracked separately and have stronger preservation guarantees than generic slur span identity

### Current tuplet stance

`mikuscore` currently uses a bounded tuplet policy:

- common ABC tuplet syntax `(n[:q][:r])` is supported in ordinary note sequences
- MusicXML roundtrip through `<time-modification>` and note-level `<tuplet>` start/stop is supported in the current path
- common explicit tuplet export such as `(3:2:3` is supported

Current limits:

- broader ratio/edge semantics beyond the current tested subset are not currently claimed
- broader cross-measure or more complex tuplet-span semantics are not currently claimed

### Current lyric stance

`mikuscore` currently uses a bounded lyric policy for ABC `w:` underlay:

- common `w:` lyric import/export is supported
- common single-verse lyric alignment in ordinary note sequences is supported
- ordinary hyphenated lyric tokens are supported in the current `w:` path

Current limits:

- full lyric alignment nuance across rests, spacers, grace, and more complex spacing is not currently claimed
- full multi-verse behavior is not currently claimed
- verse numbering semantics are not currently claimed

### Current ABC 2.2 delta stance

The following ABC 2.2 decorations are currently supported in a bounded accidental-level subset:

- `!editorial!`
- `!courtesy!`

Current bounded interpretation:

- `!editorial!`
  - applies to the following explicit accidental in the ABC import path
  - maps to MusicXML `accidental editorial="yes"`
- `!courtesy!`
  - applies to the following explicit accidental in the ABC import path
  - maps to MusicXML `accidental cautionary="yes"`

Current limits:

- support is intentionally bounded to accidental-level editorial/cautionary flags
- broader engraving/layout semantics beyond those accidental attributes are not currently claimed

### Current `U:` stance

`mikuscore` currently treats `U:` as bounded import-first functionality:

- supported
  - single-character user-defined decoration aliases on import
  - right-hand side decoration text written as either `!decor!` or `+decor+`
- not currently claimed
  - export of `U:` declarations as part of standard ABC roundtrip output
  - broader parity for redefinable-symbol semantics beyond the current alias-import subset

Malformed `U:` declarations are ignored rather than treated as fatal parse errors.
- restores transpose (`chromatic`, `diatonic`) from `%@mks transpose`
- inserts a fallback whole-rest note for empty measures

### Debug / investigation metadata

- emits metadata to `attributes/miscellaneous-field` (`mks:dbg:abc:meta:*`) by default; disable with `debugMetadata:false`

### Incident analysis using `miscellaneous-field`

For ABC import troubleshooting, inspect:

- `part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:dbg:abc:meta:count"]`
- `part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:dbg:abc:meta:"]`

Recommended flow:

1. identify the problematic measure/event in the rendered score.
2. inspect corresponding `mks:dbg:abc:meta:*` rows in MusicXML.
3. compare parsed note facts (`r`, `g`, `ch`, `st`, `al`, `oc`, `dd`, `tp`) against expected ABC intent.

---

## Clef mapping (`clefXmlFromAbcClef`)

Supported mappings:

- `bass` / `f` -> F4 clef
- `alto` / `c3` -> C3 clef
- `tenor` / `c4` -> C4 clef
- default -> G2 clef

---

## Warning and error policy

- Non-fatal compatibility issues are accumulated into `warnings`.
- Invalid-but-recoverable header values downgrade to defaults with warning.
- Structural parse failures throw errors with line context where available.

---

## Scope notes

- This module is intentionally compatibility-oriented and pragmatic.
- It does not aim to be a complete strict ABC standard implementation.
- ABC is a supported format in `mikuscore`; behavior prioritizes stable import/export and roundtrip reliability for practical workflows.
- `%@mks ...` comments are `mikuscore` extension metadata for roundtrip support, not standard ABC musical notation.
