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

## Multi-layer design note

If this area is resumed, the design should not be framed only as "an AI feature".

The stronger lesson from the related `mikuproject` work is that the same contract may need to serve three layers at once:

- human CLI users
- Agent Skills or other tool-mediated callers
- downstream generative-AI interaction that sits behind those tool callers

That implies several desirable properties:

- command names and phases should remain understandable to a human operator
- stdio behavior should remain composable in ordinary shell workflows
- diagnostics should have a machine-readable form when the caller is an agent or another program
- AI-facing exchange should prefer bounded projections, validation, and staged apply flows over unconstrained whole-document rewrites
- handoff units should be small enough for reliable AI interaction, not only convenient for a human at a terminal

For `mikuscore`, one strong candidate is to keep the actual mutation contract close to the existing core command catalog rather than inventing a separate whole-measure rewrite model.

That would mean:

- human-facing CLI phases may still look like `state inspect` / `state validate` / `state apply`
- but the machine-facing payload inside those phases may compile down to bounded commands such as `change_to_pitch` or `change_duration`

This does not mean `mikuscore` should copy the `mikuproject` AI command tree directly.

It means future AI-facing interface work should be judged partly by how well it serves all three layers together, not only by whether a single AI prompt can produce an output.

## Re-entry conditions

Revisit this only when there is a concrete implementation need such as:

- a stable tool-mediated AI workflow
- clear bounded edit operations that benefit from a machine-facing contract
- evidence that the added interface meaningfully improves reliability over the current ABC-centered flow
- a plausible CLI or tool contract that remains legible for human users while also serving agent-mediated workflows

## Editorial rule

Until resumed, current-facing documentation should not describe AI JSON as an active supported interface.
