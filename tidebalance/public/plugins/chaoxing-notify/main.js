// 学习通通知 —— 改造自 chaoxing-notify-skill v1.0.0（Python 脚本 → 潮衡插件）
// 流程：fanyalogin 登录（密码 DES-ECB/PKCS5，密钥 u2oh6Vu^，加密在本机 Rust 端完成）
//       → 会话化 HTTP 保持登录态 → 消息中心 / 课程列表 / 通知分享码详情 → 一键转提醒
// 安全：凭据只存本机 data.json；会话 Cookie 只在内存；消息中心接口有平台 IP 白名单，被拒时明确提示。
(function () {
  const LOGIN_PAGE = "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com";
  const LOGIN_URL = "https://passport2.chaoxing.com/fanyalogin";
  const COURSES_URL = "https://mooc2-ans.chaoxing.com/visit/courses/list";
  const NOTICE_URL = (code) => `https://sharewh3.xuexi365.com/share/notice/${encodeURIComponent(code)}/notice_data?pt=&wxsn=`;
  const MSG_URL = (uid) => `https://specie.chaoxing.com/apis/message/getMsgNewsListWithPoff?uid=${encodeURIComponent(uid)}&poff=0&size=30`;
  const DES_KEY = "u2oh6Vu^";

  const state = {
    creds: null,            // {uname, password}
    sid: null, uid: "", loggedIn: false,
    courses: [], msgs: [], msgError: null,
    notice: null, noticeError: null,
    loading: "",
    seen: new Set(),
    filter: { kw: "", hideSeen: false },
  };
  let ui = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function strip(s) { return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
  function msgKey(m) { return `${m.time || ""}::${(m.title || "").slice(0, 40)}`; }

  function ensureStyle() {
    if (document.getElementById("cx-notify-style")) return;
    const st = document.createElement("style");
    st.id = "cx-notify-style";
    st.textContent = `
      .cx-wrap{max-width:880px;margin:0 auto}
      .cx-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
      .cx-kw{flex:1;min-width:170px;height:34px;border:1px solid #E4DFD6;border-radius:9px;padding:0 11px;background:#fff}
      .cx-btn{font-size:12px;border:1px solid #E4DFD6;border-radius:8px;padding:7px 13px;background:#fff;cursor:pointer;color:#22303A;white-space:nowrap}
      .gx-btn:hover,.cx-btn:hover{border-color:#0F4C5C;color:#0F4C5C}
      .cx-btn.pri{background:#0F4C5C;color:#fff;border-color:#0F4C5C;font-weight:600}
      .cx-status{font-size:12px;color:#7E8B94;margin:2px 0 8px}
      .cx-status .err{color:#B03535}
      .cx-status .ok{color:#2E7D52}
      .cx-sec{font-size:12.5px;font-weight:700;color:#0F4C5C;letter-spacing:.06em;margin:18px 0 8px;padding-left:9px;border-left:3px solid #0F4C5C}
      .cx-card{display:flex;gap:12px;background:#fff;border:1px solid #E4DFD6;border-radius:14px;padding:12px 14px;margin-bottom:9px;content-visibility:auto;contain-intrinsic-size:auto 84px}
      .cx-card.seen{opacity:.55}
      .cx-main{flex:1;min-width:0}
      .cx-title{font-size:13.5px;font-weight:600;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cx-meta{display:flex;gap:8px;align-items:center;font-size:11px;color:#7E8B94;margin-top:4px;flex-wrap:wrap}
      .cx-tag{border-radius:6px;padding:2px 8px;background:#E1EEF3;color:#0F4C5C;font-size:10px}
      .cx-tag.g{background:#E5F4EC;color:#2E7D52}
      .cx-new{background:#FF6B6B;color:#fff;border-radius:8px;padding:1px 7px;font-size:10px}
      .cx-snip{font-size:11.5px;color:#7E8B94;margin-top:5px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .cx-act{display:flex;flex-direction:column;gap:6px;justify-content:center}
      .cx-act .cx-btn{font-size:11px;padding:5px 10px}
      .cx-login{max-width:420px;margin:26px auto;background:#fff;border:1px solid #E4DFD6;border-radius:18px;padding:28px 30px;box-shadow:0 2px 10px rgba(34,48,58,.07)}
      .cx-login h3{font-size:16px;margin-bottom:4px}
      .cx-login .d{font-size:12px;color:#7E8B94;line-height:1.7;margin-bottom:14px}
      .cx-login label{display:block;font-size:12px;color:#7E8B94;margin:12px 0 5px}
      .cx-login input{width:100%;height:38px;border:1px solid #E4DFD6;border-radius:9px;padding:0 12px;background:#fff;box-sizing:border-box}
      .cx-login .row{display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:12px;color:#7E8B94}
      .cx-login .submit{width:100%;height:40px;border-radius:10px;background:#0F4C5C;color:#fff;font-size:14px;font-weight:600;margin-top:18px;cursor:pointer}
      .cx-login .err{color:#B03535;font-size:12px;margin-top:10px;min-height:16px}
      .cx-login .sec{font-size:10.5px;color:#A9B2BA;margin-top:12px;line-height:1.7}
      .cx-banner{background:#FFF7E8;border:1px solid #F2D9A6;color:#8A6420;border-radius:12px;padding:12px 15px;font-size:12px;line-height:1.8;margin-bottom:10px}
      .cx-input{flex:1;height:34px;border:1px solid #E4DFD6;border-radius:9px;padding:0 11px;background:#fff;min-width:220px}
      .cx-courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:9px}
      .cx-course{background:#fff;border:1px solid #E4DFD6;border-radius:12px;padding:11px 13px}
      .cx-course .n{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cx-course .m{font-size:11px;color:#7E8B94;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cx-empty{border:1.5px dashed #CFC8BA;border-radius:12px;padding:20px;text-align:center;color:#A9B2BA;font-size:12.5px;line-height:1.8}
      .cx-notice-card{background:#fff;border:1px solid #E4DFD6;border-radius:14px;padding:14px 16px;margin-bottom:9px}
      .cx-notice-card .c{font-size:12px;color:#4B565E;line-height:1.8;margin-top:8px;max-height:180px;overflow-y:auto}
    `;
    document.head.append(st);
  }

  async function loadPrefs() {
    const f = await tide.storage.get("filter", null);
    if (f) state.filter = { ...state.filter, ...f };
    state.creds = await tide.storage.get("creds", null);
    state.seen = new Set(await tide.storage.get("seen", []));
  }
  const saveFilter = () => tide.storage.set("filter", state.filter);
  const saveSeen = () => tide.storage.set("seen", [...state.seen].slice(-400));

  /* ── 登录与数据 ── */
  async function cxLogin(uname, password) {
    state.sid = await tide.http.session();
    await tide.http.fetch(state.sid, "GET", LOGIN_PAGE);
    const pwd = await tide.util.desEncryptHex(password, DES_KEY);
    const res = await tide.http.fetch(state.sid, "POST", LOGIN_URL, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://passport2.chaoxing.com",
        "Referer": LOGIN_PAGE,
      },
      body: `fid=-1&uname=${encodeURIComponent(uname)}&password=${encodeURIComponent(pwd)}&refer=https%3A%2F%2Fi.chaoxing.com&t=true&forbidotherlogin=0&validate=`,
    });
    const j = JSON.parse(res.body);
    if (!j.status) throw new Error(j.msg2 || j.msg || "登录失败，请检查账号密码");
    state.uid = ((res.cookies || []).join("\n").match(/_uid=(\d+)/) || [])[1] || "";
    state.loggedIn = true;
    return state.uid;
  }

  async function loadCourses() {
    const res = await tide.http.fetch(state.sid, "GET", `${COURSES_URL}?v=${Date.now()}`, {
      headers: { "Accept": "text/html, */*; q=0.01", "Referer": "https://mooc2-ans.chaoxing.com/visit/interaction" },
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}（登录态可能失效，请重新登录）`);
    const html = res.body;
    const courses = [];
    const pick = (s, re) => { const m = s.match(re); return m ? m[1] : ""; };
    for (const li of html.split('<li class="course ').slice(1)) {
      const cid = pick(li, /class="courseId"\s+name="courseId"\s+value="(\d+)"/);
      const clz = pick(li, /class="clazzId"\s+name="clazzId"\s+value="(\d+)"/);
      const name = pick(li, /class="course-name[^"]*"\s+[^>]*title="([^"]+)"/);
      if (!cid || !clz || !name) continue;
      courses.push({
        name, courseid: cid, clazzid: clz,
        cpi: pick(li, /info="\d+_(\d+)"/),
        teacher: pick(li, /class="line2 color3"[^>]*title="([^"]+)"/),
        clazz: pick(li, /班级：([^<]+)/).trim(),
      });
    }
    state.courses = courses;
  }

  // 消息中心返回结构未知（接口有 IP 白名单，作者也未公开样例），做防御式解析：
  // 取响应里第一个对象数组，字段按常见命名猜测
  function normalizeMsgs(j) {
    const firstArray = (function find(o) {
      if (Array.isArray(o)) return o.length && typeof o[0] === "object" ? o : null;
      if (o && typeof o === "object") {
        for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; }
      }
      return null;
    })(j) || [];
    return firstArray.map((it) => ({
      title: strip(it.title || it.subject || it.name || it.msgTitle || it.noticeTitle || "(无标题)"),
      snippet: strip(it.content || it.summary || it.msgContent || it.brief || it.desc || "").slice(0, 120),
      time: String(it.time || it.createTime || it.sendTime || it.insertTime || it.date || "").slice(0, 16),
      url: it.url || it.link || it.pcUrl || "",
      sender: it.fromusername || it.sender || it.createrName || it.from || "",
    }));
  }

  async function loadMessages() {
    const res = await tide.http.fetch(state.sid, "GET", MSG_URL(state.uid), {
      headers: { "Referer": "https://i.chaoxing.com/", "X-Requested-With": "XMLHttpRequest" },
    });
    let j;
    try { j = JSON.parse(res.body); } catch { throw new Error("消息接口返回非 JSON"); }
    if (String(j.result) !== "1") throw new Error(j.errorMsg || j.msg || "接口拒绝");
    state.msgs = normalizeMsgs(j);
    state.msgError = null;
  }

  async function loadNotice(code) {
    const res = await tide.http.fetch(state.sid, "GET", NOTICE_URL(code), {
      headers: { "X-Requested-With": "XMLHttpRequest", "Referer": `https://sharewh3.xuexi365.com/share/${encodeURIComponent(code)}?t=4` },
    });
    const j = JSON.parse(res.body);
    if (String(j.result) !== "1") throw new Error(j.msg || "通知获取失败");
    const d = j.data || {};
    state.notice = {
      idCode: d.idCode || code,
      title: strip(d.title || "(无标题)"),
      content: strip(d.content).slice(0, 2000),
      createrName: d.createrName || "", toNames: d.toNames || "",
      insertTime: String(d.insertTime || "").slice(0, 16),
    };
    state.noticeError = null;
  }

  /* ── 转提醒 ── */
  async function toReminder(title, content, link) {
    const p = tide.util.parseWhen(`${title} ${strip(content).slice(0, 200)}`);
    const cat = tide.util.guessCategory(`${title} ${content}`);
    const task = tide.tasks.create({
      title, quad: tide.util.guessQuad(p.date),
      estMin: p.endMin ? p.endMin - p.startMin : 60,
      due: p.date, tags: ["学习通"], note: link || "",
    });
    if (p.date && p.startMin !== null) {
      tide.blocks.create({ date: p.date, start: tide.util.hhmmOf(p.startMin), durMin: p.endMin ? p.endMin - p.startMin : 60, title, taskId: task.id, cat });
      tide.notify(`已创建提醒：「${title.slice(0, 20)}${title.length > 20 ? "…" : ""}」→ ${p.date.slice(5)} ${tide.util.hhmmOf(p.startMin)}`, {
        actionLabel: "查看", ms: 6500, action: () => tide.util.navigate("timeblock"),
      });
    } else if (p.date) {
      tide.blocks.create({ date: p.date, start: "09:00", durMin: 60, title, taskId: task.id, cat });
      tide.notify(`识别到日期 ${p.date.slice(5)}，提醒先放在 09:00`);
    } else {
      tide.notify("没识别到日期，任务已存入象限池");
    }
  }

  /* ── 渲染 ── */
  function filteredMsgs() {
    const kw = state.filter.kw.trim().toLowerCase();
    return state.msgs.filter((m) => {
      if (state.filter.hideSeen && state.seen.has(msgKey(m))) return false;
      if (kw && !(m.title.toLowerCase().includes(kw) || m.snippet.toLowerCase().includes(kw))) return false;
      return true;
    });
  }
  function filteredCourses() {
    const kw = state.filter.kw.trim().toLowerCase();
    if (!kw) return state.courses;
    return state.courses.filter((c) =>
      c.name.toLowerCase().includes(kw) || c.teacher.toLowerCase().includes(kw) || c.clazz.toLowerCase().includes(kw));
  }

  function paintLogin(el) {
    el.innerHTML = `<div class="cx-login">
      <h3>登录学习通</h3>
      <div class="d">使用超星学习通账号（手机号/学号）登录。密码 DES 加密在本机 Rust 端完成，凭据只保存在本机数据文件中。</div>
      <label>账号（手机号 / 学号）</label><input data-u type="text" autocomplete="off">
      <label>密码</label><input data-p type="password">
      <div class="row"><label style="margin:0;display:flex;gap:6px;align-items:center"><input data-r type="checkbox" checked> 记住凭据（仅本机）</label><span data-switch></span></div>
      <button class="submit" data-go>登 录</button>
      <div class="err" data-err></div>
      <div class="sec">改造自 chaoxing-notify-skill（fanyalogin + DES-ECB/PKCS5）。「消息中心」接口有平台 IP 白名单：若被拒，课程与通知分享码查询仍可用。</div>
    </div>`;
    const errEl = el.querySelector("[data-err]");
    el.querySelector("[data-go]").addEventListener("click", async () => {
      const uname = el.querySelector("[data-u]").value.trim();
      const password = el.querySelector("[data-p]").value;
      const remember = el.querySelector("[data-r]").checked;
      if (!uname || !password) { errEl.textContent = "请填写账号和密码"; return; }
      errEl.textContent = "正在登录…";
      try {
        const uid = await cxLogin(uname, password);
        if (remember) { state.creds = { uname, password }; await tide.storage.set("creds", state.creds); }
        tide.notify(`登录成功${uid ? `（uid ${uid}）` : ""}`);
        paintMain(el);
        refreshAll();
      } catch (e) {
        errEl.textContent = e.message || e;
      }
    });
  }

  function paintMain(el) {
    el.innerHTML = `<div class="cx-wrap">
      <div style="font-size:11px;letter-spacing:.3em;color:#7E8B94;margin:16px 0 4px">学 习 通 通 知 · 内 置 插 件</div>
      <div class="cx-toolbar">
        <button class="cx-btn pri" data-refresh>刷新</button>
        <input class="cx-kw" data-kw type="text" placeholder="关键词过滤：课程 / 老师 / 作业 / 考试…">
        <label class="gx-toggle" data-hs><i></i>只看未读</label>
        <span style="flex:1"></span>
        <button class="cx-btn" data-switch>切换账号</button>
      </div>
      <div class="cx-status" data-status></div>
      <div data-body></div>
      <div style="height:30px"></div>
    </div>`;

    ui = {
      status: el.querySelector("[data-status]"),
      body: el.querySelector("[data-body]"),
      kw: el.querySelector("[data-kw]"),
      hs: el.querySelector("[data-hs]"),
    };
    ui.kw.value = state.filter.kw;
    ui.hs.classList.toggle("on", !!state.filter.hideSeen);
    let kwTimer = null;
    ui.kw.addEventListener("input", () => {
      clearTimeout(kwTimer);
      kwTimer = setTimeout(() => { state.filter.kw = ui.kw.value; saveFilter(); paintSections(); }, 200);
    });
    ui.kw.addEventListener("keydown", (e) => e.stopPropagation());
    ui.hs.addEventListener("click", () => {
      state.filter.hideSeen = !state.filter.hideSeen;
      saveFilter(); paintSections();
    });
    el.querySelector("[data-refresh]").addEventListener("click", refreshAll);
    el.querySelector("[data-switch]").addEventListener("click", () => {
      state.creds = null; state.loggedIn = false;
      tide.storage.set("creds", null);
      paintLogin(el);
    });
    paintSections();
  }

  function paintSections() {
    if (!ui) return;
    const body = ui.body;
    const msgs = filteredMsgs();
    const courses = filteredCourses();
    ui.hs.classList.toggle("on", !!state.filter.hideSeen);

    body.innerHTML = `
      <div class="cx-status" data-mst></div>
      <div data-mlist></div>
      <div class="cx-sec">课 程 列 表 · ${courses.length} 门</div>
      <div data-clist></div>
      <div class="cx-sec">通 知 分 享 码 查 询</div>
      <div class="cx-toolbar" style="margin-top:0">
        <input class="cx-input" data-code type="text" placeholder="粘贴通知分享码（idCode），如 3A55CB22A1BF…">
        <button class="cx-btn" data-lookup>查询详情</button>
      </div>
      <div data-ndetail></div>
      <div style="height:20px"></div>
    `;
    const mst = body.querySelector("[data-mst]");
    const mlist = body.querySelector("[data-mlist]");
    const clist = body.querySelector("[data-clist]");
    const ndetail = body.querySelector("[data-ndetail]");

    // 消息中心
    if (state.msgError) {
      mst.innerHTML = "";
      mlist.innerHTML = `<div class="cx-banner">${esc(state.msgError)}<br>学习通「消息中心」接口有来源 IP 白名单（平台限制，非账号问题）。被拒时请换到常用网络重试；课程列表与「通知分享码查询」不受影响。</div>`;
    } else {
      mst.innerHTML = `消息中心 · ${msgs.length} 条${state.msgs.length ? `（共拉取 ${state.msgs.length} 条）` : ""}`;
      mlist.innerHTML = msgs.length ? msgs.map((m) => {
        const k = msgKey(m);
        const isNew = !state.seen.has(k);
        return `<div class="cx-card${isNew ? "" : " seen"}" data-k="${esc(k)}">
          <div class="cx-main">
            <div class="cx-title">${esc(m.title)}</div>
            <div class="cx-meta">${m.sender ? `<span class="cx-tag g">${esc(m.sender)}</span>` : ""}<span>${esc(m.time || "未知时间")}</span>${isNew ? '<span class="cx-new">NEW</span>' : ""}</div>
            ${m.snippet ? `<div class="cx-snip">${esc(m.snippet)}</div>` : ""}
          </div>
          <div class="cx-act"><button class="cx-btn" data-act="remind">提醒</button>${m.url ? '<button class="cx-btn" data-act="open">打开</button>' : ""}</div>
        </div>`;
      }).join("") : `<div class="cx-empty">暂无消息 · 点上方「刷新」拉取</div>`;
    }

    // 课程
    clist.innerHTML = courses.length
      ? `<div class="cx-courses">${courses.map((c) => `<div class="cx-course"><div class="n" title="${esc(c.name)}">${esc(c.name)}</div><div class="m">${esc([c.teacher, c.clazz].filter(Boolean).join(" · ") || "—")}</div></div>`).join("")}</div>`
      : `<div class="cx-empty">没有匹配的课程</div>`;

    // 分享码查询状态
    if (state.noticeError) {
      ndetail.innerHTML = `<div class="cx-banner">${esc(state.noticeError)}</div>`;
    } else if (state.notice) {
      const n = state.notice;
      ndetail.innerHTML = `<div class="cx-notice-card">
        <div class="cx-title" style="white-space:normal">${esc(n.title)}</div>
        <div class="cx-meta"><span class="cx-tag">${esc(n.createrName || "教师")}</span><span>${esc(n.insertTime)}</span>${n.toNames ? `<span>发给：${esc(n.toNames)}</span>` : ""}</div>
        <div class="c">${esc(n.content)}</div>
        <div class="cx-act" style="flex-direction:row;margin-top:10px"><button class="cx-btn" data-nremind>转为提醒</button></div>
      </div>`;
      ndetail.querySelector("[data-nremind]").addEventListener("click", async () => {
        await toReminder(n.title, n.content, "");
        paintSections();
      });
    }
  }

  function wireSectionEvents(el) {
    ui.body.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      const card = e.target.closest(".cx-card");
      if (btn && card) {
        const m = filteredMsgs().find((x) => msgKey(x) === card.dataset.k) || state.msgs.find((x) => msgKey(x) === card.dataset.k);
        if (!m) return;
        if (btn.dataset.act === "remind") {
          await toReminder(m.title, m.snippet, m.url);
          state.seen.add(msgKey(m)); saveSeen(); paintSections();
        } else if (btn.dataset.act === "open" && m.url) {
          tide.util.openUrl(m.url);
        }
        return;
      }
      const lookup = e.target.closest("[data-lookup]");
      if (lookup) {
        const code = el.querySelector("[data-code]").value.trim();
        const nd = el.querySelector("[data-ndetail]");
        if (!code) { nd.innerHTML = `<div class="cx-banner">请先粘贴通知分享码（在课程通知的分享链接里）</div>`; return; }
        state.noticeError = null;
        nd.innerHTML = `<div class="cx-empty">正在查询…</div>`;
        try { await loadNotice(code); } catch (err) { state.notice = null; state.noticeError = String(err.message || err); }
        paintSections();
        el.querySelector("[data-code]").value = code;
      }
    });
  }

  async function refreshAll() {
    if (!ui || !state.loggedIn) return;
    state.loading = "refresh";
    ui.status.innerHTML = "正在刷新消息与课程…";
    state.msgError = null;
    try {
      await loadMessages();
    } catch (e) {
      state.msgError = String(e.message || e);
    }
    try {
      await loadCourses();
    } catch (e) {
      if (!state.msgError) state.msgError = `课程列表加载失败：${e.message || e}（登录态可能失效，请切换账号重登）`;
    }
    state.loading = "";
    paintSections();
  }

  function buildMain(el) {
    paintMain(el);
    wireSectionEvents(el);
    refreshAll();
  }

  function render(el) {
    ensureStyle();
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#A9B2BA;font-size:12.5px">正在读取凭据…</div>';
    loadPrefs().then(() => {
      if (state.creds && state.creds.uname) {
        // 有记住的凭据：自动登录
        el.innerHTML = '<div style="padding:30px;text-align:center;color:#A9B2BA;font-size:12.5px">正在登录学习通…</div>';
        cxLogin(state.creds.uname, state.creds.password)
          .then((uid) => {
            tide.notify(`已自动登录学习通${uid ? `（uid ${uid}）` : ""}`);
            buildMain(el);
          })
          .catch((e) => {
            state.creds = null;
            tide.storage.set("creds", null);
            paintLogin(el);
            const errEl = el.querySelector("[data-err]");
            if (errEl) errEl.textContent = `自动登录失败：${e.message || e}`;
          });
      } else {
        paintLogin(el);
      }
    });
  }

  tide.ui.registerView({ id: "chaoxing-notify", title: "学习通通知", icon: "学", render });
})();
