# SCREEN_SPEC

## English
## Purpose
Define the current screen specification for `mikuscore` based on the actual UI text and tooltips in `mikuscore-src.html`.

Scope note:

- This file is a screen text/layout inventory centered on actual UI copy.
- Normative UI behavior and interaction rules are defined in `docs/spec/UI_SPEC.md`.

## Global Layout
- Single-page application.
- Top brand header:
  - `mikuscore` title
  - `About mikuscore` info chip `(i)`
  - GitHub link
- 4-step tab navigation:
  - `Input`
  - `Score`
  - `Edit`
  - `Export`

### Brand Tooltip `(i)` (`About mikuscore`)
- Browser-based local score editor.
- Preserves existing MusicXML structure while editing.
- Supports loading MusicXML/ABC, score preview, note editing, playback, and export/download (`MusicXML`/`ABC`/`MIDI`) in one screen.
- Intentionally small feature set for practical, fast editing, especially on smartphones.
- Smartphone-centered, but usable on PCs as well.
- Workflow guidance:
  - `1) Choose input and load`
  - `2) Select from score preview`
  - `3) Edit notes`
  - `4) Verify by playback and export/download`
- Positioning guidance:
  - Use dedicated notation software for large-scale/complex work.
  - Use mikuscore for quick input or focused partial tasks.

## Tabs / Interaction
- Clicking a top tab opens the corresponding panel.
- Active tab is marked with `is-active`.
- Inactive panels use `hidden`.

## Panel: Input
### Section Title
- `1 Input`

### Header Tooltip `(i)` (`Input help`)
- Load score data first (from file/source) or create a new score.
- Supported file types: MusicXML (`.musicxml`, `.xml`, `.mxl`), ABC (`.abc`), MIDI (`.mid`, `.midi`).
- Move to `Score`/`Edit`/`Export` after this step.

### Input Type Radio
- `MusicXML Input`
- `ABC Input`
- `New Score`

### Import Mode Radio
- `File input`
- `Source input`

### Blocks
- `newInputBlock`
  - `Use Piano Grand Staff template (treble + bass, single part)`
  - `Track count (parts)`
  - `Time signature`
  - `Key signature`
  - Per-part clef selectors
- `fileInputBlock`
  - File picker (`Load from file`)
  - Selected file name text
- `sourceXmlInputBlock`
  - `MusicXML` textarea
- `abcInputBlock`
  - `ABC` textarea

### Actions
- `Load from file`
- `Load` (source mode)
- `Load sample 6`
- `Load sample 7`

### Messages
- `inputUiMessage` for inline status/error.
- `localDraftNotice` for local draft presence.

## Panel: Score
### Section Title
- `2 Score`

### Header Tooltip `(i)` (`Score preview help`)
- Check loaded score.
- Try quick playback.
- Select target measure for editing.
- Select a note in the target measure, then edit in `Edit`.

### Actions
- `Play`
- `Stop`
- `Add Measure (End)`

### Main Area
- `debugScoreArea` renders Verovio SVG score.
- Click handling maps SVG element id to internal `nodeId`.

### Status
- `playbackText` (default: `Playback: idle`).

## Panel: Edit
### Section Title
- `3 Edit`

### Header Tooltip `(i)` (`Edit help`)
- Start from converting a rest to a note.
- Adjust notes in the selected measure:
  - split
  - pitch
  - accidentals
  - duration
- Quick playback is available.
- `Apply` reflects edits back to `Score`.
- `Discard` cancels current measure edits.
- Arrow buttons move between measures.
- Editing scope is intentionally limited to avoid MusicXML structure breakage risk.

### Navigation / Context
- Selected part label (`measurePartNameText`).
- Measure navigation buttons:
  - previous in track (`←`)
  - next in track (`→`)
  - previous track same measure (`↑`)
  - next track same measure (`↓`)

### Empty State
- Title: `No measure selected`
- Body: `Click a measure in the score to select it`
- Action: `Go to Score`

### Selected Measure Area
- `measureEditorArea` Verovio preview for selected measure.
- Inline message area: `uiMessage`.

### Measure Commit Actions
- `Apply`
- `Discard`

