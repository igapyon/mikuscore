# ABC Standard Coverage

## Purpose

This document tracks `mikuscore` coverage against the ABC standard at a chapter-by-chapter level.

Unlike `TODO.md`, this file is intended to be the coverage baseline and completion reference.
Implementation TODO items should be derived from this file, not the other way around.

## Version Policy

- Latest formal ABC standard at the time of writing: `2.2`
- Current `mikuscore` audit baseline: `2.1`
- Reason:
  - most currently implemented/imported behavior and earlier audit work were organized against the widely used `2.1` chapter structure
  - `2.2` additions should be tracked explicitly as deltas, not mixed invisibly into the `2.1` baseline table

Practical rule:

- use the `2.1` table below as the main completion baseline
- track `2.2` additions separately in a small delta section
- do not mark a chapter fully `supported` if support depends only on `mikuscore` extensions or de facto compatibility behavior outside the standard surface

## Status Labels

- `supported`
  - implemented in normal import/export flows with no currently known major gap for the scoped item
- `partial`
  - some meaningful support exists, but coverage, semantics, roundtrip, or edge-case behavior is still incomplete
- `unsupported`
  - not currently supported in the normal ABC import/export path
- `ext-only`
  - behavior exists only through `mikuscore` extension metadata or `mikuscore`-specific decorations, not through standard ABC surface syntax

## Work-Type Labels

- `impl`
  - mainly an implementation / test / roundtrip task
- `policy`
  - mainly a scope or semantics decision that should be written down before implementation
- `mixed`
  - requires both a policy decision and follow-up implementation

## Completion Rule by Work Type

- `impl`
  - complete when implementation, regression tests, and coverage-table status update are all done
- `policy`
  - complete when a written decision is recorded here and linked specs / TODO wording are updated accordingly
- `mixed`
  - complete when both the policy decision and the implementation/test follow-up are done

## Reading Rule

- This is a conservative baseline.
- When there is doubt, the status should be `partial`, not `supported`.
- Coverage is judged from practical `mikuscore` import/export behavior, not from parser token acceptance alone.
- For decoration aliases and compatibility forms, see `docs/spec/ABC_IO.md`.

## Scope

- Baseline reference: ABC 2.1 standard
- Delta reference: ABC 2.2 additions relevant to score interchange
- Focus: chapters that materially affect score interchange in `mikuscore`
- Out of scope for now:
  - stylesheet directives and formatting-only details that `mikuscore` does not aim to preserve
  - prose-only appendices and tutorial material

## Operating Procedure

Use this document in the following order:

1. find the affected ABC chapter or delta item
2. check whether a decomposed sub-area table already exists
3. if not, decompose the chapter before creating implementation TODOs
4. choose the intended result mode:
   - `support now`
   - `support bounded subset`
   - `defer intentionally`
   - `out of practical scope`
5. if the work is backlog-sized, assign or reuse an `ABC-COV-*` item
6. only then create or update `TODO.md`
7. after implementation or policy closure, update this document first, then `TODO.md`, then narrower specs such as `docs/spec/ABC_IO.md`

## Exit Condition For This Document

`ABC_STANDARD_COVERAGE.md` should be considered "sufficiently prepared" when:

- every major `partial` / `unsupported` ABC area that matters to score interchange has either:
  - a decomposed sub-area table, or
  - an explicit statement that it is intentionally out of practical scope
- every remaining major unresolved area has an `ABC-COV-*` backlog item
- each `ABC-COV-*` item has:
  - work type
  - priority
  - done condition
  - initial stance
- `TODO.md` has a corresponding execution list derived from those `ABC-COV-*` items

At that point, further progress should usually happen in `TODO.md`, `docs/spec/ABC_IO.md`, and implementation/tests rather than by endlessly refining this file.

## Coverage Table

| ABC 2.1 area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| 3.1 Information fields | partial | Core fields such as `X:`, `T:`, `C:`, `M:`, `L:`, `K:`, `Q:`, and `V:` are handled, but not the full field family or all field semantics. |
| 3.2 Use of fields within the tune body | partial | Inline body fields `[K:...]`, `[M:...]`, `[L:...]`, `[Q:...]`, `[V:...]` are supported, and a narrow compatibility subset also accepts standalone body-side `K:` / `M:` / `L:` / `Q:` lines or tokens. Full field-level parity is not yet claimed. |
| 3.3 Field continuation | unsupported | No complete coverage claim yet. |
| 4.1 Pitch | supported | Ordinary pitch spelling and octave notation are core supported behavior. |
| 4.2 Accidentals | supported | Standard accidental forms are supported, with measure/key-context export rules implemented. |
| 4.3 Note lengths | supported | Standard ABC length tokens are part of the normal path. |
| 4.4 Broken rhythm | supported | `>` / `<` handling is implemented. |
| 4.5 Rests | supported | Standard rests are supported. |
| 4.6 Clefs and transposition | partial | Common clefs and some `V:`-level transpose handling exist, but full standard coverage and exact parity are not yet claimed. |
| 4.7 Beams | partial | Import recognizes whitespace as beam-break intent, but export/render behavior still reconstructs beams mainly from durations. |
| 4.8 Repeat/bar symbols | partial | Standard repeat/barline handling is substantially improved, but full coverage is not yet declared. |
| 4.9 First and second repeats | partial | Common alternate-ending forms are supported, but broader variant-ending coverage still needs a stricter audit. |
| 4.10 Variant endings | partial | Standard surface forms now work for common cases, but full closure is not yet claimed. |
| 4.11 Ties and slurs | partial | Ties are solid in common paths; slur reconstruction and exact span semantics still need care. |
| 4.12 Grace notes | supported | Standard grace groups and slash grace are supported. |
| 4.13 Tuplets | partial | Core tuplet parsing/export works, but full standard nuance still needs audit closure. |
| 4.14 Decorations | partial | Large portions of the standard set are now covered, but the full decoration inventory is not yet complete. |
| 4.15 Symbol lines | unsupported | No current standard `s:` symbol-line support claim. |
| 4.16 Redefinable symbols | partial | `U:` single-character decoration aliases import through normal decoration parsing, but full support is not yet claimed. |
| 4.17 Chords and unisons | supported | Standard chord-note group syntax is supported in ordinary paths. |
| 4.18 Chord symbols | partial | Common quoted chord symbols are mapped, but broader harmony quality coverage is still incomplete. |
| 4.19 Annotations | partial | Quoted non-harmonic text is partially mapped, but broader annotation behavior is not yet closed. |
| 4.20 Order of abc constructs | partial | Many common orders are accepted, but there is no complete conformance claim yet. |
| 5.1 Alignment | partial | Lyrics alignment support exists, but not all standard alignment nuance is yet audited. |
| 5.2 Verses | partial | `w:` underlay works in common cases, but full multi-verse coverage is not yet claimed. |
| 5.3 Numbering | unsupported | No complete support claim yet. |
| 6.1 Typesetting | unsupported | Formatting/typesetting directives are not a current parity target. |
| 6.2 Playback | unsupported | ABC playback semantics are not a standard-coverage target for `mikuscore`. |
| 7.1 Voice properties | partial | `V:` handling exists for common voice metadata, but standard voice-property breadth is not fully covered. |
| 7.2 Breaking lines | unsupported | Line-breaking semantics are not a current preserved interchange feature. |
| 7.3 Inline fields | partial | Core inline field support exists, but broader field coverage remains partial. |
| 7.4 Voice overlay | partial | `&` imports into synthetic overlay voices, but this is not yet faithful one-part multi-voice preservation. |

