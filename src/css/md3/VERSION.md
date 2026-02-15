# MD3 Spec Versions

## English
- local-html-tools MD3 Token Spec: `v1.0.0`
- local-html-tools MD3 Core Spec: `v1.0.2`
- local-html-tools MD3 Icon Spec: `v1.0.0`

## Policy
- `token-spec.css` defines standard design tokens (`:root` / `--md-sys-*`).
- `core-spec.css` defines standard shared component styles.
- `icon-spec.svg` defines standard SVG symbols (menu/copy/refresh).
- `docs/*.html` may include full standard sets, including currently unused definitions, to preserve spec compliance.

## Change Log
- `v1.0.0` (2026-02-08)
  - Initial extraction of Token/Core from `md3/index.html`.
- `v1.0.1` (2026-02-08)
  - Changed checked switch knob color to white (`md-switch-input:checked + .md-switch::after`).
- `v1.0.2` (2026-02-08)
  - Removed `font-weight` from `md-switch-label` to prioritize page typography.
- `v1.0.0` (2026-02-08, Icon Spec)
  - Added standard SVG symbols for menu/copy/refresh (`href` + `xlink:href`).

---

## 日本語
- local-html-tools MD3 Token Spec: `v1.0.0`
- local-html-tools MD3 Core Spec: `v1.0.2`
- local-html-tools MD3 Icon Spec: `v1.0.0`

## 方針
- `token-spec.css` は標準トークン定義（`:root` / `--md-sys-*`）。
- `core-spec.css` は共通コンポーネントの標準スタイル定義。
- `icon-spec.svg` は標準 SVG シンボル定義（menu/copy/refresh）。
- `docs/*.html` には未使用定義を含む標準セットを貼り付けてよい（仕様準拠優先）。

## 変更履歴
- `v1.0.0` (2026-02-08)
  - `md3/index.html` 掲載の Token/Core を初回切り出し。
- `v1.0.1` (2026-02-08)
  - `md-switch` の checked ノブ色を白に変更（`md-switch-input:checked + .md-switch::after`）。
- `v1.0.2` (2026-02-08)
  - `md-switch-label` の `font-weight` を削除し、ページ側タイポグラフィを優先。
- `v1.0.0` (2026-02-08, Icon Spec)
  - menu / copy / refresh の標準 SVG シンボルを追加（`href` + `xlink:href` 併記）。
