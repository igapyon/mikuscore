# TEST_CFFP

## Purpose

`CFFP` (Cross-Format Focus Parity) defines focused, minimal, cross-format roundtrip tests.

One topic at a time:
- prepare a minimal `MusicXML` fixture for that topic
- run `MusicXML -> format -> MusicXML` for all supported formats
- assert only topic-relevant invariants and policy

Supported format targets:
- `musescore`
- `midi`
- `vsqx`
- `abc`
- `mei`
- `lilypond`

---

## Policy Model

Each topic must define per-format policy:

- `must-preserve`
  - the semantic element must survive roundtrip
- `allowed-degrade`
  - degradation is accepted, but must be explicitly documented

All topics should still keep baseline checks across all formats:
- first pitched note pitch class / octave
- first pitched note start timing baseline
- no malformed MusicXML after roundtrip

---

## Case IDs and Status

- `CFFP-TRILL`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `lilypond`, `musescore`
    - `allowed-degrade`: `midi`, `vsqx`, `mei`

- `CFFP-TRILL-VARIANTS`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`

- `CFFP-TURN`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Note:
    - baseline first-note pitch is intentionally relaxed for this case because ornament handling can alter emitted leading-note representation by format.

- `CFFP-TURN-VARIANTS`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `inverted-turn` + `delayed-turn`

- `CFFP-MORDENT-VARIANTS`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `mordent` + `inverted-mordent`

- `CFFP-ORNAMENT-ACCIDENTAL-MARK`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `ornaments/accidental-mark` (with ornament context)

- `CFFP-SCHLEIFER`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`

- `CFFP-SHAKE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`

- `CFFP-DYNAMICS-BASIC`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`
  - Scope:
    - basic dynamics marks (`pp`, `ff`)

- `CFFP-DYNAMICS-ACCENTED`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`
  - Scope:
    - accented dynamics marks (`mf`, `sfz`)

- `CFFP-DYNAMICS-WEDGE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - wedge crescendo/diminuendo lines

- `CFFP-FERMATA`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`

- `CFFP-ARPEGGIATE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`

- `CFFP-BREATH-CAESURA`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `articulations/breath-mark` + `articulations/caesura`

- `CFFP-GLISSANDO`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `glissando` start/stop pair

- `CFFP-PEDAL`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `direction-type/pedal` start/stop

- `CFFP-SEGNO-CODA`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `direction-type/segno` + `direction-type/coda`

- `CFFP-HARMONY-CHORDSYMBOL`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `harmony` (`root` / `root-alter` / `kind` / `bass`)

- `CFFP-KEY-MODE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `key/mode` transition (`major` -> `minor`)

- `CFFP-TECHNIQUE-TEXT`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `direction-type/words` text marks (`pizz.` / `arco` / `con sord.`)

- `CFFP-LEFT-HAND-PIZZICATO`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `technical/left-hand-pizzicato`

- `CFFP-BOWING-DIRECTION`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - bowing direction marks (`technical/up-bow` + `technical/down-bow`)

- `CFFP-ARTICULATION-EXT`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - extended articulations (`tenuto` / `staccatissimo` / `strong-accent`)

- `CFFP-NOTEHEAD`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - notehead variants (`cross` / `diamond`)

- `CFFP-CLEF-MIDMEASURE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - mid-measure clef change

- `CFFP-STEM-BEAM-DIR`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - stem direction (`up`/`down`) + beam direction markers (`begin`/`end`)

- `CFFP-VOICE-STAFF-SWAP`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - same voice crossing staff 1/2 within one measure

- `CFFP-MEASURE-STYLE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `measure-style` (`slash` start/stop + `multiple-rest`)

- `CFFP-PRINT-LAYOUT-MIN`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - minimal `print` layout hints (`new-system` / `new-page`)

- `CFFP-MIDMEASURE-REPEAT`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - mid-measure repeat-like directives (`sound` forward/backward repeat with words marker)

- `CFFP-OTTAVA-NUMBERING`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - multiple `octave-shift` lanes using different `number` values

- `CFFP-LYRIC-BASIC`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - basic lyric text + melisma (`syllabic begin/end` + `extend`)

- `CFFP-SLIDE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `slide` start/stop pair

- `CFFP-TREMOLO`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `tremolo` single + start/stop

- `CFFP-REHEARSAL-MARK`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - rehearsal text marker (`direction-type/rehearsal`)

- `CFFP-DA-CAPO-DAL-SEGNO`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - jump words + `sound` attributes (`dacapo` / `dalsegno`)

- `CFFP-ENDING-TYPE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - `ending` type variants (`start` / `stop` / `discontinue`)

- `CFFP-TRIPLET-BRACKET`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Scope:
    - tuplet display attributes (`bracket` / `placement`)

- `CFFP-OCTSHIFT`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `lilypond`
    - `allowed-degrade`: `musescore`, `midi`, `vsqx`, `abc`, `mei`

- `CFFP-SLUR`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `lilypond`, `musescore`
    - `allowed-degrade`: `midi`, `vsqx`, `mei`

- `CFFP-TIE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `musescore`
    - `allowed-degrade`: `lilypond`, `midi`, `vsqx`, `mei`

- `CFFP-STACCATO`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `mei`, `lilypond`, `musescore`
    - `allowed-degrade`: `midi`, `vsqx`

- `CFFP-ACCENT`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `mei`, `lilypond`, `musescore`
    - `allowed-degrade`: `abc`, `midi`, `vsqx`