## Decomposed Coverage

This section breaks selected `partial` chapters into implementation-sized coverage units.
Start here when converting coverage findings into concrete TODO items.

### 3. Information Fields

#### 3.1 Information fields

| Field group | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Core identification / title / attribution: `X:`, `T:`, `C:` | supported | Supported in ordinary import/export flows. |
| Core musical defaults: `M:`, `L:`, `K:`, `Q:` | supported | Supported in ordinary import/export flows, including inline-core variants where implemented. |
| Voice field: `V:` | partial | Common voice metadata is supported, but full property breadth is not yet covered. |
| Other standard fields outside the current core subset | unsupported | They may be lexically accepted as inert header text, but no supported semantic import/export claim is made for them. |

### 3.1 Information-Field Policy Notes

Current bounded subset for `mikuscore` header-field support:

- supported core subset
  - `X:`, `T:`, `C:`
  - `M:`, `L:`, `K:`, `Q:`
  - `V:` remains covered separately under the voice-property policy
- unsupported non-core field family
  - standard information fields outside the current core subset are not part of the supported ABC interchange target
  - they may be lexically tolerated in the header scan, but `mikuscore` does not currently claim semantic import/export support for them
- export policy
  - standard ABC export emits only the current core subset and `V:` sections needed by the current bounded target

Practical result mode for `ABC-COV-001`:

- `support bounded subset`
- keep the supported header-field family explicit
- do not treat lexically accepted but semantically inert fields as supported ABC coverage

#### 3.2 Use of fields within the tune body

| Inline field group | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Core inline fields: `[K:...]`, `[M:...]`, `[L:...]`, `[Q:...]`, `[V:...]` | supported | These are supported in the current standard path. |
| Standalone body-side core field lines/tokens: `K:...`, `M:...`, `L:...`, `Q:...` | partial | Accepted as bounded compatibility shorthand for the corresponding inline fields after body parsing has begun. |
| Broader inline-field family beyond the current core subset | unsupported | Unsupported inline fields are skipped with warnings rather than treated as semantically supported. |

### 3.2 / 7.3 Inline-Field Policy Notes

Current bounded subset for `mikuscore` inline-field support:

- supported
  - `[K:...]`
  - `[M:...]`
  - `[L:...]`
  - `[Q:...]`
  - `[V:...]`
- compatibility-only
  - standalone body-side `K:...`
  - standalone body-side `M:...`
  - standalone body-side `L:...`
  - standalone body-side `Q:...`
  - these may appear as lines or tokens and are treated as shorthand for the corresponding inline fields only after body parsing has begun
- unsupported
  - broader inline-field family beyond that core subset
  - other standalone body-side single-letter fields/tokens outside the bounded compatibility subset
- handling rule
  - unsupported inline fields are skipped with warnings
  - unsupported standalone body-side single-letter fields/tokens are also skipped with warnings
  - lexical recognition of an inline field does not count as semantic support

Practical result mode for `ABC-COV-002`:

- `support bounded subset`
- keep the inline-field subset explicit at `[K/M/L/Q/V]`
- require deliberate policy work before expanding beyond that subset

#### 3.3 Field continuation

| Area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Continued information-field lines | unsupported | No current support claim or dedicated reconstruction policy. |

### 3.3 Field-Continuation Policy Notes

Current policy for `mikuscore`:

- unsupported in the present bounded ABC target
  - continued information-field lines are not part of the supported interchange subset
  - lexical tolerance of adjacent header text does not count as continuation support
  - unsupported continued header-field text should be skipped with warnings rather than later misparsed as body note/rest text
- bounded compatibility safeguard
  - a trailing body-line continuation marker `\` is stripped before body tokenization so it does not fall through into note/rest parsing
  - this is not a full support claim for continued information-field semantics
- intentionally deferred
  - field continuation will not be treated as planned work unless practical input evidence makes it necessary
- rationale
  - current core field subset works without continuation support
  - continuation support looks low-value relative to other practical ABC interoperability gaps

Directive-handling note:

- `%%score` is the current supported working directive subset
- broader `%%...` directive families remain unsupported
- unsupported directives should be skipped with warnings rather than silently treated as supported semantics

Body-token safety note:

- stray body-side continuation markers `\` should be skipped with warnings rather than reaching note/rest parsing as unknown tokens
- unsupported body-side word-token leftovers should be skipped with warnings when they are clearly outside note/rest syntax, including bounded lower-case word leftovers
- stray body-side number tokens should be skipped with warnings when they are clearly outside attached note-length syntax
- notes, chord-notes, or grace-notes with unsupported octave range should be skipped with warnings rather than failing the whole tune parse
- notes, chords, or grace-notes with invalid zero-length results should be skipped with warnings rather than failing the whole tune parse
- malformed accidental leftovers should be skipped with warnings when they do not lead into a valid note/rest token
- bounded stray body punctuation leftovers such as `;`, `` ` ``, `?`, `@`, `#`, `$`, and `*` should be skipped with warnings rather than failing note/rest parsing

Practical result mode for `ABC-COV-003`:

- `defer intentionally`
- keep field continuation explicitly outside the current supported subset unless real-world demand changes that priority

### 4.6 Clefs and Transposition

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common clefs in `V:` metadata (`treble`, `bass`, `alto`, `tenor`, `c3`, `c4`) | supported | Common working set is supported, including compatibility shorthand on import. |
| Broader standard clef forms and exact parity | partial | Full standard breadth and export parity are not yet closed. |
| Voice-level transpose handling | partial | Some `V:`-level transpose behavior exists, but full standard coverage is not yet claimed. |

### 4.6 Clef / Transposition Policy Notes

Current policy for `mikuscore`:

- supported in the bounded subset
  - common standard `V:` clef values: `treble`, `bass`, `alto`, `tenor`, `c3`, `c4`
  - compatibility shorthand import such as bare `V:2 bass`
  - current clef export for the common recognized subset
