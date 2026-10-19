/**
 * bash 兼容的花括号展开 —— 本工具唯一的算法核心。
 *
 * 【为什么照抄 bash 而不是自创语法】因为 bash 的花括号展开是**有外部基准的**：
 * 同一串模板交给 `printf '%s\n' <模板>`（不加引号）就能拿到权威结果，测试直接拿它当期望值。
 * 自创语法没有这个性质——每条规则都只能靠"实现者觉得对"来判定。语法与 bash 越接近，
 * 这个基准越能用；偏离 bash 的地方（见下方 MAX_EXPANSIONS）必须显式记在 AGENTS.md 里。
 *
 * ⚠ **基准调用形式必须不加引号**：`printf '%s\n' 'f{1..3}'`（单引号）与双引号版本**都不展开**，
 * 原样吐出模板，拿它当期望值就是假绿。详见 AGENTS.md「Key Conventions → 格式批量生成」。
 */

/** 展开总数上限。bash 没有上限，这是本工具有意偏离的一处。 */
export const MAX_EXPANSIONS = 10_000;

/**
 * 多个变量时**哪个跑得最慢**。
 *
 * - `interleave`：左侧变量最慢，每个变量轮流变一次 —— 与 bash 一致（`{1..2}_{tag,bal}`
 *   → `1tag 1bal 2tag 2bal`）。这是默认。
 * - `grouped`：右侧变量最慢，左边那个**整个跑完**再换下一个（同样模板 → `1tag 2tag 1bal 2bal`）。
 *   需要「先列完全部 tag，再列完全部 bal」时用；条目集合与顺序无关，只换排列。
 *
 * ⚠ 只有 `interleave` 与 bash 逐行一致 —— `grouped` 是**本工具有意偏离**的第二处
 * （第一处是展开上限），测试里它不参与 bash 对表。
 */
export type ExpandOrder = "interleave" | "grouped";

export type ExpandCtx = { limit: number; order: ExpandOrder };

export const DEFAULT_CTX: ExpandCtx = { limit: MAX_EXPANSIONS, order: "interleave" };

const ctxOf = (o?: Partial<ExpandCtx>): ExpandCtx => ({
  limit: o?.limit ?? DEFAULT_CTX.limit,
  order: o?.order ?? DEFAULT_CTX.order,
});

class LimitExceeded extends Error {}

const parseIntStrict = (s: string): number | null => (/^[+-]?\d+$/.test(s) ? Number(s) : null);

/**
 * 找到 `{` 的配对 `}`，跳过被反斜杠转义的字符并计入嵌套层数。
 * 返回下标；没有配对时返回 -1（此时这段 `{` 只能当字面量）。
 */
const findClose = (s: string, start: number): number => {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
};

const formatPadded = (v: number, pad: number): string => {
  if (pad <= 0) return String(v);
  if (v < 0) {
    return "-" + String(Math.abs(v)).padStart(Math.max(0, pad - 1), "0");
  }
  return String(v).padStart(pad, "0");
};

/**
 * 按序产出一段数值区间；pad > 0 时按起始值的宽度补零。
 *
 * ⚠ **上限守卫必须在这里，不能只靠下游**：`{1..100000000}` 在没有本守卫时要先把一亿个字符串
 * 建出来才被 `expandRaw` 的检查拦下 —— 实测 6.3 秒，浏览器里就是标签页冻死；再大一个量级
 * 直接 OOM。用户手输一个整数而已，这个代价不该由浏览器承担。
 */
const emitRange = (from: number, to: number, step: number, pad: number, limit: number): string[] => {
  const count = Math.floor(Math.abs(to - from) / step) + 1;
  if (count > limit) throw new LimitExceeded();

  const out: string[] = [];
  const dir = from <= to ? 1 : -1;
  for (let v = from; dir > 0 ? v <= to : v >= to; v += dir * step) {
    out.push(formatPadded(v, pad));
  }
  return out;
};

/**
 * `{a..z}` / `{1..100}` / `{1..100..2}`。不合法返回 null（该组按字面量保留）。
 *
 * 已实测对齐的几处 bash 行为（别"顺手修好"）：
 *  - `{1..}` `{..3}` `{1..3.5}` 非整数端点 → 不展开
 *  - 步长 0 按 1 处理（`{1..5..0}` → `1 2 3 4 5`），不是死循环也不是报错
 *  - 起始 > 终止照样展开成倒序；`{1..0}` → `1 0`（两步，既不是倒序也不是空）
 *  - 补零宽度**只取起始值**，`{001..10}` → `001 … 010`，跨零或负数亦保持字面宽度
 */
