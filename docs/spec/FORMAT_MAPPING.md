# Format Mapping Policy

## Purpose

This document is the first cross-format mapping table for miku-score.

It refines the canonical MusicXML state policy in
`docs/spec/CANONICAL_MUSICXML.md` by classifying each surrounding format
against the same set of outcomes:

- represented in normal MusicXML
- preserved through miku-score extension metadata (`mks:meta:*`)
- preserved as source-format metadata (`mks:src:*`)
- approximated with diagnostics
- skipped with diagnostics
- rejected with diagnostics

This is a specification planning document. Format-specific details remain in
the format-specific specs, but this file is the cross-format index used to
avoid treating every converter as a separate product.

## Mapping Terms

| Term | Meaning |
|---|---|
| Normal MusicXML | Standard MusicXML elements and attributes used as the canonical score state |
| `mks:meta:*` | miku-score extension metadata needed for product behavior or roundtrip support |
| `mks:src:*` | source-format-only data retained for traceability or possible reconstruction |
| `mks:diag:*` | structured conversion diagnostics stored in MusicXML metadata when useful |
| Approximated | Converted into a close MusicXML representation but not guaranteed equivalent |
| Skipped | Recognized but omitted because it is outside current scope |
| Rejected | Causes import/export failure because continuing would be unsafe or misleading |

## Format Roles

| Format | Role | Canonical relationship |
|---|---|---|
| MusicXML | Canonical notation state | The score state miku-score reads, validates, edits, serializes, renders, and exports from |
| MuseScore | Surrounding notation format | High-priority import/export through MusicXML with parity checks |
| MIDI | Surrounding performance-event format | Export derives performance events from MusicXML; import reconstructs notation from timed events |
| ABC | Surrounding compact text notation | Practical AI/human handoff notation imported/exported through MusicXML |
| MEI | Surrounding notation/archive format | Experimental import/export through MusicXML |
| LilyPond | Surrounding text engraving format | Experimental text notation/engraving import/export through MusicXML |
| VSQX | Surrounding singing/vocal timing format | Integration-backed import/export for vocal timing and pitch material |

## Core MusicXML Expectations

Every successful surrounding-format import SHOULD produce MusicXML with:

- a `score-partwise` document
- `part-list` / `score-part` linkage
- one or more `part` elements
- measure structure
- valid note/rest durations where the source provides enough timing information
- time/key/clef where available or safely synthesized

Every surrounding-format export SHOULD start from the current canonical
MusicXML state and avoid adding product semantics in the export adapter that
are not present in the MusicXML state or documented `mks:*` metadata.

## ABC Mapping

Status: supported surrounding compact text notation.

Source spec: `docs/spec/ABC_IO.md`.

| Outcome | Current policy |
|---|---|
| Normal MusicXML | Headers such as title, composer, meter, default note length, key, tempo, supported voices, clefs, notes, rests, chords, barlines, repeats, endings, slurs, ties, tuplets, selected decorations, beam-break hints, and supported inline fields |
| `mks:meta:*` | `%@mks ...` comment hints for roundtrip behavior where plain ABC cannot carry enough information |
| `mks:src:*` | Not the primary current ABC mechanism; source traceability may be added later if needed |
| `mks:diag:*` | Conversion warnings may be surfaced as diagnostics; storage in MusicXML metadata is allowed when useful |
| Approximated | Overlay `&` is imported through synthetic overlay voices/parts; exact one-part overlay semantics are not currently guaranteed |
| Skipped | Unsupported directives, unsupported inline fields, symbol lines, unsupported decorations/text forms, malformed leftover body tokens, and out-of-scope field continuation behavior should be skipped with warnings where possible |
| Rejected | Structurally broken or musically uninterpretable ABC input that cannot be converted safely |

Notes:

- ABC support distinguishes standard ABC surface, real-world compatibility
  behavior, and miku-score extension metadata.
- `%@mks ...` is miku-score-specific extension metadata, not standard ABC
  musical notation.
- Exact ABC source whitespace is not canonical roundtrip data.

## MIDI Mapping

Status: supported surrounding performance-event format.

Source spec: `docs/spec/MIDI_IO.md`.

