# Codex Prompt Template (Spec -> Generate)

Use this template when asking Codex to generate or update core code from project specs.

## Prompt

```md
You are Codex, an expert coding assistant.
I am building a browser-based MusicXML Score Editor.
Generate implementation code according to the formal specifications below.

## Specifications
- SPEC.md
- docs/spec/TERMS.md
- docs/spec/COMMANDS.md
- docs/spec/DIAGNOSTICS.md
- docs/spec/TEST_MATRIX.md

## Output Requirements
Produce the following outputs only:

1. Core implementation files in TypeScript:
   - core/interfaces.ts
   - core/ScoreCore.ts
   - core/commands.ts
   - core/index.ts
   - core/timeIndex.ts
   - core/validators.ts
   - core/xmlUtils.ts
   - tests/unit/core.spec.ts

2. Include:
   - function signatures
   - inline documentation comments
   - logic flow reflecting spec guarantees
   - minimal stubs where details are not finalized
   - no full UI implementation

3. Ensure:
   - strict adherence to core specs
   - tests for RT-0, RT-1, TI-1, TI-2, PT-1, BM-1, BF-1
   - modular, testable code

4. Add clear comments for:
   - DOM vs WeakMap node identity
   - dirty tracking rules
   - measure capacity / occupied time logic
   - backup/forward preservation boundaries

## Constraints
- no pretty printing for XML serialization
- do not mutate unsupported XML nodes
- do not auto-normalize beams
- edits must be minimal patches
- core API must stay UI-composable

## Output Format
Respond with a single JSON object:
{
  "files": [
    { "path": "...", "content": "..." }
  ],
  "instructions": "How to use generated code"
}

If anything in specs is unclear or contradictory, ask one focused clarification question first.
```

## Notes

- Paste actual spec contents (or file references, depending on your environment).
- Keep the requested file list explicit to reduce scope drift.