const parseRange = (body: string, ctx: ExpandCtx): string[] | null => {
  const parts = body.split("..");
  if (parts.length < 2 || parts.length > 3) return null;
  const [rawStart, rawEnd, rawStep] = parts;

  let step = 1;
  if (parts.length === 3) {
    const parsed = parseIntStrict(rawStep);
    if (parsed === null) return null;
    step = parsed === 0 ? 1 : Math.abs(parsed);
  }

  const start = parseIntStrict(rawStart);
  const end = parseIntStrict(rawEnd);
  if (start !== null && end !== null) {
    // 补零只在起始值本身带前导 0 时启用（bash 行为：01..10, -05..-01, 001..-5）
    const hasLeadingZero = /^[+-]?0\d+$/.test(rawStart);
    const pad = hasLeadingZero ? rawStart.length : 0;
    return emitRange(start, end, step, pad, ctx.limit);
  }

  // 字母区间：两端都必须是**单个**字母且同大小写（bash 不支持 {aa..zz}）
  if (rawStart.length !== 1 || rawEnd.length !== 1) return null;
  const lower = /^[a-z]$/.test(rawStart) && /^[a-z]$/.test(rawEnd);
  const upper = /^[A-Z]$/.test(rawStart) && /^[A-Z]$/.test(rawEnd);
  if (!lower && !upper) return null;
  return emitRange(rawStart.charCodeAt(0), rawEnd.charCodeAt(0), step, 0, ctx.limit).map((s) => String.fromCharCode(Number(s)));
};

/**
 * 顶层（不在嵌套花括号内）有没有 `..`。这是「区间」与「普通内容」的分界 ——
 * `{1..2{a,b}}` 的 `..` 在顶层，走区间分支；`{{1..2}}` 的 `..` 嵌在内层，走"保留外层"分支。
 */const hasTopLevelDots = (s: string): boolean => {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "." && s[i + 1] === "." && depth === 0) return true;
  }
  return false;
};

/**
 * **只按顶层逗号**切分列表项。
 *
 * ⚠ 这一条是「嵌套花括号」能对上的关键：直接 `body.split(",")` 会从嵌套组中间劈开 ——
 * `{{a,b},c}` 会被切成 `{a` / `b}` / `c`，吐出带半个花括号的垃圾。bash 是先认出配对再切的。
 */
const splitTopLevel = (body: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) { cur += c + body[i + 1]; i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
};

/**
 * 结果数组的兜底上限守卫。`flatMap` 会先把两侧都算完再拼，超限时那份中间数组已经白做了 ——
 * 这里没法省掉那份计算，但至少能在超限那一刻立刻停下来，而不是继续往外传。
 */
const pushBounded = (arr: string[], limit: number): string[] => {
  if (arr.length > limit) throw new LimitExceeded();
  return arr;
};

/**
 * 一组花括号的内容 → 展开项。返回 null 表示整组不展开（按字面量保留）。
 *
 * **外层花括号什么时候去、什么时候留**，这是与 bash 对齐最难的一条，实测归纳如下：
 *
 * | 输入 | bash 输出 | 外层花括号 |
 * | --- | --- | --- |
 * | `{a,b}` | `a` `b` | 去（顶层逗号 = 列表） |
 * | `{1..3}` | `1` `2` `3` | 去（合法区间） |
 * | `{1..2{a,b}}` | `1..2a` `1..2b` | 去（顶层有 `..`，端点含嵌套 → 展开后当列表） |
 * | `{a}` | `{a}` | **留** |
 * | `{{1..2}}` | `{1}` `{2}` | **留** |
 * | `{x{1..2}}` | `{x1}` `{x2}` | **留** |
 * | `{1..}` `{1..3.5}` | 原样 | **留** |
 *
 * 一句话：**有顶层逗号、合法区间、或顶层有 `..` 才去掉外层，其余一律保留**。
 */
