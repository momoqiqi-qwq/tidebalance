// 插件宿主：加载内置插件与用户插件目录里的插件，注入受控 API
import { api } from "./api.js";
import * as S from "./store.js";
import { toast } from "./ui.js";

const registry = new Map();   // id -> { manifest, source, enabled, error }
const eventBus = new Map();   // event -> Set<fn>
const listeners = { navChanged: new Set(), taskActionsChanged: new Set() };

export const pluginViews = [];       // { id, title, icon, render, pluginId }
export const taskActions = [];       // { id, label, icon, run(task), pluginId }

export function onNavChanged(fn) { listeners.navChanged.add(fn); }
export function onTaskActionsChanged(fn) { listeners.taskActionsChanged.add(fn); }
function emitNavChanged() { listeners.navChanged.forEach((f) => f()); }

const BUILTIN_IDS = ["pomodoro", "weekly-report"];

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
function makeApi(man) {
  const pid = man.id;
  const ns = () => S.pluginState(pid).storage;
  return {
    id: pid,
    manifest: man,

    storage: {
      async get(key, fallback = null) { return ns()[key] ?? fallback; },
      async set(key, value) { ns()[key] = value; S.saveNow(); },
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
        pluginViews.push({ ...def, pluginId: pid });
        emitNavChanged();
      },
      registerTaskAction(def) {
        taskActions.push({ ...def, pluginId: pid });
        listeners.taskActionsChanged.forEach((f) => f());
      },
    },

    notify: (msg, opts) => toast(`◈ ${man.name}：${msg}`, opts),
    events: {
      on(name, fn) {
        if (!eventBus.has(name)) eventBus.set(name, new Set());
        eventBus.get(name).add(fn);
      },
      emit(name, data) {
        (eventBus.get(name) || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } });
      },
    },

    util: {
      today: S.todayStr, addDays: S.addDays, mmOf: S.mmOf, hhmmOf: S.hhmmOf, durLabel: S.durLabel,
    },
  };
}

async function runPlugin(id, source) {
  const rec = registry.get(id);
  try {
    rec.error = null;
    const code = await loadCode(rec.manifest, source);
    // 受控沙箱：插件只拿到 tide API，拿不到全局 window
    new Function("tide", `"use strict";\n${code}`)(makeApi(rec.manifest));
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
  if (on && !rec.loaded) await runPlugin(id, rec.source);
  if (!on) {
    // 从导航与任务动作里摘掉该插件注册的内容
    for (let i = pluginViews.length - 1; i >= 0; i--) if (pluginViews[i].pluginId === id) pluginViews.splice(i, 1);
    for (let i = taskActions.length - 1; i >= 0; i--) if (taskActions[i].pluginId === id) taskActions.splice(i, 1);
    listeners.taskActionsChanged.forEach((f) => f());
  }
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
  (eventBus.get(name) || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } });
}
