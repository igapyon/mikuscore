# `utaformatix3-ts-plus.mikuscore.iife.js` Integration Guide

この文書は、`mikuscore` 側の開発者が `utaformatix3-ts-plus` の単一ファイル成果物を組み込むための自立した手順書です。

## 1. 成果物の位置づけ

- ファイル名: `utaformatix3-ts-plus.mikuscore.iife.js`
- 目的: VSQX <-> MusicXML 変換機能を `mikuscore` から利用可能にする
- 形式: IIFE (browser global)
- グローバル公開名: `UtaFormatix3TsPlusMikuscore`

## 2. 循環参照に関する設計

- この成果物は `mikuscore` を静的 import しない。
- `mikuscore` はこの成果物を「外部ユーティリティ」として読み込む。
- 必要な連携はグローバルフック経由で行う。

これにより、`mikuscore` <- `utaformatix3-ts-plus bundle` の一方向依存にできる。

## 3. 提供 API

`UtaFormatix3TsPlusMikuscore` には少なくとも以下が公開される。

- `convertVsqxToMusicXml(vsqxText, options?) => string`
- `convertVsqxToMusicXmlWithReport(vsqxText, options?) => { musicXml, issues }`
- `convertMusicXmlToVsqx(musicXmlText, options?) => string`
- `convertMusicXmlToVsqxWithReport(musicXmlText, options?) => { vsqx, issues }`
- `getMusicXmlAdapter()`
- `setMusicXmlAdapter(adapter)`
- `MikuscoreMusicXmlAdapter`
- `installMikuscoreHooks(hooks)`
- `getMikuscoreHooks()`
- `clearMikuscoreHooks()`

## 4. mikuscore 側への読み込み手順

1. `mikuscore` の配布物に `utaformatix3-ts-plus.mikuscore.iife.js` を同梱する。
2. `mikuscore` 本体スクリプトより先、または利用前に `<script>` で読み込む。
3. 実行時に `window.UtaFormatix3TsPlusMikuscore` の存在を確認する。

HTML例:

```html
<script src="./utaformatix3-ts-plus.mikuscore.iife.js"></script>
<script>
  const uf3p = window.UtaFormatix3TsPlusMikuscore;
  if (!uf3p) throw new Error("utaformatix3-ts-plus bundle not loaded");
</script>
```

## 5. オプション連携フック

`mikuscore` 側の MusicXML 正規化機能を使いたい場合は、`installMikuscoreHooks` で事前注入する。

```js
window.UtaFormatix3TsPlusMikuscore.installMikuscoreHooks({
  normalizeImportedMusicXmlText: (xml) => {
    // mikuscore 側の既存正規化関数を呼ぶ
    return window.mikuscoreNormalizeMusicXml(xml);
  },
});
```

仕様:

- フック名: `globalThis.__utaformatix3TsPlusMikuscoreHooks`
- 利用される関数: `normalizeImportedMusicXmlText(xml: string): string`
- 任意で `parseMusicXmlToProject(xml, options)` / `writeProjectToMusicXml(project, options)` も注入可能
- フック未設定でも動作は継続する（内部フォールバックあり）
- 解除する場合は `clearMikuscoreHooks()` を呼ぶ

## 6. ビルド方法（utaformatix3-ts-plus 側）

```bash
node scripts/build-mikuscore-iife.mjs
```

出力先:

- `dist/utaformatix3-ts-plus.mikuscore.iife.js`

## 7. 動作確認（mikuscore 側の最小確認）

```js
const uf3p = window.UtaFormatix3TsPlusMikuscore;
const report = uf3p.convertVsqxToMusicXmlWithReport(vsqxText, {
  defaultLyric: "あ",
});
if (!report.musicXml) {
  console.error(report.issues);
} else {
  console.log("converted", report.musicXml.length, report.issues);
}
```

## 8. 既知の制約

- 本成果物は `mikuscore` 専用運用を想定。
- Node向けモジュール配布ではなく、ブラウザ読込を優先。
- 詳細な型情報 (`.d.ts`) は同梱していない。

## 9. 受け渡しチェックリスト

- [ ] `utaformatix3-ts-plus.mikuscore.iife.js` を受領
- [ ] `mikuscore` の読み込み順を調整
- [ ] `window.UtaFormatix3TsPlusMikuscore` の存在確認
- [ ] 必要なら正規化フックを注入
- [ ] VSQXサンプル1件で変換確認
- [ ] warning/error (`issues`) をUIまたはログへ接続
