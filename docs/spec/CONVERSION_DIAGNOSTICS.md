# Conversion Diagnostics

## Purpose

This document defines the conversion-diagnostics policy for mikuscore import
and export paths.

It is separate from `docs/spec/DIAGNOSTICS.md`, which is the core bounded-edit
diagnostics catalog. Conversion diagnostics describe format I/O behavior:
unsupported input, approximation, repair, dropped events, inferred metadata,
fallbacks, and bridge/runtime failures.

## Diagnostic Layers

| Layer | Document | Scope |
|---|---|---|
| Core edit diagnostics | `docs/spec/DIAGNOSTICS.md` | `ScoreCore` command/save validity and atomicity |
| Conversion diagnostics | this document | Format import/export loss, repair, fallback, and runtime failures |
| CLI diagnostics | `docs/spec/CLI_DIAGNOSTICS_FIRSTCUT.md` | Command execution, stdio, exit status, and machine-readable wrapper shape |
| Stored metadata | `docs/spec/MISCELLANEOUS_FIELDS.md` | `mks:diag:*` storage inside MusicXML `miscellaneous-field` |

The layers may wrap each other, but they should not replace each other. For
example, CLI JSON diagnostics may contain conversion warning codes, and
MusicXML may store conversion warnings in `mks:diag:*`.

## Stability Rule

A conversion diagnostic code is stable when it is one of these:

- documented in this file
- asserted by tests as a `code`
- emitted into `mks:diag:*`
- part of a public result object used by Web, CLI, or Agent Skills

Stable codes SHOULD NOT be renamed casually. If a code needs replacement,
document the replacement and keep compatibility until callers can migrate.

Human-readable `message` text is not stable unless a format-specific spec says
otherwise.

## Severity

Use these levels:

- `info`
  - successful fallback, inserted default, or non-lossy normalization worth
    surfacing to automation
- `warn`
  - import/export succeeded, but data was inferred, approximated, repaired,
    skipped, clamped, split, or otherwise changed in a way that may matter
- `error`
  - import/export failed or should fail

`mks:diag:*` payloads SHOULD use the same `level` values.

## Payload Shape

Structured diagnostics SHOULD use these fields when available:

- `level`
- `code`
- `fmt`
- `stage`
- `message`
- `part`
- `measure`
- `staff`
- `voice`
- `event`
- `action`

Additional format-specific fields are allowed when they are stable enough for
debugging or agent workflows, such as `sourceTicks`, `capacityTicks`,
`droppedEvents`, `droppedTicks`, `trimmedEvents`, `trimmedTicks`,
`movedEvents`, `channel`, `track`, `tick`, or `grid`.

## Current Stable Codes

### ABC

| Code | Level | Meaning |
|---|---|---|
| `ABC_IMPORT_WARNING` | warn | Non-fatal ABC import warning, including unsupported syntax, skipped compatibility fragments, fallback defaults, or recoverable parse issues |

Current ABC warning messages are more specific than the code. They are useful
for humans, but callers should treat `ABC_IMPORT_WARNING` as the stable code
until narrower codes are promoted.

### MIDI

| Code | Level | Meaning |
|---|---|---|
| `MIDI_INVALID_FILE` | error | MIDI input is not a valid Standard MIDI File or is structurally unreadable |
| `MIDI_UNSUPPORTED_FORMAT` | error | MIDI file format is unsupported |
| `MIDI_UNSUPPORTED_DIVISION` | error | MIDI time division is unsupported, such as SMPTE division |
| `MIDI_NOTE_PAIR_BROKEN` | warn | Note-on / note-off pairing could not be completed cleanly |
| `MIDI_QUANTIZE_CLAMPED` | warn | Quantization clamped or adjusted timing to keep a valid notation event |
| `MIDI_EVENT_DROPPED` | warn | MIDI event was dropped because it is unsupported, malformed, or outside current scope |
| `MIDI_TIME_SIGNATURE_PICKUP_NORMALIZED` | warn | Leading time-signature/pickup information was normalized into a canonical pickup measure |
| `MIDI_KEY_SIGNATURE_INFERRED` | warn | Key signature was inferred because MIDI did not provide a usable key meta event |
| `MIDI_POLYPHONY_VOICE_ASSIGNED` | warn | Overlapping notes required automatic voice assignment |
| `MIDI_POLYPHONY_VOICE_OVERFLOW` | warn | Polyphony exceeded the current voice assignment capacity or policy |
| `MIDI_DRUM_CHANNEL_SEPARATED` | warn | MIDI channel 10 was separated into a dedicated drum part |
| `MIDI_DRUM_NOTE_UNMAPPED` | warn | Drum note could not be mapped to a known unpitched notation representation |

