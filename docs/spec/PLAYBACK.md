# Playback Specification

## Purpose

This document defines playback-related behavior exposed by:

- `src/ts/playback.ts` (public re-export surface)
- `src/ts/playback-flow.ts` (runtime playback flow and synth engine)

---

## Module boundary

## `src/ts/playback.ts`

`playback.ts` is a thin facade that re-exports MIDI-derived playback primitives from `midi-io.ts`.

Exports:

- `buildMidiBytesForPlayback`
- `buildPlaybackEventsFromMusicXmlDoc`
- `buildPlaybackEventsFromXml`
- `PlaybackEvent` type

This file MUST remain side-effect free.

## `src/ts/playback-flow.ts`

`playback-flow.ts` owns:

- quick playback runtime (Web Audio synth)
- conversion of parsed playback events into synth schedule
- orchestration of save -> parse -> event build -> play

---

## Core constants and types

- `PLAYBACK_TICKS_PER_QUARTER = 128`
- `SynthSchedule`
  - `tempo`
  - optional `tempoEvents`
  - optional `pedalRanges`
  - `events[]` (`midiNumber`, `start`, `ticks`, `channel`)
- `BasicWaveSynthEngine`
  - `unlockFromUserGesture()`
  - `playSchedule(schedule, waveform, onEnded?)`
  - `stop()`

---

## BasicWaveSynthEngine behavior

## Audio context handling

- MUST lazily initialize `AudioContext`.
- MUST support `webkitAudioContext` fallback.
- MUST return `false` from `unlockFromUserGesture` if context cannot run.
- MUST throw on playback when Web Audio API is unavailable.

## Scheduling

- Start with small lead time (`currentTime + 0.04`) to avoid onset clipping.
- Convert MIDI note numbers with 12-TET formula (`A4=440Hz`).
- Apply short attack/release envelope to avoid clicks.
- Drum channel (`10`) uses lower gain than melodic channels.

## Tempo map

- If `tempoEvents` exist, they MUST drive tick->seconds conversion.
- If not provided, fallback to `schedule.tempo` at tick 0.
- Tempo events at the same tick are merged (last value wins).

## Pedal support

- `toSynthSchedule` extracts CC64 events into pedal ranges.
- While pedal is held, synth note release is extended.

## Stop semantics

- `stop()` MUST clear pending stop timer and terminate active synth nodes.
- Cleanup errors during node stop/disconnect are ignored by design.

---

## Playback flow orchestration

## startPlayback

1. Save current score.
2. Parse saved MusicXML.
3. Resolve playback mode:
   - `playback`
   - `midi` (when MIDI-like playback is enabled)
4. Build events via `buildPlaybackEventsFromMusicXmlDoc`.
5. Build optional tempo/control streams for MIDI-like mode.
6. Build MIDI bytes (diagnostic parity and validation path).
7. Convert to synth schedule and start playback.

On failure, status text MUST be updated and playback MUST not start.

## startMeasurePlayback

Same policy as `startPlayback`, but uses draft measure core (`draftCore`).

## stopPlayback

- Delegates to engine `stop()`
- Resets play state and status text

---

## Interaction with MIDI nuance options

When flow invokes `buildPlaybackEventsFromMusicXmlDoc`, it forwards:

- `mode`
- `graceTimingMode`
- `metricAccentEnabled`
- `metricAccentProfile`

Therefore quick playback in MIDI-like mode MUST reflect the same nuance policy as MIDI export for those options.

---

## Error and diagnostics policy

- Save failure diagnostics are surfaced through playback status text.
- Overfull diagnostics can trigger debug XML dump via provided callback.
- Playback flow logs diagnostic details in debug path only.

---

## Test coverage summary

Current unit tests validate:

- AudioContext bootstrap fallback behavior
- graceful failure without Web Audio API
- tempo-map-based scheduling
- pedal-based release extension

(See `tests/unit/playback-flow.spec.ts`.)