- partial / extension-assisted
  - standard `V:` transpose is import-partial in the current path
  - transpose-preserving roundtrip currently relies on `%@mks transpose ...`
- intentionally not claimed
  - broader standard clef breadth or exact parity beyond the current recognized subset
  - full standard `V:` transpose parity on export
- rationale
  - the common working clef subset already covers practical interchange cases seen in current inputs
  - explicit boundary-setting is clearer than implying broader clef/transpose parity than the implementation actually provides

Practical result mode for `ABC-COV-004`:

- `support bounded subset`
- keep the current common clef subset and extension-assisted transpose story explicit
- do not claim broader clef/transpose parity beyond the current recognized subset

### 4.7 Beams

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Duration-based beam reconstruction | supported | Normal export reconstructs beams from note values. |
| Whitespace as explicit beam-separation intent | partial | Import recognizes it as a beam-break hint within a voice/measure beam run, but export does not preserve original ABC spacing textually. |
| Exact source whitespace preservation for beam grouping | unsupported | Original ABC inter-note spacing is not currently treated as canonical roundtrip data. |

### 4.7 Beam Policy Notes

Current bounded subset for `mikuscore`:

- import side
  - whitespace between beamable notes is treated as an explicit beam-break hint
  - this hint applies within the current voice and measure
  - beat boundaries still split implicit beam runs even without whitespace
- export side
  - canonical export does not currently encode beam grouping through preserved ABC spacing patterns
  - exported ABC uses ordinary token spacing and leaves beam reconstruction largely to downstream ABC consumers
- roundtrip claim
  - `mikuscore` currently preserves beam-break intent on ABC import into MusicXML
  - `mikuscore` does not currently claim export-side preservation of original ABC whitespace used only as beam layout intent

Practical result mode for `ABC-COV-005`:

- `support bounded subset`
- preserve import-side beam-break interpretation in the current MusicXML/ABC interchange level
- do not treat exact original inter-note spacing as canonical interchange data unless a future extension carrier is introduced

### 4.8-4.10 Repeat Structure

#### 4.8 Repeat / bar symbols

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common repeat barlines | supported | Standard repeat/barline handling works in common cases. |
| Repeat counts beyond ordinary `:|` behavior | partial | Backward repeat is supported in the standard surface; explicit repeat counts beyond the ordinary case currently rely on `%@mks measure ... times=...` extension metadata. |
| Broader repeat/barline variants and edge reconstruction | partial | Full closure is not yet claimed. |

#### 4.9 First and second repeats

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common first/second ending syntax (`[1`, `[2`, `|1`, `:|2`) | supported | Common surface forms are supported. |
| Broader alternate-ending coverage and edge forms | partial | Full closure is not yet claimed. |

#### 4.10 Variant endings

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common variant-ending surface syntax | supported | Common standard syntax works in the current path. |
| Ending stop type `discontinue` | partial | Ordinary start/stop endings are supported in the standard surface; `discontinue` currently relies on `%@mks measure ... ending-stop=... ending-type=discontinue` extension metadata. |
| Broader variant-ending semantics | partial | Full semantics and edge-case coverage remain to be audited. |

### 4.8-4.10 Repeat / Ending Policy Notes

Current bounded subset for `mikuscore`:

- standard ABC surface support
  - common repeat barlines: `|:` and `:|`
  - common alternate-ending starts/stops: `[1`, `[2`, `|1`, `:|2`
- extension-assisted repeat / ending preservation
  - backward repeat counts beyond the ordinary case use `%@mks measure ... times=...`
  - ending stop type `discontinue` uses `%@mks measure ... ending-stop=... ending-type=discontinue`
- unsupported or not yet claimed
  - broader repeat/barline variants beyond the current common subset
  - broader variant-ending semantics beyond ordinary start/stop behavior

Practical result mode for `ABC-COV-006`:

- `support bounded subset`
- prefer standard ABC surface syntax for common repeat / ending cases
- use `%@mks measure` only for edge semantics that the current standard export path does not encode directly

### 4.11 Ties and Slurs

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Tie syntax and common reconstruction | supported | Common tie handling is solid, including whole-chord tie paths. |
| Slur syntax acceptance | supported | Common unnumbered slur start/stop syntax is accepted. |
| Exact slur span reconstruction and edge semantics | partial | Cross-format span behavior still needs care; numbered/nested slur identity and broader edge semantics are not fully preserved. |

### 4.11 Slur Policy Notes

Current bounded subset for `mikuscore` slur handling:

- supported
  - ordinary ABC `(` / `)` slur markers in common note-to-note cases
  - MusicXML note-level slur start/stop presence in simple cases
- current interpretation limits
  - slur handling is currently presence-based, not identity-based
  - `mikuscore` does not currently claim faithful preservation of slur numbering, nested slur identity, or other exact span-matching semantics
  - ABC slur stop without a preceding non-rest note is treated as unsupported and currently yields a warning
- tie distinction
  - ties remain stronger than slurs and are tracked separately; chord ties are preserved more faithfully than generic slur span identity

Practical result mode for `ABC-COV-007`:

- `support bounded subset`
- preserve common start/stop slur presence
- do not claim numbered/nested slur identity preservation until a stronger span model is implemented

### 4.13 Tuplets

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Core tuplet syntax and common roundtrip | supported | Core parse/export works in the current path. |
| Full standard ratio nuance and edge semantics | partial | Full audit closure is not yet complete. |

### 4.13 Tuplet Policy Notes

Current policy for `mikuscore`:

- supported in the bounded subset
  - common ABC tuplet syntax `(n[:q][:r])` in ordinary note sequences
  - common MusicXML roundtrip through `<time-modification>` and note-level `<tuplet>` start/stop
  - common explicit tuplet export such as `(3:2:3` in the current MusicXML -> ABC path
- intentionally not claimed
  - full standard nuance for broader ratio/edge semantics beyond the currently tested subset
  - broader cross-measure or more complex tuplet-span semantics
- rationale
  - core tuplet interchange is already useful and covered by focused regression tests
  - the remaining work is edge clarification, not basic support

Practical result mode for `ABC-COV-008`:

- `support bounded subset`
- keep common tuplet syntax and current MusicXML roundtrip behavior supported and tested
- do not claim broader ratio/span semantics beyond the current bounded subset

### 4.14 Decorations (ABC 2.1)

