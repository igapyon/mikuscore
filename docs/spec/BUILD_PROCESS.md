# Build Process (Single-file Runtime / Split TS Dev)

## Purpose

This project adopts:

- development with split TypeScript source files
- distribution as a single self-contained HTML file

The build process is designed to preserve offline and zero-runtime-dependency behavior.

## Target Artifact

- Development template: `mikuscore-src.html` (editable source template)
- Distribution artifact: `mikuscore.html` (generated file, do not edit directly)

## Suggested Project Layout (MVP)

- `mikuscore-src.html`
- `mikuscore.html` (generated)
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
2. Validate `mikuscore-src.html` tag order (CSS and JS include order)
3. Inline local CSS and JS into HTML
4. Output `mikuscore.html` as single-file artifact

## Optional Commands

```bash
npm run typecheck
npm run test:unit
npm run clean
```

- `typecheck`: strict TS check for development quality
- `test:unit`: run unit tests with Vitest
- `clean`: remove generated JS and distribution HTML

## Toolchain Baseline

- TypeScript: `5.9.x` baseline (current verified: `5.9.3`)
- JavaScript output target: `ES2018`
- Recommendation: pin exact TypeScript patch version in lockfile for reproducible builds

## Browser Support Baseline

- Primary targets: latest Chrome, latest Edge, latest Safari
- Compatibility strategy: keep emitted JS at `ES2018` to improve tolerance for older Android Chrome/WebView environments
- Note: very old Android devices may still require additional runtime compatibility checks

## Runtime Constraints (MUST)

- `mikuscore.html` MUST run offline (no network required)
- `mikuscore.html` MUST NOT fetch external CDN/resources at runtime
- all required scripts/styles MUST be embedded or locally bundled
- behavior of generated `mikuscore.html` MUST match development source behavior

## Editing Rules

- `mikuscore.html` is generated; do not edit directly
- edit only `mikuscore-src.html` and files under `src/`
- PRs SHOULD include regenerated `mikuscore.html` when behavior changes

## Notes

- If TypeScript compiler is unavailable, build MAY fail fast (recommended), or use an explicit fallback policy if defined in package scripts.
- This document defines process and constraints; concrete script implementation is tracked separately.