| Outcome | Current policy |
|---|---|
| Normal MusicXML | Imported MIDI reconstructs parts/tracks, measures, notes/rests, durations, voices/lane equivalents where possible, tempo, key/time metadata where available, and quantized notation structure |
| `mks:meta:*` | MIDI export may emit miku-score text meta events such as title, movement title, composer, pickup ticks, part-name/track hints, and metadata version |
| `mks:src:*` | Not the primary current MIDI mechanism; source-event trace preservation is not a first-cut guarantee |
| `mks:diag:*` | Conversion diagnostics should describe quantization, pairing, unsupported division, malformed events, and other import/export issues when available |
| Approximated | MIDI import necessarily reconstructs notation from timed events; quantization, enharmonic spelling, voices, beams, articulations, and rests may be inferred |
| Skipped | DAW-specific, device-specific, or unrecognized MIDI events outside current playback/export scope may be skipped with diagnostics |
| Rejected | Unsupported SMPTE time division, invalid SMF structure, no playable note events for export, or event structures that cannot be paired safely |

Notes:

- MIDI is not a notation source. Import quality is bounded by timing,
  quantization, and event-pairing policy.
- MIDI export is a derived performance artifact from MusicXML, not a separate
  canonical score state.

## MuseScore Mapping

Status: supported surrounding notation format.

Source spec: `docs/spec/MUSESCORE_IO.md`.

| Outcome | Current policy |
|---|---|
| Normal MusicXML | Time/key/tempo, staff/voice events, notes/rests, tuplets, slurs, ties, ottava, trills, dynamics, directions, repeats, barlines, accidental spelling where recoverable, and beam information |
| `mks:meta:*` | May be used when miku-score-specific roundtrip behavior becomes necessary |
| `mks:src:*` | Source chunks may be stored in `mks:src:mscx:*` when source metadata is enabled |
| `mks:diag:*` | Import warnings may be exported to `miscellaneous-field` entries when debug metadata is enabled |
| Approximated | Implicit beams may be inferred when MuseScore beam mode is absent; unsupported layout or engraving details may be approximated |
| Skipped | Unknown/unsupported MuseScore input may generate `MUSESCORE_IMPORT_WARNING` and be skipped |
| Rejected | Input that is not parseable XML, lacks a usable MuseScore `Score`, or cannot be mapped safely |

Notes:

- MuseScore parity should prioritize MusicXML notational meaning and focused
  parity tests over textual MuseScore XML equality.
- Key signature import has explicit written-pitch policy for transposing parts.

## MEI Mapping

Status: experimental surrounding notation/archive format.

Source spec: `docs/spec/MEI_IO.md`.

| Outcome | Current policy |
|---|---|
| Normal MusicXML | Basic score, part/staff, measure, pitch, rest, duration, key, meter, clef, and supported notation structures where implemented |
| `mks:meta:*` | Allowed for miku-score-specific roundtrip hints if required by future MEI parity work |
| `mks:src:*` | Candidate home for MEI-only source constructs that do not map cleanly to MusicXML |
| `mks:diag:*` | Should record unsupported MEI constructs, repairs, approximation, and dropped material when practical |
| Approximated | MEI structures without direct MusicXML equivalents may be approximated into the closest canonical MusicXML representation |
| Skipped | Out-of-scope MEI editorial, analytical, facsimile, layout, or archive-specific data may be skipped with diagnostics |
| Rejected | Invalid XML or MEI input whose musical timing/structure cannot produce a valid canonical MusicXML state |

Notes:

- MEI remains experimental. Do not treat the current converter as a full MEI
  preservation engine.
- MEI has a dedicated current-boundary spec, but remains experimental rather
  than a full MEI preservation engine.

## LilyPond Mapping

Status: experimental surrounding text engraving format.

Source spec: `docs/spec/LILYPOND_IO.md`.

| Outcome | Current policy |
|---|---|
| Normal MusicXML | Basic score, part/staff, measure, pitch, rest, duration, key, meter, clef, slur, and supported notation structures where implemented |
| `mks:meta:*` | `%@mks lanes ...` stores per-measure multi-lane token streams for same-staff multi-voice restoration; `%@mks slur ...` stores slur start/stop metadata for roundtrip restoration |
| `mks:src:*` | Candidate home for LilyPond-only source constructs that do not map cleanly to MusicXML |
| `mks:diag:*` | Should record unsupported LilyPond constructs, approximation, and dropped material when practical |
| Approximated | Engraving-oriented syntax, layout directives, and constructs without direct MusicXML equivalents may be approximated or ignored |
| Skipped | Out-of-scope layout, paper, markup, Scheme, and engraving directives may be skipped with diagnostics |
| Rejected | LilyPond input whose musical token stream cannot be parsed into a valid canonical MusicXML state |

