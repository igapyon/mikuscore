# Canonical MusicXML State

## Purpose

This document defines the canonical score-state policy for miku-score.

miku-score is MusicXML-first. MusicXML is the canonical score state used for
conversion, inspection, diagnostics, light editing, CLI state commands, Web
preview/download flows, and Agent Skills handoff workflows.

This does not mean that miku-score promises byte-for-byte preservation of every
input file. It means that product semantics are centered on a current
MusicXML state, and surrounding formats are imported into or exported from that
state.

Cross-format mapping outcomes are indexed in `docs/spec/FORMAT_MAPPING.md`.

## Canonical State Rule

The canonical state is a MusicXML document that miku-score can parse, inspect,
validate, edit in bounded ways, and serialize.

The canonical state SHOULD preserve source MusicXML structure as much as
practical. When input comes from another format, miku-score MAY synthesize the
MusicXML structure required to represent the imported score.

The canonical state MUST NOT silently imply full fidelity for source-format
features that MusicXML cannot represent, that miku-score does not currently
map, or that were approximated during import.

## Product Boundary

The miku-soft layer responsibilities are already defined by the shared
miku-soft references. For miku-score, apply them as follows:

- The `10 Main Application` layer owns MusicXML canonical semantics,
  conversion behavior, diagnostics, CLI contracts, runtime bundles, and
  structured artifacts.
- The `11 Web App` layer is a human operation surface over the main
  application. It owns browser file loading, preview, diagnostics display, and
  download behavior, but not independent conversion semantics.
- The `40 Agent Skills` layer is an agent workflow adapter over the upstream
  product. It owns activation, workflow guidance, runtime discovery, and
  handoff policy, but not independent conversion semantics.

If Web or Agent Skills workflows need new musical behavior, add or stabilize
that behavior in the main application first, then expose it through the
downstream layer.

## Surrounding Format Policy

Formats other than MusicXML are surrounding formats.

| Format | Canonical relationship | Current policy |
|---|---|---|
| MusicXML | Canonical input/output state | Preserve original structure where practical; no-op save returns original text unchanged |
| MuseScore | Surrounding notation format | Import/export through MusicXML; parity work should focus on notational meaning and diagnostics |
| MIDI | Surrounding performance-event format | Import requires notation reconstruction; export derives playback events from MusicXML |
| ABC | Surrounding compact text notation | Useful for AI/human handoff; import/export through MusicXML with documented subset and `mks` hints where needed |
| MEI | Surrounding notation/archive format | Experimental import/export through MusicXML; diagnostics should make unsupported mappings visible |
| LilyPond | Surrounding text engraving format | Experimental import/export through MusicXML; `mks` hints may preserve miku-score-specific roundtrip metadata |
| VSQX | Surrounding singing/vocal timing format | Import/export through vendored integration; treat vocal/timing information as source-format-specific unless mapped into MusicXML explicitly |

## Import Policy

Import from a surrounding format MUST produce a MusicXML state or fail with a
diagnostic.

An importer SHOULD classify each source feature into one of these outcomes:

- preserved in normal MusicXML
- represented through miku-score extension metadata such as `mks:meta:*`
- retained as source-preservation metadata such as `mks:src:*`
- approximated with a warning diagnostic
- skipped with a warning diagnostic
- rejected with an error diagnostic

Importers SHOULD avoid broad musical repair that is not required at the import
boundary. Required structural normalization is allowed when it makes the
resulting MusicXML loadable, inspectable, and renderable.

## Export Policy

Export to a surrounding format MUST start from the current canonical MusicXML
state.

An exporter SHOULD classify each MusicXML or miku-score extension feature into
one of these outcomes:

- represented in the target format
- represented through target-format comments or hints
- approximated with a warning diagnostic
- skipped with a warning diagnostic
- rejected with an error diagnostic

Exporters SHOULD keep output deterministic enough for tests and review.

## Diagnostics Policy

Diagnostics are part of the product contract, not incidental UI text.

When conversion applies approximation, repair, fallback, skipped data, or
unsupported behavior, the behavior SHOULD be visible through diagnostics. Where
useful for roundtrip or downstream review, diagnostics MAY also be preserved in
MusicXML `miscellaneous-field` values using the namespace policy in
`docs/spec/MISCELLANEOUS_FIELDS.md`.

Diagnostics intended for humans, scripts, and Agent Skills SHOULD include
enough context to locate the issue, such as stage, source format, target
format, part, measure, staff, voice, and feature type when available.

## Roundtrip Policy

miku-score does not guarantee byte-for-byte roundtrip equality across formats.

Roundtrip confidence SHOULD be based on musical and structural invariants:

- measure count and ordering where applicable
- part and voice/lane validity
- beat-capacity validity
- pitch, rest, duration, and chord semantics where the target format can
  represent them
- key, time, clef, tempo, lyrics, articulations, dynamics, and layout only to
  the degree declared by the format-specific policy

For each focused notation topic, tests SHOULD classify target formats as
`must-preserve` or `allowed-degrade`, as described in
`docs/spec/TEST_CFFP.md`.

## AI Handoff Policy

AI-facing workflows SHOULD avoid handing an entire score to an agent when a
smaller projection is enough.

Preferred MusicXML-centered edit flow:

1. Inspect a bounded MusicXML projection such as one measure.
2. Generate a bounded core command.
3. Validate the command.
4. Apply the command.
5. Diff the before/after MusicXML state.

The current CLI `state` family is the main public surface for this flow.

## Non-Goals

miku-score is not a full score engraving editor, a full MuseScore replacement,
or a guarantee of lossless conversion between every format pair.

Deep layout editing, global re-engraving, full voice reconstruction, and
complete source-format preservation are outside the canonical state guarantee
unless a format-specific spec explicitly brings a feature into scope.