Current MIDI export also emits `info`-level metadata strings for inserted
default tempo, time signature, and key signature. Those are useful but not yet
promoted here as stable public conversion codes.

### MuseScore

| Code | Level | Meaning |
|---|---|---|
| `MUSESCORE_IMPORT_WARNING` | warn | Non-fatal MuseScore import warning, usually unknown or unsupported input that could be skipped while preserving usable musical structure |

MuseScore currently uses a broad stable warning code with message details.
Promote narrower codes only when callers need machine-readable branching.

### MEI

| Code | Level | Meaning |
|---|---|---|
| `OVERFULL_CLAMPED` | warn | MEI import detected overfull layer/staff content and clamped, trimmed, or dropped material to produce valid canonical MusicXML |

`OVERFULL_CLAMPED` is currently stored in `mks:diag:*` payloads with MEI
context fields such as `measure`, `staff`, `sourceTicks`, `capacityTicks`,
`droppedEvents`, `droppedTicks`, `trimmedEvents`, and `trimmedTicks`.

Future MEI work should prefer `MEI_*` codes for new warnings unless the code is
intentionally shared across formats.

### LilyPond

| Code | Level | Meaning |
|---|---|---|
| `LILYPOND_IMPORT_WARNING` | warn | Non-fatal LilyPond import warning, including unsupported commands/tokens, overfull handling, skipped chords/notes, or other bounded degradation |
| `LILYPOND_EXPORT_WARNING` | warn | Non-fatal LilyPond export warning, including skipped malformed or unsupported MusicXML material |

LilyPond currently uses broad warning codes with specific message text.

### VSQX

| Code | Level | Meaning |
|---|---|---|
| `VSQX_BRIDGE_UNAVAILABLE` | error | VSQX converter bundle is not loaded |
| `VSQX_CONVERT_EMPTY_RESULT` | error | VSQX import returned empty MusicXML |
| `VSQX_EXPORT_EMPTY_RESULT` | error | MusicXML export returned empty VSQX |
| `VSQX_EXPORT_FAILED` | error | MusicXML to VSQX conversion threw or failed |
| `VSQX_CONVERT_ERROR_N` | error | Bridge import report contained an error issue |
| `VSQX_CONVERT_WARNING_N` | warn | Bridge import report contained a warning/info issue |

The numbered VSQX bridge codes preserve the bridge issue order. Callers should
use the code prefix when they do not need item-specific ordering.

## Promotion Rules

Promote a broad warning into narrower stable codes when at least one is true:

- Agent Skills or CLI callers need different recovery behavior.
- A warning needs to be counted or filtered separately in JSON diagnostics.
- A warning appears in `mks:diag:*` and should be stable across releases.
- A focused CFFP policy depends on distinguishing the warning from other
  warnings in the same format.

Do not promote one-off debug messages into stable codes just because they are
useful during local investigation.

## Relationship to `mks:diag:*`

When a conversion diagnostic is stored in MusicXML, use
`miscellaneous-field[name="mks:diag:NNNN"]` with a semicolon-delimited payload.

Recommended key order:

```text
level;code;fmt;stage;part;measure;staff;voice;event;action;message
```

Add numeric context fields after those common keys.

Stored diagnostics should be concise. Raw source data belongs under
`mks:src:*`, and volatile tracing belongs under `mks:dbg:*`.

## Non-Goals

Conversion diagnostics do not provide a complete musicological diff.

They should make important loss, repair, approximation, unsupported behavior,
and runtime failures visible enough for humans, scripts, and Agent Skills to
avoid treating incomplete conversion as complete.
