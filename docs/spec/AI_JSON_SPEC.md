# mikuscore AI JSON Spec `v20260404e`

This document defines the experimental AI-facing JSON interface for `mikuscore`.

`mikuscore` is a single-file web app centered on MusicXML. It supports format conversion, visualization, playback, and limited editing while preserving existing MusicXML as much as possible.

This document is a specification and design reference. It is not the runtime prompt that should be sent to an AI model verbatim.

This spec covers the bounded partial JSON contract only.
It does not define the preferred whole-score handoff format for generative models.

## Current Positioning

- `mikuscore` treats MusicXML as the canonical score format
- whole-score handoff and new-score generation with generative models are currently centered on `ABC`
- AI-facing JSON is currently reserved for bounded partial inspection and patch exchange (`JSON (Partial)`)
- the app supports conversion, visualization, playback, and limited editing
- the current MVP editing core is command-based and centered on safe note-level edits
- the AI-facing interface must not require the model to read or rewrite full MusicXML directly

For the broader operational policy, see `docs/AI_INTERACTION_POLICY.md`.

## Design Intent

This spec is designed around three priorities:

- bounded patch-based editing that does not break the MusicXML preservation policy
- purpose-specific projection JSON that generative models can read reliably
- a clear separation between human explanation text and machine-applied JSON

## Core Principle

The AI does not edit canonical MusicXML directly.

Instead:

- `mikuscore` exports a purpose-specific projection JSON
- the AI reads only the given projection
- the AI returns a bounded Patch JSON
- `mikuscore` validates and applies that patch through its own mutation authority

This extends the existing architectural rule that UI and external layers must not mutate the score DOM directly.

## Current Implementation Baseline

The current core/editor baseline is approximately:

- implemented: `change_to_pitch`
- implemented: `change_duration`
- implemented: `delete_note`
- implemented: `split_note`
- defined in the core contract: `insert_note_after`
- implemented as a non-mutating core command: `ui_noop`
- implemented: MusicXML-centric `load / dispatch / save`
- implemented: diagnostics and warnings on command failure
- implemented: no-op save returns original XML unchanged

The following areas remain future-facing or partially open:

- cross-measure tie editing
- slur create / edit / delete
- articulation editing
- dynamics editing
- chord editing
- broader structural editing

Therefore this AI JSON spec distinguishes:

- safe MVP patch operations aligned with current command support
- future candidate operations that must not be used unless explicitly allowed by `rules`

## Assumptions

- the canonical score is MusicXML, not JSON
- AI input is purpose-specific projection JSON
- the AI may return short explanation text
- the final machine-consumable payload is JSON only
- missing information must not be guessed
- unspecified fields are treated as unchanged
- the AI must stay within the provided projection and `rules`

## Critical Policy

- whole-score JSON handoff is not the current recommended AI path
- full-score JSON re-output is forbidden in edit mode
- full MusicXML re-output is forbidden
- missing notes, measures, voices, tuplets, ties, slurs, or metadata must not be inferred unless they are explicitly exposed and editable under `rules`
- unknown MusicXML content is preserved by default
- unsupported content must not be redesigned by AI assumption
- if musical meaning is unclear, the AI should prefer minimal change or no change
- if a request exceeds the allowed edit boundary, the AI may explain the constraint but must not return a forbidden operation
- the AI must not bypass `rules`

## Projection JSON Families

Representative projection families for `mikuscore` are:

- `measure_detail_view`
- `note_edit_view`
- `score_overview_view`
- `selection_context_view`
- `score_patch_request`

At the current MVP stage, `measure_detail_view` and `note_edit_view` are the primary views.
`score_overview_view` and `selection_context_view` are auxiliary or still being adjusted.
The preferred operational JSON path is still partial/local, not whole-score.
The first four are context projections for reading and edit judgment.
`score_patch_request` is a wrapper that bundles a user request with bounded context.

## Projection Overview

### `measure_detail_view`

Purpose:

- inspect one measure or a tightly bounded measure window
- understand the local timeline, voice lanes, and event sequence
- judge local edit safety without exposing the full score

Typical contents:

- target part / measure identity
- divisions, time signature, key, and clef snapshot where needed
- voice lanes
- time-ordered note / rest events
- local context such as tie / slur / articulation / dynamics where needed
- edit restrictions and diagnostics
- explicit target separation when the view is used for edit proposals

