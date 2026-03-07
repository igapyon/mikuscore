# LHT_CMN_FEEDBACK

Last updated: 2026-03-07
Target: `lht-cmn` maintainers
Source project: `mikuscore`

This note summarizes issues and improvement requests found during real integration of `lht-cmn` into `mikuscore`.

## 1. Critical design contract

These are the highest-priority design issues because they affect the whole `lht-cmn` model, not just one component.

### 1-1. `lht-*` must be self-contained from the app's point of view

- Problem:
  - App code is expected to use `lht-*` as the public UI layer.
  - However, some `lht-*` components still depend on whether internal `md-*` elements happen to be loaded.
  - This leaks internal dependency responsibility to the app side.
- Request:
  - Define the contract clearly: if an app loads `lht-cmn`, `lht-*` must work without requiring the app to manage `md-*` registration.
  - Each component should use one of these approaches consistently:
    - `lht-cmn` internally guarantees the required `md-*` registration before use.
    - `lht-cmn` provides an internal non-`md-*` fallback with defined parity.

### 1-2. Apply the self-contained rule across all components, not only `lht-switch-help`

- Observed:
  - `lht-switch-help` exposed this issue most clearly, but the same design risk applies to other internals such as `md-icon-button`, `md-filled-button`, `md-outlined-select`, and `md-outlined-text-field`.
- Request:
  - Treat this as a cross-component policy.
  - Audit all `lht-*` components for leaked `md-*` responsibility and align them to the same contract.

## 2. High-priority component issues

### 2-1. `lht-help-tooltip`: viewport collision handling should be built in

- Observed:
  - Tooltips can overflow the left or right viewport edge.
  - App-side CSS/runtime adjustment was required to keep content visible.
- Impact:
  - Clipped help text, especially on narrow mobile viewports.
- Request:
  - Add built-in collision handling with auto placement adjustment and viewport clamp.
  - Suggested API:
    - `placement="auto|left|right|top|bottom"`
    - default should be `auto`
- Integration-proven behavior:
  - Measure both left/right candidates.
  - Choose the smaller overflow score.
  - Clamp width to viewport.
  - Re-measure and shift horizontally if needed.
  - Re-run on resize and during active hover/focus states.

### 2-2. Pre-upgrade content flash should be prevented centrally

- Observed:
  - Before custom elements upgrade, raw tooltip/help content can flash into the layout.
- Impact:
  - Initial render looks broken or unstable.
- Request:
  - Add a default pre-upgrade guard in `lht-cmn/css/components.css`.
  - Standardize an initialization-state contract such as `data-initialized="true"`.

### 2-3. `lht-file-select`: event ownership should be explicit

- Observed:
  - `lht-file-select` internally calls `input.click()` from the trigger button.
  - Host code may also bind to the same button ID, which creates ownership ambiguity.
- Impact:
  - Double-open risk and integration complexity.
- Request:
  - Provide an explicit event contract, for example:
    - `lht-file-select:before-open`
    - `lht-file-select:change`
  - Or provide `auto-open="false"` so the host can take over safely.

### 2-4. `lht-error-alert` should support `warning` and `info`

- Observed:
  - Real apps often need `error`, `warning`, and `info` levels.
  - Current behavior is effectively error-only.
- Request:
  - Add `variant="error|warning|info"`.
  - Align `role` / `aria-live` behavior with each variant's semantics.

### 2-5. `lht-switch-help` should not depend on app-side `md-switch` availability

- Observed:
  - Current implementation branches on whether `customElements.get("md-switch")` is already defined.
  - This means appearance and behavior depend on external load conditions.
- Request:
  - Make `lht-switch-help` self-contained.
  - Choose one explicit model:
    - `lht-cmn` internally guarantees `md-switch`
    - `lht-switch-help` uses a self-owned implementation/fallback contract
- Additional note:
  - If fallback is used, its DOM contract should be documented.
  - In the current integration, the fallback needed the `input.md-switch-input + span.md-switch` structure to match existing CSS behavior.

## 3. Documentation and test requests

### 3-1. Add an explicit integration contract section to README

- README should clearly define:
  - which IDs are app-provided vs internally generated
  - which methods/events are public APIs
  - initialization lifecycle guarantees
  - safe CSS extension points

### 3-2. Document fallback policy and parity per component

- Request:
  - Add a compact table covering at least:
    - `lht-select-help`
    - `lht-text-field-help`
    - `lht-switch-help`
    - `lht-file-select`
- For each component, document:
  - whether fallback exists
  - fallback element type
  - guaranteed parity
    - `value`
    - `input/change` events
    - `required/disabled`
    - `min/max/step/rows`
    - class propagation

### 3-3. Clarify `lht-select-help` declarative JSON options lifecycle

- Observed:
  - `lht-select-help` supports declarative JSON via:
    - `<script type="application/json" slot="options">[...]</script>`
  - During integration, an edge case caused blank dropdowns when declarative options handling and observer behavior interacted badly.
- Request:
  - Document:
    - when JSON is parsed
    - whether the `script[slot="options"]` node is consumed/removed
    - when legacy child `<option>` fallback is considered
    - whether observer-based re-sync runs after declarative init
  - Add a simple DO / DON'T example:
    - DO: use JSON declarative options as the primary static format
    - DON'T: mix declarative JSON and manual child mutation unless a supported refresh API exists

### 3-4. Provide an official dynamic-options pattern for `lht-select-help`

- Observed:
  - Some selects are static and fit JSON well.
  - Others are populated dynamically by app code.
- Request:
  - Provide one official pattern:
    - `setOptions([...])`, or
    - a documented clear/append/notify sequence
  - Also document selected-value retention when options are replaced.

### 3-5. Add regression tests for both dependency modes

- Request:
  - Add CI/test coverage for both:
    - Material loaded
    - Material not loaded
  - Verify that `lht-*` still provides minimum guaranteed behavior in both modes.

## 4. Confirmed implementation notes worth preserving

These are not all top-level feature requests. They are implementation details that proved important during integration and are easy to regress in future syncs.

### 4-1. `LhtSelectHelp.connectedCallback()` must preserve declarative-options detection

- Important detail:
  - Evaluate declarative-options existence before consuming/removing the JSON script node.
- Example shape:
  - `const hasDeclarativeOptions = this._hasDeclarativeOptions();`
- Reason:
  - Re-checking after script consumption can misclassify the component as non-declarative and trigger unwanted re-hydration behavior.

### 4-2. `LhtTextFieldHelp` fallback should be treated as a supported feature

- Current status:
  - Native fallback (`input` / `textarea`) is already present and solved a real integration issue.
- Request:
  - Keep it documented and covered by regression tests.

### 4-3. `LhtSwitchHelp` fallback structure matters

- Important detail:
  - If fallback styling relies on existing CSS contracts, the fallback DOM shape must remain compatible.
- In this integration:
  - `input.md-switch-input + span.md-switch` was needed to preserve the expected switch appearance.

## Suggested priority order

1. Establish the self-contained `lht-*` design contract.
2. Fix `lht-help-tooltip` collision handling and pre-upgrade flash.
3. Clarify `lht-select-help` JSON/dynamic options contract.
4. Clarify `lht-file-select` ownership and add `lht-error-alert` variants.
5. Add README integration/fallback contract and dual-mode regression tests.