| Decoration group | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Trill family: `!trill!`, `!trill(!`, `!trill)!` | supported | Standard trill and extended trill start/stop now import/export and roundtrip. |
| Turn family: `!turn!`, `!turnx!`, `!invertedturn!`, `!invertedturnx!` | supported | Standard turn and slashed-turn variants now import/export and roundtrip. |
| Mordent family: `!lowermordent!`, `!uppermordent!`, `!mordent!`, `!pralltriller!` | partial | Import aliases are accepted, but export naming policy and exact semantic distinction still need audit closure. |
| `!roll!` / `!arpeggio!` | supported | Standard import acceptance exists, canonical export now prefers `!arpeggio!` for MusicXML `arpeggiate`, and `!roll!` remains a compatibility alias unless a distinct roundtrip carrier is introduced. |
| Accent family: `!>!`, `!accent!`, `!emphasis!` | supported | Import aliases are accepted and canonical export is stable. |
| Fermata family: `!fermata!`, `!invertedfermata!` | supported | Standard forms are supported in common roundtrip paths. |
| `!tenuto!` | supported | Supported in common import/export paths. |
| Fingering shorthand: `!0!`-`!5!` | supported | Standard fingering shorthand now imports/exports and roundtrips. |
| `!+!` / `!plus!` | partial | Import aliases are accepted, but current standard-path policy is the narrow `stopped` technical interpretation with canonical export `!stopped!`. |
| `!snap!` | supported | Supported in common import/export paths. |
| `!slide!` | partial | Standard slide-start form is supported; explicit stop remains outside the standard surface in current policy and uses `mikuscore` extension `!slide-stop!`. |
| `!wedge!` | supported | Supported through the staccatissimo path. |
| `!upbow!` / `!downbow!` | supported | Standard forms and common aliases are supported. |
| `!open!` | supported | Supported in common import/export paths. |
| `!thumb!` | supported | Supported in common import/export paths. |
| `!breath!` | supported | Supported in common import/export paths. |
| Dynamics: `!pppp!`..`!ffff!`, `!sfz!`, etc. | supported | Standard dynamic marks in the currently enumerated subset import/export and roundtrip. |
| Wedges: `!crescendo(!`, `!crescendo)!`, `!diminuendo(!`, `!diminuendo)!`, symbolic aliases | supported | Standard wedge start/stop and symbolic aliases are supported. |
| Repeat-jump marks: `!segno!`, `!coda!`, `!D.S.!`, `!D.C.!`, `!dacoda!`, `!dacapo!`, `!fine!` | supported | Standard/de facto jump tokens in the current subset import/export and roundtrip. |
| Phrase marks: `!shortphrase!`, `!mediumphrase!`, `!longphrase!` | supported | Standard phrase-mark tokens now import/export and roundtrip via MusicXML `other-articulation` preservation. |

### 4.14 Standard Shorthand Decoration Symbols

| Symbol | Status | Current interpretation for `mikuscore` |
|---|---|---|
| `~` | supported | Imports as `roll`. |
| `H` | supported | Imports as `fermata`. |
| `L` | supported | Imports as `accent`. |
| `M` | supported | Imports as lowermordent / `mordent` path. |
| `O` | supported | Imports as `coda`. |
| `P` | supported | Imports as uppermordent / `pralltriller` path. |
| `S` | supported | Imports as `segno`. |
| `T` | supported | Imports as `trill`. |
| `u` | supported | Imports as `up-bow`. |
| `v` | supported | Imports as `down-bow`. |

### 4.14 Canonical Policy Notes

These notes are the current canonical policy for standard-decoration handling.

- `!arpeggio!` versus `!roll!`
  - keep broad import compatibility for both names
  - do not claim they are semantically identical
  - canonical export for the current MusicXML `<arpeggiate/>` carrier should prefer `!arpeggio!`
  - `!roll!` remains accepted on import as compatibility behavior unless a distinct roundtrip carrier is added
- `!+!` / `!plus!`
  - accept them on import as aliases into the current `stopped` technical path
  - canonical export remains `!stopped!`
  - do not currently claim generalized cross-instrument semantics beyond that narrow interpretation
- Mordent-family export naming
  - keep broad import alias acceptance
  - canonical export for lower mordent remains `!mordent!`
  - canonical export for upper/inverted mordent remains `!pralltriller!`
- `!slide!`
  - standard support is start-side only in the current policy
  - canonical start-side export remains `!slide!`
  - explicit stop remains a `mikuscore` extension via `!slide-stop!`

### 4.15 Symbol Lines

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| `s:` symbol lines | unsupported | No current support claim. |

### 4.15 Symbol-Line Policy Notes

Current policy for `mikuscore`:

- out of practical scope for the present bounded ABC target
  - standard `s:` symbol lines are not part of the supported interchange subset
  - there is no current import/export or roundtrip support claim for them
- intentionally frozen out of scope unless real input demand changes priority
- rationale
  - symbol lines currently look low-value compared with other musical-structure interoperability work
  - leaving them unsupported is clearer than implying partial support without a defined preservation model

Practical result mode for `ABC-COV-010`:

- `out of practical scope`
- keep `s:` explicitly outside the current bounded support target unless practical demand changes

### 4.16 Redefinable Symbols

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| `U:` single-character import aliases | supported | Current import path supports user-defined decoration aliases. |
| Broader `U:` parity, export, and exact standard semantics | partial | Current support is import-first; export parity and broader semantics are not claimed. |

### 4.16 `U:` Policy Notes

Current bounded subset for `mikuscore`:

- supported
  - import of `U:` single-character decoration aliases
  - both `!decor!` and `+decor+` style right-hand side wrappers in the current import path
- intentionally not claimed
  - export of `U:` declarations as a standard ABC roundtrip feature
  - exact parity for broader redefinable-symbol semantics beyond the current single-character decoration-alias import behavior
- malformed input handling
  - malformed `U:` declarations are ignored rather than treated as fatal parse errors

Practical result mode for `ABC-COV-011`:

- `support bounded subset`
- keep `U:` as import-first functionality
- do not currently require `U:` export parity for ABC completion claims

### 4.18 Chord Symbols

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common harmonic quoted symbols | supported | The current bounded inventory roundtrips through MusicXML `harmony`. |
| Broader quality inventory and edge spelling | partial | Coverage remains incomplete; unsupported chord-like quoted text falls back to annotation/words instead of being forced into `harmony`. |
| Full standard chord-symbol breadth | unsupported | No full support claim yet. |

### 4.18 Chord-Symbol Policy Notes

Current bounded subset for `mikuscore` quoted chord-symbol support:

- supported root spelling
  - `A`-`G`
  - optional `#` / `b`
  - optional slash bass with the same root spelling subset
- supported suffix inventory
  - major: empty suffix
  - minor: `m`, `min`
  - sixths: `6`, `m6`, `min6`
  - sevenths / extensions: `7`, `9`, `11`, `13`, `maj7`, `maj9`, `m7`, `min7`, `m9`, `min9`
  - suspended / altered common subset: `7sus4`, `sus4`, `sus2`
  - diminished / augmented subset: `dim`, `dim7`, `aug`, `+`, `m7b5`, `min7b5`, `ø`
