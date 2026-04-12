# 掲載先情報

- 掲載先: Qiita
- 公開記事タイトル: （未記入）
- URL: （未記入）
- スクリーンショット挿入: Qiita に直接アップロード方式 / 未確認

## Qiita 掲載用属性情報

- タイトル: `[mikuscore] Agent Skills で MusicXML / ABC / MIDI などの変換方針を会話で扱いやすくした`
- タグ: `mikuscore`, `MusicXML`, `ABC`, `MIDI`, `AgentSkills`

---
title: [mikuscore] Agent Skills で MusicXML / ABC / MIDI などの変換方針を会話で扱いやすくした
tags: mikuscore MusicXML ABC MIDI AgentSkills
author: igapyon
slide: false
---
## はじめに

`mikuscore` は、MusicXML を中核に据えた譜面フォーマット変換ツールです。

`ABC`、`MusicXML`、`MIDI`、`MuseScore`、`MEI`、`LilyPond` などを扱えますが、実際に生成AI と一緒に使おうとすると、「どの形式を入力にするのか」「どこで `MusicXML` を基軸として考えるのか」「生成AI には何を渡すのか」を毎回説明し直す場面が出てきます。

そこで今回、`mikuscore` 用の Agent Skills である `mikuscore-skills` を作りました。

この skill は、`mikuscore` の変換方針や制約を、会話の中で扱いやすくするためのものです。

## `mikuscore-skills` は何をするものか

`mikuscore-skills` は、生成AI に `mikuscore` 固有の前提を渡しやすくするための skill 集です。

特に大事にしているのは、次の整理です。

- `mikuscore` の内部説明基軸は `MusicXML`
- 生成AI との full-score handoff では現時点では `ABC` を優先
- format 変換は `MusicXML-first` の説明軸で整理する
- loss や limitation は diagnostics として扱う
- `mikuscore` は多機能な浄書エディタの代替ではない

つまり、この skill がやりたいのは、単に「変換できます」と言うことではありません。

`mikuscore` がどういう前提で format を扱っているのかを、会話で壊さずに渡すことです。

## なぜ skill 化したかったのか

譜面や音楽データを生成AI と一緒に扱うとき、単に format 名だけを並べても、意外とうまく話が通りません。

たとえば、

- canonical source は何か
- 生成AI に渡すときの current policy は何か
- `MIDI` や `MuseScore` をどう位置付けるか
- unsupported / experimental / future をどう区別するか

といった整理が必要になります。

これを毎回会話のたびに説明すると、少し手数が多いですし、説明の揺れも起きやすくなります。

そこで、`mikuscore` を明示したときだけ opt-in で発火する skill として切り出しました。

## どういう責務を持たせているか

`mikuscore-skills` の MVP では、skill を細かく分割せず、まず 1 つの `mikuscore` skill として成立させています。

想定している操作単位は、概ね次の 5 つです。

- `convert`
  - source format と target format を整理し、必要なら `MusicXML` を中間説明軸として案内する
- `diagnostics`
  - warning や conversion loss の意味を、`mikuscore` の方針に沿って説明する
- `format-guidance`
  - 各 format を `mikuscore` でどう位置付けるかを整理する
- `ai-handoff`
  - 生成AI に score を渡すときの current policy として `ABC` を案内する
- `workflow`
  - CLI / build / test / local development の使い方を案内する

この構成にしたのは、利用者から見た関心が「ABC 用の skill」「MIDI 用の skill」のように分かれるより、「`mikuscore` でどう扱うか」に集約されやすいと考えたからです。

## `MusicXML` と `ABC` をどう分けているか

この skill でいちばん大事なのは、`MusicXML` と `ABC` の役割を混ぜないことです。

整理すると、次のようになります。

- `MusicXML`
  - `mikuscore` の canonical source
  - 内部説明の正規基軸
  - format 変換の中核
- `ABC`
  - current generative-AI handoff の中心
  - full-score の会話的な受け渡しに向いた形式

この区別を曖昧にすると、「`mikuscore` は AI 向け JSON を前提にしているのか」「`ABC` が内部正規形式なのか」といった誤解が生まれやすくなります。

