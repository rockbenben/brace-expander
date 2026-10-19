<h1 align="center">
格式批量生成
</h1>
<p align="center">
    <em>不用再手打 100 个字段名，写一行 bash 花括号模板</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a> <a href="https://github.com/rockbenben/365opensource"><img src="https://img.shields.io/badge/365%20%E5%BC%80%E6%BA%90%E8%AE%A1%E5%88%92-%23043-1f6feb" alt="365 开源计划 #043"></a>
</p>

<p align="center">
    <a href="https://tools.newzone.top/zh/brace-expander"><b>👉 在线体验</b></a> · <a href="./README.md">English</a>
</p>

![格式批量生成：左边模板，右边展开后的清单](./public/img/brace-expander-zh.webp)

**它做什么**：你写一行 `f{1..4}pd_ever_od30_{tag,bal}`，八个名字一次给你。语法就是 bash 的花括号展开，输出与 bash 逐行一致；多组花括号自动组合，配上分隔符与前后缀还能直接拼成完整的 SQL 语句。

## 适用范围

| 项目 | 说明 |
| --- | --- |
| **运行环境** | 任意现代浏览器——无需安装、无需构建，离线可用 |
| **输出上限** | 单次 10,000 行；超过时明确提示，而不是悄悄截断 |
| **数据** | 不离开页面——展开是纯前端 JS 运算 |
| **界面语言** | 19 个语种，页头可切换：English · 简体中文 · 繁體中文 · Español · Português · Français · Deutsch · Italiano · 日本語 · 한국어 · हिन्दी · বাংলা · Bahasa Indonesia · Tiếng Việt · ไทย · Русский · Türkçe · العربية · Magyar |
| **与 bash 的一致性** | 下列每一种花括号写法都与 bash 逐行一致；唯一的有意差异是「已知限制」里的分组顺序 |

## 核心特性

- **bash 花括号展开**：`{1..100}`、`{1..100..2}` 步长、`{001..100}` 补零、`{a..e}` 字母区间、`{tag,bal}` 枚举，以及 `\{` `\}` `\,` 字面量
- **自动笛卡尔积**：多组花括号自己组合——`{a,b}{1,2}` → `a1 a2 b1 b2`
- **两种输出顺序**：**交叉**（默认，与 bash 一致）或**分组**，后者让最右边的变量整个跑完——条目相同，排列不同
- **整块包裹**：行分隔符 + 整体前/后缀，一次拼出 `IN ('a', 'b')`、JSON 数组、INSERT 语句
- **模板历史**：反复要用的配方存下来，下次一键取回

## 使用方法

1. 打开上面的在线体验，在 **模板** 框里写一行，如 `f{1..4}pd_ever_od30_{tag,bal}`。
2. 展开结果立刻出现在下方，并实时显示行数。
3. **复制**或**导出**。要拼成 SQL 或 JSON，就设置行分隔符与整体前缀 / 后缀。

需要多条规则？写多行——每行独立展开、按行序拼接。常用模板点 **保存** 存进历史。

## 常用配方

- **字段名批量生成** —— `f{1..100}pd_ever_od30_{tag,bal}`
- **URL 清单** —— `https://example.com/{a,b,c}/{1..20}`
- **文件名** —— `img_{001..100}.png`
- **SQL `IN (...)`** —— 模板 `'{1}'`，分隔符 `, `，前缀 `IN (`、后缀 `)`
- **SQL `INSERT ... VALUES`** —— 模板 `('{1}', '{2}')`，分隔符 `,\n`，整体前缀 `INSERT INTO t (a, b) VALUES\n`、后缀 `;`
- **JSON 数组** —— 模板 `"{1}"`，分隔符 `,\n`，前缀 `[\n`、后缀 `\n]`

## 已知限制

- **分组顺序不是 bash 的行为。** 让最右边的变量先整个跑完是本工具**有意增加**的；bash 永远是交叉。两种模式的条目完全相同，只有排列不同。
- **10,000 行上限。** 展开超过上限时**不产出**部分结果，免得你把半截清单当成完整结果用——宁可把区间改小。
- **写错的地方会原样留着。** `{a}`、`{1..}`、`{1..3.5}` 不是合法花括号形式，所以它们会原样输出而不是报错。模板哪里写坏了，一眼就能看出来。

## 文档与部署

详细使用说明与部署指南见 **[官方文档](https://docs.newzone.top/guide/text/brace-expander.html)**。

## 关于 365 开源计划

[365 开源计划](https://github.com/rockbenben/365opensource) 的第 **#043** 个项目——一个人 + AI，一年 300+ 个开源项目。

[提交你的需求 →](https://365.aishort.top/) · [Discord](https://discord.gg/PZTQfJ4GjX) · [Telegram](https://t.me/aishort_top)
