# Contributing to mikuscore

Thank you for contributing to `mikuscore`.

This project accepts bug reports, feature requests, documentation fixes, tests, and pull requests.

See `CODE_OF_CONDUCT.md` for collaboration and behavior expectations in project spaces.

## Before Opening an Issue or Pull Request

- Check whether the topic is already covered by an existing issue, pull request, spec note, or TODO item.
- For behavior changes, describe both the current behavior and the expected behavior.
- Keep changes focused. Small, reviewable pull requests are preferred.
- When practical, include or update tests together with code changes.

## Development Notes

- `mikuscore.html` is a generated artifact. Do not edit it directly unless regeneration is intentionally part of the change.
- `src/js/main.js` is generated from TypeScript and is committed. If you change `src/ts/`, regenerate `src/js/main.js` as part of the same change when needed.
- Application logic should normally be edited in `src/ts/` and `core/`.
- Tests live under `tests/`.
- `mikuscore` changes can require downstream follow-up in `mikuscore-skills` and `miku-abc-player`, which basically track `devel`. Keep that impact visible when a change affects shared behavior, contract, generated assets, or handoff assumptions.
- Vendored or externally sourced files should be treated carefully:
  - `src/js/verovio.js`
  - `src/js/midi-writer.js`
  - `src/vendor/utaformatix3/utaformatix3-ts-plus.mikuscore.iife.js`
  - `lht-cmn/`
- Do not rewrite vendored files as part of unrelated application changes.

## Documentation Expectations

Update documentation when a change affects behavior, scope, policy, or the supported format contract.

Documentation roles:

- `README.md`: repository entry point, supported scope, development commands, CLI overview
- `TODO.md`: active backlog only
- `docs/spec/*`: normative implementation and behavior specifications
- `docs/future/*`: deferred or future-facing notes
- `docs/FORMAT_COVERAGE.md`: current format support summary

## Recommended Checks

Run relevant commands before submitting a pull request when possible.

```bash
npm run typecheck
npm run test:build
npm run test:integration
npm run test:property
npm run test:all
npm run build
npm run check:all
```

In practice, not every change needs every command. A smaller change may only need the subset that covers the touched area.

## Pull Request Guidelines

- Explain what changed and why.
- Mention any user-visible behavior change.
- Mention any spec, README, or TODO updates that are part of the change.
- If downstream follow-up is expected, mention that `mikuscore-skills` and/or `miku-abc-player` may need updates from `devel`.
- If a change is intentionally partial, deferred, or scoped down, say so explicitly.
- If fixtures, samples, or local-only data were used for verification, explain that briefly.

## Contribution License

By submitting an issue, pull request, comment, documentation change, code change, or other material intentionally for inclusion in this project, you agree that:

- Your contribution is provided under the Apache License 2.0 used by this repository.
- The maintainer may use, modify, rewrite, adapt, edit, and redistribute your contribution as part of this project, as permitted by that license.
- You have the right to submit the contribution.
- Unless you explicitly state otherwise, your submission is treated as a "Contribution" under Section 5 of the Apache License 2.0.

If you do not want a submission to be treated as a contribution for inclusion in the project, mark that clearly and do not open it as a pull request intended to be merged.

## Collaboration Expectations

- Be specific.
- Be respectful.
- Prefer concrete repro steps, fixtures, and tests over vague reports.
