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
| 3.2 Use of fields within the tune body | partial | Inline body fields `[K:...]`, `[M:...]`, `[L:...]`, `[Q:...]`, `[V:...]` are supported, but full field-level parity is not yet claimed. |
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
| Other standard fields outside the current core subset | unsupported | No complete support claim yet. |

#### 3.2 Use of fields within the tune body

| Inline field group | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Core inline fields: `[K:...]`, `[M:...]`, `[L:...]`, `[Q:...]`, `[V:...]` | supported | These are supported in the current standard path. |
| Broader inline-field family beyond the current core subset | unsupported | No complete support claim yet. |

#### 3.3 Field continuation

| Area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Continued information-field lines | unsupported | No current support claim or dedicated reconstruction policy. |

### 4.6 Clefs and Transposition

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common clefs in `V:` metadata (`treble`, `bass`, `alto`, `tenor`, `c3`, `c4`) | supported | Common working set is supported, including compatibility shorthand on import. |
| Broader standard clef forms and exact parity | partial | Full standard breadth and export parity are not yet closed. |
| Voice-level transpose handling | partial | Some `V:`-level transpose behavior exists, but full standard coverage is not yet claimed. |

### 4.7 Beams

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Duration-based beam reconstruction | supported | Normal export reconstructs beams from note values. |
| Whitespace as explicit beam-separation intent | partial | Import recognizes it, but export does not yet preserve ABC spacing intent faithfully. |

### 4.8-4.10 Repeat Structure

#### 4.8 Repeat / bar symbols

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common repeat barlines | supported | Standard repeat/barline handling works in common cases. |
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
| Broader variant-ending semantics | partial | Full semantics and edge-case coverage remain to be audited. |

### 4.11 Ties and Slurs

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Tie syntax and common reconstruction | supported | Common tie handling is solid, including whole-chord tie paths. |
| Slur syntax acceptance | supported | Common slur syntax is accepted. |
| Exact slur span reconstruction and edge semantics | partial | Cross-format span behavior still needs care. |

### 4.13 Tuplets

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Core tuplet syntax and common roundtrip | supported | Core parse/export works in the current path. |
| Full standard ratio nuance and edge semantics | partial | Full audit closure is not yet complete. |

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

### 4.16 Redefinable Symbols

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| `U:` single-character import aliases | supported | Current import path supports user-defined decoration aliases. |
| Broader `U:` parity, export, and exact standard semantics | partial | Full support claim is not yet made. |

### 4.18 Chord Symbols

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common harmonic quoted symbols | partial | Many common forms now roundtrip through MusicXML `harmony`. |
| Broader quality inventory and edge spelling | partial | Coverage remains incomplete. |
| Full standard chord-symbol breadth | unsupported | No full support claim yet. |

### 4.19 Annotations

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common quoted non-harmonic text | partial | Common forms are partially mapped as direction words / annotations. |
| Broader annotation placement and behavior | unsupported | No full standard support claim yet. |

### 4.20 Order of abc constructs

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common construct orderings seen in practical ABC | partial | Many common orders work, but there is no complete conformance claim. |
| Full order-of-constructs conformance | unsupported | Not yet audited to closure. |

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

### 7. Multiple Voices

#### 7.1 Voice properties

| Sub-area | Status | Current interpretation for `mikuscore` |
|---|---|---|
| Common voice identity and metadata (`V:`, name, clef, common transpose) | partial | Common working subset is supported. |
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

## ABC 2.2 Delta

This section tracks standard items that are better treated as post-2.1 additions rather than silently folded into the baseline table.

| ABC 2.2 delta item | Status | Current interpretation for `mikuscore` |
|---|---|---|
| `!editorial!` decoration | unsupported | Not yet supported in the standard ABC path. |
| `!courtesy!` decoration | unsupported | Not yet supported in the standard ABC path. |

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
| `ABC-COV-001` | `support bounded subset` | Core fields already work; the main need is to bound the rest. |
| `ABC-COV-002` | `support bounded subset` | The current inline subset is already practical; expansion should be deliberate. |
| `ABC-COV-003` | `defer intentionally` | Field continuation looks low-value unless real input data demands it. |
| `ABC-COV-004` | `support bounded subset` | Common clefs/transpose already exist; the next step is explicit boundary-setting. |
| `ABC-COV-005` | `support bounded subset` | Beam intent preservation likely needs a bounded target rather than full formal parity. |
| `ABC-COV-006` | `support bounded subset` | Common repeat/ending forms are already strong; finish the edge boundary. |
| `ABC-COV-007` | `support bounded subset` | Ties are strong, but slurs likely need explicit limits before deeper work. |
| `ABC-COV-008` | `support bounded subset` | Tuplets are usable; the remaining work is edge clarification. |
| `ABC-COV-009` | `support now` | These decoration-policy items are close enough to close in the current series. |
| `ABC-COV-010` | `out of practical scope` | `s:` symbol lines currently look like a low-priority notation surface. |
| `ABC-COV-011` | `support bounded subset` | `U:` already has an import path; scope should be bounded before any export ambitions. |
| `ABC-COV-012` | `support bounded subset` | Chord symbols are important, but inventory-bounding is more realistic than full parity. |
| `ABC-COV-013` | `support bounded subset` | Annotation support should be explicit, not accidental. |
| `ABC-COV-014` | `support bounded subset` | Practical acceptance is likely sufficient, but that should be stated plainly. |
| `ABC-COV-015` | `support bounded subset` | Lyrics already work in useful cases; scope clarification is the next step. |
| `ABC-COV-016` | `support bounded subset` | Voice-property breadth should be enumerated explicitly around the current working subset. |
| `ABC-COV-017` | `defer intentionally` | Faithful overlay preservation may be expensive relative to current value unless demanded. |
| `ABC-COV-018` | `defer intentionally` | ABC 2.2 delta items should be roadmap decisions, not silent obligations. |

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

## Likely Practical-Scope Freezes

These are not final decisions, but they currently look like the strongest candidates for "explicitly unsupported unless real-world demand appears":

- `3.3` field continuation
- `4.15` symbol lines
- `6.1` formatting/typesetting details
- `6.2` playback semantics from ABC notation itself
- `7.2` line-breaking semantics

## Current High-Priority Gaps

- `4.14 Decorations`
  - ABC 2.2 delta decorations `!editorial!` / `!courtesy!` are still open
  - implementation follow-up remains open only where code still differs from the settled policy
- `4.7 Beams`
  - whitespace-as-beam-separation is only partially preserved
- `4.18 Chord symbols`
  - common forms work, but broader standard harmony spelling coverage remains incomplete
- `7.4 Voice overlay`
  - imported overlays still become separate MusicXML parts instead of preserved synchronized voices inside one part

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
