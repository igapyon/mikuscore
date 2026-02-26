# Format I/O Common Checklist

## Purpose

When adding a new format (e.g. ABC / MEI / future formats), use this checklist to ensure consistent quality and behavior across import/export paths.

---

## 1. Scope and Policy

- [ ] Define initial scope clearly:
  - Import only / Export only / both
  - Supported notation subset (note/rest/chord/tuplet/ornament/etc.)
  - Explicit out-of-scope items for first release
- [ ] Define degradation policy:
  - What must be preserved
  - What may degrade
  - What is rejected with diagnostics

---

## 2. Import (Format -> MusicXML)

- [ ] Parser/decoder handles invalid input safely (no crash, diagnostic returned)
- [ ] Generated MusicXML is valid XML and parseable by existing loader
- [ ] Output MusicXML is pretty-printed (human-readable)
- [ ] Apply only bounded structural normalization required for loader/renderer interoperability:
  - [ ] Allowed example: synthesize missing `part-list` and `part/@id` / `score-part/@id` linkage when absent
  - [ ] Forbidden example: global musical reflow or cross-voice reconstruction unrelated to import boundary
- [ ] Basic musical structure is reconstructed:
  - [ ] part / measure
  - [ ] attributes (divisions/key/time/clef as available)
  - [ ] note/rest/chord
  - [ ] voice/staff handling policy
- [ ] Metadata mapping policy is defined and implemented:
  - [ ] title
  - [ ] tempo
  - [ ] key/time/transpose
  - [ ] `miscellaneous-field` equivalent (if representable in source format)
  - [ ] format-specific roundtrip hints (if used) are explicitly documented (key format, scope, restore rule)
- [ ] Unsupported feature handling is explicit:
  - [ ] either diagnostic + skip
  - [ ] or hard error + fail import

---

## 3. Export (MusicXML -> Format)

- [ ] Export accepts current canonical MusicXML from `save()`
- [ ] Output text/file is formatted for readability where applicable
- [ ] Filename extension and MIME type are correct
- [ ] Core data is exported:
  - [ ] part / measure
  - [ ] note/rest/chord
  - [ ] key/time/clef minimum set
- [ ] Metadata export policy is explicit:
  - [ ] title
  - [ ] tempo
  - [ ] transpose
  - [ ] `miscellaneous-field` equivalent
  - [ ] comment-level metadata/hints (if any) are versioned and parseable (e.g. `%@mks ...`)
- [ ] If loss is unavoidable, degradation behavior is documented

---

## 4. Roundtrip Rules

- [ ] Define roundtrip target:
  - [ ] `MusicXML -> NewFormat -> MusicXML`
  - [ ] `NewFormat -> MusicXML -> NewFormat` (if needed)
- [ ] Define acceptable delta:
  - [ ] layout-only differences ignored
  - [ ] semantic differences rejected
- [ ] Define invariants to preserve:
  - [ ] measure count
  - [ ] beat capacity validity (no overfull)
  - [ ] voice validity (no invalid voice/layer)

---

## 5. UI / Flow Integration

- [ ] Input file extension is added to picker and load-flow routing
- [ ] Unsupported extension message is updated
- [ ] Export button and action are wired
- [ ] Error messages use existing UI message policy
- [ ] `mikuscore-src.html` and generated `mikuscore.html` stay in sync via build

---

## 6. Diagnostics and Error Codes

- [ ] Add/extend diagnostic codes where needed
- [ ] Error message includes actionable context (what failed and why)
- [ ] Warn vs error boundary is documented
- [ ] Console diagnostics and UI diagnostics are consistent
- [ ] For bug investigation, preserve and utilize debug metadata through `miscellaneous-field` (or format-equivalent mapping) whenever possible.
- [ ] When conversion applies degradation/auto-fix (e.g. overfull clamped), record it as structured diagnostics in `miscellaneous-field` using `diag:*`.

### `miscellaneous-field` Usage Patterns (MUST classify explicitly)

- [ ] Classify each `miscellaneous-field` mapping into one of the following:
  - **Source-preservation metadata** (`src:*` recommended):
    - Purpose: preserve source-format-only information when importing `Format -> MusicXML`.
    - Example: fields needed to reconstruct/trace original MEI/ABC semantics not directly representable in core MusicXML path.
  - **mikuscore extension metadata** (`mks:*`):
    - Purpose: preserve mikuscore-specific semantics/provenance when a target format cannot represent them natively (not debug-only).
    - Example: mikuscore extension comments/hints and restoration metadata required for compatible roundtrip behavior.
  - **Optional debug-only metadata** (`dbg:*` recommended if separated):
    - Purpose: investigation/tracing only.
    - Example: event-level conversion traces used for incident analysis.
  - **Structured conversion diagnostics** (`diag:*`):
    - Purpose: record warnings/repair actions that occurred during conversion, so issues are not silently hidden.
    - Example: `diag:0001 = level=warn;code=OVERFULL_CLAMPED;fmt=mei;measure=8;staff=1;action=clamped;droppedTicks=240`.
    - Recommended key order inside `diag:NNNN` payload:
      - `level;code;fmt;measure;staff;voice;action;message;sourceTicks;capacityTicks;movedEvents;droppedEvents;droppedTicks`
      - Omit keys that do not apply, but keep relative order for diff/readability.
- [ ] For each format, document retention policy for both categories:
  - preserve as-is / transform / drop
  - roundtrip expectations (`MusicXML -> Format -> MusicXML`, `Format -> MusicXML -> Format`)
- [ ] If using out-of-band comment hints (non-XML metadata), define:
  - token schema and allowed keys
  - event addressing key (`voice + measure + event`)
  - fallback when hint is absent or invalid
  - safety against conflicts with existing source comments
- [ ] Keep namespace separation strict (`src:*` vs `mks:*` vs `diag:*` vs optional `dbg:*`) to avoid mixing source data, functional extension metadata, diagnostics, and debug traces.

### LilyPond Note (Current `mks` usage)

- `%@mks lanes ...`:
  - stores per-measure multi-lane token streams to restore same-staff multi-voice structure (`backup`) on import.
- `%@mks slur ...`:
  - stores slur start/stop metadata (`type`, optional `number`, optional `placement`) by event key for roundtrip restoration.

---

## 7. Tests (Minimum)

- [ ] Unit test: basic import success
- [ ] Unit test: basic export success
- [ ] Unit test: invalid input produces expected failure
- [ ] Unit test: metadata mapping (title/key/time/tempo)
- [ ] Unit test: `miscellaneous-field` mapping if supported
- [ ] Roundtrip golden test for representative fixtures
- [ ] Regression test for known tricky cases

---

## 8. Build and Release Hygiene

- [ ] `npm run typecheck` passes
- [ ] relevant `npm run test:unit` passes
- [ ] `npm run build` executed and artifacts updated
- [ ] Documentation updated:
  - [ ] feature scope
  - [ ] known limitations
  - [ ] TODO next steps

---

## 9. Recommended Implementation Pattern

- [ ] Create dedicated module (`xxx-io.ts`) with both directions in API:
  - `exportMusicXmlDomToXxx(doc): string`
  - `convertXxxToMusicXml(source): string`
- [ ] Keep conversion logic isolated from UI code
- [ ] Keep load/download flow adapters thin
- [ ] Add focused unit tests in `tests/unit/xxx-io.spec.ts`

---

## Notes

- Keep the first implementation small and explicit; expand feature coverage incrementally.
- Prefer deterministic output to stabilize diffs and tests.
