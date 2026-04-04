# Generation Docs

This directory contains practical prompt assets and sample inputs used when working with external generative models.

Use this directory for actual prompt handoff and experiment materials.
Use `docs/spec/AI_JSON_SPEC.md` as the current design/spec source for the AI-facing JSON contract.
Use `docs/AI_INTERACTION_POLICY.md` for the higher-level format-routing policy (`MusicXML` canonical, `ABC` for whole-score/new-score AI work, `JSON (Partial)` for bounded local AI work).

## What Each File Is For

- `AI_ABC_JSON_WORKFLOW_PROMPT.md`
  Prompt file to send to another generative model before starting the current `ABC` + `JSON (Partial)` workflow.
  The intended flow is:
  1. send this file first
  2. confirm the model replies with `OK`
  3. continue with `ABC` for broad score context when needed
  4. continue with bounded projection JSON and user requests when local patch/review work is needed

- `examples/`
  Example projection JSON files that can be pasted into AI JSON conversations.

## Current Example Files

- `classical-opening-gesture-simplified.measure-detail.json`
  Simplified classical-style local excerpt for AI readability testing.

- `twinkle-twinkle-opening.measure-detail.json`
  Melody sample with lyric hints.

- `twinkle-twinkle-opening.no-lyrics.measure-detail.json`
  Same melody sample without lyric hints, useful for comparison.

## Recommended Usage

For AI JSON interaction experiments:

1. Read `docs/spec/AI_JSON_SPEC.md` if you need the current contract/design intent.
2. Confirm that the task is actually a partial JSON task, not a whole-score/new-score task that should go through ABC.
3. Send `AI_ABC_JSON_WORKFLOW_PROMPT.md` to the target model first.
4. Wait for `OK`.
5. If the task needs broad score communication, provide `ABC`.
6. If the task needs bounded local patch/review work, provide one of the example JSON files.
7. Add the user request.
8. Observe whether the model uses `ABC` as broad context and returns bounded patch JSON only when the JSON contract supports it.

## Notes

- Files in this directory are operational assets, not the normative spec.
- The normative AI JSON spec currently lives in `docs/spec/AI_JSON_SPEC.md`.