- export policy
  - recognized MusicXML harmony kinds are exported back to canonical ABC quoted chord symbols in the current subset
  - unsupported harmony kinds are not claimed as standard quoted-chord coverage
- fallback policy
  - quoted text outside the supported chord-symbol inventory is treated as annotation/words rather than forced into MusicXML `harmony`

Practical result mode for `ABC-COV-012`:

- `support bounded subset`
- keep the recognized quoted-chord inventory explicit and testable
- treat unsupported chord-like quoted text as annotation fallback unless and until the supported inventory is deliberately expanded

### 4.19 Annotations

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common quoted non-harmonic text | supported | Common quoted non-harmonic text is mapped as direction words / annotations in the current bounded subset. |
| Broader annotation placement and behavior | unsupported | No full standard support claim yet. |

### 4.19 Annotation Policy Notes

Current bounded subset for `mikuscore` annotation handling:

- supported
  - quoted non-harmonic text attached to notes is imported as MusicXML direction words
  - MusicXML direction words are exported as quoted ABC annotations in common cases
  - quoted text that does not fit the supported chord-symbol inventory falls back to annotation/words
- intentionally not claimed
  - broader annotation placement semantics beyond the current note-attached quoted-text / direction-words path
  - full parity for all standard annotation positioning/behavior nuances

Practical result mode for `ABC-COV-013`:

- `support bounded subset`
- keep quoted non-harmonic text support explicit through the current direction-words path
- do not claim broader annotation semantics beyond that bounded subset

### 4.20 Order of abc constructs

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common construct orderings seen in practical ABC | partial | Many common orders work, but there is no complete conformance claim. |
| Full order-of-constructs conformance | unsupported | Not yet audited to closure. |

### 4.20 Order-of-Constructs Policy Notes

Current policy for `mikuscore`:

- supported in the bounded practical sense
  - accept the common construct orderings already handled by the current parser
  - prefer practical acceptance of structurally recognizable real-world ABC over strict rejection based only on a narrower reading of construct-order rules
  - keep the failure boundary at cases that remain structurally ambiguous or that break note/directive interpretation
- intentionally not claimed
  - full formal conformance to every standard order-of-constructs nuance
  - exact acceptance parity with every ABC implementation for unusual but technically legal construct orderings
- rationale
  - the current ABC target is practical interchange, not a fully validated reference implementation of the standard grammar
  - the important boundary is to avoid misparsing or silently reclassifying structurally unclear input as supported music content

Practical result mode for `ABC-COV-014`:

- `support bounded subset`
- keep broad practical acceptance where the current parser behavior is stable and musically interpretable
- do not claim complete formal order-of-constructs conformance beyond that bounded subset

### 5. Lyrics

#### 5.1 Alignment

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common lyric alignment for `w:` underlay | partial | Works in common cases. |
| Full alignment nuance across rests, spacers, grace, and complex spacing | unsupported | Not yet audited to closure. |

#### 5.2 Verses

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Single-verse underlay | supported | Common `w:` import path exists. |
| Multi-verse behavior and edge semantics | partial | Not yet fully audited. |

#### 5.3 Numbering

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Verse numbering semantics | unsupported | No current support claim. |

### 5.1-5.3 Lyrics Policy Notes

Current policy for `mikuscore`:

- supported in the bounded subset
  - common `w:` underlay import/export
  - common single-verse lyric alignment in ordinary note sequences
  - ordinary hyphenated lyric token handling in the current `w:` path
- intentionally not claimed
  - full lyric alignment nuance across rests, spacers, grace, and more complex spacing rules
  - full multi-verse behavior parity
  - verse numbering semantics
- rationale
  - current lyric support is useful for common interchange cases and is already exercised by focused tests
  - broader lyric semantics should not be implied until alignment and multi-verse behavior are audited more deeply

Practical result mode for `ABC-COV-015`:

- `support bounded subset`
- keep common `w:` lyric behavior supported and tested
- do not claim broader lyric alignment, multi-verse, or numbering semantics beyond that subset

### 7. Multiple Voices

#### 7.1 Voice properties

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Voice identity / lane selection (`V:id`) | supported | Standard voice selection and per-voice body routing are supported in normal import/export flow. |
| Voice name (`name=...`) | supported | Import/export of `name=...` is supported in the current standard path. |
| Common clef metadata (`clef=treble`, `clef=bass`, `clef=alto`, `clef=tenor`, `clef=c3`, `clef=c4`) | supported | Common working clef subset is supported on import/export; bare clef shorthand is accepted as compatibility behavior. |
| Voice transpose property (`transpose=...`) | partial | Import path accepts a bounded chromatic transpose value, but standard `V:` transpose is not yet emitted on export; export currently relies on `%@mks transpose ...` extension metadata for roundtrip restoration. |
| Extension-assisted voice transpose roundtrip (`%@mks transpose ...`) | ext-only | Voice transpose can be preserved on export/import roundtrip through `mikuscore` extension metadata even where the standard `V:` property is not emitted. |
| Broader standard voice properties (`staves`, `brace`, `bracket`, `merge`, `middle`, `gchords`, etc.) | unsupported | No current support claim in the standard ABC path; grouped multi-staff import is currently driven by bounded `%%score (...)` handling rather than these `V:` properties, and unsupported properties should still be skipped with warnings. |
| Full standard voice-property breadth | unsupported | No complete support claim yet. |

#### 7.2 Breaking lines

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Line-breaking semantics | unsupported | Not a current preserved interchange target. |

#### 7.3 Inline fields

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Core inline-field subset | supported | The current core subset is supported. |
| Broader inline-field breadth | unsupported | No complete support claim yet. |

#### 7.4 Voice overlay

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Import acceptance of `&` overlay syntax | supported | Overlay syntax is accepted on import. |
| Faithful preservation as one part with synchronized voices | unsupported | Current import expands overlays into synthetic parts instead. |

### 7.4 Overlay Policy Notes

Current policy for `mikuscore`:

- supported
  - accept ABC overlay syntax `&` on import
  - preserve the overlaid musical material by expanding it into synthetic overlay voices / parts
- intentionally not claimed
  - faithful preservation as one MusicXML part with synchronized internal voices
  - exact overlay identity roundtrip back to standard ABC `&` surface syntax
- rationale
  - current synthetic-part expansion preserves musical content well enough for practical import
  - faithful same-part overlay preservation would require a stronger internal/roundtrip model than the current bounded ABC support target

Practical result mode for `ABC-COV-017`:

