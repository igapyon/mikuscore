# Fixture Catalog

This directory contains MusicXML fixtures used by `tests/unit/core.spec.ts`.

## Files and Intended Test IDs

- `base.musicxml`
  - RT-0, RT-1, DR-1, TI-1, BF-1, IN-2, AT-1
- `underfull.musicxml`
  - IN-1
- `overfull.musicxml`
  - SV-2
- `with_rest.musicxml`
  - NK-1
- `with_unknown.musicxml`
  - PT-1
- `with_beam.musicxml`
  - BM-1
- `with_backup.musicxml`
  - BF-2
- `with_backup_safe.musicxml`
  - BF-5, BF-6
- `mixed_voices.musicxml`
  - BF-3
- `interleaved_voices.musicxml`
  - BF-4
- `inherited_attributes.musicxml`
  - TI-3
- `inherited_divisions_changed.musicxml`
  - TI-4
- `inherited_time_changed.musicxml`
  - TI-5
- `invalid_note_duration.musicxml`
  - SV-3
- `invalid_note_voice.musicxml`
  - SV-4

## Maintenance Rules

- Keep fixtures minimal and purpose-specific.
- Prefer adding a new fixture over mutating an existing one for a different behavior.
- Avoid changing unrelated nodes to preserve test intent readability.
