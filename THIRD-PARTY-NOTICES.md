# Third-Party Notices

This document records third-party software and materials that are bundled with, directly used by, or explicitly referenced by `mikuscore`.

It is maintained as a practical repository notice file, not as a substitute for upstream license texts.

## Bundled or vendored components

### `utaformatix3-ts-plus`

- Usage: Vendored bundle used for VSQX `<->` MusicXML conversion.
- Local files:
  - `src/vendor/utaformatix3/utaformatix3-ts-plus.mikuscore.iife.js`
  - `docs/integrations/utaformatix3-ts-plus.mikuscore.iife.js.md`
- Source: `scripts/sync-utaformatix3-vendor.sh` syncs this bundle from the upstream `utaformatix3-ts-plus` repository.
- Upstream: https://github.com/igapyon/utaformatix3-ts-plus

### `lht-cmn`

- Usage: Shared UI component package included in this repository.
- Local files:
  - `lht-cmn/`
- License: Apache License 2.0
- Source: See `lht-cmn/README.md`, `lht-cmn/LICENSE`, and `lht-cmn/NOTICE`.

### Material Web

- Usage: Referenced via `lht-cmn` integration and attribution materials.
- License: Apache License 2.0
- Source: See `lht-cmn/README.md` and `lht-cmn/NOTICE`.
- Upstream: https://github.com/material-components/material-web

### `verovio.js`

- Usage: Bundled browser runtime used for MusicXML to SVG rendering.
- Local files:
  - `src/js/verovio.js`
- Note: Keep upstream attribution and license information aligned with the bundled artifact source when updating this file.

### `midi-writer.js`

- Usage: Bundled browser-side MIDI writer used by the MIDI export path.
- Local files:
  - `src/js/midi-writer.js`
- Note: Keep upstream attribution and license information aligned with the bundled artifact source when updating this file.

## Package-managed dependencies

### `jsdom`

- Usage: Test and browser-like DOM runtime support in the Node-based development and test environment.
- License: MIT
- Source: `package.json` / `package-lock.json`
- Upstream: https://github.com/jsdom/jsdom

## Referenced materials

### MusicXML

- Usage: Core interchange format and specification baseline for the project.
- Source: https://www.w3.org/2021/06/musicxml40/

### MuseScore

- Usage: Import and export interoperability target format.
- Source: https://musescore.org/

## Maintenance Notes

- When updating vendored files, update this notice file if the origin, attribution, or packaging changes.
- Keep this document aligned with `LICENSE`, repository contents, and any bundled NOTICE files.
