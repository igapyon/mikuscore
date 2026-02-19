# MIDI I/O Specification

## Purpose

This document defines the behavior of `src/ts/midi-io.ts`.

The module is responsible for:

- building playback events from MusicXML
- collecting tempo/control/program metadata from MusicXML
- building MIDI bytes from normalized playback events

---

## Public API

### Types

- `PlaybackEvent`
- `MidiControlEvent`
- `MidiTempoEvent`
- `MidiProgramPreset`
- `MidiProgramOverrideMap`
- `GraceTimingMode = "before_beat" | "on_beat" | "classical_equal"`

### Functions

- `collectMidiProgramOverridesFromMusicXmlDoc(doc)`
- `collectMidiControlEventsFromMusicXmlDoc(doc, ticksPerQuarter)`
- `collectMidiTempoEventsFromMusicXmlDoc(doc, ticksPerQuarter)`
- `buildMidiBytesForPlayback(events, tempo, programPreset, trackProgramOverrides, controlEvents, tempoEvents)`
- `buildPlaybackEventsFromMusicXmlDoc(doc, ticksPerQuarter, options)`
- `buildPlaybackEventsFromXml(xml, ticksPerQuarter)`

---

## buildPlaybackEventsFromMusicXmlDoc

### Options

- `mode?: "playback" | "midi"` (default: `"playback"`)
- `graceTimingMode?: GraceTimingMode` (default: `"before_beat"`)
- `metricAccentEnabled?: boolean` (default: `false`)

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

Velocity deltas are subtle and additive:

- strong: `+2`
- medium: `+1`
- weak: `+0`

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

