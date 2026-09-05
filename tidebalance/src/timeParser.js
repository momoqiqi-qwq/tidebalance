// 中文自然语言时间解析：从聊天文字 / 网页文本中提取日期、起止时间
// 支持：今天/明天/后天/大后天、周X/下周X/下下周X、X月X日、X号、月底、
//       凌晨/早上/上午/中午/下午/晚上X点(半/X点X分)、14:30、X点到Y点
export function parseWhen(raw, base = new Date()) {
  let text = String(raw || "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248))
    .replace(/\s+/g, " ");

  // 语义归一：今晚8点 → 今天 晚上8点（否则时间词被日期吃掉，8点会被当成早上）
  text = text
    .replace(/今(天|日)?晚(上)?/g, "今天 晚上")
    .replace(/明(天|日)?晚(上)?/g, "明天 晚上")
    .replace(/(今|明|后)早(上)?/g, (m, c) => (c === "今" ? "今天 上午" : c === "明" ? "明天 上午" : "后天 上午"));

  const eaten = [];
  let date = null;
  // 兼容两种形态：正则匹配对象取 m[0]，时间条目取 .text
  const eat = (m) => { if (m) eaten.push(m.text ?? m[0]); return !!m; };

  const mk = (y, mo, d) => d2s(y, mo, d);
  const mkThisYear = (mo, d) => {
    let y = base.getFullYear();
    let dt = new Date(y, mo - 1, d);
    if (dt < new Date(base.getFullYear(), base.getMonth(), base.getDate())) dt = new Date(y + 1, mo - 1, d);
    return d2s(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  };

  /* ── 日期 ── */
  const ymd = text.match(/(\d{4})[年.\/-](\d{1,2})[月.\/-](\d{1,2})[号日]?/);
  const md = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?/);
  const relMap = [
    [/大后天/, 3], [/后天/, 2], [/(今天|今日)/, 0], [/(明天|明日)/, 1],
  ];
  let rel = null;
  for (const [re, off] of relMap) { const m = text.match(re); if (m) { rel = { m, off }; break; } }
  const wd = text.match(/(下下|下个?|本|这)?(?:星期|礼拜|周)([一二三四五六日天])/);
  const nextMonthDay = text.match(/下个?月\s*(\d{1,2})\s*[号日]?/);
  const monthEnd = text.match(/(这个?月|本|下个?月)?月底/);
  const dayOnly = text.match(/(?<![0-9年月\/.])(\d{1,2})\s*[号日](?!\d)/);

  if (rel) {
    date = dateOf(rel.off, base); eat(rel.m);
  } else if (ymd) {
    date = mk(+ymd[1], +ymd[2], +ymd[3]); eat(ymd);
  } else if (md) {
    date = mkThisYear(+md[1], +md[2]); eat(md);
  } else if (wd) {
    const target = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }[wd[2]];
    const baseDiff = (target - base.getDay() + 7) % 7;
    let diff;
    if (wd[1] === "下下") diff = (baseDiff || 7) + 7;
    else if (wd[1] === "下" || wd[1] === "下个") diff = baseDiff || 7;
    else diff = baseDiff;
    date = dateOf(diff, base); eat(wd);
  } else if (nextMonthDay) {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, +nextMonthDay[1]);
    date = d2s(d.getFullYear(), d.getMonth() + 1, d.getDate()); eat(nextMonthDay);
  } else if (monthEnd) {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    date = d2s(d.getFullYear(), d.getMonth() + 1, d.getDate()); eat(monthEnd);
  } else if (dayOnly) {
    const d = new Date(base.getFullYear(), base.getMonth(), +dayOnly[1]);
    date = d2s(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (d < new Date(base.getFullYear(), base.getMonth(), base.getDate())) {
      const n = new Date(base.getFullYear(), base.getMonth() + 1, +dayOnly[1]);
      date = d2s(n.getFullYear(), n.getMonth() + 1, n.getDate());
    }
    eat(dayOnly);
  }

  /* ── 时间（收集全部，第一个是开始，第二个是结束） ── */
  const timeRe = /(凌晨|清晨|早上|早晨|上午|中午|午后|下午|傍晚|晚上|夜里|晚)?\s*(\d{1,2})\s*(?:[点时:：]\s*(半|一刻|三刻|(\d{1,2})\s*分?)?|:(\d{2}))/g;
  const times = [];
  let m;
  while ((m = timeRe.exec(text))) {
    let h = +m[2];
    let min = 0;
    if (m[5] !== undefined) min = +m[5];
    else if (m[3] === "半") min = 30;
    else if (m[3] === "一刻") min = 15;
    else if (m[3] === "三刻") min = 45;
    else if (m[4] !== undefined) min = +m[4];
    let period = m[1] || "";
    if (period) {
      if (period === "下午" || period === "午后" || period === "傍晚") { if (h < 12) h += 12; }
      else if (period === "晚上" || period === "夜里" || period === "晚") { if (h <= 11) h += 12; }
      else if (period === "中午") { if (h <= 2) h += 12; }
      else if (period === "凌晨") { if (h === 12) h = 0; }
    }
    if (h > 23 || min > 59 || (m[2].length === 1 && h === 0)) continue;
    times.push({ h, min, period, text: m[0], at: m.index });
  }

  let startMin = null, endMin = null;
  if (times.length) {
    if (times.length >= 2) {
      const between = text.slice(times[0].at + times[0].text.length, times[1].at);
      if (/到|至|—|--|~|～|-/.test(between)) {
        startMin = times[0].h * 60 + times[0].min;
        let eH = times[1].h, eM = times[1].min;
        // 「下午3点到4点」：结束时间继承开始时间的时段词
        if (!times[1].period && times[0].period) {
          const p = times[0].period;
          if ((p === "下午" || p === "午后" || p === "傍晚") && eH < 12) eH += 12;
          else if ((p === "晚上" || p === "夜里" || p === "晚") && eH <= 11) eH += 12;
          else if (p === "中午" && eH <= 2) eH += 12;
        }
        endMin = eH * 60 + eM;
        if (endMin <= startMin) endMin = null;
        eat(times[0]); eat(times[1]);
      } else {
        startMin = times[0].h * 60 + times[0].min; eat(times[0]);
      }
    } else {
      startMin = times[0].h * 60 + times[0].min; eat(times[0]);
    }
  }

  /* ── 标题清洗 ── */
  let title = text;
  for (const t of eaten) title = title.replace(t, " ");
  title = title
    .replace(/(记得|帮忙|麻烦|劳驾|安排一下|安排|提醒我|我需要|需要|定在|定个|约个|有个|开个)/g, " ")
    .replace(/[，。,、;；！!？?\s]+/g, " ")
    .replace(/^[到至~～\-—·,\s]+/, "")
    .trim();
  if (!title || title.length < 2) {
    title = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 24) || "捕获的事件";
  } else {
    title = title.slice(0, 40);
  }

  return { date, startMin, endMin, title };
}

function d2s(y, m, d) { return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
export function dateOf(offsetDays, base = new Date()) {
  const dt = new Date(base);
  dt.setDate(dt.getDate() + offsetDays);
  return d2s(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/* 从文本猜分类 */
export function guessCategory(text) {
  const t = String(text || "");
  if (/健身|跑步|跑|泳|球|运动|锻炼|瑜伽/.test(t)) return "sport";
  if (/吃饭|午餐|晚饭|早饭|聚餐|咖啡|超市|快递|理发|洗牙|买菜|缴费/.test(t)) return "life";
  if (/考试|上课|课|读书|背|学|复习|论文|答辩|作业/.test(t)) return "study";
  if (/休息|睡|午休|假/.test(t)) return "rest";
  return "work";
}

/* 从文本猜象限：近两天期限 → 象限 I，否则象限 II */
export function guessQuad(dateStr, base = new Date()) {
  if (!dateStr) return 2;
  const d = new Date(dateStr);
  const diff = (d - new Date(base.getFullYear(), base.getMonth(), base.getDate())) / 86400000;
  return diff <= 2 ? 1 : 2;
}
