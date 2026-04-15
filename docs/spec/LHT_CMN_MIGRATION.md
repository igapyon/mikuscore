# LHT_CMN_MIGRATION

Last updated: 2026-03-07

This document records Phase 0 inventory for migrating mikuscore UI to `lht-cmn`.
Primary target file: `mikuscore-src.html`
Compatibility anchor: `src/ts/main.ts` DOM contracts (`id`, `name`, and event wiring).

## Inventory summary (Phase 0)

- Help tooltip groups (`md-tooltip-group`): 19
- `select.md-select`: 10
- `label.md-switch-label`: 10
- `textarea.md-textarea`: 6
- `input.md-input` (number fields in new-score form): 2
- Existing loading/status primitives:
  - `#fileLoadOverlay`
  - `#inputUiMessage`
  - `#uiMessage`
- Existing file-picker contracts:
  - `#fileInput`, `#fileSelectBtn`, `#fileNameText`
  - ZIP selector: `#zipEntrySelectBlock`, `#zipEntrySelect`

## Replacement mapping table

| Current pattern (mikuscore) | Candidate `lht-*` | Preserve IDs / contracts | Compatibility notes |
|---|---|---|---|
| Inline tooltip group (`.md-tooltip-group`, section help and settings help) | `lht-help-tooltip` | none required for tooltip wrapper itself | Replace duplicated icon/tooltip markup first; keep surrounding heading/label structure unchanged. |
| File chooser button + hidden file input + file name text | `lht-file-select` | `fileInput`, `fileSelectBtn`, `fileNameText` | Must keep current click and `change` flow used in `main.ts`; if component-generated IDs differ, migration is blocked. |
| Global file loading overlay (`#fileLoadOverlay`) | `lht-loading-overlay` | `fileLoadOverlay` | `setFileLoadInProgress` currently toggles `md-hidden` and `aria-hidden`; adapt to `active`/`setActive` without breaking behavior. |
| Inline UI message blocks (`#inputUiMessage`, `#uiMessage`) | `lht-error-alert` (+ optional `lht-toast`) | `inputUiMessage`, `uiMessage` | Existing code sets class names and text directly; either keep wrapper IDs or add adapter helper before replacing markup. |
| Source/new input textareas (`#xmlInput`, `#abcInput`, `#museScoreInput`, `#vsqxInput`, `#meiInput`, `#lilyPondInput`) | `lht-text-field-help` | all existing textarea IDs | Multi-line use requires `rows`; migration is low risk if IDs stay on generated field elements. |
| New-score numeric inputs (`#newPartCount`, `#newTimeBeats`) | `lht-text-field-help` | `newPartCount`, `newTimeBeats` | Keep numeric attributes (`min`, `max`, `step`) and live `input/change` listeners. |
| Existing selects in input/edit/output (`#newTimeBeatType`, `#newKeyFifths`, `#zipEntrySelect`, `#durationPreset`, `#graceTimingMode`, `#metricAccentProfile`, `#midiProgramSelect`, `#midiExportProfile`, `#midiImportQuantizeGrid`, `#playbackWaveform`) | `lht-select-help` | all listed IDs | For `#zipEntrySelect`, options are populated dynamically by JS; ensure runtime option append still works after component conversion. |
| Switch rows (`#newTemplatePianoGrandStaff`, `#keepMksMetaMetadataInMusicXml`, `#keepMksSrcMetadataInMusicXml`, `#keepMksDbgMetadataInMusicXml`, `#exportMusicXmlAsXmlExtension`, `#compressXmlMuseScoreExport`, `#metricAccentEnabled`, `#midiImportTripletAware`, `#forceMidiProgramOverride`, `#playbackUseMidiLike`) | `lht-switch-help` | all listed switch IDs | Event wiring is direct (`change` listeners in `main.ts`); keep `checked`/`disabled` semantics identical. |
| Hero/header block at top of page | `lht-page-hero` (later phase) | no direct ID dependency today | Defer to later phase to avoid layout regressions in tab header and GitHub link area. |
| Optional page menu | `lht-page-menu` (if needed) | none currently | Not mandatory for current functionality; only adopt if it simplifies future multi-page consistency. |

## Risk classification for migration order

1. Low risk
- Tooltip-only replacement (`lht-help-tooltip`)
- Overlay and status primitives (`lht-loading-overlay`, `lht-error-alert`, `lht-toast`) with adapter layer

2. Medium risk
- Text fields and most selects/switches with strict ID preservation

3. High risk
- File picker and ZIP entry selector (tight coupling with current event flow and dynamic option handling)
- Hero/page-frame normalization (`lht-page-hero`) due to layout coupling

## Non-negotiable constraints

- Do not change `lht-cmn/js/components.js` or `lht-cmn/css/components.css` without explicit user approval.
- Keep all `src/ts/main.ts` element lookup contracts valid during every migration step.
- Migrate in small, verifiable slices and run UI regression checks after each slice.
