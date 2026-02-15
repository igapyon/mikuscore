# MD3 Spec Versions

- local-html-tools MD3 Token Spec: `v1.0.0`
- local-html-tools MD3 Core Spec: `v1.0.2`
- local-html-tools MD3 Icon Spec: `v1.0.0`

## Policy

- `token-spec.css` は `local-html-tools MD3 Token Spec`（`:root` / `--md-sys-*` の標準トークン定義）。
- `core-spec.css` は `local-html-tools MD3 Core Spec`（共通コンポーネントの標準スタイル定義）。
- `icon-spec.svg` は `local-html-tools MD3 Icon Spec`（menu/copy/refresh の標準SVG定義）。
- `docs/*.html` には、未使用定義を含む標準セットを貼り付けてよい（仕様準拠を優先）。

## Change Log

- `v1.0.0` (2026-02-08)
  - `md3/index.html` 掲載の Token/Core を初回切り出し。
- `v1.0.1` (2026-02-08)
  - `md-switch` の checked ノブ色を白に変更（`md-switch-input:checked + .md-switch::after`）。
- `v1.0.2` (2026-02-08)
  - `md-switch-label` の `font-weight` を削除し、ページ側タイポグラフィを優先する。
- `v1.0.0` (2026-02-08, Icon Spec)
  - menu / copy / refresh の標準SVGシンボルを追加（`href` + `xlink:href` 併記運用）。
