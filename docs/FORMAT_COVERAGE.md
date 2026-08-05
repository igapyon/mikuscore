# Format Coverage

## Coverage Policy

- Priority order: MusicXML fidelity > conversion breadth.
- MusicXML is the canonical score state. Other formats are surrounding formats
  that import into or export from MusicXML.
- "Supported" means available in product flows, not full notation parity.
- Supported formats may still change behavior as compatibility and parity work progress.
- miku-score is a converter, not a promise of lossless editing parity across all formats.

## Current Coverage

| Format | Direction | Status | Notes |
|---|---|---|---|
| MusicXML 4.0 | import/export | Core baseline | Canonical score state |
| MuseScore (`.mscx`, `.mscz`) | import/export | Supported | Surrounding notation format; focus on reliable MusicXML conversion and parity tests |
| MIDI (`.mid`, `.midi`) | import/export | Supported | Surrounding performance-event format; import requires notation reconstruction and quantization |
| VSQX | import/export | Supported via vendored integration | Surrounding singing/vocal timing format; uses `utaformatix3-ts-plus` |
| ABC | import/export | Supported | Surrounding compact text notation; ABC standard 2.2 baseline with practical import/export coverage and optional `%@mks ...` roundtrip hints |
| MEI | import/export | Experimental | Surrounding notation/archive format; compatibility work tracked with reference samples |
| LilyPond (`.ly`) | import/export | Experimental | Surrounding text engraving format; conversion coverage is limited |

## Constraints

- Some notation semantics are format-specific and cannot be preserved 1:1.
- Enharmonic spelling, articulation detail, repeat semantics, and layout constructs can differ by source format.
- When exact preservation is not possible, diagnostics and metadata should provide traceability.
- For notation editing beyond conversion-oriented inspection, use a dedicated notation editor.
- Quick playback in miku-score is a lightweight feature and may not work reliably on large scores (long duration, many parts, dense events).
- For reliable playback of large scores, export MIDI and use an external MIDI-capable playback app.

## Related Specs

- `docs/spec/CANONICAL_MUSICXML.md`
- `docs/spec/FORMAT_MAPPING.md`
- `docs/spec/CONVERSION_DIAGNOSTICS.md`
- `docs/spec/MIDI_IO.md`
- `docs/spec/ABC_IO.md`
- `docs/spec/MEI_IO.md`
- `docs/spec/LILYPOND_IO.md`
- `docs/spec/VSQX_IO.md`
- `docs/spec/ABC_STANDARD_COVERAGE.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/MISCELLANEOUS_FIELDS.md`
