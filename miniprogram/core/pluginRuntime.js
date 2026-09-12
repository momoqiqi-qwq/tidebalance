// 微信小程序原生插件适配层：只放纯数据逻辑，页面负责交互。
const store = require("./store.js");
const holidayData = require("./pluginData/holiday.js");
const examData = require("./pluginData/exams.js");

const WEEK_CN = "日一二三四五六";
const CAT_LABEL = { work: "工作", study: "学习", sport: "运动", life: "生活", rest: "休息" };

function dateMs(ds) {
  const p = String(ds || "").split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]).getTime();
}
function dayDiff(a, b) { return Math.round((dateMs(b) - dateMs(a)) / 86400000); }
function weekday(ds) {
  const p = String(ds || "").split("-").map(Number);
  return "周" + WEEK_CN[new Date(p[0], p[1] - 1, p[2]).getDay()];
}
function durationLabel(min) {
  min = Math.max(0, Number(min) || 0);
  if (min < 60) return min + "m";
  const h = Math.floor(min / 60), r = min % 60;
  return h + "h" + (r ? r + "m" : "");
}
function weeklyReport(today) {
  today = today || store.todayStr();
  const days = [];
  for (let i = -6; i <= 0; i++) days.push(store.addDays(today, i));
  const perDay = days.map((date) => {
    const blocks = store.blocksOf(date);
    const minutes = blocks.reduce((sum, b) => sum + (Number(b.durMin) || 0), 0);
    return { date, weekday: weekday(date), minutes, label: durationLabel(minutes) };
  });
  const max = Math.max(60, ...perDay.map((x) => x.minutes));
  perDay.forEach((x) => { x.pct = Math.max(3, Math.round((x.minutes / max) * 100)); });
  const byCat = {};
  for (const date of days) {
    for (const b of store.blocksOf(date)) byCat[b.cat] = (byCat[b.cat] || 0) + (Number(b.durMin) || 0);
  }
  const cats = store.CATEGORIES.map((c) => ({
    id: c.id,
    label: CAT_LABEL[c.id] || c.label || c.id,
    minutes: byCat[c.id] || 0,
    value: durationLabel(byCat[c.id] || 0),
  }));
  const tasks = store.getState().tasks || [];
  const done = tasks.filter((t) => t.done).length;
  const total = perDay.reduce((sum, x) => sum + x.minutes, 0);
  return { days: perDay, cats, total, totalLabel: durationLabel(total), averageLabel: durationLabel(Math.round(total / 7)), done, taskCount: tasks.length };
}

function holidaySummary(today) {
  today = today || store.todayStr();
  const year = today.slice(0, 4);
  const doc = holidayData[year] || null;
  if (!doc) return { available: false, year, today, todayText: "当前年份没有内置节假日数据", upcoming: [] };
  const map = Object.create(null);
  for (const d of doc.days || []) map[d.date] = d;
  const special = map[today];
  const dow = new Date(dateMs(today)).getDay();
  let todayText;
  if (special) todayText = special.isOffDay ? `${special.name} · 放假` : `${special.name} · 调休上班`;
  else todayText = dow === 0 || dow === 6 ? "周末 · 休息日" : "普通工作日";

  const groups = [];
  const days = (doc.days || []).filter((d) => d.isOffDay && d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    const last = groups[groups.length - 1];
    if (last && last.name === d.name && dayDiff(last.endDate, d.date) === 1) {
      last.endDate = d.date;
      last.days += 1;
    } else {
      groups.push({ name: d.name, startDate: d.date, endDate: d.date, days: 1 });
    }
  }
  const upcoming = groups.slice(0, 8).map((g) => {
    const diff = dayDiff(today, g.startDate);
    return Object.assign({}, g, {
      countdown: diff === 0 ? "今天" : diff === 1 ? "明天" : `${diff} 天后`,
      range: g.startDate === g.endDate ? g.startDate : `${g.startDate} → ${g.endDate}`,
    });
  });
  return { available: true, year, today, todayText, upcoming, papers: doc.papers || [] };
}

