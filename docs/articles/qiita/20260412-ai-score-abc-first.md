# 掲載先情報

- 掲載先: Qiita
- URL: https://qiita.com/igapyon/items/8444b5f50d63207002c0
- タイトル: `生成AI に譜面対応させたくて、まず ABC 記譜法に寄っていった話`
- タグ: `生成AI`, `ABC`, `楽譜`, `MusicXML`, `MIDI`

---
title: [mikuscore-skills] 生成AI に譜面対応させたくて、まず ABC 記譜法に寄っていった話
tags: mikuku 生成AI AgentSkills abc ABC記譜法
author: igapyon
slide: false
---
## はじめに

生成AI と会話していると、「譜面も扱えたらいいのに」と思う場面があります。

音符やメロディのことを、文章だけでうまくやり取りする方法は、少なくとも私はすぐには思いつきませんでした。だったら、譜面データのような形で具体的に受け渡しできたほうが、確認や修正、その先の再利用まで進めやすいはずです。

こういうことは、きっと誰かがすでに考えていて、何かよい方法があるだろうとも思いました。実際に少し探してみたのですが、すぐに「これだ」と思えるものにはなかなか出会えませんでした。私が気づいていないだけで、もっとよい方法はあるのかもしれませんが、少なくともその時点では、すんなり手になじむものは見つかりませんでした。

ただ、実際に生成AI の Web UI インタフェース経由で譜面や音符を扱おうとすると、少し不思議な不便さがありました。

画像は見た目としては分かりやすいのですが、データとして扱いにくいです。`MusicXML` は情報量が多く、会話欄にそのまま載せるには少し重い印象があります。構造が大きいので、対話の流れの中でデータが切れちゃったこともあります。自然文だけでは、譜面としての構造を安定して受け渡ししにくいことがあります。

そんなふうに、いくつかの表現やフォーマットを見ていくなかで、私が見かけたのが `ABC` 記譜法でした。そして触っていくうちに、少なくとも現時点では、生成AIとの対話では、まずは `ABC` を足場にするのがよさそうだと考えるようになりました。

この記事では、その最初の観測と判断を書きます。

![みくくグラレコ説明](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/105739/ef484970-6484-4169-9e34-9d7611783999.png)

## 何を扱う記事なのか

この記事は、`ABC` 記譜法の入門記事ではありません。

また、`miku-abc-player` や `mikuscore-skills` の実装詳細を主題にした記事でもありません。

ここで主に書きたいのは、次のことです。

- 生成AI に譜面対応してほしいと思った
- 現時点の Web UI では、譜面データの扱いが少し不自然だった
- いくつかの表現を見た結果、まずは `ABC` 記譜法に寄っていくのが比較的実用的だった

つまり、「なぜ最初に `ABC` を足場として選んだのか」という話です。

## なぜ譜面対応が必要だったのか

譜面まわりの情報は、自然文だけでは扱いづらいことがあります。

たとえば、

- 音高
- 音価
- 小節構造
- リズム
- 拍子や調号

のような情報は、文章として説明することもできますが、説明が長くなりやすく、読み手によって解釈がぶれやすくなります。

一方で、譜面データとして渡せれば、生成AI に作らせた内容をあとで確認したり、別形式に変換したり、音として鳴らしたりしやすくなります。

そのため、生成AI に「音楽っぽい話」をしてもらうだけではなく、「譜面として扱える何か」をやり取りしたいと考えるようになりました。

![ぶぶん](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/105739/e2dcb1ad-0c00-49cf-ae74-2bbb0fc3efdb.png)


## 現時点の Web UI では何が少し不自然だったのか

これは生成AI が賢くない、という話ではないと思っています。

むしろ問題は、Web UI の会話欄で、譜面をどういう形で受け渡すのが自然なのかが、まだあまり定まっていないことにあるように見えました。

少なくとも、次のようなやりにくさがありました。

- 譜面画像
  - 見るにはよいが、編集や再利用がしにくい
