// 应用外壳：侧栏导航 + 顶栏 + 视图切换
import * as S from "./store.js";
import { appIcon } from "./icons.js";
import { el } from "./ui.js";
import { renderQuadrant } from "./views/quadrant.js";
import { renderTimeblock } from "./views/timeblock.js";
import { renderElder } from "./views/elder.js";
import { renderSettings } from "./views/settings.js";
import { pluginViews, onNavChanged } from "./pluginHost.js";

// 注意：模块导入阶段 state 还未初始化，activeView 必须延迟到 renderShell 时读取
let activeView = null;
function ensureActiveView() {
  if (activeView === null) {
    const saved = S.getState().settings.lastView;
    if (["quadrant", "timeblock", "elder", "market", "settings"].includes(saved)) activeView = saved;
    else if (typeof saved === "string" && saved.startsWith("plug:")) activeView = saved;
    else activeView = "elder";
  }
  return activeView;
}

const VIEWS = [
  { id: "quadrant", icon: "四", title: "四象限", sub: "先决定，再动手" },
  { id: "timeblock", icon: "时", title: "时间块", sub: "把任务装进一天的格子" },
  { id: "elder", icon: "老", title: "安心日常", sub: "按自己的节奏，照顾好每一天" },
  { id: "market", icon: "件", title: "插件", sub: "扩展能力集中在这里" },
  { id: "settings", icon: "设", title: "设置", sub: "数据与插件" },
];
const PLUGIN_ICONS = {
  "pomodoro": "番",
  "weekly-report": "报",
  "elder-care": "护",
  "gx-news": "赛",
  "chaoxing-notify": "学",
  "cppu-notify": "警",
  "wechat-push": "微",
};
function viewDef(id) {
  if (id.startsWith("plug:")) {
    const v = pluginViews.find((x) => `plug:${x.id}` === id);
    return v ? { id, icon: PLUGIN_ICONS[v.pluginId] || v.icon || "件", title: v.title, sub: v.pluginId, pluginView: v } : null;
  }
  return VIEWS.find((v) => v.id === id) || VIEWS[0];
}

