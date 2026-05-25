# MEI I/O Specification

## Purpose

This document defines the current public behavior of `src/ts/mei-io.ts`.

MEI support is an experimental surrounding notation/archive format path. It is
not a promise of full MEI preservation, but the implemented import/export
surface is large enough to require an explicit spec boundary.

MEI import/export is centered on canonical MusicXML as defined in
`docs/spec/CANONICAL_MUSICXML.md` and classified in
`docs/spec/FORMAT_MAPPING.md`.
Conversion diagnostic policy is defined in
`docs/spec/CONVERSION_DIAGNOSTICS.md`.

## Public API

- `convertMeiToMusicXml(meiSource, options): string`
- `exportMusicXmlDomToMei(doc, options): string`

### Import Options

- `debugMetadata?: boolean`
- `sourceMetadata?: boolean`
- `failOnOverfullDrop?: boolean`
- `meiCorpusIndex?: number`

### Export Options

- `meiVersion?: string`

## Import (`MEI -> MusicXML`)

The importer accepts parseable MEI XML and emits MusicXML `score-partwise`.

Current supported mapping includes:

- title metadata
- score/part/staff/measure structure
- note, rest, space, `mRest`, and `mSpace` timing
- pitch, accidental, key signature, meter, clef, and transposition
- lyrics where mapped through MEI verse/syllable data
- slur, tie, beam, tuplet, grace, articulation, trill, turn, mordent, fermata,
  breath, caesura, glissando, slide, dynamics, wedge, pedal, octave shift,
  segno, coda, fine, repeat marks, and harmony where implemented
- selected official MEI CMN fixture behavior covered by tests

The importer MAY synthesize MusicXML structure required by the canonical state
policy, such as part-list linkage, divisions, measures, attributes, and
implicit beams.

## Export (`MusicXML -> MEI`)

The exporter emits MEI XML from the current canonical MusicXML state.

Current supported mapping includes:

- MEI root with configurable `meiversion`
- score metadata and title
- `scoreDef`, `staffDef`, meter, key, clef, and transposition
- notes, rests, full-measure rests, invisible rests, chords, grace notes,
  tuplets, ties, slurs, articulations, accidentals, dynamics, wedges, pedal,
  octave shift, repeat marks, glissando, slide, ornaments, fermata, breath,
  caesura, harmony, and tempo where implemented

Output is intended to be deterministic enough for focused tests and parity
review, not byte-for-byte equivalent to a specialist MEI editor.

## Metadata and Diagnostics

MEI import/export uses MusicXML `miscellaneous-field` metadata when needed.

Current metadata policy:

- `mks:src:mei:*`
  - preserves MEI source chunks or source-only values when `sourceMetadata` is
    enabled
  - non-namespaced MEI misc labels are mapped into the `mks:src:mei:*`
    namespace
- `mks:dbg:mei:*`
  - stores optional debug metadata when `debugMetadata` is enabled
- `mks:diag:*`
  - records structured diagnostics such as overfull event dropping when useful
- `musicxml-measure-meta` / `mks:measure-meta` MEI annotations
  - preserve MusicXML measure metadata needed for roundtrip behavior, such as
    selected section-boundary and explicit-time details

If `failOnOverfullDrop` is true, import should fail instead of silently
dropped overfull events.

## Approximation and Degradation

The following are not full-fidelity guarantees:

- MEI editorial, analytical, facsimile, layout, archive, and source-critical
  apparatus data
- exact source element ordering outside mapped musical semantics
- engraving details that have no current MusicXML mapping
- all MEI control-event addressing variants
- all MEI version or corpus variants

Unsupported or degraded behavior SHOULD be surfaced through diagnostics or
`mks:*` metadata when practical.

## Roundtrip Policy

The primary confidence target is musical and structural roundtrip:

- valid MusicXML after import
- no overfull canonical MusicXML state unless explicitly rejected
- preservation of mapped pitch/rest/duration, measure, staff/part, and selected
  notation semantics where tests declare `must-preserve`
- documented degradation for CFFP topics marked `allowed-degrade`

Full MEI source roundtrip is not guaranteed.

## Related Tests

- `tests/unit/mei-io.spec.ts`
- `tests/unit/cffp-series.spec.ts`
- `tests/spot/local-mei-roundtrip-parity.spot.spec.ts`
- `tests/spot/local-mei-official-visual.spot.spec.ts`
