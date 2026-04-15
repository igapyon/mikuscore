# Quality Strategy

## Quality Goals

- Keep conversion behavior deterministic.
- Minimize notation loss against source intent.
- Detect regressions quickly through automated tests.

## Round-trip Focus

- Round-trip stability is a primary quality axis.
- Important path: `MusicXML -> foreign format -> MusicXML`.
- Regressions are evaluated on semantic and structural impact, not whitespace identity.

## Test Strategy

- Unit tests per I/O module (MEI, MuseScore, MIDI, ABC, etc.).
- Golden tests for representative conversion scenarios.
- Focused regression cases for known edge patterns.

## Diagnostics and Traceability

- Emit diagnostic codes/messages for import/export incidents.
- Preserve debug metadata fields (`mks:*`) where applicable.
- Use diagnostics and metadata to support failure triage and parity analysis.

## Operational Checks

- Use `npm run test:unit` for routine module-level verification.
- Use `npm run check:all` before integration/merge.
- Keep format-specific regression tests updated when conversion behavior changes.

## Related Specs

- `docs/spec/SPEC.md`
- `docs/spec/TEST_MATRIX.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/MISCELLANEOUS_FIELDS.md`