// 翻页顺序：滑动/翻页沿此序（插件页夹在时间块和插件市场之间）
function allViewIds() {
  return ["quadrant", "timeblock", "elder", ...pluginViews.map((pv) => `plug:${pv.id}`), "market", "settings"];
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
    for (const v of VIEWS) nav.append(navBtn(v.id));
    if (pluginViews.length) {
      // 桌面端侧栏仍保留插件直达列表；移动端底栏只留核心入口（.plug-list 被隐藏）
      const box = el("div", { class: "plug-list" }, el("div", { class: "sec" }, "插 件 视 图"));
      for (const pv of pluginViews) box.append(navBtn(`plug:${pv.id}`, true));
      nav.append(box);
    }
  }
  function navBtn(id, isPlug = false) {
    const def = viewDef(id);
    if (!def) return null;
    // 插件市场高亮条件：在市场页或任何插件页里（插件从市场进入）
    const on = activeView === id || (id === "market" && activeView.startsWith("plug:"));
    const b = el("button", { class: on ? "on" : "", "data-view": id },
      el("span", { class: "ic" }, appIcon(def.pluginView?.pluginId || id)),
      el("span", { class: "lb" }, def.title),
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

  function switchTo(id, dirHint) {
    const prevId = activeView;
    if (id.startsWith("plug:") && !viewDef(id)) id = "market";
    activeView = id;
    S.getState().settings.lastView = id;
    S.saveNow();
    document.querySelector(".drawer")?._close?.();
    view._unsub?.();
    view._unsub = null;
    view.classList.remove("tb-root", "elder-root");
    view.replaceChildren();
    const def = viewDef(id);
    if (!def) return switchTo("market", dirHint);
    titleEl.textContent = def.title;
    subEl.textContent = ` · ${def.sub}`;
    renderNav();
    renderStat();
    if (def.pluginView) {
      const box = el("div", { class: "plugview" });
      view.append(box);
      try {
        const cleanup = def.pluginView.render(box, { refresh: () => switchTo(id) });
        if (typeof cleanup === "function") view._unsub = cleanup;
      }
      catch (e) { box.append(el("p", { class: "desc" }, `插件视图出错：${e.message}`)); }
    } else if (id === "quadrant") renderQuadrant(view);
    else if (id === "timeblock") renderTimeblock(view);
    else if (id === "elder") renderElder(view);
    else if (id === "market") renderMarket(view);
    else if (id === "settings") renderSettings(view);
    // 翻页动画：按视图顺序决定方向（显式 dirHint 优先，来自滑动手势）
    const ids = allViewIds();
    const dir = dirHint || (ids.indexOf(id) >= ids.indexOf(prevId) ? "left" : "right");
    view.classList.remove("page-l", "page-r");
    if (prevId !== id) {
      void view.offsetWidth; // 强制重排，让连续切换也能重启动画
      view.classList.add(dir === "left" ? "page-l" : "page-r");
    }
  }

  // ── 插件市场：所有插件以卡片形式集中陈列 ──
  function renderMarket(container) {
    const wrap = el("div", { class: "market" });
    wrap.append(el("p", { class: "market-lead" },
      pluginViews.length ? `共 ${pluginViews.length} 个内置插件 · 点卡片进入` : "暂无插件 · 内置插件会出现在这里"));
    const grid = el("div", { class: "market-grid" });
    for (const pv of pluginViews) {
      const def = viewDef(`plug:${pv.id}`);
      grid.append(el("button", { class: "mcard", onclick: () => switchTo(`plug:${pv.id}`) },
        el("span", { class: "mi" }, appIcon(pv.pluginId)),
        el("b", {}, pv.title),
        el("small", {}, pv.pluginId === "elder-care" ? "日常提醒 · 与安心日常同步" : "点开即可使用"),
        el("span", { class: "go" }, "进入"),
      ));
    }
    wrap.append(grid);
    container.append(wrap);
  }

  // ── 内容区左右滑动 = 翻页（与底栏点按互补）──
  // 只排除真正占有横向手势的元素：可拖拽时间块、横向滚动池、抽屉、输入控件
  let swX = 0, swY = 0, swOn = false;
  const SWIPE_SKIP = ".plist, .block, .drawer, .popmenu, input, textarea, select, [data-noswipe]";
  view.addEventListener("touchstart", (e) => {
    swOn = false;
    if (e.touches.length !== 1) return;
    if (e.target.closest?.(SWIPE_SKIP)) return;
    swX = e.touches[0].clientX; swY = e.touches[0].clientY; swOn = true;
  }, { passive: true });
  view.addEventListener("touchcancel", () => { swOn = false; }, { passive: true });
  view.addEventListener("touchend", (e) => {
    if (!swOn) return;
    swOn = false;
    const dx = e.changedTouches[0].clientX - swX;
    const dy = e.changedTouches[0].clientY - swY;
    // 横向主导 + 足够长才翻页，避免误伤纵向滚动
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    const ids = allViewIds();
    const i = ids.indexOf(activeView);
    const next = dx < 0 ? ids[i + 1] : ids[i - 1];
    if (next) switchTo(next, dx < 0 ? "left" : "right");
  }, { passive: true });

  renderNav();
  onNavChanged(() => {
    const missingActivePlugin = activeView.startsWith("plug:") && !viewDef(activeView);
    renderNav();
    if (missingActivePlugin) switchTo("market");
    else if (activeView.startsWith("plug:") || activeView === "market") switchTo(activeView);
  });
  // 捕获/插件可请求跳转视图
  window.addEventListener("tide:navigate", (e) => switchTo(e.detail));
  switchTo(activeView);
  S.subscribe(renderStat);
}
