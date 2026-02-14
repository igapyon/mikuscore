# Spec-to-Code Workflow

## Goal

Generate consistent core code from the project specs without violating preservation rules.

## Steps

1. Confirm specs are up to date:
- `SPEC.md`
- `docs/spec/TERMS.md`
- `docs/spec/COMMANDS.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/TEST_MATRIX.md`

2. Start from `docs/generation/CODEX_PROMPT_TEMPLATE.md`.

3. Keep output scope fixed:
- only requested files
- no UI implementation
- no extra architecture outside MVP unless explicitly requested

4. Verify generated code against constraints:
- no-op save returns original XML unchanged
- dirty state changes only on successful content edits
- overfull rejects atomically with `MEASURE_OVERFULL`
- non-editable voice rejects with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`
- unknown elements remain preserved
- existing beam/backup/forward remain preserved

5. Run and extend tests based on `docs/spec/TEST_MATRIX.md`.

## Review Checklist

- Is save mode correctly split into `original_noop` and serialized mode?
- Are failed commands mutation-free?
- Is node identity managed outside XML (WeakMap)?
- Are unsupported nodes untouched?
- Is there any implicit pretty-printing or normalization?
