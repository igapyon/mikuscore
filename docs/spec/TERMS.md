# Terms and Scope (MVP)

## Purpose

This document defines normative terms and MVP scope boundaries used by `SPEC.md`.

## Normative Keywords

- `MUST`: required for conformance
- `MUST NOT`: prohibited
- `SHALL`: equivalent to MUST in this project
- `MAY`: optional behavior

## Core Terms

- `Core`: the non-UI engine responsible for MusicXML load/edit/save guarantees.
- `UI`: selection/cursor/input/render layer. It MUST NOT mutate XML DOM directly.
- `Editable voice`: the voice ID allowed to be edited in MVP (default: `1`).
- `Non-editable voice`: any voice other than editable voice in MVP.
- `Dirty`: internal state indicating successful content-changing edit has occurred.
- `No-op save`: save when `dirty === false`; returns original XML text unchanged.
- `Continuous region` (beam): same part/measure/voice, beam-eligible notes only, continuous in time with no rest and no backup/forward boundary.

## MVP In Scope

- Load MusicXML text into DOM while preserving unknown elements.
- Edit operations limited to supported commands on editable voice.
- Save behavior with no-op optimization and serializer fallback.
- Measure time integrity validation (overfull reject / underfull allow).
- Preservation policy for existing `<beam>`, `<backup>`, `<forward>`.

## MVP Out of Scope

- Full automatic notation repair (rest fill, note split, tie insertion).
- Cross-voice structural reflow.
- Rewriting backup/forward structure.
- Global beam normalization.
- Guarantee of textual equivalence after content-changing edits.
