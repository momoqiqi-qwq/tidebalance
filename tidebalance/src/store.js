// 全局状态 + 持久化 + 派生数据
import { api } from "./api.js";

let state = null;
const subs = new Set();
let saveTimer = null;
let saveFail = 0;

export function uid(p = "id") {
  return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ── 日期工具 ── */
export function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
export function todayStr() { return fmtDate(new Date()); }
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return fmtDate(dt);
}
export function weekdayCN(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return "日一二三四五六"[new Date(y, m - 1, d).getDay()];
}
export function mmOf(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function hhmmOf(min) {
  min = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function durLabel(m) {
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h} 小时`;
}

/* ── 初始化 ── */
export async function initStore(seed) {
  try {
    state = await api.loadData();
  } catch {
    state = seed;
  }
  // 兜底字段，老数据也能跑
  state.tasks ??= []; state.blocks ??= []; state.settings ??= {}; state.plugins ??= {};
  return state;
}
export function getState() { return state; }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function changed() {
  subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await api.saveData(state); saveFail = 0; }
    catch (e) { if (++saveFail === 1) console.error("保存失败", e); }
  }, 350);
}

/* ── 任务 ── */
export function addTask(patch) {
  const t = {
    id: uid("t"), title: "新任务", note: "", quad: 1, done: false, estMin: 30,
    tags: [], project: "", due: null, createdAt: Date.now(), ...patch,
  };
  state.tasks.unshift(t); changed(); return t;
}
export function updateTask(id, patch) {
  const t = state.tasks.find((x) => x.id === id);
  if (t) { Object.assign(t, patch); changed(); }
  return t;
}
export function removeTask(id) {
  const i = state.tasks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [t] = state.tasks.splice(i, 1);
  state.blocks = state.blocks.filter((b) => b.taskId !== id);
  changed(); return t;
}
export function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (t) { t.done = !t.done; changed(); }
  return t;
}

/* ── 时间块 ── */
export function blocksOf(dateStr) {
  return state.blocks.filter((b) => b.date === dateStr).sort((a, b) => mmOf(a.start) - mmOf(b.start));
}
export function addBlock(patch) {
  const b = { id: uid("b"), date: todayStr(), start: "09:00", durMin: 30, title: "新时间块", taskId: null, cat: "work", ...patch };
  state.blocks.push(b); changed(); return b;
}
export function updateBlock(id, patch) {
  const b = state.blocks.find((x) => x.id === id);
  if (b) { Object.assign(b, patch); changed(); }
  return b;
}
export function removeBlock(id) {
  const i = state.blocks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [b] = state.blocks.splice(i, 1); changed(); return b;
}

/* ── 派生：某天的任务池（未安排且未完成） ── */
export function poolOf(dateStr) {
  const scheduled = new Set(blocksOf(dateStr).map((b) => b.taskId).filter(Boolean));
  return state.tasks.filter((t) => !t.done && !scheduled.has(t.id));
}
export function taskById(id) { return state.tasks.find((t) => t.id === id); }

/* ── 象限取任务 ── */
export function tasksOfQuad(q) {
  return state.tasks
    .filter((t) => t.quad === q)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999") < (b.due || "9999") ? -1 : 1)
    .sort((a, b) => Number(a.done) - Number(b.done));
}

/* ── 插件状态 ── */
export function pluginState(id) {
  if (!state.plugins[id]) state.plugins[id] = { enabled: true, storage: {} };
  state.plugins[id].storage ??= {};
  return state.plugins[id];
}
export function setPluginEnabled(id, on) {
  pluginState(id).enabled = on; changed();
}
export function replaceAll(next) {
  next.tasks ??= []; next.blocks ??= []; next.settings ??= {}; next.plugins ??= {};
  state = next; changed();
}
export function saveNow() {
  clearTimeout(saveTimer);
  return api.saveData(state);
}

export const CATEGORIES = [
  { id: "work", label: "工作" },
  { id: "study", label: "学习" },
  { id: "sport", label: "运动" },
  { id: "life", label: "生活" },
  { id: "rest", label: "休息" },
];
export function catLabel(c) { return (CATEGORIES.find((x) => x.id === c) || {}).label || c; }
