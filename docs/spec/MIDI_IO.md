# MIDI I/O Specification

## Purpose

This document defines the behavior of `src/ts/midi-io.ts`.

The module is responsible for:

- building playback events from MusicXML
- collecting tempo/control/program metadata from MusicXML
- building MIDI bytes from normalized playback events
- converting MIDI binary input (SMF) into MusicXML (MVP import path)

---

## Public API

### Types

- `PlaybackEvent`
- `MidiControlEvent`
- `MidiTempoEvent`
- `MidiProgramPreset`
- `MidiProgramOverrideMap`
- `GraceTimingMode = "before_beat" | "on_beat" | "classical_equal"`
- `MetricAccentProfile = "subtle" | "balanced" | "strong"`

### Functions

- `collectMidiProgramOverridesFromMusicXmlDoc(doc)`
- `collectMidiControlEventsFromMusicXmlDoc(doc, ticksPerQuarter)`
- `collectMidiTempoEventsFromMusicXmlDoc(doc, ticksPerQuarter)`
- `buildMidiBytesForPlayback(events, tempo, programPreset, trackProgramOverrides, controlEvents, tempoEvents)`
- `buildPlaybackEventsFromMusicXmlDoc(doc, ticksPerQuarter, options)`
- `buildPlaybackEventsFromXml(xml, ticksPerQuarter)`
- `convertMidiToMusicXml(midiBytes, options)` (planned/import path)

---

## buildPlaybackEventsFromMusicXmlDoc

### Options

- `mode?: "playback" | "midi"` (default: `"playback"`)
- `graceTimingMode?: GraceTimingMode` (default: `"before_beat"`)
- `metricAccentEnabled?: boolean` (default: `false`)
- `metricAccentProfile?: MetricAccentProfile` (default: `"subtle"`)

### Mode policy

- `mode="playback"`:
  - plain scheduling oriented for quick playback
  - no MIDI nuance-specific adjustments
- `mode="midi"`:
  - enables articulation/slur/tie/grace nuance logic
  - used by MIDI-like playback and MIDI export paths

---

## Timing and duration rules (midi mode)

### Articulation

- `strong-accent` and `accent` increase velocity
- `staccatissimo` and `staccato` shorten duration
- `tenuto` prevents shortening and enables legato-like behavior

### Default detache

- For normal notes, subtle implicit shortening is applied:
  - `DEFAULT_DETACHE_DURATION_RATIO = 0.93`
- This is NOT applied when:
  - grace
  - chord notes
  - note under slur
  - tied note (`start`/`stop`)
  - tenuto
  - explicit shortening articulation

### Slur/Tie

- tie chains are merged by `(voice, channel, midiNumber)`
- slur context enables slight overlap for legato continuity

### Temporal expressions

- fermata and caesura can extend note duration and inject post-pause shift

---

## Grace timing modes

When pending grace notes exist before a principal note in `mode="midi"`:

1. `before_beat`
- grace notes are placed before the principal start tick
- principal tick remains at beat location

2. `on_beat`
- grace notes start on the beat
- principal note is delayed by consumed grace time

3. `classical_equal`
- grace + principal are split into equal segments within the principal span
- principal starts after grace segments

---

## Metric beat accents

Enabled only when:

- `mode="midi"`
- `metricAccentEnabled=true`

Velocity deltas are additive and profile-dependent:

- `subtle`: strong `+2`, medium `+1`, weak `+0`
- `balanced`: strong `+4`, medium `+2`, weak `+0`
- `strong`: strong `+6`, medium `+3`, weak `+0`

Pattern table:

1. `4/4`: strong, weak, medium, weak
2. `6/8`: strong, weak, weak, medium, weak, weak
3. `3/x` (3-beat): strong, weak, weak
4. `5/x` (5-beat): strong, weak, medium, weak, weak
5. others: strong, weak, weak, ...

---

## Tempo/control/program extraction

### Program overrides

- read from `part-list > score-part > midi-instrument > midi-program`
- first valid program per part is used

### Control events

- pedal markings are mapped to CC64 events
- supports `start/continue/resume`, `change`, `stop`

### Tempo events

- extracted from `sound[tempo]` and metronome marks
- normalized and deduplicated by tick
- always includes a tick-0 event

---

## MIDI byte building

`buildMidiBytesForPlayback`:

- groups events by trackId
- writes a dedicated tempo map track
- applies per-track program overrides when provided
- writes note events with explicit `startTick`
- writes per-channel CC tracks (e.g., pedal)
- returns `Uint8Array`

If no playable note events exist, the function MUST throw an error.

### Custom MIDI writer (raw SMF writer)

The module includes a built-in raw SMF Type-1 writer path in addition to `midi-writer.js`.

#### Entry points

- `buildMidiBytesForPlayback(..., options)` with:
  - `rawWriter?: boolean`
  - `rawRetriggerPolicy?: "off_before_on" | "on_before_off" | "pitch_order"`
- internal implementation:
  - `buildRawMidiBytesForPlayback(...)`
  - `encodeRawTrackChunk(...)`

#### Output structure