- `defer intentionally`
- keep `&` import acceptance as supported compatibility behavior
- do not currently require faithful same-part overlay preservation for ABC completion claims

## ABC 2.2 Delta

This section tracks standard items that are better treated as post-2.1 additions rather than silently folded into the baseline table.

| ABC 2.2 delta item | Status | Current interpretation for `mikuscore` |
|---|---|---|
| `!editorial!` decoration | supported | Supported as a bounded accidental-decoration modifier on the following explicit accidental, mapped to MusicXML `accidental@editorial="yes"`. |
| `!courtesy!` decoration | supported | Supported as a bounded accidental-decoration modifier on the following explicit accidental, mapped to MusicXML `accidental@cautionary="yes"`. |

### ABC 2.2 Delta Policy Notes

Current policy for `mikuscore`:

- `!editorial!`
  - now included in the bounded supported roadmap
  - interpreted as a modifier for the following explicit accidental
- `!courtesy!`
  - now included in the bounded supported roadmap
  - interpreted as a modifier for the following explicit accidental

Rationale:

- current ABC completion work is organized around the `2.1` baseline plus explicit delta triage
- both decorations fit naturally into the existing accidental import/export path
- both are standard 2.2 decorations with practical musical value, and are narrower than broader deferred engraving/layout areas
- the bounded support target is accidental-level editorial/cautionary flags, not wider engraving semantics

Practical result mode for `ABC-COV-018`:

- `support bounded subset`
- keep broader 2.2 delta expansion explicit, but treat these two accidental decorations as in-scope
- do not include them in current ABC completion claims

## Derived Actionable Backlog

This section is the direct bridge from coverage to implementation TODOs.
If an item here is completed, update the detailed coverage tables first, then update `TODO.md`.

| Item | Source area | Work type | Priority | Default direction | Done when | Target outcome |
|---|---|---|---|---|---|---|
| `ABC-COV-001` | `3.1 Information fields` | `policy` | `P2` | bound scope first | non-core field policy is written here and reflected in linked specs | Decide and document which non-core standard fields are intentionally unsupported versus planned. |
| `ABC-COV-002` | `3.2 / 7.3 Inline fields` | `policy` | `P2` | bound scope first | supported inline subset is explicitly bounded in spec text | Decide whether the supported inline-field subset stops at `[K/M/L/Q/V]` or should expand. |
| `ABC-COV-003` | `3.3 Field continuation` | `policy` | `P3` | likely defer or freeze | continuation is either explicitly frozen as unsupported or promoted to planned work | Either implement continuation support or explicitly freeze it as unsupported in the practical scope. |
| `ABC-COV-004` | `4.6 Clefs and transposition` | `mixed` | `P1` | expand common working subset conservatively | supported standard clef/transpose set is enumerated and covered by tests | Close the remaining standard clef/transpose policy beyond the current common subset. |
| `ABC-COV-005` | `4.7 Beams` | `mixed` | `P1` | decide preservation target before code | whitespace-beam preservation target is decided and tested to that level | Decide how far ABC whitespace-as-beam-separation must be preserved on export. |
| `ABC-COV-006` | `4.8-4.10 Repeat structure` | `mixed` | `P1` | finish edge-case audit | remaining repeat/ending edge forms are either supported with tests or explicitly marked unsupported | Audit remaining repeat/ending edge variants and mark what is still unsupported. |
| `ABC-COV-007` | `4.11 Ties and slurs` | `mixed` | `P1` | keep ties strong, define slur limits | slur-span limits are written down and tested, or stronger preservation is implemented | Close the slur-span reconstruction policy or keep it explicitly partial with defined limits. |
| `ABC-COV-008` | `4.13 Tuplets` | `mixed` | `P2` | close edge semantics incrementally | remaining tuplet edge semantics are either tested or explicitly excluded | Audit remaining ratio/edge semantics and mark what is still unsupported. |
| `ABC-COV-009` | `4.14 Decorations` | `mixed` | `P1` | finish pending policy notes | each pending decoration-policy item is resolved in spec text, with implementation/tests if needed | Resolve pending policy items: `!arpeggio!` / `!roll!`, `!+!` / `!plus!`, mordent export naming, `!slide!` stop policy. |
| `ABC-COV-010` | `4.15 Symbol lines` | `policy` | `P3` | likely out of scope unless demanded by real data | `s:` is explicitly marked in-scope or frozen out-of-scope | Decide whether `s:` symbol lines are in scope or intentionally out of scope. |
| `ABC-COV-011` | `4.16 Redefinable symbols` | `policy` | `P2` | likely keep import-first | `U:` support boundary is explicitly written down | Decide whether `U:` remains import-only or needs broader parity/export support. |
| `ABC-COV-012` | `4.18 Chord symbols` | `mixed` | `P1` | expand common inventory, bound the rest | supported chord-symbol inventory is enumerated enough to test and maintain | Expand or explicitly bound the supported chord-symbol inventory. |
| `ABC-COV-013` | `4.19 Annotations` | `policy` | `P2` | define supported subset explicitly | supported annotation subset and exclusions are written down | Define the supported annotation behavior and explicit exclusions. |
| `ABC-COV-014` | `4.20 Order of constructs` | `policy` | `P3` | prefer practical acceptance over formal completeness | acceptance philosophy and any explicit exclusions are written down | Decide whether broad practical acceptance is enough or whether stricter conformance is required. |
| `ABC-COV-015` | `5.1-5.3 Lyrics` | `mixed` | `P2` | strengthen single/multi-verse clarity | lyric scope is bounded and tested for the chosen supported subset | Audit lyrics alignment, multi-verse behavior, and numbering scope. |
| `ABC-COV-016` | `7.1 Voice properties` | `mixed` | `P1` | enumerate supported standard properties explicitly | supported/unsupported voice-property list is explicit and testable | Enumerate which standard voice properties are supported, unsupported, or extension-only. |
| `ABC-COV-017` | `7.4 Voice overlay` | `policy` | `P1` | decide whether current synthetic-part import is acceptable | overlay preservation target is explicitly accepted or rejected | Decide whether faithful same-part overlay preservation is required. |
| `ABC-COV-018` | `ABC 2.2 delta` | `policy` | `P2` | decide roadmap versus explicit defer | 2.2 delta items are either put on roadmap or marked intentionally deferred | Decide whether `!editorial!` and `!courtesy!` are in the supported roadmap or intentionally deferred. |

## Result Modes

When closing a backlog item above, prefer one of these explicit outcomes:

- `support now`
  - implement and test it
- `support bounded subset`
  - document the exact supported subset and explicit exclusions
- `defer intentionally`
  - record that it is not in the current supported roadmap
