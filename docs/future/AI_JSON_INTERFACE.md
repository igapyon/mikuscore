# Future Note: AI JSON Interface

## Status

- Deferred future work.
- Not part of the current `mikuscore` product contract.
- Not a normative spec for present behavior.

## Purpose of this note

This file preserves the direction for a possible future AI-facing JSON interface after it was removed from the current-spec surface.

The current product policy is documented in:

- `docs/AI_INTERACTION_POLICY.md`

Archived or deferred JSON-related materials still exist in:

- `docs/spec/AI_JSON_SPEC.md`
- `docs/generation/AI_ABC_JSON_WORKFLOW_PROMPT.md`
- `docs/generation/examples/`

Those files should be read as design/archive material unless and until this work is resumed.

## Intended direction if resumed later

- Keep `MusicXML` as canonical score storage.
- Avoid direct full-score MusicXML rewriting by external AI.
- Prefer bounded, validation-friendly exchange rather than unconstrained rewrite.
- Reassess whether JSON is actually better than `ABC` for the target workflow before reviving the interface.

## Re-entry conditions

Revisit this only when there is a concrete implementation need such as:

- a stable tool-mediated AI workflow
- clear bounded edit operations that benefit from a machine-facing contract
- evidence that the added interface meaningfully improves reliability over the current ABC-centered flow

## Editorial rule

Until resumed, current-facing documentation should not describe AI JSON as an active supported interface.
