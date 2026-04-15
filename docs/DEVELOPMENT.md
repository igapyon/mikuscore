# Development Notes

This page collects repository-facing notes that are useful for contributors and local development, but too detailed for the root `README.md`.

## Build And Verification

- `npm run build`
- `npm run build:full`
- `npm run test:build`
- `npm run test:build:full`
- `npm run test:slow`
- `npm run test:integration`
- `npm run check:all`
- `npm run clean`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:property`
- `npm run test:all`
- `npm run build:vendor:utaformatix3`

Practical command split:

- `npm run build`: faster day-to-day build (`typecheck` + `test:build` + `build:dist`)
- `npm run build:full`: fuller build path (`typecheck` + `test:build:full` + `build:dist`)
- `npm run test:slow`: heavy suites currently split out of the day-to-day build path
- `npm run test:integration`: heavy integration-style suites (`cffp-series`, `mei-io`, `musescore-io`)
- `npm run check:all`: full verification (`typecheck` + full `test:all` + `build:dist`)

Generated HTML note:

- `mikuscore.html` is generated from `mikuscore-src.html`
- `index.html` is generated from `index-src.html`
- `{{BUILD_DATE}}` placeholders are filled during the build

## CLI Notes

Current CLI uses a `convert`-first command surface.

Available commands:

- `mikuscore convert --from abc --to musicxml`
- `mikuscore convert --from musicxml --to abc`
- `mikuscore convert --from midi --to musicxml`
- `mikuscore convert --from musicxml --to midi`
- `mikuscore convert --from musescore --to musicxml`
- `mikuscore convert --from musicxml --to musescore`
- `mikuscore render svg`

Input/output contract:

- `--from <format>` selects source format
- `--to <format>` selects target format
- `--in <file>` reads from file
- omitted `--in` reads from `stdin`
- `--out <file>` writes to file
- omitted `--out` writes to `stdout`
- text conversions use text input/output
- MIDI input/output uses binary input/output
- current MuseScore CLI scope is `.mscx`-style text, not compressed `.mscz`

Examples:

- `npm run cli -- --help`
- `npm run cli -- convert --help`
- `npm run cli -- convert --from abc --to musicxml --in score.abc --out score.musicxml`
- `npm run cli -- convert --from musicxml --to abc --in score.musicxml --out score.abc`
- `npm run cli -- convert --from midi --to musicxml --in score.mid --out score.musicxml`
- `npm run cli -- convert --from musicxml --to midi --in score.musicxml --out score.mid`
- `npm run cli -- convert --from musescore --to musicxml --in score.mscx --out score.musicxml`
- `npm run cli -- convert --from musicxml --to musescore --in score.musicxml --out score.mscx`
- `npm run cli -- render svg --in score.musicxml --out score.svg`
- `cat score.abc | npm run cli -- convert --from abc --to musicxml`

## Documentation Map

Contribution and repository policy docs:

- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `CONTRIBUTORS.md`
- `THIRD-PARTY-NOTICES.md`

Product docs:

- `docs/PRODUCT_POSITIONING.md`
- `docs/CONVERSION_PRINCIPLES.md`
- `docs/FORMAT_COVERAGE.md`
- `docs/QUALITY.md`
- `docs/AI_INTERACTION_POLICY.md`

Related-project note:

- `mikuscore-skills` and `miku-abc-player` embed `mikuscore` as an upstream dependency
- when `mikuscore` changes in a way that affects behavior, contracts, generated assets, or handoff assumptions, remember that those downstream projects may need to pull the updated upstream
- keep this follow-up visible in PRs and development notes when the change is likely to affect downstream consumers

Specification docs:

- `docs/spec/SPEC.md`
- `docs/spec/ARCHITECTURE.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/LOCAL_WORKFLOW.md`
- `docs/spec/BUILD_PROCESS.md`
- `docs/spec/MUSESCORE_IO.md`
- `docs/spec/MIDI_IO.md`
- `docs/spec/ABC_IO.md`
- `docs/spec/CLI_STEP1.md`
- `docs/spec/TEST_MATRIX.md`

Future notes:

- `docs/future/AI_JSON_INTERFACE.md`
- `docs/future/CLI_ROADMAP.md`

## AI Interaction Policy

- Canonical score source remains MusicXML.
- For generative-AI interaction, full-score handoff and new-score generation are currently centered on ABC.
- A dedicated AI-facing JSON interface is deferred future work, not part of the current product contract.

See:

- `docs/AI_INTERACTION_POLICY.md`
- `docs/future/AI_JSON_INTERFACE.md`

## Debugging Note

For import-side incident analysis, check:

- `docs/spec/MIDI_IO.md`
- `docs/spec/ABC_IO.md`

Especially the sections about `attributes > miscellaneous > miscellaneous-field` (`mks:*` debug fields).