### Note Editing Actions
- `Convert Rest to Note`
- `Split Note`
- `Delete Note`
- `Play` (measure playback)

### Pitch / Duration Controls
- Pitch step controls (`↑` / `↓`) with current step text.
- Accidental buttons:
  - `None`
  - `♭♭`
  - `♭`
  - `♮`
  - `♯`
  - `♯♯`
- Duration preset dropdown: `(Select duration)`

## Panel: Export
### Section Title
- `4 Export`

### Header Tooltip `(i)` (`Export help`)
- Take work out of mikuscore.
- Main flow is `MusicXML` export.
- `ABC` and lightweight `MIDI` export are for quick checks.
- Complex production/export should be handled in dedicated software.

### Export Actions
- `Export MusicXML` (primary)
- `Export ABC`
- `Export MIDI`
- `Discard Draft` (shown conditionally)

### Settings Card
- Accordion title: `MIDI & Playback Settings`

#### Block: `MIDI & Playback Shared Settings`
- `Grace Timing Mode`
  - options:
    - `Before beat (appoggiatura-like)`
    - `On beat (principal delayed)`
    - `Classical equal split`
  - tooltip: applies to MIDI-like playback and MIDI export.
- `Use metric beat accents` (switch)
  - tooltip:
    - adds subtle beat emphasis for MIDI-like playback/export
    - pattern examples:
      - `4/4: strong-weak-medium-weak`
      - `6/8: strong-weak-weak-medium-weak-weak`
      - `3-beat: strong-weak-weak`
      - `5-beat: strong-weak-medium-weak-weak`
      - `others: strong-weak-weak-...`
- `Accent amount`
  - options:
    - `Subtle`
    - `Balanced`
    - `Strong`
  - tooltip: controls velocity gap of metric accents when enabled.

#### Block: `MIDI Settings`
- `MIDI Export Instrument`
  - tooltip: used when MusicXML does not specify an instrument for the part.
- `Always override instrument` (switch)
  - tooltip: always override MusicXML instrument with selected export instrument.

#### Block: `Playback Settings`
- `Use MIDI-like playback` (switch)
  - tooltip: uses MIDI-style timing/expression in quick playback.
- `Quick Playback Tone`
  - options:
    - `Sine`
    - `Triangle`
    - `Square`

#### Settings Actions / Debug
- `Reset to defaults`
- Block: `MIDI Debug`
  - `Refresh MIDI Debug`
  - `midiDebugText` output area

#### Block: `General Settings`
- `Export MusicXML text as .xml extension` (switch, default OFF)
  - tooltip: default text export uses `.musicxml`; when enabled it uses `.xml`.
- `Compress MusicXML / MuseScore export` (switch)
  - tooltip: when enabled, MusicXML export uses `.mxl` and MuseScore export uses `.mscz`.
- Mutual exclusion rule:
  - if `.xml extension` switch is ON, compression is forced OFF.
  - if compression is turned ON, `.xml extension` switch is turned OFF.

### File Naming Policy
- MusicXML text: `mikuscore-YYYYMMDDhhmm.musicxml` (default) or `mikuscore-YYYYMMDDhhmm.xml` (when enabled)
- `mikuscore-YYYYMMDDhhmm.abc`
- `mikuscore-YYYYMMDDhhmm.mid`

## Diagnostics / UI Messaging
- `inputUiMessage` and `uiMessage` are used for inline feedback.
- Save/dispatch diagnostics are surfaced without rewriting core diagnostic code semantics.

## Non-goals
- Complex score-authoring workflows.
- Heavy multi-step modal workflows.
- Advanced history management in-screen (`undo`/`redo`).

---

## 日本語（抄訳）

- 正本は上記 English セクションです。
- 本セクションは画面仕様の要点のみを記載します。
- 例外として、未決定事項や検討中メモは日本語のみで記述する場合があります。

### 要点
- 本文書は `mikuscore-src.html` の画面文言・配置インベントリです。
- 規範的な UI 挙動は `docs/spec/UI_SPEC.md` を参照してください。
- 主要導線は `Input / Score / Edit / Export` の4パネルです。
- `MIDI & Playback Settings` と `General Settings` の詳細仕様は English セクションを参照してください。
