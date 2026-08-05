# LilyPond I/O Specification

## Purpose

This document defines the current public behavior of
`src/ts/lilypond-io.ts`.

LilyPond support is an experimental surrounding text notation/engraving path.
It is not a complete LilyPond interpreter. The product boundary is practical
conversion to and from canonical MusicXML.

LilyPond import/export is centered on canonical MusicXML as defined in
`docs/spec/CANONICAL_MUSICXML.md` and classified in
`docs/spec/FORMAT_MAPPING.md`.
Conversion diagnostic policy is defined in
`docs/spec/CONVERSION_DIAGNOSTICS.md`.

## Public API

- `convertLilyPondToMusicXml(source, options): string`
- `exportMusicXmlDomToLilyPond(doc): string`

### Import Options

- `debugMetadata?: boolean`
- `debugPrettyPrint?: boolean`
- `sourceMetadata?: boolean`

## Import (`LilyPond -> MusicXML`)

The importer accepts a bounded LilyPond text subset and emits MusicXML
`score-partwise`.

Current supported mapping includes:

- title/header metadata where implemented
- notes, rests, chords, durations, dots, accidentals, relative/absolute octave
  handling, clef, key, meter, transpose, tempo, part names, and staff choice
- repeat/volta and alternative markers through internal marker expansion
- tuplets, articulations, grace notes, trills, slurs, glissando, octave shift,
  lyrics, and selected direction/event hints where implemented
- implicit beam generation for short-note groups

The importer MAY use a direct parser path or a compatibility path through an
ABC-like intermediate representation when that is the practical current
implementation.

## Export (`MusicXML -> LilyPond`)

The exporter emits LilyPond text from the current canonical MusicXML state.

Current supported mapping includes:

- `\version` / score structure
- title or movement-title metadata
- parts/staves, clef, key, time, transpose, notes, rests, chords, tuplets,
  repeats, endings, slurs, trills, accidentals, grace notes, lyrics, and
  selected articulations where implemented
- multi-lane restoration hints for same-staff voice structures

Output is intended as practical LilyPond text for conversion and review. It is
not a guarantee of preserving every engraving directive from a source file.

## `mks` Comment Metadata

LilyPond import/export uses `%@mks ...` comments as miku-score extension
metadata. These comments are not standard LilyPond musical syntax.

Current supported comment families include:

- `%@mks transpose ...`
- `%@mks measure ...`
- `%@mks articul ...`
- `%@mks grace ...`
- `%@mks tuplet ...`
- `%@mks accidental ...`
- `%@mks lanes ...`
- `%@mks slur ...`
- `%@mks trill ...`
- `%@mks octshift ...`
- `%@mks diag ...`

Important roundtrip metadata:

- `%@mks lanes ...`
  - stores per-measure multi-lane token streams for same-staff multi-voice
    restoration
- `%@mks slur ...`
  - stores slur start/stop metadata such as type, number, and placement
- `%@mks diag ...`
  - carries import/export diagnostics in a reviewable comment form

## Source Metadata and Diagnostics

When `sourceMetadata` is enabled, import may store raw source chunks under
`mks:src:lilypond:*` fields in MusicXML `miscellaneous-field` metadata.

When warnings occur, import may store structured diagnostics in `mks:diag:*`
with `LILYPOND_IMPORT_WARNING`. Export may emit diagnostic comments for
`LILYPOND_EXPORT_WARNING`.

Warnings should be used for unsupported commands, unsupported chord tokens,
unparseable pitches, overfull material, dropped events, and other bounded
degradation.

## Approximation and Degradation

The following are not full-fidelity guarantees:

- Scheme code
- paper/layout/engraving directives
- arbitrary markup
- all LilyPond commands
- exact source formatting and comments
- every possible relative-mode or simultaneous-music construct

Unsupported constructs SHOULD be skipped with diagnostics when the remaining
music can still produce valid canonical MusicXML. Input that cannot produce a
safe MusicXML state should fail.

## Roundtrip Policy

The primary confidence target is musical and structural roundtrip:

- valid MusicXML after import
- no overfull canonical MusicXML state unless explicitly rejected
- preservation of mapped pitch/rest/duration, measure, staff/part, and selected
  notation semantics where tests declare `must-preserve`
- metadata-assisted restoration for multi-lane and slur cases where plain
  LilyPond output would not carry enough information

Full LilyPond source roundtrip is not guaranteed.

## Related Tests

- `tests/unit/lilypond-io.spec.ts`
- `tests/unit/cffp-series.spec.ts`
