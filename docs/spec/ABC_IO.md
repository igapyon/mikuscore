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

#### 2. Compatibility behavior

- optional `%%score` voice ordering directive
- partial/legacy patterns accepted for practical compatibility
- de facto ecosystem conventions commonly accepted by `abcjs` / `abcm2ps` may be supported when the intended musical meaning is clear and implementation behavior can be specified
- `V:` directive tails may accept recognized bare clef names / aliases such as `bass`, `treble`, `alto`, `tenor`, `c3`, `c4` as compatibility shorthand for `clef=...`
- unsupported inline text / decoration forms may be skipped with warnings
- overlay marker `&` is imported by splitting one ABC body stream into synthetic overlay voices
- current overlay limitation: these synthetic overlay voices become separate MusicXML parts rather than one part with multiple synchronized voices
- standalone octave marks may be tolerated in unsupported positions

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
- skips unsupported decorations/inline strings with warnings
- accepts partial/legacy patterns where possible
- may accept de facto ecosystem forms seen in `abcjs` / `abcm2ps`-style inputs when they are structurally recognizable and musically interpretable
- should not pass unknown directive-tail fragments through as ordinary body note text
- should warn on unsupported bare `V:` tail words instead of letting them fail later as body note/rest parsing errors

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
