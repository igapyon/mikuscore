# AI Interaction Policy

This document records the current `mikuscore` policy for interacting with generative models.

It complements:

- `docs/spec/AI_JSON_SPEC.md`
- `docs/generation/AI_JSON_PROMPT.md`

## Current adopted policy

- Canonical source remains `MusicXML`.
- Full-score handoff to a generative model uses `ABC`.
- New score generation by a generative model uses `ABC`.
- Partial inspection and patch exchange with a generative model use `JSON (Partial)`.
- Full-score JSON handoff is not the current recommended path.

## Why this split exists

`mikuscore` currently has to balance three different concerns:

- canonical score preservation
- practical readability for generative models
- bounded and safe machine-editable patch exchange

The current policy separates those roles:

- `MusicXML` for canonical preservation
- `ABC` for broad human/AI score communication
- `JSON (Partial)` for local and bounded AI patch work

## Current constraints

- Generative models often read whole-score `ABC` more reliably than whole-score JSON.
- Whole-score JSON tends to be larger and easier for a model to truncate, skim, or partially ignore.
- Local JSON is still useful when the task is bounded and patch-oriented.
- Therefore JSON is currently positioned as a partial projection, not as the main full-score AI handoff format.

## Transition-phase note

This policy should be understood as a transition-phase design.

Today, the human user may still need to be aware of whether the current AI task is:

- whole-score / new-score (`ABC`)
- partial review / patch exchange (`JSON (Partial)`)

That human-visible split is not the long-term ideal.

## MCP-oriented future goal

The longer-term goal is for an MCP-capable tool layer to choose the right representation automatically.

In that future shape:

- the human should mostly express intent, not choose data format manually
- the tool layer should route whole-score AI tasks through `ABC`
- the tool layer should route bounded edit/review tasks through `JSON (Partial)`
- `MusicXML` should remain canonical underneath

Until that mediation becomes normal, `mikuscore` keeps the format split explicit in docs and some UI decisions.