### `note_edit_view`

Purpose:

- perform a safe edit on a single target note or rest
- provide only the minimum surrounding context needed for that edit

Typical contents:

- target note identity
- pitch / duration / rest / chord / grace / cue state
- containing part / measure / voice
- neighboring events
- allowed patch operations and editable fields
- blockers and warnings

### `score_overview_view`

Purpose:

- understand overall score structure
- decide which part / measure / voice should be inspected next
- support drill-down into narrower views

Position:

- auxiliary / future-facing view
- not the primary operational handoff for current generative-model interaction
- not required at the start of the MVP AI editing flow

Typical contents:

- score metadata summary
- parts list
- measure count
- per-part measure ranges
- high-level warnings
- edit scope summary

### `selection_context_view`

Purpose:

- reflect the currently selected UI target
- provide a narrow context view without exposing unrelated score regions

Position:

- auxiliary view whose role is still being refined
- if it remains note-only, it may later be merged into `note_edit_view`

Typical contents:

- selection type
- selected node id or another stable AI-facing token
- resolved part / measure / voice context
- minimal surrounding context
- allowed change boundary for the current selection

### `score_patch_request`

Purpose:

- package a user request together with bounded views
- make the patch contract explicit for the AI

Typical contents:

- user instruction
- bundled views
- `rules`
- expected output mode

## Conditions For AI-Friendly JSON

Using JSON is not sufficient by itself.
The real question is what kind of JSON a generative model can read reliably while minimizing unsafe inference.

At minimum, `mikuscore` should prefer JSON that satisfies the following conditions.

### 1. High locality

- the exposed region should be limited to the smallest practical part / measure / note neighborhood
- the AI should not need to inspect unrelated regions
- if the edit target is local, the input JSON should also stay local

### 2. Readable timeline structure

- notes and rests should be represented as timeline / event data rather than visual coordinates
- at minimum, `measure -> voice -> events in time order` should be easy to follow
- simultaneity, voice separation, and duration relationships should be visible directly in JSON

### 3. Clear boundaries

- `part`, `measure`, `voice`, and `event` boundaries must be explicit
- the line between editable target and surrounding context must be clear
- if backup / forward or similar structural boundaries matter, the JSON should be able to express that

### 4. Separation between editable target and preserved context

- the AI must not confuse visible context with editable authority
- surrounding notes may be exposed as context while only one target note is editable
- the JSON shape should not suggest that everything visible may be changed

### 5. Low incentive for guesswork

- the JSON should not encourage the AI to invent missing notes, symbols, or metadata
- when information is intentionally omitted, the omission should be explicit where practical
- it should be easier to tell “not exposed” apart from “does not exist”

### 6. Easy co-location of rules

- score context and `rules` should live together naturally
- allowed operations, forbidden targets, and editable fields should be readable in the same payload
- the AI should be able to judge both “what is visible” and “what may be returned” from one input

### 7. Not a raw leak of internal implementation

- the AI-facing JSON should not expose internal MusicXML or DOM structure more than necessary
- however, structural information needed for edit safety must not be dropped
- the goal is neither a raw internal dump nor a purely visual abstraction, but a projection of the meaning the AI actually needs

### 8. Not a direct JSON transcription of full MusicXML

- simply translating MusicXML into JSON does not automatically make it AI-friendly
- preservation information and edit-decision information would remain mixed together
- AI-facing JSON should be a purpose-specific projection, not a replacement syntax for MusicXML

### 9. Easy to split into small round trips

- the representation should support separate overview, measure-level, and note-level exchanges
- one round trip should not try to solve every task at once
- the format should support progressive drill-down where needed

### 10. Natural bridge into patch operations

- the mapping from read-only context JSON to returned Patch JSON should be straightforward
- for example, seeing `target_note.node_id` should make `change_to_pitch.target_node_id` obvious
- projection identifiers and granularity should already match safe patch input units

### 11. Self-describing structure

- the rough meaning should remain understandable even without a long explanatory prompt
- at minimum, `measure -> voice -> events`, `pitch`, `duration`, `offset`, `target`, and `rules` should read naturally
- this “self-describing” property is an important signal that the AI-facing reconstruction is working

## Current Conclusion