const parseGroup = (body: string, ctx: ExpandCtx): string[] | null => {
  // ① 顶层逗号 → 列表。项内可能还嵌着组（`{a,{1..2}}`），bash 会继续展开 —— 递归放在**这里**，
  //    不能放到 expandRaw 的拼接循环里：那边再递归一次就与本函数互相调用，成死循环。
  const items = splitTopLevel(body);
  if (items.length > 1) return pushBounded(items.flatMap((item) => expandRaw(item, ctx)), ctx.limit);

  // ② 合法区间
  const range = parseRange(body, ctx);
  if (range) return range;

  // ③ 顶层有 `..` 但端点不是纯整数/单字母（端点里套了花括号）：展开后当列表，外层去掉
  if (hasTopLevelDots(body)) {
    const inner = expandRaw(body, ctx).flatMap((s) => splitTopLevel(s));
    return inner.length > 1 ? pushBounded(inner, ctx.limit) : [`{${inner[0]}}`];
  }

  // ④ 其余：bash 保留外层花括号，只展开里面的内容
  return pushBounded(expandRaw(body, ctx).map((s) => `{${s}}`), ctx.limit);
};

/**
 * 原始展开（**保留空串**）。空串只在最外层被丢弃 —— 这个差异是有讲究的：
 * `{a,}` 单独出现时 bash 只出一项 `a`，而 `X{a,}Y` 出两项 `XaY`/`XY`。
 * 只有在展开彻底结束、字符串确实为空时才丢，递归中途丢会把 `X{a,}Y` 的第二项吃掉。
 */
const expandRaw = (s: string, ctx: ExpandCtx): string[] => {
  let prefix = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // 转义：吃掉反斜杠，下一字符按字面量处理（不进花括号识别）
    if (c === "\\" && i + 1 < s.length) { prefix += s[i + 1]; i += 2; continue; }
    if (c === "{") {
      const close = findClose(s, i);
      if (close !== -1) {
        const items = parseGroup(s.slice(i + 1, close), ctx);
        if (items) {
          const tails = expandRaw(s.slice(close + 1), ctx);
          const out: string[] = [];
          // items 已在 parseGroup 里递归展开完毕，这里**只做拼接** —— 再递归一次就成了
          // parseGroup ⇄ expandRaw 的互相调用（`{a}` 会直接把栈打爆）
          //
          // ⚠ **两层循环的先后就是「哪个变量跑得慢」**，整个分组/交叉特性只差这两行：
          // 笛卡尔积预检：乘积已超上限时毫秒级判负，无需逐个拼串分配内存
          if (items.length * tails.length > ctx.limit) throw new LimitExceeded();

          if (ctx.order === "grouped") {
            for (const tail of tails) {
              for (const item of items) {
                out.push(prefix + item + tail);
                if (out.length > ctx.limit) throw new LimitExceeded();
              }
            }
          } else {
            for (const item of items) {
              for (const tail of tails) {
                out.push(prefix + item + tail);
                if (out.length > ctx.limit) throw new LimitExceeded();
              }
            }
          }
          return out;
        }
      }
      // 不是合法展开组 → 花括号当字面量，继续往后找下一组
      prefix += c;
      i++;
      continue;
    }
    prefix += c;
    i++;
  }
  return [prefix];
};

/** 单行展开。空串在最外层丢弃 —— 见 `expandRaw` 的注释。 */
export const expandLine = (template: string, opts?: Partial<ExpandCtx>): string[] =>
  expandRaw(template, ctxOf(opts)).filter((x) => x !== "");

/**
 * 多行模板：每行独立展开、按行序拼接。
 * ⚠ 输出顺序（`order`）只作用于**单行内的多个花括号组**；多行之间永远是「按行序」，
 *    因为那是你手写的分行，不存在"交错"的语义。
 * 空行不产出空行 —— textarea 末尾的换行不该变成一条空结果。
 */
export const expandTemplate = (template: string, opts?: Partial<ExpandCtx>): string[] => {
  const ctx = ctxOf(opts);
  const out: string[] = [];
  for (const line of template.split(/\r?\n/)) {
    for (const v of expandLine(line, { ...ctx, limit: ctx.limit - out.length })) {
      out.push(v);
      if (out.length > ctx.limit) throw new LimitExceeded();
    }
  }
  return out;
};

export type ExpandResult =
  | { ok: true; lines: string[] }
  | { ok: false; reason: "limit" };

/** 对外入口：把"超上限"变成一种可展示的结论，而不是异常或静默截断。 */
export const expand = (template: string, opts?: Partial<ExpandCtx>): ExpandResult => {
  try {
    return { ok: true, lines: expandTemplate(template, opts) };
  } catch (e) {
    if (e instanceof LimitExceeded) return { ok: false, reason: "limit" };
    throw e;
  }
};
