# TODO

## Spec Work

- [x] Confirm command catalog for MVP (exact command names and payloads, including insert/delete).
- [x] Add explicit save rejection contract when current state is overfull.
- [x] Decide nodeId stability policy (session-local only in MVP).
- [x] Decide unsupported note kinds in MVP (`grace` / `cue` / `chord` / `rest` -> reject).
- [ ] Define message text policy (i18n vs fixed English) for diagnostics.
- [ ] Add one canonical fixture MusicXML for each required test ID (currently inline fixtures in tests).
- [x] Align file naming conventions for single-file build (`mikuscore-src.html` / `mikuscore.html`).

## Core Implementation

- [x] Create `core/interfaces.ts`.
- [x] Create `core/commands.ts`.
- [x] Create `core/xmlUtils.ts` (parse/serialize, unknown node-safe helpers).
- [x] Create `core/timeIndex.ts` (measure capacity / occupied time helpers).
- [x] Create `core/validators.ts` (overfull, voice edit constraints).
- [x] Create `core/ScoreCore.ts` (load/dispatch/save + dirty tracking).
- [x] Create `core/index.ts` exports.

## Tests

- [x] Set up Vitest (`test:unit`) as the unit test runner baseline.
- [x] Add `tests/unit/core.spec.ts`.
- [x] Implement RT-0, RT-1, TI-1, TI-2, PT-1, BM-1, BF-1.
- [x] Add DR-1, NK-1, BF-2/BF-3/BF-4, IN-2, SV-2, AT-1.
- [x] Add fixtures for base/overfull/underfull/backup/voice-boundary/unknown/beam scenarios.
- [x] Confirm no-op save returns exact original XML string.

## Docs

- [ ] Keep `SPEC.md` and `docs/spec/*` synchronized when rules change.
- [ ] Update prompt template if file layout changes.
- [ ] Keep `docs/spec/BUILD_PROCESS.md` and package scripts consistent.