At this stage, the most promising AI-facing JSON for `mikuscore` has the following properties:

- it is a bounded projection rather than a full score dump
- it is centered on measure-local timeline / event structure rather than visual layout coordinates
- note-level edit views make the target note and nearby context explicit
- `rules` can live in the same payload
- it connects naturally to bounded Patch JSON
- its field names and structure remain understandable even with only light prompt support

Therefore, `mikuscore` should design AI-facing JSON not as “MusicXML rewritten in JSON”, but as a projection that lets a generative model understand local score meaning and return constrained edit decisions.

## Why Experimental Validation Is Required

A JSON design that looks clean on paper and a JSON design that a model can reliably read and write are not the same thing.

Therefore, `mikuscore` should not finalize AI-facing JSON from desk review alone.
Representative score patterns and edit requests must be tested with real model interactions.

## Experimental Validation Goals

The goal is not only to see whether the model returns a correct answer.
More importantly, the experiment should reveal:

- which fields the AI actually relies on
- where unsafe inference begins
- whether `rules` are obeyed
- whether target and context are confused
- whether returned patches remain minimal

## Representative Test Patterns

Initial experiments should favor a small number of failure-prone patterns rather than broad coverage.

At minimum, include:

- a simple monophonic measure
- a measure containing rests
- a multi-voice measure
- a tie case
- a slur case
- a blocked-target case such as `chord`, `grace`, or `cue`
- a duration-risk case that approaches underfull / overfull behavior

## Experimental Workflow

The default workflow is:

1. create a trial `measure_detail_view` or `note_edit_view`
2. prepare representative edit requests for that JSON
3. send the JSON to an actual model and inspect the explanation and Patch JSON
4. record misreads, unsafe inference, forbidden operations, or oversized edits
5. refine field design and `rules` based on the results

## Current Practical Priority

At this stage, the priority is not to perfect the prose of the spec.
The priority is to prepare minimal experimental JSON and representative cases.

The near-term focus should be:

- trial `measure_detail_view` examples
- representative edit requests
- explicit failure-mode and evaluation criteria

The spec can then be narrowed or adjusted based on real results.

## Identifier Policy

The core uses session-scoped internal node identity.
AI-facing JSON must expose explicit string identifiers and the AI must treat them as opaque tokens.

Representative identifiers may include:

- `part_id`
- `measure_id`
- `measure_number`
- `voice_id`
- `node_id`
- `xml_id`

Rules:

- all identifiers are strings
- the AI must not synthesize new identifiers unless a specific add operation explicitly requires one
- session-scoped IDs are valid only within the current interaction context
- `xml:id` handling is implementation-specific and must not be assumed to be persistent unless explicitly stated

## Measure And Voice Assumptions

- note editing depends on the measure-local timeline
- voice boundaries matter
- backup / forward boundaries and non-editable lanes matter
- a musically plausible change can still be invalid if it crosses a forbidden structural boundary
- chord / grace / cue notes are often outside the editable MVP target set

## Projection JSON Examples

### `score_overview_view` example

```json
{
  "view_type": "score_overview_view",
  "score": {
    "title": "Example Score",
    "movement_title": "Allegro",
    "format": "musicxml",
    "part_count": 2,
    "measure_count": 48
  },
  "parts": [
    {
      "part_id": "P1",
      "name": "Violin",
      "measure_start": "1",
      "measure_end": "48",
      "voice_ids": ["1"]
    }
  ],
  "summary": {
    "warnings": [],
    "editable_command_family": [
      "change_to_pitch",
      "change_duration",
      "delete_note",
      "split_note"
    ]
  }
}
```

### `measure_detail_view` example

```json
{
  "view_type": "measure_detail_view",
  "score": {
    "title": "Example Score"
  },
  "part": {
    "part_id": "P1",
    "name": "Violin"
  },
  "measure": {
    "measure_id": "P1-M12",
    "measure_number": "12",
    "divisions": 8,
    "time": {
      "beats": 4,
      "beat_type": 4
    }
  },
  "voices": [
    {
      "voice_id": "1",
      "events": [
        {
          "node_id": "n-1201",
          "kind": "note",
          "offset": 0,
          "duration": 8,
          "pitch": {
            "step": "C",
            "alter": 0,
            "octave": 4
          },
          "notations": {
            "tie_start": false,
            "tie_stop": false,
            "slur_start": false,
            "slur_stop": false
          },
          "editability": {
            "editable": true,
            "blocked_reasons": []
          }
        }
      ]
    }
  ],
  "target": {
    "target_node_id": "n-1201",
    "target_voice_id": "1"
  },
  "rules": {
    "allow_patch_ops": ["change_to_pitch", "change_duration", "split_note", "delete_note"],
    "forbid_cross_voice_edit": true,
    "forbid_backup_forward_boundary_cross": true
  }
}
```

