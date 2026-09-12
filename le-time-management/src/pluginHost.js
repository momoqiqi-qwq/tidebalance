import { registerCareChannel, removeCareChannels, receiveCareEvent, getCare, careChanged } from "./care.js";
// 插件宿主：加载内置插件与用户插件目录里的插件，注入受控 API
import { api } from "./api.js";
import * as S from "./store.js";
import { toast } from "./ui.js";
import { parseWhen, guessCategory, guessQuad } from "./timeParser.js";
import { renderNativeSchedule } from "./nativeSchedule.js";

const registry = new Map();   // id -> { manifest, source, enabled, error }
const eventBus = new Map();   // event -> Set<{ pluginId, fn }>
const listeners = { navChanged: new Set(), taskActionsChanged: new Set() };

export const pluginViews = [];       // { id, title, icon, render, pluginId }
export const taskActions = [];       // { id, label, icon, run(task), pluginId }

export function onNavChanged(fn) { listeners.navChanged.add(fn); return () => listeners.navChanged.delete(fn); }
export function onTaskActionsChanged(fn) { listeners.taskActionsChanged.add(fn); return () => listeners.taskActionsChanged.delete(fn); }
function emitNavChanged() { listeners.navChanged.forEach((f) => f()); }

const BUILTIN_IDS = ["shiguang-schedule", "pomodoro", "weekly-report", "elder-care", "gx-news", "chaoxing-notify", "cppu-notify", "wechat-push", "cn-holiday", "exam-calendar"];

export function getRegistry() { return [...registry.values()]; }

async function loadManifest(id, source) {
  if (source === "builtin") {
    const res = await fetch(`/plugins/${id}/manifest.json`);
    if (!res.ok) throw new Error(`manifest 拉取失败 (${res.status})`);
    return res.json();
  }
  const raw = await api.readPluginFile(`${id}/manifest.json`);
  return JSON.parse(raw);
}

async function loadCode(man, source) {
  const entry = man.entry || "main.js";
  if (source === "builtin") {
    const res = await fetch(`/plugins/${man.id}/${entry}`);
    if (!res.ok) throw new Error(`入口拉取失败 (${res.status})`);
    return res.text();
  }
  return api.readPluginFile(`${man.id}/${entry}`);
}

/* ── 注入给插件的 API ── */
function makeApi(man, source) {
  const pid = man.id;
  const ns = () => S.pluginState(pid).storage;
  return {
    care: {
      registerChannel: def => registerCareChannel(pid, def),
      reportEvent: event => receiveCareEvent(pid, event),
    },
    id: pid,
    manifest: man,

    storage: {
      async get(key, fallback = null) { return pid === "elder-care" && key === "reminders" ? getCare().reminders : ns()[key] ?? fallback; },
      async set(key, value) { if (pid === "elder-care" && key === "reminders") { getCare().reminders = value; careChanged(); } else { ns()[key] = value; S.saveNow(); } },
    },

    tasks: {
      list: () => JSON.parse(JSON.stringify(S.getState().tasks)),
      create: (patch) => S.addTask(patch),
      update: (id, patch) => S.updateTask(id, patch),
      remove: (id) => S.removeTask(id),
    },

    blocks: {
      list: (date) => JSON.parse(JSON.stringify(S.blocksOf(date))),
      create: (patch) => S.addBlock(patch),
      update: (id, patch) => S.updateBlock(id, patch),
      remove: (id) => S.removeBlock(id),
    },

    ui: {
      registerView(def) {
        pluginViews.push({ ...def, pluginId: pid,
          ...(pid === "shiguang-schedule" && api.isTauri ? { render: renderNativeSchedule } : {}) });
        emitNavChanged();
      },
      registerTaskAction(def) {
        taskActions.push({ ...def, pluginId: pid });
        listeners.taskActionsChanged.forEach((f) => f());
      },
    },

    assets: {
      async text(path) {
        const clean = String(path || "").replace(/\\/g, "/");
        if (!clean || clean.startsWith("/") || clean.includes("..")) throw new Error("资源路径必须是插件目录内的相对路径");
        if (source === "builtin") {
          const res = await fetch(`/plugins/${pid}/${clean}`);
          if (!res.ok) throw new Error(`资源拉取失败 (${res.status})`);
          return res.text();
        }
        return api.readPluginFile(`${pid}/${clean}`);
      },
      async json(path) { return JSON.parse(await this.text(path)); },
    },

    notify: (msg, opts) => toast(`${man.name}：${msg}`, opts),
    events: {
      on(name, fn) {
        if (!eventBus.has(name)) eventBus.set(name, new Set());
        eventBus.get(name).add({ pluginId: pid, fn });
      },
      emit(name, data) {
        (eventBus.get(name) || []).forEach((entry) => { try { entry.fn(data); } catch (e) { console.error(e); } });
      },
    },

    // 网络桥：Rust 端抓取，绕开 WebView CORS；仅允许 http/https
    http: {
      get: (url) => api.httpGet(url),
      // 会话化请求：Cookie 自动保持，适合需要登录的接口
      session: () => api.httpSessionNew(),
      fetch: (sid, method, url, opts) => api.httpFetch(sid, method, url, opts),
    },

    util: {
      today: S.todayStr, addDays: S.addDays, mmOf: S.mmOf, hhmmOf: S.hhmmOf, durLabel: S.durLabel,
      openUrl: (url) => api.openExternal(url),
      parseWhen, guessCategory, guessQuad,
      navigate: (view) => window.dispatchEvent(new CustomEvent("tide:navigate", { detail: view })),
      desEncryptHex: (plain, key) => api.desEncryptHex(plain, key),
    },
  };
}

