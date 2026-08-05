# AI Interaction Policy

This document records the current `miku-score` policy for interacting with generative models.

It complements:

- `docs/generation/README.md`
- `docs/future/AI_JSON_INTERFACE.md`

## Current adopted policy

- Canonical source remains `MusicXML`.
- Full-score handoff to a generative model uses `ABC`.
- New score generation by a generative model uses `ABC`.
- A dedicated AI-facing JSON patch/projection interface is not part of the current product contract.
- AI interaction is one bridge use case for miku-score, not the sole or primary product identity.

## Why this policy is simpler now

`miku-score` currently prioritizes:

- canonical score preservation
- practical readability for generative models
- a smaller current-scope contract

For the current product shape, `ABC` is the documented AI-facing interchange layer.
This sits inside the broader product role of moving score data between tools and formats while keeping MusicXML canonical.

## Current constraint

- Humans may still explicitly choose `ABC` when working with external generative models.
- `miku-score` does not currently claim a supported AI-facing JSON workflow.
- Existing JSON-related notes and examples should be treated as deferred design material, not current behavior guarantees.
- If older cross-repository design memos mention AI JSON, measure-detail JSON, or projection/patch style score workflows for `miku-score`, read those references as future-direction material unless this document or a current product spec explicitly reactivates them.

## Deferred future note

A dedicated AI-facing JSON interface may be revisited later as a future step.

If that work resumes, the goal is still likely to be:

- keep `MusicXML` canonical underneath
- avoid direct AI rewriting of full MusicXML
- use a bounded machine-facing contract rather than unconstrained score rewrite

That future work is tracked separately in `docs/future/AI_JSON_INTERFACE.md`.
