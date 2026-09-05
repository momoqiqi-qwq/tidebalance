// 应用外壳：侧栏导航 + 顶栏 + 视图切换
import * as S from "./store.js";
import { el } from "./ui.js";
import { renderQuadrant } from "./views/quadrant.js";
import { renderTimeblock } from "./views/timeblock.js";
import { renderSettings } from "./views/settings.js";
import { pluginViews, onNavChanged } from "./pluginHost.js";

// 注意：模块导入阶段 state 还未初始化，activeView 必须延迟到 renderShell 时读取
let activeView = null;
function ensureActiveView() {
  if (activeView === null) {
    const saved = S.getState().settings.lastView;
    activeView = ["quadrant", "timeblock", "settings"].includes(saved) ? saved : "quadrant";
  }
  return activeView;
}

const VIEWS = [
  { id: "quadrant", icon: "▦", title: "四象限", sub: "先决定，再动手" },
  { id: "timeblock", icon: "▭", title: "时间块", sub: "把任务装进一天的格子" },
  { id: "settings", icon: "⚙", title: "设置", sub: "数据与插件" },
];
function viewDef(id) {
  if (id.startsWith("plug:")) {
    const v = pluginViews.find((x) => `plug:${x.id}` === id);
    return v ? { id, icon: v.icon || "◈", title: v.title, sub: v.pluginId, pluginView: v } : VIEWS[0];
  }
  return VIEWS.find((v) => v.id === id) || VIEWS[0];
}

export function renderShell(root) {
  ensureActiveView();
  const nav = el("nav", { class: "nav" });
  const view = el("div", { class: "view" });
  const titleEl = el("h1", {});
  const subEl = el("span", { class: "sub" });
  const statPill = el("span", { class: "pill" });

  const rail = el("aside", { class: "rail" },
    el("div", { class: "brand" },
      el("span", { class: "mark" }),
      el("div", {}, el("b", {}, "潮 衡"), el("small", {}, "TIDE × BALANCE")),
    ),
    nav,
    el("div", { class: "foot" }, "本地优先 · 无账号", el("br"), "Tauri 2 · v0.1.0"),
  );

  const main = el("main", { class: "main" },
    el("header", { class: "topbar" },
      el("div", {}, titleEl, subEl),
      el("span", { style: "flex:1" }),
      statPill,
    ),
    view,
  );

  root.append(el("div", { class: "app" }, rail, main));

  function renderNav() {
    nav.replaceChildren();
    const core = VIEWS.filter((v) => v.id !== "settings");
    nav.append(el("div", { class: "sec" }, "时 间 管 理"));
    for (const v of core) nav.append(navBtn(v.id));
    if (pluginViews.length) {
      nav.append(el("div", { class: "sec" }, "插 件 视 图"));
      for (const pv of pluginViews) nav.append(navBtn(`plug:${pv.id}`, true));
    }
    nav.append(el("div", { class: "sec" }, "其 他"));
    nav.append(navBtn("settings"));
  }
  function navBtn(id, isPlug = false) {
    const def = viewDef(id);
    const b = el("button", { class: activeView === id ? "on" : "" },
      el("span", { class: "ic" }, def.icon),
      def.title,
      isPlug ? el("span", { class: "pv-count" }, "插件") : null,
    );
    b.addEventListener("click", () => switchTo(id));
    return b;
  }

  function renderStat() {
    const t = S.getState().tasks;
    const open = t.filter((x) => !x.done).length;
    statPill.replaceChildren("待办 ", el("b", {}, String(open)), " · 已完成 ", el("b", {}, String(t.length - open)));
  }

  function switchTo(id) {
    activeView = id;
    S.getState().settings.lastView = id;
    S.saveNow();
    view._unsub?.();
    view.replaceChildren();
    const def = viewDef(id);
    titleEl.textContent = def.title;
    subEl.textContent = ` · ${def.sub}`;
    renderNav();
    renderStat();
    if (def.pluginView) {
      const box = el("div", { class: "plugview" });
      view.append(box);
      try { def.pluginView.render(box, { refresh: () => switchTo(id) }); }
      catch (e) { box.append(el("p", { class: "desc" }, `插件视图出错：${e.message}`)); }
    } else if (id === "quadrant") renderQuadrant(view);
    else if (id === "timeblock") renderTimeblock(view);
    else if (id === "settings") renderSettings(view);
  }

  renderNav();
  onNavChanged(() => { renderNav(); if (activeView.startsWith("plug:")) switchTo(activeView); });
  // 捕获/插件可请求跳转视图
  window.addEventListener("tide:navigate", (e) => switchTo(e.detail));
  switchTo(activeView);
  S.subscribe(renderStat);
}