function removeRegistrations(id) {
  removeCareChannels(id);
  for (let i = pluginViews.length - 1; i >= 0; i--) if (pluginViews[i].pluginId === id) pluginViews.splice(i, 1);
  for (let i = taskActions.length - 1; i >= 0; i--) if (taskActions[i].pluginId === id) taskActions.splice(i, 1);
  for (const [name, set] of eventBus) {
    for (const entry of [...set]) if (entry.pluginId === id) set.delete(entry);
    if (!set.size) eventBus.delete(name);
  }
  listeners.taskActionsChanged.forEach((f) => f());
}

async function runPlugin(id, source) {
  const rec = registry.get(id);
  try {
    rec.error = null;
    removeRegistrations(id);
    const code = await loadCode(rec.manifest, source);
    // 受控沙箱：插件只拿到 tide API，拿不到全局 window
    new Function("tide", `"use strict";\n${code}`)(makeApi(rec.manifest, source));
    rec.loaded = true;
  } catch (e) {
    rec.error = String(e && e.message || e);
    console.error(`插件 ${id} 加载失败:`, e);
  }
}

export async function initPluginHost() {
  const sources = [
    ...BUILTIN_IDS.map((id) => ({ id, source: "builtin" })),
    ...(await api.listPlugins().catch(() => [])).map((p) => ({ id: p.id, source: "external" })),
  ];
  for (const { id, source } of sources) {
    if (registry.has(id)) continue;
    const rec = { id, source, manifest: null, enabled: true, error: null, loaded: false };
    registry.set(id, rec);
    try {
      rec.manifest = await loadManifest(id, source);
      rec.manifest.id = rec.manifest.id || id;
    } catch (e) {
      rec.error = String(e && e.message || e);
      continue;
    }
    // 首次见到该插件：默认启用（写入状态以便用户关闭后记住）
    S.pluginState(id);
    if (S.pluginState(id).enabled !== false) await runPlugin(id, source);
  }
  emitNavChanged();
}

export async function setEnabled(id, on) {
  S.setPluginEnabled(id, on);
  const rec = registry.get(id);
  if (!rec) return;
  rec.enabled = on;
  if (on) await runPlugin(id, rec.source);
  if (!on) {
    // 从导航、任务动作、事件订阅里摘掉该插件注册的内容
    removeRegistrations(id);
    rec.loaded = false;
  }
  emitNavChanged();
}

export async function removeExternalPlugin(id) {
  const rec = registry.get(id);
  if (!rec) throw new Error("插件不存在");
  if (rec.source === "builtin") throw new Error("内置插件不能删除，可停用");
  await setEnabled(id, false);
  await api.deletePlugin(id);
  S.removePluginState(id);
  registry.delete(id);
  emitNavChanged();
}

// 清空注册表后重新发现并加载插件（设置页「重新扫描」用）
export async function rescan() {
  pluginViews.length = 0;
  taskActions.length = 0;
  registry.clear();
  await initPluginHost();
}

export function emitLocal(name, data) {
  (eventBus.get(name) || []).forEach((entry) => { try { entry.fn(data); } catch (e) { console.error(e); } });
}
