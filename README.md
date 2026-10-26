# lifesim-kit

[![demo](https://img.shields.io/badge/demo-live-DA291C?style=flat)](https://jasonin2099.github.io/lifesim-kit/)
[![stars](https://img.shields.io/github/stars/Jasonin2099/lifesim-kit?style=flat&label=stars&color=1D1D1F&logo=github)](https://github.com/Jasonin2099/lifesim-kit/stargazers)
[![last commit](https://img.shields.io/github/last-commit/Jasonin2099/lifesim-kit?style=flat&label=last%20commit&color=1A7F37)](https://github.com/Jasonin2099/lifesim-kit/commits/main)
[![license](https://img.shields.io/github/license/Jasonin2099/lifesim-kit?style=flat&label=license&color=6E6E73)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-3C3C43?style=flat&logo=javascript&logoColor=white)](https://developer.mozilla.org/docs/Web/JavaScript)

[English](README.en.md) · [日本語](README.ja.md)

一个很小的「人生模拟」文字游戏引擎。剧情全写在 JSON 里，引擎只管抽事件、算数值、判结局。零依赖，浏览器和 Node 都能跑。

**[在线试玩 →](https://jasonin2099.github.io/lifesim-kit/)**（附带的示例剧本：《入职半年》，6 个月，3 分钟一局）

> 这是从我做过的一个人生模拟小游戏里抽出来的骨架，示例剧本是重新写的。现在还很粗糙，慢慢补。

## 有什么

- `engine/` 引擎本体（几百行）
  - 回合制：每回合先出固定事件，再从事件池按权重抽 `perTurn` 个
  - 一套共用的条件语法：`{stat, min, max}` `{flag}` `{turn}` `{seen}` `{all|any|not}`
  - 选项可以带成功率（`chance` + `success` / `failure`）、数值区间随机（`[lo, hi]`）
  - 带种子的随机数，状态存在存档里，读档后随机序列也接得上
  - `validatePack()` 会抓拼错的数值名、重复 id、缺兜底结局；`packWarnings()` 提醒 `turns` / `fixed` 超出回合数、永远不会出现的事件（模拟器开头会打印）
- `tools/simulate.mjs` 批量模拟：让几种机器人各玩一千局，看结局分布、数值中位数、哪些事件从来没出现过
- `packs/first-job/` 示例剧本（中英双语）
- `index.html` + `demo/` 可玩的网页，直接放 GitHub Pages

## 跑起来

```bash
npm test                 # 引擎测试
npm run simulate         # 批量模拟示例剧本
npm run simulate -- --bot reckless   # 只跑一个机器人
npm run simulate -- --curve          # 再打印每回合开始时的数值中位数（--json 里也有 curve）
npm run serve            # 打开 http://localhost:8000
```

模拟输出大概长这样：

```
[max-skill] 1000 runs
   50%  Passed
   29%  Made it
   21%  Next stop
  median: energy 60 · mood 68 · skill 39 · money 1160

never seen events: none
unreached endings: burned_out
```

最后两行就是调平衡时最有用的信息：写了但玩家几乎碰不到的内容。

## 写自己的剧本

每个字段的含义和默认值见 [docs/pack-format.md](docs/pack-format.md)（英文）。

```json
{
  "id": "my-pack", "turns": 6, "perTurn": 2,
  "stats": { "energy": { "initial": 70, "min": 0, "max": 100 } },
  "events": [
    { "id": "rain", "turns": [1, 6], "weight": 2, "when": { "stat": "energy", "min": 20 },
      "title": "下雨了", "text": "…",
      "choices": [
        { "label": "冲出去", "effect": { "energy": -5, "flag": "wet" }, "result": "…" },
        { "label": "赌它会停", "chance": 0.5,
          "success": { "result": "停了。" }, "failure": { "effect": { "energy": -10 }, "result": "没停。" } }
      ] }
  ],
  "endings": [
    { "id": "tired", "immediate": true, "when": { "stat": "energy", "max": 0 }, "title": "…" },
    { "id": "ok", "title": "…" }
  ]
}
```

文字字段可以是字符串，也可以是 `{ "zh": "…", "en": "…" }`，引擎不碰文字，只有 UI 会读。

```js
import { createGame } from './engine/game.js';
const g = createGame(pack, { seed: 42 });
while (!g.state.ended) { console.log(g.current().id); g.choose(0); }
console.log(g.ending());
```

## 计划

见 [ROADMAP.md](ROADMAP.md)。

MIT License