Notes:

- LilyPond support is not a complete LilyPond interpreter.
- LilyPond has a dedicated current-boundary spec, but remains experimental
  rather than a complete LilyPond interpreter.

## VSQX Mapping

Status: supported through vendored integration, with CLI support currently
constrained by integration/runtime shape.

Source specs: `docs/spec/VSQX_IO.md` and
`docs/integrations/utaformatix3-ts-plus.mikuscore.iife.js.md`.

| Outcome | Current policy |
|---|---|
| Normal MusicXML | Vocal pitch/timing material that can be represented as score notes, rests, measures, tempo, and related canonical MusicXML structures |
| `mks:meta:*` | Allowed for miku-score-specific roundtrip or provenance metadata when VSQX information cannot be represented directly |
| `mks:src:*` | Candidate home for VSQX-only singer, lyric, phoneme, or parameter data when retained for traceability |
| `mks:diag:*` | Should record unsupported VSQX parameters, approximation, dropped vocal controls, and integration limitations |
| Approximated | Singing/vocal timing and pitch data may be approximated into notated MusicXML; expressive vocal parameters may not have score equivalents |
| Skipped | VSQX-only automation, synthesis parameters, singer settings, or phonetic details outside current mapping may be skipped with diagnostics |
| Rejected | Invalid VSQX or integration failures that prevent a valid canonical MusicXML state |

Notes:

- VSQX is a vocal/timing format, not a general notation format.
- Missing CLI support for VSQX should be solved by stabilizing the upstream
  callable integration shape before adding skill-local or CLI-local workarounds.

## Cross-Format Preservation Baseline

The following table is a planning baseline, not a claim that all entries are
fully implemented today.

| Topic | ABC | MIDI | MuseScore | MEI | LilyPond | VSQX |
|---|---|---|---|---|---|---|
| Pitch/rest/duration | normal | approximated on import, normal on export | normal | normal/experimental | normal/experimental | approximated |
| Measure structure | normal | reconstructed | normal | normal/experimental | normal/experimental | reconstructed |
| Voice/lane structure | normal/metadata-assisted | approximated | normal | experimental | metadata-assisted | approximated |
| Key/time/clef | normal | partial metadata/reconstructed | normal | experimental | experimental | partial |
| Tempo | normal | normal where available | normal | experimental | experimental | normal where available |
| Lyrics | partial | not a primary MIDI guarantee | partial/normal | experimental | experimental | vocal text candidate |
| Articulations/dynamics | partial | derived/limited on export, weak on import | normal where mapped | experimental | experimental | not primary |
| Slurs/ties | partial | tie-like duration pairing only | normal where mapped | experimental | metadata-assisted | not primary |
| Layout/engraving | skipped | not applicable | partial/skipped | skipped | skipped | not applicable |
| Source-specific controls | metadata/diagnostics | metadata/diagnostics | `mks:src:*`/diagnostics | `mks:src:*` candidate | `mks:src:*` candidate | `mks:src:*` candidate |

Format-specific specs and tests should either confirm these classifications or
replace them with narrower implemented behavior.

## CFFP Alignment

`docs/spec/TEST_CFFP.md` is the authoritative focused roundtrip policy for
implemented CFFP cases.

Use this document to understand broad format roles and likely preservation
classes. Use CFFP to decide whether one named notation topic is currently
`must-preserve` or `allowed-degrade` for a specific format.

Important interpretation rules:

- Broad `normal` mapping does not automatically mean every CFFP topic in that
  area is `must-preserve`.
- A format can be experimental and still have individual `must-preserve` CFFP
  topics when tests prove that slice.
- MIDI and VSQX are not notation-preservation targets by default; focused
  preservation claims should stay narrow.
- If a future CFFP case requires a feature that this document classifies as
  approximated, skipped, or not applicable, update this mapping document in the
  same change or explain why the CFFP case is a narrow exception.

## Next Specification Work

- Keep `docs/spec/CONVERSION_DIAGNOSTICS.md` aligned when format import/export
  warning codes are promoted or renamed.
- Keep `docs/spec/TEST_CFFP.md` aligned whenever focused preservation policy
  changes.
