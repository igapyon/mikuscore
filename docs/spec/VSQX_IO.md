# VSQX I/O Specification

## Purpose

This document defines the current public behavior of `src/ts/vsqx-io.ts`.

VSQX support is a surrounding singing/vocal timing format path backed by the
vendored `utaformatix3-ts-plus` integration. It is not a general notation
format and should not be treated as equivalent to MuseScore, MEI, ABC, or
LilyPond.

VSQX import/export is centered on canonical MusicXML as defined in
`docs/spec/CANONICAL_MUSICXML.md` and classified in
`docs/spec/FORMAT_MAPPING.md`.
Conversion diagnostic policy is defined in
`docs/spec/CONVERSION_DIAGNOSTICS.md`.

## Public API

- `isVsqxBridgeAvailable(): boolean`
- `installVsqxMusicXmlNormalizationHook(normalizeImportedMusicXmlText): void`
- `convertVsqxToMusicXml(vsqxText, options): VsqxToMusicXmlResult`
- `convertMusicXmlToVsqx(musicXmlText, options): MusicXmlToVsqxResult`

### Import Options

- `defaultLyric?: string`

### Export Options

- `musicXml.defaultLyric?: string`
- `splitPartStaves?: boolean`

## Runtime Boundary

The current bridge is browser-global and provided by
`src/vendor/utaformatix3/utaformatix3-ts-plus.mikuscore.iife.js`.

The expected global is:

- `window.UtaFormatix3TsPlusMikuscore`

The integration guide is:

- `docs/integrations/utaformatix3-ts-plus.mikuscore.iife.js.md`

The bridge dependency means VSQX behavior belongs to a thin adapter around the
vendored runtime. Product-level MusicXML normalization and diagnostics should
remain visible on the miku-score side.

## Import (`VSQX -> MusicXML`)

The importer calls the bridge `convertVsqxToMusicXmlWithReport` operation and
returns:

- `ok`
- `xml`
- `diagnostics`
- `warnings`

Bridge report issues with level `error` become diagnostics. Bridge report
issues with level `warning` or `info` become warnings.

The importer fails when:

- the bridge is unavailable
- the bridge returns an empty MusicXML result
- bridge issues include errors

## Export (`MusicXML -> VSQX`)

The exporter calls the bridge `convertMusicXmlToVsqx` operation and returns:

- `ok`
- `vsqx`
- `diagnostic` when export failed

The exporter fails when:

- the bridge is unavailable
- the bridge returns empty output
- the bridge throws

## Stable Diagnostic Codes

Current stable adapter diagnostics:

| Code | Meaning |
|---|---|
| `VSQX_BRIDGE_UNAVAILABLE` | VSQX converter bundle is not loaded |
| `VSQX_CONVERT_EMPTY_RESULT` | VSQX import returned empty MusicXML |
| `VSQX_EXPORT_EMPTY_RESULT` | MusicXML export returned empty VSQX |
| `VSQX_EXPORT_FAILED` | MusicXML to VSQX conversion threw or failed |
| `VSQX_CONVERT_ERROR_N` | Bridge import report contained an error issue |
| `VSQX_CONVERT_WARNING_N` | Bridge import report contained a warning/info issue |

## Mapping Policy

VSQX is treated as a vocal/timing source.

Current mapping confidence:

- pitch/timing material may become MusicXML notes, rests, measures, and tempo
- lyrics may use a default lyric when needed
- singer settings, phoneme-level details, vocal expression controls, synthesis
  parameters, and automation are not current canonical MusicXML guarantees
- unsupported VSQX-only data should become diagnostics or source metadata if
  preserved later

## CLI Status

VSQX Web import/export exists through the bridge-backed adapter. CLI support is
not a normal non-browser callable path yet because the current bridge shape is
browser-oriented.

The preferred follow-up is to stabilize an upstream non-browser callable
entrypoint or equivalent runtime shape before adding CLI conversion pairs.
Avoid implementing VSQX product semantics in Agent Skills or CLI wrapper code
as a workaround.

## Related Tests

- `tests/unit/vsqx-io.spec.ts`
- `tests/unit/load-flow.spec.ts`
- `tests/unit/cffp-series.spec.ts`
