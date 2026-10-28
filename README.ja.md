# lifesim-kit

[中文](README.md) · [English](README.en.md)

テキストで遊ぶ「人生シミュレーション」用の小さなエンジンです。シナリオはすべて JSON に書き、エンジンはイベントを引いて、数値を動かして、エンディングを決めるだけ。依存ゼロで、ブラウザでも Node でも動きます。

**[デモで遊ぶ →](https://jasonin2099.github.io/lifesim-kit/)**（サンプル：『入社半年』、1 回 3 分ほど。表示は中国語／英語）

> 以前作った人生シミュゲームから骨組みだけ取り出したものです。サンプルのシナリオは新しく書きました。まだ粗削りです。

## 中身

- `engine/`：数百行
  - ターン制。そのターンの固定イベント → イベントプールから重み付きで `perTurn` 件
  - 共通の条件記法：`{stat, min, max}` `{flag}` `{turn}` `{seen}` `{all|any|not}`
  - 成功率つきの選択肢（`chance` + `success` / `failure`）、幅のある効果（`[lo, hi]`）
  - 繰り返し出るイベント（`once: false`）。`cooldown: n` で出た後 n ターン休ませられます
  - イベントの `onEnter` 効果：イベントが表示された時点で（選ぶ前に）適用。例：雨でまずおにぎりが 2 個濡れる。ロードしても二重には適用されません
  - シード付き乱数。状態はセーブに入るので、ロード後も同じ乱数列が続きます
  - `validatePack()` が数値名のタイプミス・ID 重複・フォールバックエンディング漏れを検出。`packWarnings()` は `turns` / `fixed` が総ターン数の範囲外で出現しないイベントを警告（シミュレーターが最初に表示）
- `tools/simulate.mjs`：ボットに千回ずつ遊ばせて、エンディング分布・数値の中央値・一度も出なかったイベントを表示
- `packs/first-job/`（『入社半年』）と `packs/night-market/`（『夜市の五晩』）：サンプルシナリオ 2 本（中国語／英語）。シナリオを差し替えられることの確認用
- `index.html` + `demo/`：そのまま GitHub Pages に置ける遊べるページ。`?pack=night-market` でシナリオを切り替え（[遊ぶ](https://jasonin2099.github.io/lifesim-kit/?pack=night-market)）、タイトル画面にも切り替えリンクあり

## 動かす

```bash
npm test
npm run simulate
npm run simulate -- --curve   # ターンごとの数値の中央値も表示
npm run serve     # http://localhost:8000
```

JSON の書き方は[中国語版 README](README.md#写自己的剧本) の例を、全フィールドの説明は [docs/pack-format.md](docs/pack-format.md)（英語）を見てください。

ロードマップ：[ROADMAP.md](ROADMAP.md) ・ MIT License