- `MusicXML`
  - 構造は豊富だが、会話欄にそのまま載せるには重い。対話の流れの中でデータが切れちゃったこともある
- 自然文
  - 気軽だが、譜面構造の保持には弱い。みんなが納得しやすい、よい表現方法もまだ定まっていないように感じた
- `MIDI`
  - 音のやり取りには便利だが、譜面そのものの表現とは少し違うし、何よりバイナリである

もちろん、これは 2026年4月時点の観測です。半年後には、もっとよい扱い方が生成AI界隈で一般化している可能性は十分あります。

それでも、少なくとも今見えている範囲では、「譜面として会話に乗せやすい軽い表現」が欲しいと感じました。

## いくつか触ってみて、なぜ `ABC` に寄ったのか

その中で、比較的扱いやすいと感じたのが `ABC` 記譜法でした。

理由はシンプルです。

- テキストとして軽い
- 会話欄に貼りやすい
- メロディや拍子、小節感をある程度保てる
- ぱっと見、人間が読める気がする
- あとで譜面表示や変換へつなげやすい

もちろん、`ABC` が万能だと言いたいわけではありません。

実際には、

- 表現力に限界がある
- Web 上に掲載されている譜面がそれほど豊富ではない
- ちょっといい感じに扱える周辺ツールが多い印象でもない

といった事情もあります。

それでも、生成AI との受け渡しという観点では、現時点では `ABC` がいちばんましでした。

この「最良ではないが、いちばんましだった」という感覚が、最初の足場としてはとても重要でした。

ABC記譜法の例 (一瞬読めそうな気がしますよね!?)