- `CFFP-GRACE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `mei`, `lilypond`, `musescore`
    - `allowed-degrade`: `midi`, `vsqx`

- `CFFP-TUPLET`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `mei`, `lilypond`, `musescore`
    - `allowed-degrade`: `midi`, `vsqx`

- `CFFP-ACCIDENTAL`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `lilypond`, `musescore`
    - `allowed-degrade`: `mei`, `midi`, `vsqx`

- `CFFP-ACCIDENTAL-RESET`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `mei`, `lilypond`, `musescore`, `midi`
    - `allowed-degrade`: `vsqx` (pitch baseline in this case)

- `CFFP-COURTESY-ACCIDENTAL`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`

- `CFFP-BEAM-CONTINUITY`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`

- `CFFP-MULTIVOICE-BACKUP`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`

- `CFFP-PICKUP-IMPLICIT`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`

- `CFFP-TRANSPOSE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`
  - Note:
    - baseline first-note pitch is intentionally relaxed for this case because transposition semantics can shift written pitch representation by format.

- `CFFP-GRANDSTAFF-MAPPING`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`
  - Note:
    - baseline first-note pitch is intentionally relaxed for this case because first-note order can differ between staves by format.

- `CFFP-KEY-CHANGE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`

- `CFFP-TIME-CHANGE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `mei`, `lilypond`, `musescore`
    - `allowed-degrade`: `abc`, `midi`, `vsqx`

- `CFFP-DOUBLE-BARLINE`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: none
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `musescore`, `midi`, `vsqx`

- `CFFP-REPEAT-ENDING`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `abc`, `lilypond`, `musescore`
    - `allowed-degrade`: `mei`, `midi`, `vsqx`

- `CFFP-TEMPO-MAP`:
  - Status: implemented
  - Test: `tests/unit/cffp-series.spec.ts`
  - Current policy:
    - `must-preserve`: `musescore`
    - `allowed-degrade`: `abc`, `mei`, `lilypond`, `midi`, `vsqx`

- Additional implemented cases (see `tests/unit/cffp-series.spec.ts`):
  - `CFFP-ACCIDENTAL-COURTESY-MODE`
  - `CFFP-PERCUSSION-UNPITCHED`
  - `CFFP-PERCUSSION-NOTEHEAD`
  - `CFFP-PERCUSSION-INSTRUMENT-ID`
  - `CFFP-PERCUSSION-VOICE-LAYER`
  - `CFFP-PERCUSSION-STAFF-LINE`
  - `CFFP-TRANSPOSING-INSTRUMENT`
  - `CFFP-TIMEWISE-BACKUP-FORWARD`
  - `CFFP-CROSS-STAFF-BEAM`
  - `CFFP-CHORD-SYMBOL-ALTER`
  - `CFFP-NOTE-TIES-CROSS-MEASURE`
  - `CFFP-MULTI-REST-COUNT`
  - `CFFP-REPEAT-JUMP-SOUND`
  - `CFFP-CUE-GRACE-MIX`
  - `CFFP-LYRICS-MULTI-VERSE`
  - `CFFP-TEXT-ENCODING`
  - `CFFP-HARMONIC-NATURAL-ARTIFICIAL`
  - `CFFP-OPEN-STRING`
  - `CFFP-STOPPED`
  - `CFFP-SNAP-PIZZICATO`
  - `CFFP-FINGERING`
  - `CFFP-STRING`
  - `CFFP-DOUBLE-TRIPLE-TONGUE`
  - `CFFP-HEEL-TOE`
  - `CFFP-PLUCK-TEXT`
  - `CFFP-BREATH-VARIANTS`
  - `CFFP-BREATH-PLACEMENT`
  - `CFFP-CAESURA-STYLE`

---

## Authoring Rules

- Keep fixtures minimal (usually 1 measure).
- Avoid mixing multiple semantics in one case.
- Keep assertions deterministic and narrow.
- If policy changes, update this file and `docs/spec/TEST_MATRIX.md` together.

---

## Current Matrix (Implemented Cases)

- `must-preserve` focused:
  - `musescore`: `CFFP-TRILL`, `CFFP-STACCATO`, `CFFP-ACCENT`, `CFFP-GRACE`, `CFFP-TUPLET`, `CFFP-ACCIDENTAL`, `CFFP-ACCIDENTAL-RESET`, `CFFP-BEAM-CONTINUITY`, `CFFP-MULTIVOICE-BACKUP`, `CFFP-PICKUP-IMPLICIT`, `CFFP-GRANDSTAFF-MAPPING`, `CFFP-TIME-CHANGE`, `CFFP-REPEAT-ENDING`, `CFFP-TEMPO-MAP`
  - `abc`: `CFFP-TRILL`, `CFFP-SLUR`, `CFFP-TIE`, `CFFP-STACCATO`, `CFFP-GRACE`, `CFFP-TUPLET`, `CFFP-ACCIDENTAL`, `CFFP-ACCIDENTAL-RESET`, `CFFP-REPEAT-ENDING`
  - `mei`: `CFFP-STACCATO`, `CFFP-ACCENT`, `CFFP-GRACE`, `CFFP-TUPLET`, `CFFP-ACCIDENTAL-RESET`, `CFFP-TIME-CHANGE`
  - `lilypond`: `CFFP-TRILL`, `CFFP-OCTSHIFT`, `CFFP-STACCATO`, `CFFP-ACCENT`, `CFFP-GRACE`, `CFFP-TUPLET`, `CFFP-ACCIDENTAL`, `CFFP-ACCIDENTAL-RESET`, `CFFP-REPEAT-ENDING`, `CFFP-TIME-CHANGE`
  - `midi`: `CFFP-ACCIDENTAL-RESET`
  - `vsqx`: none

- `allowed-degrade`:
  - all other case/format combinations not listed above.