const EXAM_FILTERS = [
  { id: "all", label: "全部考试" },
  { id: "cet4", label: "大学英语四级（CET4）" },
  { id: "cet6", label: "大学英语六级（CET6）" },
  { id: "ncre", label: "全国计算机等级考试（NCRE）" },
  { id: "ntce", label: "中小学教师资格考试（NTCE）" },
  { id: "kaoyan", label: "全国硕士研究生招生考试" },
  { id: "tem4", label: "英语专业四级（TEM4）" },
  { id: "tem8", label: "英语专业八级（TEM8）" },
];
function examFamilyIds(id) {
  if (id === "cet4") return ["cet4", "cet-set4"];
  if (id === "cet6") return ["cet6", "cet-set6"];
  return [id];
}
function eventBelongsToExam(ev, id) {
  if (!id || id === "all") return true;
  const ids = examFamilyIds(id);
  if (ids.indexOf(ev.examId) >= 0) return true;
  const merged = Array.isArray(ev.mergedFrom) ? ev.mergedFrom : [];
  return merged.some((x) => ids.indexOf(x) >= 0);
}
function futureExams(today, limit, examFilter) {
  today = today || store.todayStr();
  limit = Number(limit) || 30;
  examFilter = examFilter || "all";
  return (examData.events || [])
    .filter((ev) => ev && (ev.endDate || ev.date) >= today && eventBelongsToExam(ev, examFilter))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit)
    .map((ev) => ({
      examId: ev.examId,
      name: ev.name,
      type: ev.type,
      typeName: ev.typeName || "考试",
      category: ev.category || "考试",
      date: ev.date,
      endDate: ev.endDate || ev.date,
      dateRange: ev.endDate && ev.endDate !== ev.date ? `${ev.date} ～ ${ev.endDate}` : ev.date,
      confirmed: !!ev.confirmed,
      statusText: ev.confirmed ? "官方确认" : "规则推算",
      url: ev.url || "",
      startTime: ev.startTime || "",
      endTime: ev.endTime || "",
      countdown: dayDiff(today, ev.date) === 0 ? "今天" : `${dayDiff(today, ev.date)} 天后`,
      key: [ev.examId, ev.type, ev.date].join("|"),
    }));
}
function examFlow(today, examFilter) {
  today = today || store.todayStr();
  examFilter = examFilter || "all";
  const option = EXAM_FILTERS.find((x) => x.id === examFilter) || EXAM_FILTERS[0];
  if (examFilter === "all") return { id: "all", label: option.label, registrations: [], registrationText: "", cetNotice: "", signupUrl: "" };
  const regs = (examData.events || [])
    .filter((ev) => ev && eventBelongsToExam(ev, examFilter) && (ev.type === "registration" || ev.type === "pre-registration") && (ev.endDate || ev.date) >= today)
    .sort((a,b) => a.date.localeCompare(b.date));
  const registrationText = regs.length
    ? "已收录报名时间：" + regs.map((r) => (r.type === "pre-registration" ? "预报名 " : "报名 ") + r.date + (r.endDate && r.endDate !== r.date ? " ～ " + r.endDate : "") + (r.confirmed ? "（官方）" : "（预计）")).join("；")
    : "报名时间：当前离线数据尚未收录可用的全国统一报名起止时间，请以考试官网及所在学校/考点通知为准。";
  const isCet = examFilter === "cet4" || examFilter === "cet6";
  return {
    id: examFilter,
    label: option.label,
    registrations: regs,
    registrationText,
    cetNotice: isCet ? "CET 报名时间可能因省份、学校或考点不同而不同。请考生按所在学校规定时间登录 CET 全国网上报名系统（cet-bm.neea.edu.cn），完成资格审核、笔试报名缴费及口试报名缴费。" : "",
    signupUrl: isCet ? "https://cet-bm.neea.edu.cn/" : "",
  };
}

module.exports = { weeklyReport, holidaySummary, futureExams, examFlow, EXAM_FILTERS, durationLabel, dayDiff };
