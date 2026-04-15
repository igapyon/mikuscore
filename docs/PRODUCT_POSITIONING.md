# Product Positioning

## Summary

mikuscore is a MusicXML-first score converter for moving score data between formats.
It is not positioned as a score editor, and it does not try to replace dedicated notation editors such as MuseScore.

## Target Use Cases

- Move score data from one format to another while keeping MusicXML as the semantic center.
- Normalize score data around MusicXML for downstream editing, exchange, or archival workflows.
- Bridge notation tools, exchange formats, and AI-oriented handoff flows.
- Run conversion and verification in restricted or offline environments with a single HTML app.

## Value Proposition

- MusicXML-first architecture.
- Preservation-first conversion policy.
- Conversion diagnostics and metadata for traceability.
- Single-file web app distribution (`mikuscore.html`) with offline runtime.
- Clear separation of roles: use notation editors for editing, use mikuscore for conversion and handoff.

## Non-goals

- Competing with feature-rich engraving editors in direct notation editing.
- Providing full parity for every advanced notation feature in all source formats.
- Replacing desktop notation authoring workflows end-to-end.
- Acting as a general-purpose notation editor with deep interactive editing features.

## Relationship with `docs/spec/*`

- This document explains product intent and boundaries.
- Normative technical behavior is defined in `docs/spec/*`.
