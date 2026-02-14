# Build Process (Single-file Runtime / Split TS Dev)

## Purpose

This project adopts:

- development with split TypeScript source files
- distribution as a single self-contained HTML file

The build process is designed to preserve offline and zero-runtime-dependency behavior.

## Target Artifact

- Development template: `app-src.html` (editable source template)
- Distribution artifact: `app.html` (generated file, do not edit directly)

## Suggested Project Layout (MVP)

- `app-src.html`
- `app.html` (generated)
- `src/css/app.css`
- `src/ts/main.ts`
- `src/ts/**/*.ts` (core/ui split modules)
- `src/js/main.js` (generated from TS)
- `src/js/**/*.js` (generated)
- `src/vendor/**/*.js` (optional vendored libraries, local only)

## Build Command

```bash
npm run build
```

`build` SHOULD perform the following steps:

1. Compile `src/ts/**/*.ts` to `src/js/**/*.js`
2. Validate `app-src.html` tag order (CSS and JS include order)
3. Inline local CSS and JS into HTML
4. Output `app.html` as single-file artifact

## Optional Commands

```bash
npm run typecheck
npm run clean
```

- `typecheck`: strict TS check for development quality
- `clean`: remove generated JS and distribution HTML

## Runtime Constraints (MUST)

- `app.html` MUST run offline (no network required)
- `app.html` MUST NOT fetch external CDN/resources at runtime
- all required scripts/styles MUST be embedded or locally bundled
- behavior of generated `app.html` MUST match development source behavior

## Editing Rules

- `app.html` is generated; do not edit directly
- edit only `app-src.html` and files under `src/`
- PRs SHOULD include regenerated `app.html` when behavior changes

## Notes

- If TypeScript compiler is unavailable, build MAY fail fast (recommended), or use an explicit fallback policy if defined in package scripts.
- This document defines process and constraints; concrete script implementation is tracked separately.
