# Conversion Principles

## Core Principles

1. MusicXML-first
- MusicXML is the baseline representation and semantic anchor.
- Conversion logic should avoid unnecessary transformations away from MusicXML intent.

2. Preserve before enrich
- Preserve existing information first.
- Do not aggressively infer notation when source data is ambiguous.

3. Loss visibility
- When full fidelity is not possible, emit diagnostics and metadata that make the loss explicit.
- Keep debugging fields available for import incident analysis.

4. Stable round-trip
- Optimize for predictable behavior across repeated conversions.
- Prefer deterministic output over format-specific "smart" rewriting.

## Practical Rules

- Preserve unknown/unsupported elements when possible.
- Keep `<backup>`, `<forward>`, and existing structural timing intent stable.
- Apply bounded and local transformations only; avoid unrelated global rewrites.
- Ensure failed operations are atomic.

## Scope Note

These principles define behavior goals for conversion, inspection, and handoff workflows.
They do not define mikuscore as a general-purpose notation editor.
Detailed normative rules remain in `docs/spec/*`.
