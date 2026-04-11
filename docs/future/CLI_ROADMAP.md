# Future Note: CLI Roadmap

## Status

- Step 1 first cut exists.
- Initial Step 2 MIDI pairs now exist as a first cut.
- Initial Step 3 MuseScore text pairs now exist as a first cut.
- Initial `render svg` support now exists as a first cut.
- This file tracks likely next-step expansion only.
- This is a future note, not a current normative contract.

## Current Step 1

Current implemented Step 1 scope:

- `mikuscore convert --from abc --to musicxml`
- `mikuscore convert --from musicxml --to abc`
- `mikuscore convert --from midi --to musicxml`
- `mikuscore convert --from musicxml --to midi`
- `mikuscore convert --from musescore --to musicxml`
- `mikuscore convert --from musicxml --to musescore`
- `mikuscore render svg`
- `mikuscore --help`
- `mikuscore convert --help`
- `mikuscore render --help`

Current Step 1 policy is defined in:

- `docs/spec/CLI_STEP1.md`

## Planned Direction

The CLI family is expected to grow along two tracks:

- convert-oriented commands
- render-oriented commands

`MusicXML` remains canonical underneath.

## Step 2 Candidate Scope

Implemented first-cut Step 2 additions:

- `mikuscore convert --from midi --to musicxml`
- `mikuscore convert --from musicxml --to midi`

Rationale:

- `midi` is a practical exchange format already supported by the application
- Step 1 already makes `musicxml` explicit as the canonical endpoint in `convert`

## Step 3 Candidate Scope

Implemented first-cut Step 3 additions:

- `mikuscore convert --from musescore --to musicxml`
- `mikuscore convert --from musicxml --to musescore`

Rationale:

- current CLI MuseScore scope is `.mscx`-style text; compressed `.mscz` handling is still outside the CLI contract
- `svg` is better modeled as render output, not as the same class of interchange export as `abc` / `musicxml` / `midi`

## Facade Growth Path

The non-UI CLI facade is expected to grow in this order:

### Step 1

- `importAbcToMusicXml(...)`
- `exportMusicXmlToAbc(...)`

### Step 2

- `normalizeMusicXml(...)`
- `importMidiToMusicXml(...)`
- `exportMusicXmlToMidi(...)`
- `importMuseScoreToMusicXml(...)`
- `exportMusicXmlToMuseScore(...)`

### Step 3

- `renderMusicXmlToSvg(...)`

`renderMusicXmlToSvg(...)` should remain in a render-oriented group, not a convert-oriented group.

## Non-Goals

The roadmap above does not imply:

- AI JSON CLI support
- patch/state CLI workflows
- note-level editing CLI commands
- forced parity with every UI button
