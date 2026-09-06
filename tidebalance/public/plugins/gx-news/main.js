// 竞赛消息雷达 —— 演示 tide.http / openUrl / parseWhen 组合：
// 抓取摩课云竞赛平台公告，过滤显示，一键转潮衡提醒
(function () {
  const API = "https://www.gxxsjs.com/prod-api/home/competition/news/page";
  const DETAIL = "https://www.gxxsjs.com/newsContain/detail?newsId=";
  const TYPE_NAMES = { "202": "平台通知", "203": "赛事动态" };
  const PAGE_SIZE = 40;

  const state = {
    list: [], fetchedAt: 0, loading: false, error: null,
    seen: new Set(),
    filter: { kw: "", type: "all", hideSeen: false, auto: false },
    timer: null,
  };
  let ui = null; // 当前渲染的 DOM 引用

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function ensureStyle() {
    if (document.getElementById("gx-news-style")) return;
    const st = document.createElement("style");
    st.id = "gx-news-style";
    st.textContent = `
      .gx-wrap{max-width:880px;margin:0 auto}
      .gx-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 10px}
      .gx-kw{flex:1;min-width:170px;height:34px;border:1px solid #E4DFD6;border-radius:9px;padding:0 11px;background:#fff}
      .gx-chip{font-size:12px;border:1px solid #E4DFD6;background:#fff;border-radius:16px;padding:6px 13px;cursor:pointer;color:#7E8B94}
      .gx-chip.on{background:#0F4C5C;color:#fff;border-color:#0F4C5C}
      .gx-toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:#7E8B94;cursor:pointer;user-select:none}
      .gx-toggle i{width:34px;height:19px;border-radius:10px;background:#D8D2C6;display:inline-block;position:relative;transition:.15s}
      .gx-toggle i::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s}
      .gx-toggle.on i{background:#2EC4B6}
      .gx-toggle.on i::after{left:17px}
      .gx-status{font-size:12px;color:#7E8B94;margin:2px 0 10px}
      .gx-status .err{color:#B03535}
      .gx-card{display:flex;gap:12px;background:#fff;border:1px solid #E4DFD6;border-radius:14px;padding:12px 14px;margin-bottom:9px;cursor:pointer;box-shadow:0 1px 3px rgba(34,48,58,.06);content-visibility:auto;contain-intrinsic-size:auto 96px}
      .gx-card:hover{box-shadow:0 3px 10px rgba(34,48,58,.12)}
      .gx-card.seen{opacity:.55}
      .gx-cover{width:74px;height:56px;border-radius:8px;object-fit:cover;flex:none;background:#EFEAE1}
      .gx-main{flex:1;min-width:0}
      .gx-title{font-size:13.5px;font-weight:600;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gx-meta{display:flex;gap:8px;align-items:center;font-size:11px;color:#7E8B94;margin-top:4px;flex-wrap:wrap}
      .gx-tag{border-radius:6px;padding:2px 8px;background:#E1EEF3;color:#0F4C5C;font-size:10px}
      .gx-tag.n{background:#EFE7FB;color:#6C3FB8}
      .gx-new{background:#FF6B6B;color:#fff;border-radius:8px;padding:1px 7px;font-size:10px}
      .gx-snip{font-size:11.5px;color:#7E8B94;margin-top:5px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .gx-act{display:flex;flex-direction:column;gap:6px;justify-content:center}
      .gx-btn{font-size:11px;border:1px solid #E4DFD6;border-radius:8px;padding:5px 10px;background:#fff;cursor:pointer;color:#22303A;white-space:nowrap}
      .gx-btn:hover{border-color:#0F4C5C;color:#0F4C5C}
      .gx-empty{border:1.5px dashed #CFC8BA;border-radius:12px;padding:26px;text-align:center;color:#A9B2BA;font-size:12.5px;line-height:1.8}
      .gx-refresh{font-size:12.5px;font-weight:600;height:34px;padding:0 15px;border-radius:9px;background:#0F4C5C;color:#fff;cursor:pointer}
      .gx-refresh:disabled{opacity:.5}
    `;
    document.head.append(st);
  }

  async function loadPrefs() {
    const f = await tide.storage.get("filter", null);
    if (f) state.filter = { ...state.filter, ...f };
    state.seen = new Set(await tide.storage.get("seen", []));
  }
  const savePrefs = () => tide.storage.set("filter", state.filter);
  const saveSeen = () => tide.storage.set("seen", [...state.seen].slice(-600));

  async function fetchList() {
    if (state.loading) return;
    state.loading = true;
    paintStatus();
    try {
      const res = await tide.http.get(`${API}?pageNum=1&pageSize=${PAGE_SIZE}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const d = JSON.parse(res.body);
      if (d.code !== 0 || !d.data) throw new Error(d.msg || "接口返回异常");
      state.list = (d.data.records || []).map((r) => ({
        id: r.newsId,
        title: String(r.newsTitle || "(无标题)"),
        type: String(r.newsType || ""),
        time: String(r.publishTime || "").slice(0, 16),
        cover: String(r.newsCover || ""),
        snippet: String(r.newsInfo || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120),
      }));
      state.fetchedAt = Date.now();
      state.error = null;
    } catch (e) {
      state.error = String(e.message || e);
    }
    state.loading = false;
    paintStatus();
    paintList();
  }

  function filtered() {
    const kw = state.filter.kw.trim().toLowerCase();
    return state.list.filter((m) => {
      if (state.filter.type !== "all" && m.type !== state.filter.type) return false;
      if (state.filter.hideSeen && state.seen.has(m.id)) return false;
      if (kw && !(m.title.toLowerCase().includes(kw) || m.snippet.toLowerCase().includes(kw))) return false;
      return true;
    });
  }

  function typeChips() {
    const types = [...new Set(state.list.map((m) => m.type))].filter(Boolean);
    return [{ id: "all", label: "全部" },
      ...types.map((t) => ({ id: t, label: TYPE_NAMES[t] || `类型 ${t}` }))];
  }

  function paintStatus() {
    if (!ui) return;
    const s = ui.status;
    if (state.loading) { s.innerHTML = "⏳ 正在抓取消息…"; return; }
    if (state.error) { s.innerHTML = `<span class="err">⚠ 抓取失败：${esc(state.error)}（点「刷新」重试）</span>`; return; }
    const at = state.fetchedAt ? new Date(state.fetchedAt).toTimeString().slice(0, 5) : "—";
    s.innerHTML = `已更新 ${at} · 拉取 ${state.list.length} 条 · 显示 <b>${filtered().length}</b> 条`;
  }

  function paintChips() {
    if (!ui) return;
    ui.chips.replaceChildren(...typeChips().map((c) => {
      const b = document.createElement("button");
      b.className = "gx-chip" + (state.filter.type === c.id ? " on" : "");
      b.textContent = c.label;
      b.addEventListener("click", () => { state.filter.type = c.id; savePrefs(); paintChips(); paintList(); });
      return b;
    }));
    ui.hideSeen.classList.toggle("on", !!state.filter.hideSeen);
    ui.auto.classList.toggle("on", !!state.filter.auto);
  }

  function paintList() {
    if (!ui) return;
    const rows = filtered();
    ui.count.textContent = String(rows.length);
    if (!rows.length) {
      ui.list.innerHTML = `<div class="gx-empty">${state.list.length
        ? "没有符合过滤条件的消息<br>试试换个关键词或切回「全部」"
        : "还没有消息，点上方「刷新」抓取"}<br></div>`;
      return;
    }
    ui.list.innerHTML = rows.map((m) => {
      const isNew = !state.seen.has(m.id);
      const tn = TYPE_NAMES[m.type] || `类型 ${m.type}`;
      return `<div class="gx-card${isNew ? "" : " seen"}" data-id="${m.id}">
        ${m.cover ? `<img class="gx-cover" loading="lazy" decoding="async" fetchpriority="low" src="${esc(coverSmall(m.cover))}" data-orig="${esc(m.cover)}" onerror="if(this.dataset.retried){this.style.display='none'}else{this.dataset.retried=1;this.src=this.dataset.orig}">` : ""}
        <div class="gx-main">
          <div class="gx-title">${esc(m.title)}</div>
          <div class="gx-meta">
            <span class="gx-tag ${m.type === "203" ? "n" : ""}">${esc(tn)}</span>
            <span>🕐 ${esc(m.time)}</span>
            ${isNew ? '<span class="gx-new">NEW</span>' : ""}
          </div>
          ${m.snippet ? `<div class="gx-snip">${esc(m.snippet)}</div>` : ""}
        </div>
        <div class="gx-act">
          <button class="gx-btn" data-act="open">打开 ↗</button>
          <button class="gx-btn" data-act="remind">＋ 提醒</button>
        </div>
      </div>`;
    }).join("");
  }

  function markSeen(id) {
    state.seen.add(id);
    saveSeen();
  }

  // 阿里云 OSS 支持实时缩放：列表里只拉 148px 缩略图，失败回退原图
  function coverSmall(url) {
    if (!url) return "";
    return url + (url.includes("?") ? "&" : "?") + "x-oss-process=image/resize,w_148/quality,q_80";
  }

  async function createReminder(m) {
    const text = `${m.title} ${m.snippet}`;
    const p = tide.util.parseWhen(text);
    const cat = tide.util.guessCategory(text);
    const task = tide.tasks.create({
      title: m.title,
      quad: tide.util.guessQuad(p.date),
      estMin: p.endMin ? p.endMin - p.startMin : 60,
      due: p.date,
      tags: ["竞赛消息"],
      note: DETAIL + m.id,
    });
    if (p.date && p.startMin !== null) {
      const dur = p.endMin ? p.endMin - p.startMin : 60;
      tide.blocks.create({ date: p.date, start: tide.util.hhmmOf(p.startMin), durMin: dur, title: m.title, taskId: task.id, cat });
      tide.notify(`已创建提醒：「${m.title.slice(0, 20)}${m.title.length > 20 ? "…" : ""}」→ ${p.date.slice(5)} ${tide.util.hhmmOf(p.startMin)}`, {
        actionLabel: "查看", ms: 6500,
        action: () => tide.util.navigate("timeblock"),
      });
    } else if (p.date) {
      tide.blocks.create({ date: p.date, start: "09:00", durMin: 60, title: m.title, taskId: task.id, cat });
      tide.notify(`识别到日期 ${p.date.slice(5)}，提醒先放在 09:00`);
    } else {
      tide.notify("没识别到日期，任务已存入象限池，可手动安排");
    }
    markSeen(m.id);
    paintList();
  }

  function setAuto(on) {
    state.filter.auto = on;
    savePrefs();
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (on) state.timer = setInterval(fetchList, 10 * 60 * 1000);
  }

  function render(el) {
    ensureStyle();
    // 先读回持久化的过滤偏好与已读记录，再构建界面
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#A9B2BA;font-size:12.5px">⏳ 正在读取偏好…</div>';
    loadPrefs().then(() => buildUI(el)).catch(() => buildUI(el));
  }

  function buildUI(el) {
    el.innerHTML = "";
    el.style.overflowY = "auto";

    const wrap = document.createElement("div");
    wrap.className = "gx-wrap";
    wrap.innerHTML = `
      <div style="font-size:11px;letter-spacing:.3em;color:#7E8B94;margin:16px 0 4px">竞 赛 消 息 雷 达 · 内 置 插 件</div>
      <div class="gx-toolbar">
        <button class="gx-refresh">⟳ 刷新</button>
        <input class="gx-kw" type="text" placeholder="关键词过滤：如 答辩 / 数学 / 报名 / 截止…">
        <label class="gx-toggle hide-seen"><i></i>只看未读</label>
        <label class="gx-toggle auto"><i></i>每 10 分钟自动刷新</label>
      </div>
      <div class="gx-toolbar" data-chips></div>
      <div class="gx-status"></div>
      <div data-list></div>
      <div style="height:30px"></div>
    `;
    el.append(wrap);

    ui = {
      status: wrap.querySelector(".gx-status"),
      chips: wrap.querySelector("[data-chips]"),
      list: wrap.querySelector("[data-list]"),
      kw: wrap.querySelector(".gx-kw"),
      hideSeen: wrap.querySelector(".hide-seen"),
      auto: wrap.querySelector(".auto"),
      refresh: wrap.querySelector(".gx-refresh"),
      count: document.createElement("b"),
    };

    ui.kw.value = state.filter.kw;
    let kwTimer = null;
    ui.kw.addEventListener("input", () => {
      clearTimeout(kwTimer);
      kwTimer = setTimeout(() => {
        state.filter.kw = ui.kw.value;
        savePrefs();
        paintStatus();
        paintList();
      }, 200);
    });
    ui.kw.addEventListener("keydown", (e) => e.stopPropagation());

    ui.hideSeen.addEventListener("click", () => {
      state.filter.hideSeen = !state.filter.hideSeen;
      savePrefs(); paintChips(); paintList();
    });
    ui.auto.addEventListener("click", () => {
      setAuto(!state.filter.auto);
      paintChips();
      tide.notify(state.filter.auto ? "已开启自动刷新（10 分钟）" : "已关闭自动刷新");
    });
    ui.refresh.addEventListener("click", fetchList);

    // 卡片点击：整卡 → 打开详情；＋提醒 → 转潮衡事件
    ui.list.addEventListener("click", (e) => {
      const card = e.target.closest(".gx-card");
      if (!card) return;
      const id = card.dataset.id;
      const m = state.list.find((x) => String(x.id) === String(id));
      if (!m) return;
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "remind") { createReminder(m); return; }
      markSeen(m.id);
      paintList();
      tide.util.openUrl(DETAIL + m.id);
    });

    paintChips();
    paintStatus();
    paintList();

    // 首次打开自动抓一次
    if (!state.list.length && !state.loading && !state.error) fetchList();
  }

  tide.ui.registerView({ id: "gx-news", title: "竞赛消息", icon: "📡", render });
})();