- `MThd`:
  - format: `1`
  - track count: computed from generated tracks
  - division: `ticksPerQuarter`
- `MTrk #1` (meta track):
  - tempo meta (`FF 51`)
  - time signature meta (`FF 58`)
  - key signature meta (`FF 59`)
  - optional mikuscore SysEx chunks
- `MTrk #N` (note tracks by `trackId`):
  - program change per used channel (except ch10)
  - note-on / note-off events
- additional CC tracks:
  - grouped by `(trackId, channel)` for controller streams

#### Retrigger order policy

For same-tick same-pitch situations, event ordering is configurable:

- `off_before_on`:
  - note-off is emitted before note-on at the same tick
  - default and recommended for stable retrigger behavior
- `on_before_off`:
  - note-on before note-off
  - retained for parity experiments
- `pitch_order`:
  - same order bucket, sorted by pitch key
  - retained for parity experiments

#### Current usage policy

- `safe` export profile:
  - TPQ defaults to `480`
  - default writer path (`midi-writer.js`)
- `musescore_parity` profile:
  - TPQ is fixed to `480`
  - raw writer path enabled
  - retrigger policy defaults to `off_before_on`

#### Known constraints

- raw writer currently targets deterministic export parity behavior, not full DAW-grade rendering semantics.
- parity quality still depends on import quantization and note pairing rules in `convertMidiToMusicXml`.

---

## MIDI binary import to MusicXML (MVP)

### Scope

The import target is Standard MIDI File (SMF) binary input:

- supported SMF formats: `0` and `1`
- supported time division: PPQ only (`ticks per quarter note`)
- SMPTE time division is unsupported in MVP

Output format:

- MusicXML `score-partwise` (MusicXML 4.0)

### Note pairing policy (import)

- Pairing unit is `(channel, midiNoteNumber)`.
- For same-pitch retriggers, `note-off` MUST pair with the oldest unmatched `note-on` (FIFO).
- This avoids order-dependent duration drift when equivalent streams differ only by same-tick event order (`on->off` / `off->on`).

### Quantization policy

- default quantization grid is `1/16`
- quantization grid options: `1/8 | 1/16 | 1/32`
- default option value MUST be `1/16`

For `TPQ` (ticks-per-quarter), quantization tick is:

- `qTick = TPQ / subdivision`
- subdivision: `2` for `1/8`, `4` for `1/16`, `8` for `1/32`

Start/end quantization:

- `startQ = round(start / qTick) * qTick`
- `endQ = round(end / qTick) * qTick`
- `durationQ = max(qTick, endQ - startQ)`

### Part/channel mapping

- non-drum channels are mapped by MIDI channel
- `MIDI channel 10` is ALWAYS mapped to a dedicated drum part
- drum part is never merged with melodic parts
- drum part MUST preserve `midi-channel=10` in `midi-instrument`

### Polyphony policy (auto voice split)

The MVP import uses `auto voice split` (high-quality path), not simplify-first mode.

Rules:

1. work per part (channel-grouped; drum part handled separately)
2. treat each quantized note as an interval `[startTick, endTick)`
3. same-start notes form a chord cluster
4. assign each cluster to the smallest available voice index without overlap
5. when multiple voices are available, prefer continuity (smaller start-gap, then smaller pitch jump)
6. renumber voices to contiguous `1..N` for output
7. emit measure content with valid MusicXML timing structure (`backup` / `forward` as needed)

### Musical metadata mapping

- `program_change` -> `part-list/score-part/midi-instrument/midi-program`
- tempo meta -> direction/sound tempo (measure-aligned)
- time signature meta -> `attributes/time`
- key signature meta (when available) -> `attributes/key`

### Debug metadata default policy

- `convertMidiToMusicXml` option `debugMetadata` default is `true`.
- this default MUST be kept `true` until the next major version upgrade.
- changing this default before the next major version is not allowed.

### Incident analysis using `miscellaneous-field`

When analyzing rendering/import issues, inspect:

- `part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:midi-meta-count"]`
- `part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:midi-meta-"]`

Recommended flow:

1. identify the problematic measure and note on screen.
2. open the same measure in MusicXML and read `mks:midi-meta-*`.
3. compare note duration/type and debug payload (`key`, `vel`, `sd`, `dd`, `tk0`, `tk1`) to detect where conversion diverged.

### Drum note rendering

For channel 10 output:

- use unpitched-oriented representation
- preserve pitch number as the sounding MIDI note basis
- if display pitch is required, use best-effort fallback mapping

### Diagnostics (planned)

MVP import path SHOULD expose diagnostics for loss/normalization decisions:

- `MIDI_UNSUPPORTED_DIVISION`
- `MIDI_NOTE_PAIR_BROKEN`
- `MIDI_QUANTIZE_CLAMPED`
- `MIDI_EVENT_DROPPED`
- `MIDI_POLYPHONY_VOICE_ASSIGNED`
- `MIDI_POLYPHONY_VOICE_OVERFLOW`
- `MIDI_DRUM_CHANNEL_SEPARATED`
- `MIDI_DRUM_NOTE_UNMAPPED`
