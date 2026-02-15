# mikuscore

## English
mikuscore is a browser-only MusicXML score editor.

Its primary goal is reliability, not feature volume: preserve existing MusicXML and apply only safe, minimal edits.

### Core Principles
- Preserve existing MusicXML as much as possible.
- Apply minimal patches (change only required nodes).
- Keep round-trip safety (`load -> edit -> save`).
- Preserve unknown/unsupported elements.
- Preserve `<backup>`, `<forward>`, and existing `<beam>` nodes.
- Roll back atomically on failure.
- Keep Core/UI separated so UI can be replaced later.

### MVP Highlights
- If `dirty === false`, save returns original XML text (`original_noop`).
- Overfull measures are rejected with `MEASURE_OVERFULL`.
- Non-editable voices are rejected with `MVP_UNSUPPORTED_NON_EDITABLE_VOICE`.
- MVP commands: `change_to_pitch`, `change_duration`, `insert_note_after`, `delete_note`, `split_note`.
- Rests are not a normal edit target, but rest-to-note via `change_to_pitch` is allowed.
- Serialization is compact (no pretty-print).

### Supported MusicXML Version
- **MusicXML 4.0**

### Distribution and Development
- Distribution: **single-file web app** (`mikuscore.html`).
- Runtime: offline, no external network dependency.
- Source: split TypeScript files.
- Build: `mikuscore-src.html` + `src/` -> `mikuscore.html`.

### Development Commands
- `npm run build`
- `npm run clean`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:property`
- `npm run test:all`

### Documents
- `docs/spec/SPEC.md`
- `docs/spec/TERMS.md`
- `docs/spec/COMMANDS.md`
- `docs/spec/COMMAND_CATALOG.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/TEST_MATRIX.md`
- `docs/spec/BUILD_PROCESS.md`
- `docs/spec/ARCHITECTURE.md`
- `docs/spec/UI_SPEC.md`
- `docs/spec/SCREEN_SPEC.md`
- `TODO.md`

---

## 日本語
ブラウザ上で完結する MusicXML スコアエディタのプロジェクトです。

このアプリの主眼は「多機能化」ではなく、既存 MusicXML を壊さずに編集する信頼性です。

### 基本方針
- 既存 MusicXML の保全を最優先。
- 最小パッチ編集（必要なノードだけ変更）。
- ラウンドトリップ安全性（`load -> edit -> save`）。
- unknown / unsupported 要素を保持。
- `<backup>` / `<forward>` / 既存 `<beam>` を保持。
- 失敗時は原子的にロールバック。
- 将来の UI 置換を考慮した Core / UI 分離設計。

### MVP 仕様ハイライト
- `dirty === false` の保存は入力 XML をそのまま返す（`original_noop`）。
- 小節 overfull は `MEASURE_OVERFULL` で拒否。
- 非編集対象 voice は `MVP_UNSUPPORTED_NON_EDITABLE_VOICE` で拒否。
- `change_to_pitch` / `change_duration` / `insert_note_after` / `delete_note` / `split_note` をMVPコマンドとして扱う。
- 休符は通常の編集対象外だが、`change_to_pitch` による休符音符化は許可。
- pretty-print なしでシリアライズ。

### 対応 MusicXML バージョン
- **MusicXML 4.0**

### 配布と開発方針
- 配布形態: 単一 HTML（`mikuscore.html`）。
- 実行条件: オフライン動作、外部依存なし。
- 開発形態: 分割 TypeScript ソース。
- ビルド方針: `mikuscore-src.html` + `src/` から `mikuscore.html` を生成。

### 開発コマンド
- `npm run build`
- `npm run clean`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:property`
- `npm run test:all`

### ドキュメント
- `docs/spec/SPEC.md`
- `docs/spec/TERMS.md`
- `docs/spec/COMMANDS.md`
- `docs/spec/COMMAND_CATALOG.md`
- `docs/spec/DIAGNOSTICS.md`
- `docs/spec/TEST_MATRIX.md`
- `docs/spec/BUILD_PROCESS.md`
- `docs/spec/ARCHITECTURE.md`
- `docs/spec/UI_SPEC.md`
- `docs/spec/SCREEN_SPEC.md`
- `TODO.md`
