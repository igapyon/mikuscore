# LHT_CMN_FEEDBACK_STATUS

Last updated: 2026-03-07
Target: `lht-cmn` maintainers / integrators
Source project: `mikuscore`

This note maps the previous `LHT_CMN_FEEDBACK.md` requests to the current `lht-cmn` update status.

Status labels used in this file:

- `Reflected`: implemented and/or documented in a way that substantially matches the request.
- `Partially reflected`: some meaningful part was adopted, but the request is not fully covered.
- `Intentionally not adopted for now`: the maintainer appears to have chosen a different design direction for now.

## Status Table

| Feedback item | Status | Notes |
|---|---|---|
| `lht-*` must be self-contained from the app's point of view | Reflected | README now states `lht-*` is self-contained and app code should not manage `md-*` registration. See `lht-cmn/README.md:22` and `lht-cmn/README.md:89` |
| Apply the self-contained rule across all components | Reflected | Policy is documented, and `help-tooltip`, `command-block`, `file-select`, `switch-help`, `text-field-help` now have fallbacks. The chosen implementation path is fallback-oriented rather than internal `md-*` registration. See `lht-cmn/js/components.js:23`, `lht-cmn/js/components.js:217`, `lht-cmn/js/components.js:322`, `lht-cmn/js/components.js:1030`, `lht-cmn/js/components.js:1132`, and `lht-cmn/js/components.js:1239` |
| `lht-help-tooltip`: built-in viewport collision handling | Partially reflected | `placement="auto|left|right|top|bottom"` and runtime positioning logic were added, but a later integration regression showed that the component still lacked some self-owned base positioning CSS (`md-tooltip-group` / `md-tooltip` anchoring), so hover behavior could break even when app-side usage was correct. See `lht-cmn/js/components.js:16`, `lht-cmn/README.md:183`, and `lht-cmn/css/components.css:42` |
| `lht-help-tooltip` should bundle the minimum base CSS needed for correct hover/positioning | Partially reflected | `lht-cmn` owns the tooltip behavior conceptually, but this was not fully true in practice until the `mikuscore` integration restored missing base CSS. This should be treated as part of the component contract and covered by regression tests. See `lht-cmn/css/components.css:42` and `docs/spec/LHT_CMN_FEEDBACK.md` |
| Prevent pre-upgrade content flash centrally | Reflected | `components.css` now hides uninitialized `lht-*` until `data-initialized="true"`. See `lht-cmn/css/components.css:13` and `lht-cmn/README.md:101` |
| `lht-file-select`: explicit event ownership | Reflected | `auto-open`, `lht-file-select:before-open`, and `lht-file-select:change` are implemented and documented. See `lht-cmn/js/components.js:1022`, `lht-cmn/js/components.js:1075`, and `lht-cmn/README.md:256` |
| `lht-error-alert`: support `warning` and `info` | Reflected | `variant` support and ARIA behavior are implemented and documented. See `lht-cmn/js/components.js:727`, `lht-cmn/js/components.js:792`, `lht-cmn/css/components.css:382`, and `lht-cmn/README.md:296` |
| `lht-switch-help` should not depend on app-side `md-switch` availability | Reflected | The adopted answer is fallback-based self-containment rather than internal `md-switch` registration. README now documents this explicitly. See `lht-cmn/js/components.js:1132` and `lht-cmn/README.md:223` |
| README: explicit integration contract section | Reflected | `Integration Contract` was added. See `lht-cmn/README.md:89` |
| README: fallback policy and parity table | Reflected | `Fallback / Parity Table` was added. See `lht-cmn/README.md:130` |
| README: clarify `lht-select-help` declarative JSON lifecycle | Reflected | Lifecycle notes now describe declarative detection timing, script consumption, and observer behavior. See `lht-cmn/README.md:204` |
| README: official dynamic-options pattern for `lht-select-help` | Reflected | `setOptions([...])`, `getValue()`, `setValue()`, and value retention rules are documented and implemented. See `lht-cmn/README.md:209` and `lht-cmn/js/components.js:520` |
| Add regression tests for both dependency modes | Partially reflected | New component tests exist and cover several fallback cases, but they do not clearly show a full two-mode matrix of Material-loaded vs Material-not-loaded for every critical `lht-*` component. See `lht-cmn/components.test.js` |
| Internally register required `md-*` elements instead of relying on fallback-oriented branching | Intentionally not adopted for now | Current implementation continues to branch on `customElements.get(...)` and relies on documented fallback/self-contained behavior instead of internal `md-*` registration. This looks like an intentional design choice, not a missed implementation. See `lht-cmn/README.md:26` and `lht-cmn/js/components.js:23` |
| Introduce a full explicit two-mode CI matrix for all critical `lht-*` components | Intentionally not adopted for now | Tests were added, but not as a full framework-level Material-loaded vs Material-not-loaded matrix. The current update suggests incremental test coverage was preferred. See `lht-cmn/components.test.js` |
| Preserve `hasDeclarativeOptions` pre-capture in `LhtSelectHelp.connectedCallback()` | Reflected | The implementation still captures declarative-options state before hydration. See `lht-cmn/js/components.js:320` |
| Treat `LhtTextFieldHelp` fallback as supported behavior | Reflected | Fallback is documented and tested, not just left as an implicit implementation detail. See `lht-cmn/README.md:195` and `lht-cmn/components.test.js` |
| Preserve `LhtSwitchHelp` fallback DOM structure | Reflected | README and implementation both use `input.md-switch-input + span.md-switch`. See `lht-cmn/README.md:223` and `lht-cmn/js/components.js:1182` |

## Summary

- Reflected:
  - self-contained contract in README
  - cross-component fallback-oriented self-contained direction
  - pre-upgrade flash prevention
  - file-select event ownership API
  - error-alert variants
  - select-help JSON lifecycle docs
  - select-help dynamic options API
  - fallback/parity documentation
  - preservation of important select/text-field/switch implementation details
- Partially reflected:
  - tooltip collision handling, because base positioning CSS completeness was still missing in real integration
  - tooltip self-owned base CSS contract and its regression coverage
  - regression coverage as an explicit two-mode matrix
- Intentionally not adopted for now:
  - internal `md-*` registration as the primary solution
  - a full explicit two-mode CI matrix across all critical components