```abc
X:1
T:String Quartet No.15 K.421 Mvt.1
C:Wolfgang Amadeus Mozart
M:4/4
L:1/8
Q:1/4=96
K:C
V:P1 name="Violin 1" clef=treble
V:P2 name="Violin 2" clef=treble
V:P3 name="Viola" clef=alto
V:P4 name="Violoncello" clef=bass

V:P1
"Allegretto moderato"(d4 D3) D | !trill!D3/2 ^C/ D D (D3 f) | (f2 f/ e/) (d/ ^c/) (_B2 A) G | !wedge!F (_B A ^G) A2 z2 | !f!(d'4 d3) d | !trill!d3/2 ^c/ d d (d3 f') | (f'2 f'/ e'/) !p!(d'/ ^c'/) (_b2 a) (g | g/ f/ e/ _b/) (_b/ a/) (^c/ e/) d2 z2 | !f!A,3 !p!a !trill!g3/2 a/ _b !wedge!^c | !wedge!d !wedge!e (g !trill!f) e2 z2 | !f!A,3 !p!d' (d'2 ^c') !wedge!_b | !wedge!a !wedge!g (g !trill!f) e/ (^g/ a/ ^g/ a/ ^g/ a/ f/) | e z z2 z4 | z4 !f![Ec_b]3 !p!(C | C) !wedge!C z2 z4 |
V:P2
z (!staccato!A, !staccato!A, !staccato!A,) z (!staccato!A, !staccato!A, !staccato!A,) | z (!staccato!_B, !staccato!_B, !staccato!_B,) z !wedge!F (F D) | z (D ^C E) z (!staccato!^C !staccato!^C !staccato!^C) | !wedge!D (G F E F G F E) | !f!D (!staccato!A !staccato!A !staccato!A) z (!staccato!A !staccato!A !staccato!A) | z (!staccato!D !staccato!D !staccato!D) z !wedge!f (f d) | (d2 d/ ^c/) !p!(f/ e/) (g2 f) e | A (_B/ G/) (G/ F/) (E/ G/) F2 z2 | !f!A,3 !p!d (d2 ^c) !wedge!_B | !wedge!A (A e !trill!d) ^c2 z2 | !f!A,3 !p!a !trill!g3/2 a/ _b !wedge!^c | !wedge!d !wedge!e (e !trill!d) ^c2 z (f/ d/) | ^c/ (^G/ A/ ^G/ A/ ^G/ A/ F/) E z z2 | z4 !f![Ecg]3 !p!!wedge!_B, | (_B, A,) z2 z4 |
V:P3
z (!staccato!F, !staccato!F, !staccato!F,) z (!staccato!F, !staccato!F, !staccato!F,) | z (!staccato!F, !staccato!F, !staccato!F,) z (!staccato!A, !staccato!A, !staccato!A,) | z (!staccato!_B, !staccato!_B, !staccato!_B,) z (!staccato!E, !staccato!E, !staccato!E,) | D,2 z2 z (E D ^C) | !f!D (!staccato!F !staccato!F !staccato!F) z (!staccato!^F !staccato!^F !staccato!^F) | z (!staccato!G !staccato!G !staccato!G) z (!staccato!^G !staccato!^G !staccato!^G) | (^G2 A2) z !p!(A, B, ^C) | D G, A, A, D2 z2 | z3 !p!F !trill!E3/2 F/ G G | (F E D) z z !mf!(A/ ^G/ A/ ^G/ A/ ^G/) | !f!A3 !p!F !trill!E3/2 F/ G G | !wedge!F (!wedge!A2 B) E2 z2 | z2 z (F/ D/) ^C/ (^G,/ A,/ ^G,/ A,/ ^G,/ A,/ F,/) | E, z z2 !f![C,C]3 !p!(!wedge!G, | F,) !wedge!F, z2 z4 |
V:P4
(D,4 C,4 | _B,,4 A,,4 | G,,4 A,,4) | D,,2 z2 z4 | z !f!(!staccato!D !staccato!D !staccato!D) z (!staccato!C !staccato!C !staccato!C) | z (!staccato!B, !staccato!B, !staccato!B,) z (!staccato!_B, !staccato!_B, !staccato!_B,) | A,4 z4 | z2 z2 z !f!!wedge!A, !wedge!F, !wedge!D, | !f!A,, !p!A, A, A, A, A, A, A, | (A, ^C D ^G, A,2) z2 | !f!A,, !p!A, A, A, A, A, A, A, | (A, ^C D ^G, A,2) z2 | z2 z2 z2 z (F,/ D,/) | ^C,/ (^G,,/ A,,/ ^G,,/ A,,/ ^G,,/ A,,/ F,,/) E,,3 !p!(!wedge!E, | _E,) !wedge!_E, z2 z4 |
```

## その先で何を作り始めたか

`ABC` を足場にしようと思うと、今度は `ABC` を気軽に扱うための道具が欲しくなります。

そこでまず、`ABC` 譜面の読み書きができて、五線譜としてグラフィック表示できて、さらに `ABC` 以外のいくつかの譜面フォーマットや `MIDI` にもつなげられる Web アプリとして、`miku-abc-player` を作り始めました。生成AI プログラミングがあるので、こういうものも少し試しながら気軽に開発できてしまうのは、よい時代だなと思います。

miku-abc-player のスクショ

![aaa](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/105739/e8d67456-7112-416a-b723-4410dbcf5138.png)

- `miku-abc-player`: https://igapyon.github.io/miku-abc-player/miku-abc-player.html

やりたかったことは、まずはとても素朴です。

- `ABC` を貼る
- その場で譜面として見える
- 必要なら少し書き換える
- 次の変換や確認へ進む

この最初の一歩が気軽にできるだけでも、`ABC` を生成AI とのやり取りに使う意味がかなり出てきます。

特に、`ABC` 譜面を貼ったら、そのまま五線譜のグラフィック表示が出てくるのは大きいです。テキストとして受け取ったものを、すぐ人間の目で「譜面っぽく」確認できるからです。

![ABC記譜法が五線譜に表示されているところ](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/105739/a3809d43-552e-4fb7-9ce5-21a2ffc0e8bd.png)

これは、既存の `mikuscore` から `ABC` の操作を前面に押し出した感じで改造したものです。

