---
title: miku-score renaming migration
description: Canonical naming and compatibility policy for the miku-score rename.
topics:
  - miku-score
  - migration
  - compatibility
  - release
category: reference
status: stable
audience:
  - maintainer
  - developer
  - operator
created: 2026-08-05
updated: 2026-08-05
sources:
  - type: local-file
    role: primary
    label: Main application migration record
    path: TODO.md
    checked: 2026-08-05
---

# miku-score Renaming Migration

The canonical product name is `miku-score`. This document records the local
Main Application migration required by Issue #198.

## Canonical Public Names

- Product, repository, and package: `miku-score`
- Canonical CLI command: `miku-score`
- Web App file: `miku-score.html`
- Node.js runtime bundle: `bundle/miku-score.mjs`
- Release runtime asset: `miku-score-<version>.mjs`
- Release source archive: `miku-score-sources-<version>.tgz`

The companion Web App is planned as `miku-score-web`. It is not separated as
part of this rename; separation follows only after the new repository and its
browser-compatible upstream contract are ready.

## CLI Compatibility Policy

The package is currently `private`; it does not define a published npm-package
compatibility surface. The renamed release exposes only the canonical
`miku-score` CLI name and does not add a second `mikuscore` executable or
duplicate runtime bundle.

Historical Releases and external articles remain historical records. Operators
upgrading scripts must replace the old command and artifact name with the
canonical names above.

## Preserved Compatibility Identifiers

The following are data-format or external-runtime contracts, not current
product names. They remain unchanged in this rename so existing score data and
the upstream vendor artifact keep working.

- `mks:` MusicXML and text-format metadata keys
- `https://mikuscore.org/ns/analysis` version 1 namespace URI
- MIDI SysEx metadata value `app=mikuscore`
- `utaformatix3-ts-plus.mikuscore.iife.js` and its
  `UtaFormatix3TsPlusMikuscore` browser-global API

Do not introduce a new schema namespace, `mks` prefix, or vendor-global alias
solely for the product rename. A future format-version change must specify and
test its own read/write compatibility policy.

## External Repository Step

The GitHub repository rename from `igapyon/mikuscore` to
`igapyon/miku-score` was completed by a human maintainer on 2026-08-05. The
local `origin` remote uses the new canonical repository URL; managed links
must use that URL rather than rely on GitHub redirects.