### `note_edit_view` example

```json
{
  "view_type": "note_edit_view",
  "score": {
    "title": "Example Score"
  },
  "part": {
    "part_id": "P1",
    "name": "Violin"
  },
  "measure": {
    "measure_id": "P1-M12",
    "measure_number": "12"
  },
  "target_note": {
    "node_id": "n-1201",
    "voice_id": "1",
    "kind": "note",
    "is_rest": false,
    "is_chord": false,
    "is_grace": false,
    "is_cue": false,
    "duration": 8,
    "pitch": {
      "step": "C",
      "alter": 0,
      "octave": 4
    }
  },
  "neighbors": {
    "previous_node_id": "n-1200",
    "next_node_id": "n-1202"
  },
  "rules": {
    "allow_patch_ops": ["change_to_pitch", "change_duration", "split_note", "delete_note"],
    "allowed_edit_fields": ["pitch", "duration"],
    "forbid_rest_target_for_duration": true,
    "forbid_chord_target": true,
    "forbid_grace_target": true,
    "forbid_cue_target": true
  }
}
```

### `selection_context_view` example

```json
{
  "view_type": "selection_context_view",
  "selection": {
    "selection_type": "note",
    "node_id": "n-1201"
  },
  "resolved_context": {
    "part_id": "P1",
    "measure_number": "12",
    "voice_id": "1"
  },
  "rules": {
    "allow_patch_ops": ["change_to_pitch"]
  }
}
```

### `score_patch_request` example

```json
{
  "view_type": "score_patch_request",
  "request": {
    "instruction": "Raise the selected note from C4 to D4."
  },
  "views": [
    {
      "view_type": "note_edit_view"
    }
  ],
  "rules": {
    "allow_patch_ops": ["change_to_pitch"],
    "allowed_edit_fields": ["pitch"]
  }
}
```

## `rules` Contract

Each projection may include `rules`.

`rules` are normative. They are not hints.

At minimum, the AI must obey:

- `allow_patch_ops`
- `allowed_edit_fields`
- `forbid_*` restrictions
- any projection-specific edit boundary

If an operation is not allowed by `rules`, the AI must not return it.

## Patch JSON Principles

Patch JSON is an operation list and is intentionally narrower than full score JSON.

Edit mode uses Patch JSON only.

Principles:

- patch application is partial, not full replacement
- unspecified fields mean no change
- forbidden operations must not be returned
- semantic links such as tie / slur should use dedicated operations rather than ad hoc field rewriting
- when unsure, prefer no-op over speculative mutation

## Patch JSON Envelope

```json
{
  "operations": []
}
```

## Safe MVP Patch Operations

Subject to `rules`, the current MVP-aligned operations are:

- `change_to_pitch`
- `change_duration`
- `split_note`
- `delete_note`

`insert_note_after` exists in the core contract but should be treated as an explicitly opt-in operation until AI editing and UI exposure are both clearer.

`ui_noop` is natural as an internal non-mutating core command, but for AI-facing Patch JSON, `operations: []` is usually sufficient and clearer.

## Future Candidate Operations

The following are future candidate names only.
They must not be assumed available unless explicitly listed in `allow_patch_ops`.

- `change_rest_to_pitch`
- `merge_adjacent_rests`
- `create_tie`
- `delete_tie`
- `create_slur`
- `delete_slur`
- `set_articulation`
- `clear_articulation`
- `set_dynamic_mark`
- `clear_dynamic_mark`
- `add_chord_tone`
- `delete_chord_tone`

## MVP Operation Definitions

### `change_to_pitch`

Use this for changing the pitch of a target note.

```json
{
  "op": "change_to_pitch",
  "target_node_id": "n-1201",
  "voice_id": "1",
  "pitch": {
    "step": "D",
    "alter": 0,
    "octave": 4
  }
}
```