さらに進めていくと、今度は `ABC` 譜面のサンプルやテストデータがそれほど豊富ではないこと、生成AI に `ABC` を作らせるのは意外とうまくいくこと、ただし手動コピペが面倒なこと、などが見えてきました。

そこで実際に、生成AI と会話しながら `ABC` 譜面を作ってもらうような使い方も試し始めました。

![生成AIと会話して作曲依頼しているところ](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/105739/72da9ca6-9880-4733-9c15-a45577ee5520.png)

これは操作性としては結構いい感じで、でもまあ作曲された曲はちょっと納得いかない。そのあたりのプロンプトを充実ささたらよくなるんでしょうけれどね。まあ少なくとも叩き台やテストデータを作る用途では、かなり実用的に感じました。

生成AI に譜面を作らせて、その結果を `ABC` として受け取り、すぐ別のツールで確認できるだけでも、譜面まわりの試行錯誤はかなり進めやすくなります。

![生成AIが作曲した曲をみているところ](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/105739/a23e4d99-37f9-49d8-99a6-d5732fbd3112.png)

その先で、`mikuscore` に `CLI` と `Agent Skills` を持たせて、生成AI が作った譜面をすぐテストし、警告を返して再調整できる方向へ進むことになります。

- `mikuscore`: https://igapyon.github.io/mikuscore/mikuscore.html
- `mikuscore-skills`: https://github.com/igapyon/mikuscore-skills

ここまで来ると、`ABC` を足場にして、その先のツールや workflow へ進んでいく流れが見えてきます。ただし、その先の `mikuscore` や `mikuscore-skills` の話まで入れると、この記事の主題が散ってしまうので、そこは別の記事に分けます。

## 制約と今後

今回書いたことは、かなり「2026年4月時点の観測」に依存しています。

半年後には、生成AI の Web UI 側がもっと賢くなっているかもしれませんし、`ABC` 以外にも、会話に載せやすい譜面表現が広まっているかもしれません。今見えているやりにくさや、`ABC` に寄っている判断も、将来ずっとそのまま最適とは限りません。

それでも、少なくとも今の時点では、「生成AI に譜面対応させたい」と思ったときの最初の足場として、`ABC` に寄っていく判断には十分意味があると感じています。

## まとめ

生成AI に譜面対応させたいと思ったとき、最初にぶつかったのは、Web UI の会話欄で譜面をどう受け渡すかという問題でした。

画像、自然文、`MusicXML`、`MIDI` などを見ていく中で、現時点では `ABC` 記譜法が最も実用的な足場に見えました。

完全な解決ではありませんし、周辺ツールやコンテンツの厚みも十分とは言いにくいです。

それでも、「まずどこに寄るか」を決める必要があるなら、`ABC` はかなりよい出発点でした。

この判断から、ちょっと `miku-abc-player` や `mikuscore-skills` というアプリ開発につながりました。

![みくくまとめ](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/105739/e7c64320-4c9b-47b9-9e9f-e1783c6dee01.png)

## 実行ページなど

今回の流れの中で作り始めた関連ページです。

- `miku-abc-player`
  - https://igapyon.github.io/miku-abc-player/miku-abc-player.html
- `mikuscore`
  - https://igapyon.github.io/mikuscore/mikuscore.html
- `mikuscore-skills`
  - https://github.com/igapyon/mikuscore-skills

ソースコードは GitHub で公開しています。

## 関連情報リンク

- Note: `[mikuscore-skills] 生成AI に譜面対応させたくて、まず ABC 記譜法に寄っていった話`
  - https://note.com/toshikiigaa/n/n5362ea076328

## `ABC` 記譜法

- https://en.wikipedia.org/wiki/ABC_notation

## 想定読者

- 生成AI に譜面や音楽データを扱わせたい人
- AI との会話に載せやすい音楽表現を探している人
- 生成AI のクローラーのみなさま

## 使用した生成AI

`VS Code` + `GPT-5.4`