- `out of practical scope`
  - record that `mikuscore` does not currently target this standard area

## Initial Stance by Backlog Item

This is a non-binding starting recommendation for turning the backlog into TODOs.

| Item | Recommended result mode | Rationale |
|---|---|---|
| `ABC-COV-001` | `support bounded subset` | Closed for the current bounded subset: the supported core field family is explicit, and non-core information fields are now explicitly treated as semantically unsupported even if lexically tolerated. |
| `ABC-COV-002` | `support bounded subset` | Closed for the current bounded subset: supported inline fields are explicitly limited to `[K/M/L/Q/V]`, and broader inline fields are now explicitly treated as warning-based skips rather than supported semantics. |
| `ABC-COV-003` | `defer intentionally` | Field continuation looks low-value unless real input data demands it. |
| `ABC-COV-004` | `support bounded subset` | Closed for the current bounded subset: the supported clef set is explicit, compatibility shorthand is documented, and transpose remains explicitly partial/extension-assisted. |
| `ABC-COV-005` | `support bounded subset` | Closed for the current bounded policy: import-side beam-break hints are supported, while exact export-side ABC spacing preservation remains out of scope and is now explicitly documented/tested. |
| `ABC-COV-006` | `support bounded subset` | Closed for the current bounded subset: common repeat / ending forms use standard ABC surface, while edge cases such as repeat counts beyond the ordinary case and `ending type=discontinue` are explicitly extension-assisted and now covered by tests/spec text. |
| `ABC-COV-007` | `support bounded subset` | Closed for the current bounded subset: common unnumbered slur start/stop presence is supported, while numbered/nested slur identity and broader span semantics remain explicitly out of claim and are now documented/tested. |
| `ABC-COV-008` | `support bounded subset` | Tuplets are usable; the remaining work is edge clarification. |
| `ABC-COV-009` | `support now` | Closed in the current series; canonical policy and implementation/tests are aligned for the tracked items. |
| `ABC-COV-010` | `out of practical scope` | `s:` symbol lines currently look like a low-priority notation surface. |
| `ABC-COV-011` | `support bounded subset` | Closed for the current bounded subset: `U:` remains import-first, single-character decoration-alias support is explicit, malformed declarations are ignored, and export parity is intentionally not claimed. |
| `ABC-COV-012` | `support bounded subset` | Closed for the current bounded inventory: supported quoted chord-symbol roots/suffixes are now enumerated in spec text and backed by tests, while unsupported quoted chord-like text explicitly falls back to annotation rather than forced harmony parsing. |
| `ABC-COV-013` | `support bounded subset` | Annotation support should be explicit, not accidental. |
| `ABC-COV-014` | `support bounded subset` | Practical acceptance is likely sufficient, but that should be stated plainly. |
| `ABC-COV-015` | `support bounded subset` | Closed for the current bounded subset: common `w:` underlay and ordinary hyphenation are supported, while broader alignment, multi-verse, and numbering semantics remain explicitly out of claim. |
| `ABC-COV-016` | `support bounded subset` | Closed for the current working subset; supported, partial, ext-only, and unsupported `V:` properties are now enumerated explicitly and backed by tests. |
| `ABC-COV-017` | `defer intentionally` | Closed by policy: `&` import acceptance remains supported via synthetic overlay voices / parts, while faithful same-part overlay preservation and exact `&` roundtrip are intentionally not current completion targets. |
| `ABC-COV-018` | `support bounded subset` | Closed for the current bounded 2.2 subset: `!editorial!` and `!courtesy!` are now supported as accidental-level modifiers with import/export/roundtrip coverage. |

## Ready-to-Transfer TODO Order

If the goal is to turn this document into executable TODO items with minimal extra analysis, use this order:

1. `ABC-COV-009` decorations pending policy
2. `ABC-COV-016` voice-property enumeration
3. `ABC-COV-005` beam-separation preservation target
4. `ABC-COV-006` repeat / ending edge audit
5. `ABC-COV-012` chord-symbol inventory bounds
6. `ABC-COV-007` slur-span policy
7. `ABC-COV-017` overlay preservation decision
8. `ABC-COV-018` ABC 2.2 delta decision
9. `ABC-COV-008`, `ABC-COV-011`, `ABC-COV-015`
10. `ABC-COV-001`, `ABC-COV-002`, `ABC-COV-003`, `ABC-COV-010`, `ABC-COV-013`, `ABC-COV-014`

Current phase note:

- this transfer order has been fully consumed for the current bounded-coverage pass
- treat it as historical execution order, not as the current active queue

## Likely Practical-Scope Freezes

These are not final decisions, but they currently look like the strongest candidates for "explicitly unsupported unless real-world demand appears":

- `3.3` field continuation
- `4.15` symbol lines
- `6.1` formatting/typesetting details
- `6.2` playback semantics from ABC notation itself
- `7.2` line-breaking semantics

## Current High-Priority Follow-Ups

- `4.14 Decorations`
  - canonical decoration policy is closed, but implementation/test follow-up may still be needed where broader parity is intentionally bounded
- `4.7 Beams`
  - bounded policy is closed, but exact export-side spacing preservation remains intentionally out of scope
- `4.18 Chord symbols`
  - bounded inventory is closed, but broader harmony spelling coverage remains intentionally outside the current subset
- `7.4 Voice overlay`
  - policy is closed, but current import still expands overlays into synthetic parts rather than synchronized voices inside one part

## Recently Closed Backlog Items

- `ABC-COV-009`
  - closed as `support now`
  - policy text is settled in this document and `docs/spec/ABC_IO.md`
  - current implementation/tests align on:
    - canonical `!arpeggio!` export for the current MusicXML `arpeggiate` carrier
    - canonical `!stopped!` export for `!+!` / `!plus!` import aliases
    - canonical `!mordent!` / `!pralltriller!` export for mordent-family import aliases
    - standard `!slide!` as start-side support, with explicit stop kept as `mikuscore` extension `!slide-stop!`
- `ABC-COV-016`
  - closed as `support bounded subset`
  - `7.1 Voice properties` is now decomposed into:
    - supported: `V:id`, `name=...`, common `clef=...`
    - partial: standard `transpose=...` import
    - ext-only: transpose-preserving roundtrip through `%@mks transpose ...`
    - unsupported: broader standard properties such as `staves`, `brace`, `bracket`, `merge`, `middle`, `gchords`
    - practical multi-staff import is currently available through bounded `%%score (...)` grouping rather than those `V:` properties
  - regression coverage now exists for:
    - supported `transpose=...` import
    - warnings on unsupported standard `V:` properties
