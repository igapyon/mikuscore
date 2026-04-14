# Format Coverage

## Coverage Policy

- Priority order: MusicXML fidelity > conversion breadth.
- "Supported" means available in product flows, not full notation parity.
- Supported formats may still change behavior as compatibility and parity work progress.
- mikuscore is a converter, not a promise of lossless editing parity across all formats.

## Current Coverage

| Format | Direction | Status | Notes |
|---|---|---|---|
| MusicXML 4.0 | import/export | Core baseline | Canonical internal target for compatibility work |
| MuseScore (`.mscz`) | import/export | Supported | Focus on reliable conversion and parity tests |
| MIDI (`.mid`) | import/export | Supported | Quantization/notation reconstruction has expected limits |
| VSQX | import/export | Supported via vendored integration | Uses `utaformatix3-ts-plus` |
| ABC | import/export | Supported | ABC standard 2.2 baseline with practical import/export coverage; some standard features remain partial or unsupported, and `mikuscore` may emit/accept extension metadata comments such as `%@mks ...` for roundtrip support |
| MEI | import/export | Experimental | Compatibility work tracked with reference samples |
| LilyPond (`.ly`) | import/export | Experimental | Conversion coverage is limited |

## Constraints

- Some notation semantics are format-specific and cannot be preserved 1:1.
- Enharmonic spelling, articulation detail, repeat semantics, and layout constructs can differ by source format.
- When exact preservation is not possible, diagnostics and metadata should provide traceability.
- For notation editing beyond conversion-oriented inspection, use a dedicated notation editor.
- Quick playback in mikuscore is a lightweight feature and may not work reliably on large scores (long duration, many parts, dense events).
- For reliable playback of large scores, export MIDI and use an external MIDI-capable playback app.

## Related Specs

- `docs/spec/MIDI_IO.md`
- `docs/spec/ABC_IO.md`
- `docs/spec/ABC_STANDARD_COVERAGE.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/MISCELLANEOUS_FIELDS.md`