そのため skill 側では、`MusicXML-first` と `ABC handoff` の二層構造を崩さないようにしています。

## 発火条件を opt-in にしている理由

この skill は、format 名だけでは自動発火しない方針です。

たとえば `MIDI` や `MusicXML` が話題に出ただけでは、自動で `mikuscore` skill を使うとは限りません。

理由は単純で、一般的な作曲相談や一般的な MIDI 編集相談まで `mikuscore` 文脈に引き込むと、かえって不自然になるからです。

そこで、少なくとも MVP では、次のような条件を重視しています。

- 利用者が `mikuscore` と明示する
- `mikuscore` 固有の変換方針や workflow を求める
- 直前まで `mikuscore` 文脈が継続している

この opt-in 型にすることで、汎用会話を壊さずに、必要なときだけ `mikuscore` 固有の制約を前面に出せます。

## 実体 repo と参照先の整理

`mikuscore-skills` では、`mikuscore` 本体を `vendor/mikuscore/` に `git subtree` で取り込む前提を採っています。

これは、単に vendor したかったからではありません。

- `workplace/` は一時作業用で、正式参照先にはしにくい
- skill の参照先をこの repo 内で閉じたい
- upstream 更新を定型手順で追いやすくしたい

といった事情があります。

そのため、仕様確認や安定参照は `vendor/mikuscore/` を優先し、`workplace/` は検討用の作業コピーとして扱う設計です。

## 使い始め方

配布用 bundle を作る場合は、次を実行します。

```bash
npm run build:bundle
```

生成された bundle を、自分の skill home 配下へ配置して使います。

開発中にこの repo の中で確認したい場合は、次の流れです。

```bash
npm test
npm run install:local
```

- `npm test`
  - skill 構成の確認
- `npm run install:local`
  - `skills/mikuscore` を repo-local の `.codex/skills/mikuscore` に同期

その後、新しい Codex セッションで `mikuscore` を明示して試します。

## どういう会話で使うのか

たとえば、次のような会話を想定しています。

```text
mikuscore で、この ABC を MusicXML に変換したいです。
変換上の注意点も教えてください。
```

あるいは、

```text
mikuscore で、生成AI に譜面全体を渡したいです。
今は MusicXML と ABC のどちらを使うのがよいですか。
```

このとき skill は、format 名だけを機械的に処理するのではなく、

- `mikuscore` の current policy
- `MusicXML` と `ABC` の役割分担
- diagnostics や limitation の扱い

を踏まえて返すことを狙います。

## 制約と割り切り

`mikuscore-skills` は、譜面編集の何でも屋を目指しているわけではありません。

少なくとも現時点では、

- `mikuscore` 固有の変換方針を壊さずに伝える
- `MusicXML-first` の説明軸を保つ
- AI handoff では `ABC` を優先する
- unsupported / experimental / future を明確に分ける

ことを主目的にしています。

そのため、一般的な音楽理論の相談や、あらゆる譜面ソフトの横断的な使い方までをこの skill に押し込むつもりはありません。

## まとめ

`mikuscore-skills` は、`mikuscore` の format conversion と AI handoff に関する前提を、会話で扱いやすくするための Agent Skills です。

特に重要なのは、`MusicXML` を内部の正規基軸として保ちつつ、生成AI との full-score handoff では現時点で `ABC` を中心に扱う、という役割分担を明示できることです。

format 名だけでは伝わりにくい運用上の前提を、skill 側へ寄せることで、`mikuscore` を使った会話や案内を少し安定させやすくなりました。

## リポジトリと関連文書

- `mikuscore-skills` リポジトリ
  - （未記入）
- 開発メモ
  - `docs/development.md`
- 設計メモ
  - `docs/agent-skill-design.md`

## 想定読者

- `mikuscore` を生成AI と組み合わせて使いたい人
- `MusicXML` / `ABC` / `MIDI` などの役割分担を整理したい人
- Agent Skills でプロダクト固有の workflow を会話に埋め込みたい人

## Appendix

- この記事は技術寄りの整理を主に扱っています
- 背景や使ってみた実感は Note 側の双子記事へ切り分ける想定です
