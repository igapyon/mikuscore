# MuseScore I/O Specification

## Purpose

This document defines the behavior of `src/ts/musescore-io.ts`.

The module is responsible for:

- importing MuseScore XML (`.mscx` content) into MusicXML
- exporting MusicXML into MuseScore XML (`.mscx` content)
- preserving musically relevant notation where representable
- emitting diagnostics metadata for import-side incident analysis

---

## Public API

- `convertMuseScoreToMusicXml(mscxSource, options): string`
- `exportMusicXmlDomToMuseScore(doc, options): string`

### `convertMuseScoreToMusicXml` options

- `sourceMetadata?: boolean` (default: `true`)
- `debugMetadata?: boolean` (default: `true`)
- `normalizeCutTimeToTwoTwo?: boolean` (default: `false`)
- `applyImplicitBeams?: boolean` (default: `true`)

### `exportMusicXmlDomToMuseScore` options

- `normalizeCutTimeToTwoTwo?: boolean` (default: `false`)

---

## Import (`MuseScore -> MusicXML`)

## Root and baseline

- Input MUST be parseable XML.
- Root MUST contain `museScore > Score` (or `Score`).
- `Division` defaults to `480` when missing/invalid.

## Measure and notation mapping

- Time/key/tempo and staff/voice events are mapped into MusicXML measure structure.
- Tuplet/slur/tie/ottava/trill/dynamic/direction mappings are handled at event level.
- Unknown/unsupported input MAY generate `MUSESCORE_IMPORT_WARNING`.

## Repeat handling

- Start/end repeat at measure boundary is imported.
- Mid-measure repeat markers from MuseScore `barline/BarLine subtype` variants are imported:
  - `start-repeat`
  - `end-repeat`
  - `end-start-repeat`
- Mid-measure repeat is represented as MusicXML middle barline events.

## Trill handling

- Trill spanner transitions are mapped to `trill-mark` and `wavy-line start/stop`.
- Chord-local trill ornament is mapped as trill mark.
- Trill accidental near ornament is mapped to MusicXML `accidental-mark` when available.

## Accidental spelling policy

- If explicit accidental subtype is absent, importer MAY use MuseScore `tpc` to recover preferred spelling.
- Preferred spelling is propagated through pitch/accidental resolution to reduce enharmonic drift.

## Beam policy

- Explicit MuseScore beam mode is respected when present.
- If beam mode is absent and `applyImplicitBeams !== false`, importer infers implicit beams by beat grouping.
- If `applyImplicitBeams === false`, implicit beam fill is not applied.

## Import diagnostics metadata

- Import warnings are exported to `miscellaneous-field` (`mks:diag:*`) when debug metadata is enabled.
- Source chunks MAY be stored in `mks:src:mscx:*` fields when source metadata is enabled.

---

## Export (`MusicXML -> MuseScore`)

## Root and baseline

- Export root is `museScore version="4.0"`.
- Global `Division` is computed from source score timing requirements.

## Repeat handling

- MusicXML left/right repeats are exported to MuseScore repeat representation.
- Mid-measure repeat information is exported as MuseScore barline subtype:
  - `start-repeat`
  - `end-repeat`
  - `end-start-repeat`

## Trill handling

- MusicXML trill ornaments (`trill-mark`, `wavy-line`) are exported to MuseScore trill spanner/events.

## Scope note

- This spec defines I/O behavior of the converter implementation.
- Cross-tool parity strategy and fixture operations are defined separately in:
  - `docs/spec/MUSESCORE_EXPORT_PARITY_TEST.md`
