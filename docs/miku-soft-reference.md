---
title: miku-score miku-soft reference
description: Current shared miku-soft references and the repository's standardization status.
topics:
  - miku-score
  - miku-soft
  - architecture
  - maintenance
category: reference
status: stable
audience:
  - maintainer
  - developer
  - agent
created: 2026-08-05
updated: 2026-08-05
sources:
  - type: upstream-doc
    role: primary
    label: igapyon-miku-soft-developer skill
    url: https://github.com/igapyon/igapyon-agent-skills/tree/devel/skills/igapyon-miku-soft-developer
    checked: 2026-08-05
  - type: local-file
    role: supporting
    path: docs/spec/CANONICAL_MUSICXML.md
    checked: 2026-08-05
---

# miku-score miku-soft Reference

This repository follows the shared `igapyon-miku-soft-developer` references
for architecture, maintenance, CLI contracts, generated artifacts, and
repository operations. Project-specific product behavior remains in this
repository's README, `docs/`, source code, tests, and TODO.

## Checked Reference

- Checked date: 2026-08-05
- Installed skill commit: unavailable; the installed skill directory was not a
  Git working tree at the time of this check. Record the source commit when the
  shared skill is next refreshed.
- Main workflow: existing miku-soft maintenance
- Required future migration workflow: Node/Web separation

## Current Repository Position

`miku-score` is currently a historical combined repository. It contains both
the `10 Main Application` responsibilities (MusicXML-first product core, CLI,
diagnostics, tests, and Node.js runtime bundle) and the `11 Web App`
responsibilities (browser UI, Single-file Web App generation, `lht-cmn`, and
browser adapters).

The target direction is a separate `miku-score-web` repository that depends on
the main application through a documented browser-compatible API or runtime
artifact. Do not move or delete Web files until that dependency contract and
the new repository are ready. Track the project-specific decisions in
`TODO.md`.

## Reference Use

- Shared miku-soft design and workflow guidance: the installed
  `igapyon-miku-soft-developer` skill and its GitHub source above.
- Product semantics and canonical score policy: `docs/spec/CANONICAL_MUSICXML.md`.
- Current build artifacts and editing rules: `docs/spec/BUILD_PROCESS.md`.
- Current developer commands and CLI contract: `docs/DEVELOPMENT.md` and
  `docs/spec/CLI_STEP1.md`.

Do not copy shared miku-soft basic design documents into this repository.
Update this reference document and the relevant project-specific records when
the shared guidance is refreshed or a separation decision is made.