Rules:

- `target_node_id` and `voice_id` are required
- `pitch.step` must be `A`..`G`
- `pitch.alter` is typically `-2`..`2`
- this operation must not be used on a forbidden target
- rest-to-note conversion must not be assumed here unless a separate allowed operation or explicit rule is later defined

### `change_duration`

Use this for changing note duration within the allowed local lane.

```json
{
  "op": "change_duration",
  "target_node_id": "n-1201",
  "voice_id": "1",
  "duration": 4
}
```

Rules:

- `target_node_id`, `voice_id`, and `duration` are required
- the AI must not assume global reflow
- if measure integrity would break, `mikuscore` may reject the change

### `split_note`

Use this for splitting one note into two adjacent notes.

```json
{
  "op": "split_note",
  "target_node_id": "n-1201",
  "voice_id": "1"
}
```

Rules:

- the operation is bounded to one target note
- unless the projection says otherwise, the AI must not assume arbitrary split ratios

### `delete_note`

Use this for deleting one target note.

```json
{
  "op": "delete_note",
  "target_node_id": "n-1201",
  "voice_id": "1"
}
```

Rules:

- delete aftermath is implementation-owned by `mikuscore`
- the AI must not assume whether the result becomes a rest or a structural removal

### `insert_note_after`

Use this only when the projection explicitly allows it.

```json
{
  "op": "insert_note_after",
  "anchor_node_id": "n-1201",
  "voice_id": "1",
  "note": {
    "duration": 4,
    "pitch": {
      "step": "E",
      "alter": 0,
      "octave": 4
    }
  }
}
```

Rules:

- the core may define this operation, but AI must not return it unless the current projection explicitly allows it
- UI exposure and AI permission are separate concerns

## Patch JSON Examples

### Pitch change

```json
{
  "operations": [
    {
      "op": "change_to_pitch",
      "target_node_id": "n-1201",
      "voice_id": "1",
      "pitch": {
        "step": "D",
        "alter": 0,
        "octave": 4
      }
    }
  ]
}
```

### Duration change

```json
{
  "operations": [
    {
      "op": "change_duration",
      "target_node_id": "n-1201",
      "voice_id": "1",
      "duration": 4
    }
  ]
}
```

### No change

```json
{
  "operations": []
}
```

## What The AI Must Not Do

- do not return full MusicXML
- do not return a full score JSON replacement in edit mode
- do not rewrite unrelated measures
- do not move notes across voices unless a dedicated allowed operation exists
- do not invent ties, slurs, articulations, dynamics, chord tones, or metadata that are not exposed in the projection
- do not edit forbidden chord / grace / cue targets
- do not assume UI selection IDs remain stable outside the provided context

## Human Explanation vs Machine JSON

- the AI may return short explanation text before the final JSON
- only the final `json` code fence should be treated as machine-consumable
- if no safe change is possible, the final JSON should be an empty `operations` array

## Output Rules

- short explanation text is allowed in interactive usage
- the final machine-consumable payload must be the last `json` code fence
- in edit mode, that final JSON block is always Patch JSON
- if the instruction is ambiguous or exceeds `rules`, prefer minimal change
- if no change should be made, return:

```json
{
  "operations": []
}
```

## Suggested Implementation Stance For `mikuscore`

This section is non-normative but recommended.

- keep projection JSON intentionally narrower than internal MusicXML richness
- prefer note-level and measure-level views over full-score exposure
- represent tie / slur-like semantics with dedicated operations rather than loose field patches
- include explicit blockers in `rules` so the AI can fail safely
- treat AI editing as an extension of the existing `dispatch(command)` boundary, not as a second mutation path

## Future Extension Candidates

- measure-window scoped editing for tie / slur work
- articulation and dynamics patch operations with preserve / degrade policy
- a suggestion-only mode distinct from direct patch mode
- diagnostics-aware patch planning
- projection variants for conversion incident analysis rather than editing

## Summary

For `mikuscore`, the right AI contract is not “send the score and ask the model to rewrite MusicXML”.

The right contract is:

- expose only the bounded score context needed for the task
- make allowed operations explicit
- accept only narrow Patch JSON
- keep semantic validation and actual MusicXML mutation inside `mikuscore`
