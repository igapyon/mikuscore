# Clef / Staff Selection Policy (Draft)

## Purpose

This document defines deterministic clef/staff selection rules for track-level notation output.
Primary target is MIDI-derived import where explicit staff/clef information is weak or absent.

## Scope

- Input unit: one logical track (or one part candidate).
- Output unit:
  - single staff with one clef, or
  - grand staff (2 staves: upper/lower).

## Pitch Thresholds

- `A3 = MIDI 57`
- `C4 = MIDI 60`
- `D4 = MIDI 62`

## Decision Flow

1. Decide whether to use grand staff (2 staves).
2. If not grand staff, choose a single clef.
3. If grand staff, split notes into upper/lower staff.

## Rule 1: Grand Staff Decision

Use grand staff if both are true in the same track:

- minimum pitch `<= A3 (57)`
- maximum pitch `>= D4 (62)`

Otherwise, do not use grand staff.

## Rule 2: Single-Clef Decision (Non-grand Case)

- Compute median pitch from all note events in the track.
- If `median < C4 (60)`: use bass clef (`F`).
- If `median >= C4 (60)`: use treble clef (`G`).
- If there are no notes: default to treble clef (`G`).

## Rule 3: Grand Staff Clefs and Note Split

When grand staff is selected:

- Upper staff clef is fixed to treble (`G`).
- Lower staff clef is fixed to bass (`F`).
- Base split:
  - `>= C4 (60)` -> upper
  - `<= B3 (59)` -> lower

### Flow-preserving correction (anti-flip)

To reduce unnatural rapid switching between staves, apply a continuity correction:

- Keep recent staff assignment context per local phrase/time adjacency.
- For boundary-area notes (around `B3/C4`), prefer previous staff if musically reasonable.
- Do not violate hard constraints that would create severe ledger-line jumps compared to neighboring notes.

Implementation details may evolve, but behavior MUST remain deterministic.

## Empty / Degenerate Cases

- No pitched notes in the track:
  - single staff + treble clef (`G`)
- Percussion or non-pitched-only tracks:
  - handled by existing percussion policy (out of scope for this document).

## Test Expectations

Minimum required tests:

1. Grand staff is selected when range crosses `A3..D4` condition.
2. Single bass clef is selected when median is below `C4`.
3. Single treble clef is selected when median is at/above `C4`.
4. No-note track defaults to treble clef.
5. Grand split keeps `C4` in upper and `B3` in lower.
6. Flow-preserving correction prevents excessive one-note flip-flop near boundary.

## Notes

- This policy optimizes readability, not strict performer hand semantics.
- Threshold constants are intentionally explicit and centralized for future tuning.
