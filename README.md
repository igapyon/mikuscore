# mikuscore

![mikuscore OGP image](screenshots/mikuscore-ogp.png)

mikuscore is a MusicXML-first score converter for people who need to move score data between formats.  
It treats MusicXML as the central interchange format and helps bridge notation tools, file formats, and AI-oriented workflows.

It is distributed as a single-file web app (`mikuscore.html`) and is designed to run offline in a browser.

## What mikuscore is for

mikuscore is a practical tool for:

- moving score data from one format to another
- normalizing score data around MusicXML
- bridging notation software, exchange files, and AI-friendly handoff workflows

## What mikuscore is not

- not a full score engraving editor
- not a replacement for MuseScore or other dedicated notation editors
- not a promise of lossless conversion between every format pair

If you want to edit notation in depth, use a notation editor such as MuseScore.  
mikuscore is for converting, inspecting, and handing score data off.

## Core idea

- MusicXML-first conversion pipeline
- preserve existing MusicXML as much as possible
- keep conversion losses visible through diagnostics and metadata
- stay lightweight and portable

## Supported formats

- MusicXML (`.musicxml`, `.xml`, `.mxl`)
- MuseScore (`.mscx`, `.mscz`)
- MIDI (`.mid`, `.midi`)
- VSQX (`.vsqx`)
- ABC (`.abc`)
- MEI (`.mei`, experimental)
- LilyPond (`.ly`, experimental)

## Typical use cases

- convert ABC, MIDI, or MuseScore data into MusicXML for downstream editing or archival
- export MusicXML into another format for a tool or workflow that does not speak MusicXML directly
- inspect conversion diagnostics instead of silently losing information
- use ABC as a practical handoff format in generative-AI workflows while keeping MusicXML as the canonical score structure

## Related projects

- `mikuscore-skills`
  - agent skills for embedding `mikuscore` into generative-AI workflows and making `mikuscore` score-conversion features easier to use from generative AI
  - https://github.com/igapyon/mikuscore-skills
- `miku-abc-player`
  - a companion web app that makes an ABC-limited subset of `mikuscore` easier to use
  - https://github.com/igapyon/miku-abc-player

## Quick start

### Web app

- open `mikuscore.html` in a browser
- load a score file
- convert and export
- inspect diagnostics if conversion details matter

### CLI

Current CLI is `convert`-first.

Examples:

- `npm run cli -- convert --from abc --to musicxml --in score.abc --out score.musicxml`
- `npm run cli -- convert --from musicxml --to abc --in score.musicxml --out score.abc`
- `npm run cli -- convert --from midi --to musicxml --in score.mid --out score.musicxml`
- `npm run cli -- convert --from musicxml --to midi --in score.musicxml --out score.mid`
- `npm run cli -- convert --from musescore --to musicxml --in score.mscx --out score.musicxml`
- `npm run cli -- convert --from musicxml --to musescore --in score.musicxml --out score.mscx`
- `npm run cli -- render svg --in score.musicxml --out score.svg`

For CLI and development details, see `docs/DEVELOPMENT.md` and `docs/spec/CLI_STEP1.md`.

## Screenshots

![mikuscore screenshot 1](screenshots/screen1.png)
![mikuscore screenshot 2](screenshots/screen2.png)
![mikuscore screenshot 3](screenshots/screen3.png)
![mikuscore screenshot 4](screenshots/screen4.png)

## Documents

User-facing documents:

- `docs/FORMAT_COVERAGE.md`
- `docs/PRODUCT_POSITIONING.md`
- `docs/CONVERSION_PRINCIPLES.md`
- `docs/QUALITY.md`

Contributor and repository workflow:

- `docs/DEVELOPMENT.md`
- `CONTRIBUTING.md`
- `TODO.md`

Implementation specs:

- `docs/spec/SPEC.md`
- `docs/spec/ARCHITECTURE.md`
- `docs/spec/ABC_IO.md`
- `docs/spec/MIDI_IO.md`
- `docs/spec/MUSESCORE_IO.md`

## 日本語

mikuscore は、譜面データを別形式へ持ち替えたい人のための、MusicXML-first な譜面変換ツールです。  
MusicXML を変換の中心に置き、譜面ソフト、交換用ファイル、生成 AI 向けワークフローの橋渡しを行います。

配布形態は単一 HTML (`mikuscore.html`) で、ブラウザでオフライン動作します。

### 用途

- 複数の譜面フォーマット間の変換
- MusicXML を基準にした譜面データ整理
- 他ソフトや AI ワークフローへの受け渡し

### これは何ではないか

- 多機能な浄書エディタではありません
- MuseScore などの本格的な譜面編集ソフトの代替ではありません
- すべての形式間で完全な無損失変換を保証するものではありません

譜面をしっかり編集したい場合は、MuseScore などの既存エディタの利用を推奨します。  
mikuscore は、変換・確認・受け渡しのためのツールです。

### 対応フォーマット

- MusicXML（`.musicxml`, `.xml`, `.mxl`）
- MuseScore（`.mscx`, `.mscz`）
- MIDI（`.mid`, `.midi`）
- VSQX（`.vsqx`）
- ABC（`.abc`）
- MEI（`.mei`、実験的）
- LilyPond（`.ly`、実験的）

### 関連プロジェクト

- `mikuscore-skills`
  - `mikuscore` を生成 AI に組み込み、生成 AI から `mikuscore` の譜面変換機能を利用しやすくするための agent skills
  - https://github.com/igapyon/mikuscore-skills
- `miku-abc-player`
  - `mikuscore` の機能を ABC に限定して使いやすくした companion web app
  - https://github.com/igapyon/miku-abc-player

### はじめかた

- `mikuscore.html` をブラウザで開く
- 譜面ファイルを読み込む
- 変換して書き出す
- 必要なら診断情報を確認する

CLI や開発向け情報は `docs/DEVELOPMENT.md` を参照してください。
