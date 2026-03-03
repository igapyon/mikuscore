# Product Positioning

## Summary

mikuscore is a MusicXML-centered score format converter.
It is not positioned as a full-featured notation editor.

## Target Use Cases

- Convert scores between MusicXML and other formats while minimizing notation loss.
- Keep round-trip behavior stable for practical workflows.
- Run conversion and verification in restricted/offline environments with a single HTML app.

## Value Proposition

- MusicXML-first architecture.
- Preservation-first conversion policy.
- Conversion diagnostics and metadata for traceability.
- Single-file web app distribution (`mikuscore.html`) with offline runtime.

## Non-goals

- Competing with feature-rich engraving editors in direct notation editing.
- Providing full parity for every advanced notation feature in all source formats.
- Replacing desktop notation authoring workflows end-to-end.

## Relationship with `docs/spec/*`

- This document explains product intent and boundaries.
- Normative technical behavior is defined in `docs/spec/*`.
