# TODO

## Spec Work

- [ ] Confirm command catalog for MVP (exact command names and payloads).
- [ ] Add explicit save rejection contract when current state is overfull.
- [ ] Define message text policy (i18n vs fixed English) for diagnostics.
- [ ] Add one canonical fixture MusicXML for each required test ID.

## Core Implementation

- [ ] Create `core/interfaces.ts`.
- [ ] Create `core/commands.ts`.
- [ ] Create `core/xmlUtils.ts` (parse/serialize, unknown node-safe helpers).
- [ ] Create `core/timeIndex.ts` (measure capacity / occupied time helpers).
- [ ] Create `core/validators.ts` (overfull, voice edit constraints).
- [ ] Create `core/ScoreCore.ts` (load/dispatch/save + dirty tracking).
- [ ] Create `core/index.ts` exports.

## Tests

- [ ] Add `tests/unit/core.spec.ts`.
- [ ] Implement RT-0, RT-1, TI-1, TI-2, PT-1, BM-1, BF-1.
- [ ] Add fixtures for unknown elements and backup/forward boundaries.
- [ ] Confirm no-op save returns exact original XML string.

## Docs

- [ ] Keep `SPEC.md` and `docs/spec/*` synchronized when rules change.
- [ ] Update prompt template if file layout changes.
