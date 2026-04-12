# TODO

## CLI

- [ ] Document `convert`-first CLI naming consistently in all current-facing docs.
  - Recheck `README.md`, `docs/spec/CLI_STEP1.md`, and future notes after the command surface stabilizes.
  - Keep `import/export` as internal facade wording only, not CLI wording.

- [ ] Decide whether to keep the current local TypeScript-on-demand loader as the long-term CLI bootstrap.
  - Current path:
    - `scripts/mikuscore-cli.mjs`
    - `scripts/lib/load-cli-api.mjs`
  - Re-evaluate whether Step 2 should keep this loader or move to a build-produced CLI entry.

- [ ] Investigate the root cause of `load-cli-api.mjs` runtime fragility before changing its compilation strategy.
  - Scope:
    - `scripts/lib/load-cli-api.mjs`
  - Current stance:
    - do not switch to a `tsc` CLI subprocess workaround without a clearer root-cause explanation
    - prefer understanding why direct runtime TypeScript loading fails in some environments before accepting a different bootstrap path

- [ ] Harden Step 2 MIDI conversion pairs.
  - Current first cut exists for:
    - `mikuscore convert --from midi --to musicxml`
    - `mikuscore convert --from musicxml --to midi`
  - Next checks:
    - decide whether CLI needs MIDI export options such as profile / metadata toggles

- [ ] Implement Step 3 conversion/render pairs.
  - Current first cut exists for:
    - `mikuscore convert --from musescore --to musicxml`
    - `mikuscore convert --from musicxml --to musescore`
    - `mikuscore render svg`
  - Next checks:
    - add explicit CLI support decision/work for compressed `.mscz`
    - decide whether CLI should handle compressed `.mscz` directly or remain `.mscx`-text only
    - decide whether render options such as scale / page size should become CLI flags

- [ ] Expand CLI tests together with each new conversion pair.
  - Cover file input, `stdin`, `--out`, and representative failure cases.
  - Keep `stdout` for payload and `stderr` for diagnostics only.

## Facade

- [ ] Keep the non-UI CLI facade small and format-oriented.
  - Current Step 1 functions:
    - `importAbcToMusicXml(...)`
    - `exportMusicXmlToAbc(...)`
  - Planned next functions:
    - `importMuseScoreToMusicXml(...)`
    - `exportMusicXmlToMuseScore(...)`
    - `renderMusicXmlToSvg(...)`

- [ ] Re-evaluate `core/` boundaries only if reuse pressure becomes real.
  - Do not move conversion facade code into `core/` without a concrete need.

## Cleanup

- [ ] Add the standard file header to source files as needed.
  - Target header:
    ```text
    /*
     * Copyright 2026 Toshiki Iga
     * SPDX-License-Identifier: Apache-2.0
     */
    ```

- [ ] Make MuseScore export fully 4.0+-native where compatibility fallback is not required.
  - Keep compatibility fallbacks on import.
  - Remove any remaining import-side fallback for former custom MuseScore transpose helper tags after related roundtrip/tests are updated.
  - Raise exported `museScore/@version` from `4.0` only after the emitted XML is confirmed to match the expected newer 4.x save-format behavior closely enough (e.g. `4.60`).
  - Define a clearer general policy for MuseScore files that carry multiple co-located tempo representations (e.g. visible tempo text plus hidden metronome/playback tempo), instead of relying only on the current first-measure/last-candidate heuristic.

- [ ] After the current CLI series settles, prune this file again.
  - Remove items that have become fully implemented.
  - Keep only active backlog and intentionally retained long-term notes.
