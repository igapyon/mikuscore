# ABC I/O Specification

## Purpose

This document defines the behavior of `src/ts/abc-io.ts`.

The module is responsible for:

- parsing ABC text into an internal structure compatible with MusicXML generation
- converting ABC source to MusicXML
- exporting MusicXML DOM to ABC text
- providing reusable ABC utility functions

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

## Input structure

Parser reads:

- headers (`X:`, `T:`, `C:`, `M:`, `L:`, `K:`)
- voice directives (`V:` with optional `name`, `clef`, `transpose`)
- optional `%%score` voice ordering directive
- optional mikuscore metadata comments (`%@mks key ...`, `%@mks measure ...`, `%@mks transpose ...`)
- body note/rest/chord tokens

## Compatibility behavior

Parser is intentionally lenient for real-world ABC:

- ignores standalone octave marks in unsupported positions
- skips unsupported decorations/inline strings with warnings
- accepts partial/legacy patterns where possible

## Supported musical tokens

- notes and rests
- accidentals (`^`, `_`, `=`)
- length tokens (`2`, `/`, `/2`, `3/2`, etc.)
- ties (`-`)
- chords (`[...]`)
- tuplets (`(n[:q][:r]`)
- broken rhythm (`>` / `<`)
- barlines

## Parse result characteristics

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

## Header mapping

Exports:

- `X:1`
- `T:` from `work-title` or `movement-title` (fallback `mikuscore`)
- `C:` from composer creator if present
- `M:` from first measure time (fallback `4/4`)
- `L:1/8` (fixed)
- `K:` from key fifths/mode conversion

## Voice / part mapping

- each MusicXML `part` maps to `V:` section
- voice id is sanitized from part id
- part name exported as `name="..."`
- clef mapped to ABC clef suffix when recognized

## Note export policy

- supports rests, pitch notes, chords, durations, ties
- supports tuplet roundtrip export (`(n:q:r` style) from MusicXML time-modification/tuplet notations
- emits accidentals based on key signature + measure accidental memory
  - suppresses redundant naturals in-context
  - emits required naturals where key/measure context differs
- serializes each part as ABC measure stream (`|` separated)
- emits mikuscore metadata lines for lossless roundtrip:
  - `%@mks key voice=... measure=... fifths=...`
  - `%@mks measure voice=... measure=... number=... implicit=... [repeat=...] [times=...]`
  - `%@mks transpose voice=... chromatic=... [diatonic=...]`

---

## ABC -> MusicXML (`convertAbcToMusicXml`)

`convertAbcToMusicXml` pipeline:

1. parse ABC via `AbcCompatParser.parseForMusicXml`
2. transform parsed result into MusicXML 4.0 document text

Generation policy:

- fixed divisions: `960`
- supports multi-part output
- writes part list + default midi-instrument tags
- writes first-measure attributes (key/time/clef and optional transpose)
- preserves tie semantics using both `<tie>` and `<notations><tied>`
- restores tuplet semantics using both `<time-modification>` and `<notations><tuplet>`
- restores measure metadata (`number`, `implicit`) and repeat barlines from `%@mks measure`
- restores transpose (`chromatic`, `diatonic`) from `%@mks transpose`
- inserts a fallback whole-rest note for empty measures

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

- This module is compatibility-oriented and intentionally pragmatic.
- It does not aim to be a complete strict ABC standard implementation.
- Behavior prioritizes stable import/export for mikuscore workflows.
