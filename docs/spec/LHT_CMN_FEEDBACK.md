# LHT_CMN_FEEDBACK

Last updated: 2026-03-08
Target: `lht-cmn` maintainers
Source project: `mikuscore`

This note now tracks only open or partially-resolved integration issues. Items already reflected in `lht-cmn` were removed from this file and are tracked historically in `LHT_CMN_FEEDBACK_STATUS.md`.

## 1. Open component issues

### 1-1. `lht-help-tooltip` should be fully self-contained, including base positioning CSS

- Observed:
  - `lht-help-tooltip` already has runtime placement logic such as `placement="auto"`, viewport measurement, and resize follow-up.
  - However, a later `mikuscore` integration regression showed that hover behavior could still break even when the app used `<lht-help-tooltip>` normally.
  - The root cause was missing component-owned base CSS for tooltip anchoring and visibility, especially around:
    - `position: relative` on the anchor container
    - `position: absolute` on the tooltip layer
    - `overflow: visible` on the relevant host/container
- Impact:
  - Integrators can see the help icon hover as "broken" even though the app is not misusing the component.
  - This creates a false impression that the host app needs to supply tooltip-layout CSS.
- Request:
  - Treat the minimum positioning/visibility CSS as part of the public `lht-help-tooltip` contract.
  - Do not consider tooltip support complete based on placement logic alone.
  - Verify that a plain `<lht-help-tooltip>` works correctly in isolation without app-specific tooltip CSS.

### 1-2. `lht-help-tooltip` needs regression coverage for the complete contract

- Observed:
  - Existing tests cover fallback rendering, `placement="auto"`, and Escape hide behavior.
  - They do not clearly prove that the component is self-contained from a CSS/layout point of view.
- Request:
  - Add regression coverage that checks the complete tooltip contract, not only JS logic.
  - Minimum expectation:
    - the tooltip host/group has the positioning needed for anchoring
    - hover/focus state can reveal the tooltip without relying on app CSS
    - base tooltip styling is bundled in `lht-cmn`

## 2. Open cross-cutting test request

### 2-1. Add a clearer two-mode regression matrix

- Observed:
  - New component tests exist and several fallback cases are covered.
  - But the test story is still not a clear matrix of:
    - Material loaded
    - Material not loaded
  - for each critical `lht-*` component.
- Request:
  - Add an explicit regression matrix, or an equally clear equivalent structure, for critical components.
  - The main goal is to make self-contained guarantees easy to verify and hard to regress.

## Suggested priority order

1. Finish the `lht-help-tooltip` self-contained contract, including bundled base CSS.
2. Add regression coverage that validates the full tooltip contract.
3. Strengthen the two-mode regression matrix for critical `lht-*` components.