- `ABC-COV-005`
  - closed as `support bounded subset`
  - bounded policy is now explicit:
    - import: whitespace is a beam-break hint within the current voice/measure
    - export: exact beam-specific ABC spacing is not preserved
    - practical interchange target is beam-break interpretation on import, not verbatim source spacing roundtrip
  - regression coverage now exists for:
    - import-side whitespace beam-break hints
    - current export-side non-preservation of exact beam spacing text
- `ABC-COV-006`
  - closed as `support bounded subset`
  - bounded policy is now explicit:
    - standard surface support covers common repeat / ending forms: `|:`, `:|`, `[1`, `[2`, `|1`, `:|2`
    - edge semantics beyond that subset currently rely on `%@mks measure` metadata
    - repeat counts beyond the ordinary case use `times=...`
    - ending stop type `discontinue` uses `ending-stop=... ending-type=discontinue`
  - regression coverage now exists for:
    - standard repeat barlines
    - standard alternate endings
    - extension-assisted repeat counts
    - extension-assisted `discontinue` ending stop
- `ABC-COV-012`
  - closed as `support bounded subset`
  - bounded quoted-chord inventory is now explicit:
    - roots/bass: `A`-`G` with optional `#` / `b`
    - supported suffix subset:
      - ``
      - `m`, `min`
      - `6`, `m6`, `min6`
      - `7`, `9`, `11`, `13`
      - `maj7`, `maj9`
      - `m7`, `min7`, `m9`, `min9`
      - `7sus4`, `sus4`, `sus2`
      - `dim`, `dim7`, `aug`, `+`, `m7b5`, `min7b5`, `ø`
    - unsupported quoted chord-like text falls back to annotation/words
  - regression coverage now exists for:
    - supported quoted-chord harmony parsing/export
    - unsupported quoted chord-like fallback to annotation
- `ABC-COV-007`
  - closed as `support bounded subset`
  - bounded slur policy is now explicit:
    - supported: common unnumbered start/stop slur presence
    - unsupported/not yet claimed: numbered/nested slur identity preservation and broader exact span semantics
    - warning-based edge handling: slur stop without a preceding non-rest note
  - regression coverage now exists for:
    - common slur start/stop roundtrip
    - warning-based unsupported edge behavior
- `ABC-COV-017`
  - closed as `defer intentionally`
  - overlay policy is now explicit:
    - supported: import acceptance of `&` via synthetic overlay voices / parts
    - intentionally not claimed: faithful same-part multi-voice preservation
    - intentionally not claimed: exact standard ABC `&` roundtrip preservation
- `ABC-COV-018`
  - closed as `support bounded subset`
  - 2.2 delta policy is now explicit:
    - `!editorial!` is supported as a bounded accidental-level modifier
    - `!courtesy!` is supported as a bounded accidental-level modifier
    - broader 2.2 delta work still remains outside the current bounded target
- `ABC-COV-011`
  - closed as `support bounded subset`
  - `U:` policy is now explicit:
    - supported: single-character decoration-alias import
    - supported: `!decor!` / `+decor+` right-hand side forms in the current import path
    - malformed `U:` declarations are ignored
    - export parity for `U:` is intentionally not claimed
- `ABC-COV-001`
  - closed as `support bounded subset`
  - information-field policy is now explicit:
    - supported core subset: `X:`, `T:`, `C:`, `M:`, `L:`, `K:`, `Q:`
    - `V:` remains supported only through its separately bounded voice-property subset
    - non-core information fields are not semantically supported
    - lexical tolerance of an unsupported field does not count as ABC coverage
- `ABC-COV-002`
  - closed as `support bounded subset`
  - inline-field policy is now explicit:
    - supported subset: `[K:...]`, `[M:...]`, `[L:...]`, `[Q:...]`, `[V:...]`
    - broader inline fields are not semantically supported
    - unsupported inline fields are skipped with warnings
- `ABC-COV-013`
  - closed as `support bounded subset`
  - annotation policy is now explicit:
    - supported: common quoted non-harmonic text as direction words / annotations
    - supported: unsupported quoted chord-like text falls back to annotation/words instead of being forced into `harmony`
    - not currently claimed: broader annotation placement and behavior semantics
- `ABC-COV-014`
  - closed as `support bounded subset`
  - order-of-constructs policy is now explicit:
    - supported in the practical sense: common construct orderings already handled by the parser
    - preferred stance: broad practical acceptance for structurally recognizable real-world ABC
    - not currently claimed: full formal conformance to every order-of-constructs nuance
- `ABC-COV-003`
  - closed as `defer intentionally`
  - field-continuation policy is now explicit:
    - continued information-field lines are outside the current supported subset
    - lexical tolerance does not count as continuation support
    - this area is intentionally deferred unless practical input evidence makes it worth revisiting
- `ABC-COV-010`
  - closed as `out of practical scope`
  - symbol-line policy is now explicit:
    - standard `s:` symbol lines are outside the current bounded support target
    - there is no current import/export or roundtrip support claim
    - this area stays out of scope unless practical input demand changes priority
- `ABC-COV-015`
  - closed as `support bounded subset`
  - lyrics policy is now explicit:
    - supported: common `w:` underlay import/export and ordinary hyphenated lyric handling
    - not currently claimed: full alignment nuance, full multi-verse behavior, or verse numbering semantics
    - current support target is useful common lyric interchange, not full lyric-parity coverage
- `ABC-COV-008`
  - closed as `support bounded subset`
  - tuplet policy is now explicit:
    - supported: common `(n[:q][:r])` syntax and common MusicXML roundtrip through `time-modification` plus note-level `tuplet` markers
    - supported: current explicit tuplet export such as `(3:2:3` in the common path
    - not currently claimed: broader ratio/edge semantics or more complex span behavior beyond the current tested subset
- `ABC-COV-004`
  - closed as `support bounded subset`
  - clef / transposition policy is now explicit:
    - supported: common `V:` clef subset `treble`, `bass`, `alto`, `tenor`, `c3`, `c4`
    - supported: bare clef shorthand as compatibility behavior on import
    - partial/ext-only: standard `V:` transpose import plus `%@mks transpose ...` for roundtrip preservation
    - not currently claimed: broader standard clef breadth or full standard `V:` transpose export parity

## TODO Derivation Rule

When creating or updating ABC-related TODO items:

1. identify the affected `ABC 2.1` chapter or `ABC 2.2 delta` item in this file
2. update the status and note here first if the understanding changed
3. create implementation TODO items only for the delta between current and desired status
4. when possible, reference the `ABC-COV-*` backlog item that the TODO comes from
5. treat this file as the source for completion judgment

## Related Documents

- `docs/spec/ABC_IO.md`
- `docs/spec/abc-compat-parser-ebnf.md`
- `docs/FORMAT_COVERAGE.md`
- `TODO.md`
