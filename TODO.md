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

- [ ] After the current CLI series settles, prune this file again.
  - Remove items that have become fully implemented.
  - Keep only active backlog and intentionally retained long-term notes.
