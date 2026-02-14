# TODO

## Spec Work

- [x] Confirm command catalog for MVP (exact command names and payloads, including insert/delete).
- [ ] Add explicit save rejection contract when current state is overfull.
- [x] Decide nodeId stability policy (session-local only in MVP).
- [x] Decide unsupported note kinds in MVP (`grace` / `cue` / `chord` / `rest` -> reject).
- [ ] Define message text policy (i18n vs fixed English) for diagnostics.
- [ ] Add one canonical fixture MusicXML for each required test ID.
- [x] Align file naming conventions for single-file build (`mikuscore-src.html` / `mikuscore.html`).

## Core Implementation

- [ ] Create `core/interfaces.ts`.
- [ ] Create `core/commands.ts`.
- [ ] Create `core/xmlUtils.ts` (parse/serialize, unknown node-safe helpers).
- [ ] Create `core/timeIndex.ts` (measure capacity / occupied time helpers).
- [ ] Create `core/validators.ts` (overfull, voice edit constraints).
- [ ] Create `core/ScoreCore.ts` (load/dispatch/save + dirty tracking).
- [ ] Create `core/index.ts` exports.

## Tests

- [ ] Set up Vitest (`test:unit`) as the unit test runner baseline.
- [ ] Add `tests/unit/core.spec.ts`.
- [ ] Implement RT-0, RT-1, TI-1, TI-2, PT-1, BM-1, BF-1.
- [ ] Add fixtures for unknown elements and backup/forward boundaries.
- [ ] Confirm no-op save returns exact original XML string.

## Docs

- [ ] Keep `SPEC.md` and `docs/spec/*` synchronized when rules change.
- [ ] Update prompt template if file layout changes.
- [ ] Keep `docs/spec/BUILD_PROCESS.md` and package scripts consistent.
