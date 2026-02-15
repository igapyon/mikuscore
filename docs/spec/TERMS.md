# Terms and Scope (MVP)

## Purpose

Normative terms and MVP scope boundaries.

## Normative Keywords

- `MUST`: required
- `MUST NOT`: prohibited
- `MAY`: optional

## Core Terms

- `Core`: non-UI engine for MusicXML load/edit/save guarantees.
- `UI`: interaction/render layer; MUST NOT mutate score DOM directly.
- `Editable voice`: editable voice ID (default `1`).
- `Dirty`: successful content-changing edit has occurred.
- `No-op save`: `dirty === false`, returns original XML text unchanged.

## MVP In Scope

- DOM-preserving load/edit/save.
- Commands on editable voice.
- Overfull rejection / underfull warning model.
- Verovio click-to-select mapping.
- Split-note command (`split_note`).
- Rest-to-note conversion via `change_to_pitch`.

## MVP Out of Scope

- Full automatic notation repair across arbitrary contexts.
- Cross-voice/global structural reflow.
- Global beam normalization.
- Textually identical output guarantee after dirty save.
