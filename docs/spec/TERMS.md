# Terms and Scope (MVP)

## Purpose

Normative terms and MVP scope boundaries.

Scope note:

- This file is a glossary/scope index.
- Normative behavior details are defined in:
  - `docs/spec/SPEC.md`
  - `docs/spec/COMMAND_CATALOG.md`
  - `docs/spec/DIAGNOSTICS.md`

## Language Policy

- English text is the normative source unless explicitly noted otherwise.
- Japanese sections are abridged translations for readability.
- Exception: for undecided points or in-progress notes, Japanese-only entries MAY be used temporarily.

## Normative Keywords

- `MUST`: required
- `MUST NOT`: prohibited
- `MAY`: optional

## Core Terms

- `Core`: non-UI engine for MusicXML load/edit/save guarantees.
- `UI`: interaction/render layer; MUST NOT mutate score DOM directly.
- `Command voice`: voice ID carried by each edit command; MUST match target note voice.
- `Dirty`: successful content-changing edit has occurred.
- `No-op save`: `dirty === false`, returns original XML text unchanged.

## MVP In Scope (Summary)

- DOM-preserving load/edit/save.
- Commands whose voice matches the target note voice.
- Overfull rejection / underfull warning model.
- Verovio click-to-select mapping.
- Split-note command (`split_note`).
- Rest-to-note conversion via `change_to_pitch`.

## MVP Out of Scope (Summary)

- Full automatic notation repair across arbitrary contexts.
- Cross-voice/global structural reflow.
- Global beam normalization.
- Textually identical output guarantee after dirty save.
