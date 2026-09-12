// 警大门户通知 —— 对齐 cppu-notify-skill v1.2.1（Python + tesseract OCR → Le时间管理插件）
// 相比原 skill 的优化：移除 74MB OCR 运行时，验证码改为界面内手输；
// 保留完整 SSO 链路（主 SSO → sso-jw bridge → 门户 tp_up）与 rememberMe 5 天免密。
// 安全：学号存本机，密码不落盘；会话 Cookie 只在内存。
(function () {
  const SSO = "https://sso.cppu.edu.cn";
  const JW = "https://sso-jw.cppu.edu.cn";
  const PORTAL = "https://portal-jw.cppu.edu.cn";
  const SERVICE_JW = JW + "/tpass/bridge";
  const LOGIN_URL = SSO + "/tpass/login?service=" + encodeURIComponent(SERVICE_JW);
  const SERVICE_PORTAL = PORTAL + "/tp_up/view?m=up";
  const SILENT_LOGIN = JW + "/tpass/login?service=" + encodeURIComponent(SERVICE_PORTAL);
  const PAGES_MAX = 10, PAGE_SIZE = 50, CHUNK = 15;

  // Sudy CAS RSAUtils.encryptedString 忠实移植（126 字符分块，16 位小端打包，非 PKCS#1）
  const MODULUS_HEX = "008aed7e057fe8f14c73550b0e6467b023616ddc8fa91846d2613cdb7f7621e3cada4cd5d812d627af6b87727ade4e26d26208b7326815941492b2204c3167ab2d53df1e3a2c9153bdb7c8c2e968df97a5e7e01cc410f92c4c2c2fba529b3ee988ebc1fca99ff5119e036d732c368acf8beba01aa2fdafa45b21e4de4928d0d403";
  const EXPONENT_HEX = "010001";
  function rsaEncrypt(password) {
    const n = BigInt("0x" + MODULUS_HEX), e = BigInt("0x" + EXPONENT_HEX);
    const chunkSize = 2 * Math.max(0, Math.floor((n.toString(2).length - 1) / 16));
    const a = [...password].map((c) => c.charCodeAt(0));
    while (a.length % chunkSize !== 0) a.push(0);
    const blocks = [];
    for (let i = 0; i < a.length; i += chunkSize) {
      let m = 0n;
      const chunk = a.slice(i, i + chunkSize);
      for (let j = 0; j < chunk.length; j += 2) {
        const word = chunk[j] + ((chunk[j + 1] ?? 0) << 8);
        m |= BigInt(word) << BigInt(16 * (j / 2));
      }
      let r = 1n, b = m % n, ee = e;
      while (ee > 0n) { if (ee & 1n) r = r * b % n; b = b * b % n; ee >>= 1n; }
      blocks.push(r.toString(16));
    }
    return blocks.join(" ");
  }

  const state = {
    sid: null, token: "", username: "", rememberUsername: true,
    notices: [], page: 1, hasMore: true,
    fetching: false, error: null, fetchedAt: 0,
    expanded: new Set(),
    details: {},           // rid -> {content, loading, error}
    seen: new Set(),
    filter: { kw: "", month: "all", hideSeen: false },
    captcha: "", pending: null, renderedCount: CHUNK,
  };
  let ui = null, io = null, sentinelCb = null, paintToken = 0;

  function observeSentinel(node, cb) {
    sentinelCb = cb;
    if (io) io.disconnect();
    if (node && io) io.observe(node);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function monthOf(m) {
    const t = Number(m.CREATE_TIME || 0);
    if (!t) return "unknown";
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function monthLabel(mo) {
    if (mo === "unknown") return "时间未知";
    const [y, m] = mo.split("-");
    return `${y}年${Number(m)}月`;
  }
  function cleanText(raw) {
    let t = String(raw || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|ul|ol)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    const ta = document.createElement("textarea");
    ta.innerHTML = t;
    t = ta.value.replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d");
    const out = [];
    for (const ln of t.split("\n").map((s) => s.trim())) {
      if (ln) out.push(ln);
      else if (!ln && out.length && out[out.length - 1] !== "") out.push("");
    }
    return out.join("\n").trim();
  }
  const titleOf = (it) => String(it.PIM_TITLE || "(无标题)").replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d");
  const itemKey = (it) => String(it.RESOURCE_ID || "");
  function tokenFromText(...parts) {
    for (const part of parts) {
      const m = String(part || "").match(/tp_up[=;]([^&?;\s"'<>]+)/);
      if (m) return m[1];
    }
    return "";
  }
  function explainHttpError(e) {
    const msg = String(e && (e.message || e) || "");
    if (/Failed to fetch|Load failed|NetworkError/i.test(msg)) {
      return "网络桥不可用：浏览器预览会被智慧警大跨域策略拦截，请在桌面版 Le 中打开本插件。";
    }
    return msg || "网络请求失败";
  }

  function ensureStyle() {
    if (document.getElementById("pp-notify-style")) return;
    const st = document.createElement("style");
    st.id = "pp-notify-style";
    st.textContent = `
      .pp-wrap{max-width:880px;margin:0 auto}
      .pp-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
      .pp-lab{font-size:11px;color:#A9B2BA;letter-spacing:.14em;flex:none;width:34px}
      .pp-chips{display:flex;gap:8px;flex-wrap:wrap;flex:1}
      .pp-kw{flex:1;min-width:170px;height:34px;border:1px solid #E4DFD6;border-radius:9px;padding:0 11px;background:#fff}
      .pp-chip{font-size:12px;border:1px solid #E4DFD6;background:#fff;border-radius:16px;padding:6px 13px;cursor:pointer;color:#7E8B94}
      .pp-chip.on{background:#0F4C5C;color:#fff;border-color:#0F4C5C}
      .gx-btn:hover,.pp-btn:hover{border-color:#0F4C5C;color:#0F4C5C}
      .pp-btn{font-size:12px;border:1px solid #E4DFD6;border-radius:8px;padding:7px 13px;background:#fff;cursor:pointer;color:#22303A;white-space:nowrap}
      .pp-btn.pri{background:#0F4C5C;color:#fff;border-color:#0F4C5C;font-weight:600}
      .pp-btn.pri:hover{background:#0B3D4A;color:#fff}
      .pp-toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:#7E8B94;cursor:pointer;user-select:none}
      .pp-toggle i{width:34px;height:19px;border-radius:10px;background:#D8D2C6;display:inline-block;position:relative;transition:.15s}
      .pp-toggle i::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s}
      .pp-toggle.on i{background:#2EC4B6}
      .pp-toggle.on i::after{left:17px}
      .pp-status{font-size:12px;color:#7E8B94;margin:2px 0 8px}
      .pp-status .err{color:#B03535}
      .pp-month{font-size:12.5px;font-weight:700;color:#0F4C5C;padding:9px 2px 7px;letter-spacing:.05em}
      .pp-card{background:#fff;border:1px solid #E4DFD6;border-radius:14px;padding:12px 14px;margin-bottom:9px;cursor:pointer;content-visibility:auto;contain-intrinsic-size:auto 74px}
      .pp-heading{display:block;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:4px 0;cursor:pointer;font-family:inherit;min-height:44px}
      .pp-expand{margin-top:10px;min-height:44px}
      .pp-heading:focus-visible,.pp-btn:focus-visible{outline:3px solid #2EC4B6;outline-offset:2px}
      @media(max-width:600px){.pp-wrap{width:100%;min-width:0}.pp-login{margin:12px auto;padding:20px 16px;max-width:100%;box-sizing:border-box}.pp-title{font-size:17px!important}.pp-meta{font-size:13px!important}.pp-detail .c{font-size:16px!important;max-height:none!important;overflow-wrap:anywhere}.pp-btn,.pp-chip{min-height:44px;font-size:14px!important}.pp-kw{width:100%;flex-basis:100%;box-sizing:border-box;min-height:44px}.pp-card{padding:14px;cursor:default}.pp-caprow input{min-width:0}.pp-detail .pp-act{flex-wrap:wrap}}
      .pp-card:hover{background:#FBFAF5;border-color:#D8D2C4}
      .pp-card.seen{opacity:.6}
      .pp-title{font-size:13.5px;font-weight:600;line-height:1.5}
      .pp-meta{display:flex;gap:8px;align-items:center;font-size:11px;color:#7E8B94;margin-top:5px;flex-wrap:wrap}
      .pp-tag{border-radius:6px;padding:2px 8px;background:#E1EEF3;color:#0F4C5C;font-size:10px}
      .pp-tag.top{background:#FFF0E1;color:#B26A00}
      .pp-tag.unread{background:#FDE8E8;color:#C64545}
      .pp-detail{margin-top:10px;border-top:1px dashed #EFEAE1;padding-top:10px}
      .pp-detail .c{font-size:12px;color:#4B565E;line-height:1.9;white-space:pre-wrap;max-height:320px;overflow-y:auto}
      .pp-detail .pp-act{display:flex;gap:8px;margin-top:10px}
      .pp-login{max-width:440px;margin:26px auto;background:#fff;border:1px solid #E4DFD6;border-radius:18px;padding:28px 30px;box-shadow:0 2px 10px rgba(34,48,58,.07)}
      .pp-login h3{font-size:16px;margin-bottom:4px}
      .pp-login .d{font-size:12px;color:#7E8B94;line-height:1.7;margin-bottom:12px}
      .pp-login label{display:block;font-size:12px;color:#7E8B94;margin:12px 0 5px}
      .pp-login input{width:100%;height:38px;border:1px solid #E4DFD6;border-radius:9px;padding:0 12px;background:#fff;box-sizing:border-box}
      .pp-caprow{display:flex;gap:10px;align-items:flex-end}
      .pp-caprow .capbox{flex:none;width:120px;text-align:center;cursor:pointer}
      .pp-caprow img{width:120px;height:40px;border:1px solid #E4DFD6;border-radius:8px;background:#fff;display:block}
      .pp-caprow small{font-size:10px;color:#A9B2BA;display:block;margin-top:3px}
      .pp-login .err{color:#B03535;font-size:12px;margin-top:10px;min-height:16px}
      .pp-login .sec{font-size:10.5px;color:#A9B2BA;margin-top:12px;line-height:1.7}
      .pp-login .saved{background:#F6FBFA;border:1px solid #D6EBE8;color:#42656A;border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.65;margin:10px 0 12px}
      .pp-empty{border:1.5px dashed #CFC8BA;border-radius:12px;padding:20px;text-align:center;color:#A9B2BA;font-size:12.5px;line-height:1.8}
      .pp-banner{background:#FFF7E8;border:1px solid #F2D9A6;color:#8A6420;border-radius:12px;padding:12px 15px;font-size:12px;line-height:1.8;margin-bottom:10px}
      .pp-more{display:flex;justify-content:center;padding:8px 0 4px}
      .pp-more .pp-btn{padding:8px 20px;font-size:12px}
    `;
    document.head.append(st);
  }

  async function loadPrefs() {
    const f = await tide.storage.get("filter", null);
    if (f) state.filter = { ...state.filter, ...f };
    state.username = (await tide.storage.get("username", "")) || "";
    state.rememberUsername = await tide.storage.get("rememberUsername", true) !== false;
    state.seen = new Set(await tide.storage.get("seen", []));
  }
  const saveFilter = () => tide.storage.set("filter", state.filter);
  const saveSeen = () => tide.storage.set("seen", [...state.seen].slice(-500));

  /* ── SSO 登录链路 ── */
  async function newSession() { if (!state.sid) state.sid = await tide.http.session(); }
  const referer = () => PORTAL + "/tp_up/view;tp_up=" + state.token + "?m=up";

  async function getPage(url, useBinary = false, opts = {}) {
    try {
      return await tide.http.fetch(state.sid, "GET", url, { ...opts, binary: useBinary });
    } catch (e) {
      throw new Error(explainHttpError(e));
    }
  }

  async function fetchLoginHtml() {
    const res = await getPage(LOGIN_URL);
    const m = res.body.match(/name="execution" value="([^"]+)"/);
    if (!m) throw new Error("登录页加载异常（网络或站点不可达）");
    return m[1];
  }

  async function fetchCaptcha() {
    const res = await getPage(SSO + "/tpass/captcha.jpg?tt=" + Math.random(), true);
    if (res.status !== 200) throw new Error("验证码获取失败");
    state.captcha = "data:image/jpeg;base64," + res.body;
    // 更新页面上所有验证码图（登录表单/换图按钮共用）
    document.querySelectorAll("img[data-cap]").forEach((img) => { img.src = state.captcha; });
    return state.captcha;
  }

  async function finishPortalLogin(firstRes) {
    const direct = tokenFromText(firstRes?.finalUrl, firstRes?.body);
    if (direct) { state.token = direct; return true; }

    // 对齐原 skill：主 SSO 登录成功后，显式补走 sso-jw -> 门户换 tp_up。
    // HTTP 桥已经跟随 bridge 重定向；不要重复消费一次性 ticket。
    const renew = await getPage(SILENT_LOGIN).catch(() => null);
    const renewed = tokenFromText(renew?.finalUrl, renew?.body);
    if (renewed) { state.token = renewed; return true; }
    return false;
  }

  async function submitLogin(code) {
    const p = state.pending;
    let res;
    try {
      res = await tide.http.fetch(state.sid, "POST", LOGIN_URL, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": LOGIN_URL,
        },
        body: `username=${encodeURIComponent(p.username)}&password=${encodeURIComponent(rsaEncrypt(p.password))}` +
          `&authcode=${encodeURIComponent(code)}&execution=${encodeURIComponent(p.execution)}` +
          `&encrypted=true&_eventId=submit&loginType=1&rememberMe=true&submit=${encodeURIComponent("登 录")}`,
      });
    } catch (e) {
      throw { retry: explainHttpError(e) };
    }
    if (await finishPortalLogin(res)) { state.pending = null; return; }
    const body = res.body || "";
    let msg = null;
    if (/密码错误|账号或密码/.test(body)) throw { fatal: "账号或密码错误" };
    const plain = cleanText(body);
    const mm = plain.match(/((?:验证码|密码|账号|用户名|锁定|禁止|失败|不正确|不允许|过期)[^\n。；;]{0,40})/);
    if (mm) msg = mm[1].trim();
    // 失败后 execution 已失效：重置登录页（新 execution + 新验证码）
    state.pending.execution = await fetchLoginHtml();
    await fetchCaptcha();
    const diag = `诊断：HTTP ${res.status} · 登录未建立，请核对验证码`;
    throw { retry: msg || `登录未通过（HTTP ${res.status}），已重置登录页，请重试`, diag };
  }

  // 静默续期：CASTGC 5 天内有效时，sso-jw 会自动换 ticket，无需验证码
  async function silentRenew() {
    try {
      const res = await getPage(SILENT_LOGIN);
      const t = tokenFromText(res.finalUrl, res.body);
      if (t) { state.token = t; return true; }
    } catch { /* ignore */ }
    return false;
  }

  /* ── 通知数据 ── */
  async function loadPage(page = 1, renewed = false) {
    if (state.fetching) return;
    state.fetching = true;
    paintStatus();
    try {
      let res;
      try {
        res = await tide.http.fetch(state.sid, "POST", PORTAL + "/tp_up/up/pim/allpim/getAllPimList", {
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Referer": referer(),
            "Cookie": "tp_up=" + state.token,
          },
          body: JSON.stringify({ pageNum: page, pageSize: PAGE_SIZE }),
        });
      } catch (e) {
        throw new Error(explainHttpError(e));
      }
      if (res.status !== 200) throw new Error(`列表接口 HTTP ${res.status}，会话可能已过期`);
      let d;
      try { d = JSON.parse(res.body); } catch { throw new Error("会话已过期，请重新登录"); }
      if (!Array.isArray(d.list)) throw new Error("列表格式异常或会话已过期，请重新登录");
      const items = d.list;
      if (page === 1) state.notices = items;
      else {
        const ids = new Set(state.notices.map((x) => x.RESOURCE_ID));
        state.notices = state.notices.concat(items.filter((x) => !ids.has(x.RESOURCE_ID)));
      }
      state.page = page;
      state.hasMore = items.length >= PAGE_SIZE && page < PAGES_MAX;
      state.fetchedAt = Date.now();
      state.error = null;
    } catch (e) {
      // 会话过期先尝试静默续期一次
      if (!renewed && await silentRenew()) {
        state.fetching = false;
        return loadPage(page, true);
      }
      state.error = String(e.message || e);
    }
    state.fetching = false;
    paintAll();
  }

  async function loadDetail(rid) {
    const cur = state.details[rid] || {};
    if (cur.content || cur.loading) return;
    state.details[rid] = { loading: true };
    paintList();
    try {
      let res;
      try {
        res = await tide.http.fetch(state.sid, "POST", PORTAL + "/tp_up/up/pim/showpim/getPimDetailInfoById", {
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Referer": referer(),
            "Cookie": "tp_up=" + state.token,
          },
          body: JSON.stringify({ RESOURCE_ID: rid }),
        });
      } catch (e) {
        throw new Error(explainHttpError(e));
      }
      if (res.status !== 200) throw new Error(`详情接口 HTTP ${res.status}`);
      const arr = JSON.parse(res.body);
      const d = Array.isArray(arr) ? arr[0] : null;
      let text = "";
      if (d) {
        const cu = d.CONTENT_URL || "";
        if (cu) {
          const url = cu.startsWith("http") ? cu : PORTAL + "/tp_up/" + cu.replace(/^\//, "");
          const cres = await getPage(url, false, { headers: { "Referer": referer(), "Cookie": "tp_up=" + state.token } });
          if (cres.status !== 200) throw new Error(`正文接口 HTTP ${cres.status}`);
          const mm = cres.body.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
          let obj;
          try { obj = JSON.parse(mm ? mm[1] : cres.body); text = obj.result || obj.content || ""; }
          catch { text = cres.body; }
        } else {
          text = d.PIM_CONTENT || "";
        }
      }
      state.details[rid] = { content: cleanText(text) || "（正文为空，可能内容在附件中）" };
    } catch (e) {
      state.details[rid] = { error: String(e.message || e) };
    }
    paintList();
  }

  /* ── 过滤与渲染 ── */
  function filtered() {
    const kw = state.filter.kw.trim().toLowerCase();
    const rows = state.notices.filter((it) => {
      if (state.filter.month !== "all" && monthOf(it) !== state.filter.month) return false;
      if (state.filter.hideSeen && state.seen.has(itemKey(it))) return false;
      if (kw) {
        const hay = `${titleOf(it)} ${it.CREATE_USER_NAME || ""} ${it.BELONG_UNIT_NAME || ""} ${it.TYPE_NAME || ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => Number(b.IS_TOP || 0) - Number(a.IS_TOP || 0) || Number(b.CREATE_TIME || 0) - Number(a.CREATE_TIME || 0));
  }

  function paintStatus() {
    if (!ui) return;
    if (state.fetching && !state.notices.length) { ui.status.innerHTML = "正在拉取通知…"; return; }
    if (state.error) { ui.status.innerHTML = `<span class="err">${esc(state.error)}</span>`; return; }
    const at = state.fetchedAt ? new Date(state.fetchedAt).toTimeString().slice(0, 5) : "—";
    ui.status.innerHTML = `${esc(state.username ? "学号 " + state.username : "")} · 已更新 ${at} · 拉取 ${state.notices.length} 条 · 显示 <b>${filtered().length}</b> 条`;
  }

  function paintChips() {
    if (!ui) return;
    const months = [...new Set(state.notices.map(monthOf))].filter((mo) => mo !== "unknown").sort().reverse();
    ui.months.replaceChildren(...[{ id: "all", label: "全部" }, ...months.map((mo) => ({ id: mo, label: monthLabel(mo) }))].map((c) => {
      const b = document.createElement("button");
      b.className = "pp-chip" + (state.filter.month === c.id ? " on" : "");
      b.textContent = c.label;
      b.addEventListener("click", () => { state.filter.month = c.id; saveFilter(); paintChips(); paintList(true); });
      return b;
    }));
    ui.hs.classList.toggle("on", !!state.filter.hideSeen);
  }

  function cardHtml(it) {
    const rid = itemKey(it);
    const key = rid;
    const isNew = !state.seen.has(key);
    const t = Number(it.CREATE_TIME || 0);
    const timeStr = t ? new Date(t).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const det = state.details[rid];
    const open = state.expanded.has(rid);
    return `<div class="pp-card" data-rid="${esc(rid)}">
      <button class="pp-title pp-heading" data-toggle aria-expanded="${open}" aria-label="${esc(titleOf(it))}，${open ? "收起正文" : "展开正文"}">${esc(titleOf(it))}</button>
      <div class="pp-meta">
        ${it.IS_TOP === "1" ? '<span class="pp-tag top">置顶</span>' : ""}
        ${it.IS_READ === "0" ? '<span class="pp-tag unread">未读</span>' : ""}
        ${it.TYPE_NAME ? `<span class="pp-tag">${esc(it.TYPE_NAME)}</span>` : ""}
        <span>发布：${esc(it.CREATE_USER_NAME || "—")}（${esc(it.BELONG_UNIT_NAME || "—")}）</span>
        <span>${timeStr}</span>
        ${isNew ? '<span class="pp-tag unread">NEW</span>' : ""}
      </div>
      <button class="pp-btn pp-expand" data-toggle aria-expanded="${open}">${open ? "收起正文" : "展开正文"}</button>
      ${open ? `<div class="pp-detail">${!det || det.loading ? "正在加载正文…" :
        det.error ? `<span style="color:#B03535;font-size:12px">${esc(det.error)}</span><button class="pp-btn" data-retry>重试加载正文</button>` :
        `<div class="c">${esc(det.content)}</div>
         <div class="pp-act"><button class="pp-btn" data-remind>转为提醒</button></div>`}</div>` : ""}
    </div>`;
  }

  function paintList(reset) {
    if (!ui) return;
    if (reset) state.renderedCount = CHUNK;
    const rows = filtered();
    const slice = rows.slice(0, state.renderedCount);
    const token = ++paintToken;

    if (!slice.length) {
      ui.list.innerHTML = `<div class="pp-empty">${state.notices.length
        ? "没有符合过滤条件的通知<br>试试换个关键词或切回「全部」月份"
        : state.error ? "" : "还没有通知，点上方「刷新」拉取"}</div>`;
      return;
    }

    let html = "", lastMonth = "";
    const counts = {};
    for (const it of rows) counts[monthOf(it)] = (counts[monthOf(it)] || 0) + 1;
    for (const it of slice) {
      const mo = monthOf(it);
      if (mo !== lastMonth) {
        html += `<div class="pp-month">${esc(monthLabel(mo))} · ${counts[mo]} 条</div>`;
        lastMonth = mo;
      }
      html += cardHtml(it);
    }
    ui.list.innerHTML = html;

    const more = document.createElement("div");
    more.className = "pp-more";
    if (state.renderedCount < rows.length) {
      const b = document.createElement("button");
      b.className = "pp-btn";
      b.textContent = `▾ 显示更多（本页还有 ${rows.length - state.renderedCount} 条）`;
      b.addEventListener("click", () => { if (token === paintToken) { state.renderedCount += CHUNK; paintList(); } });
      more.append(b);
    } else if (state.hasMore) {
      const b = document.createElement("button");
      b.className = "pp-btn";
      b.textContent = state.fetching ? "正在加载更早的通知…" : `加载更早的通知（第 ${state.page + 1} 页）`;
      b.addEventListener("click", () => { if (token === paintToken) loadPage(state.page + 1); });
      more.append(b);
    } else if (state.notices.length) {
      more.innerHTML = `<div style="font-size:11px;color:#A9B2BA">已加载的通知全部展示</div>`;
    }
    ui.list.append(more);

    // 哨兵元素：滚到底自动补渲染下一块（IO 异步触发，不占滚动帧）
    if (state.renderedCount < rows.length) {
      const sentinel = document.createElement("div");
      sentinel.style.height = "1px";
      ui.list.append(sentinel);
      observeSentinel(sentinel, () => {
        if (token !== paintToken) return;
        state.renderedCount += CHUNK;
        paintList();
      });
    }
  }

  function paintAll() { paintStatus(); paintChips(); paintList(); }

  async function toReminder(it) {
    const title = titleOf(it);
    const det = state.details[itemKey(it)];
    const content = det && det.content ? det.content : "";
    const p = tide.util.parseWhen(`${title} ${cleanText(content).slice(0, 300)}`);
    const cat = tide.util.guessCategory(`${title} ${content}`);
    const task = tide.tasks.create({
      title, quad: tide.util.guessQuad(p.date),
      estMin: p.endMin ? p.endMin - p.startMin : 60,
      due: p.date, tags: ["警大通知"],
      note: PORTAL + "/tp_up/view?m=up",
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
      tide.notify("通知里没识别到日期，任务已存入象限池");
    }
    state.seen.add(itemKey(it));
    saveSeen();
    paintList();
  }

  function setSeen(rid) { state.seen.add(rid); saveSeen(); }

  /* ── 登录界面 ── */
  function paintLogin(el, errMsg) {
    const hasSaved = !!state.username;
    el.innerHTML = `<div class="pp-login">
      <h3>登录智慧警大门户</h3>
      <div class="d">中国人民警察大学统一门户（portal-jw.cppu.edu.cn）。系统会优先尝试当前会话自动登录；失效后只需要在这里输入密码和验证码。</div>
      ${hasSaved ? `<div class="saved">已填入上次账号 ${esc(state.username)}。密码不会保存，每次只在这个登录框里输入。</div>` : ""}
      <label>学号 / 用户名</label><input data-u aria-label="学号 / 用户名" type="text" value="${esc(state.username)}" autocomplete="off">
      <label>密码</label><input data-p aria-label="密码" type="password" autocomplete="current-password">
      <label>验证码</label>
      <div class="pp-caprow">
        <input data-code aria-label="验证码" type="text" maxlength="4" placeholder="4 位字符">
        <div class="capbox" data-capbox title="点击更换"><img data-cap src="${esc(state.captcha)}"><small>看不清？点图换一张</small></div>
      </div>
      <div class="row" style="margin-top:12px;gap:12px;align-items:center;flex-wrap:wrap">
        <label class="pp-toggle ${state.rememberUsername ? "on" : ""}" data-remember><i></i>记住账号</label>
        <span data-switchuser style="font-size:12px;color:#7E8B94;cursor:pointer">清除上次账号</span>
      </div>
      <button class="submit" data-go style="width:100%;height:40px;border-radius:10px;background:#0F4C5C;color:#fff;font-size:14px;font-weight:600;margin-top:14px;cursor:pointer">登 录</button>
      <div class="err" data-err>${esc(errMsg || "")}</div>
      <div class="sec">登录成功后会保存账号并在本次应用运行期间保留门户自动登录票据；密码只在内存中用于本次登录，不会落盘。</div>
    </div>`;

    const errEl = el.querySelector("[data-err]");
    const codeEl = el.querySelector("[data-code]");
    const capImg = el.querySelector("[data-cap]");
    const userEl = el.querySelector("[data-u]");
    const passEl = el.querySelector("[data-p]");
    const rememberEl = el.querySelector("[data-remember]");
    el.querySelector("[data-capbox]").addEventListener("click", async () => {
      errEl.textContent = "正在换验证码…";
      try {
        const url = await fetchCaptcha();
        if (capImg) capImg.src = url;   // 直接更新登录表单里的验证码图
        errEl.textContent = "";
      } catch (e) {
        errEl.textContent = e.message || e;
      }
    });
    rememberEl.addEventListener("click", () => {
      state.rememberUsername = !state.rememberUsername;
      rememberEl.classList.toggle("on", state.rememberUsername);
      tide.storage.set("rememberUsername", state.rememberUsername);
      if (!state.rememberUsername) tide.storage.set("username", "");
    });
    el.querySelector("[data-switchuser]").addEventListener("click", () => {
      state.username = "";
      tide.storage.set("username", "");
      userEl.value = "";
      userEl.focus();
    });

    let loggingIn = false;
    const doLogin = async () => {
      if (loggingIn) return;
      const username = userEl.value.trim();
      const password = passEl.value;
      const code = codeEl.value.trim();
      if (!username || !password || !code) { errEl.textContent = "请填写学号、密码和验证码"; return; }
      if (!state.pending?.execution) { errEl.textContent = "登录页尚未准备好，请稍候再试"; return; }
      loggingIn = true; el.querySelector("[data-go]").disabled = true;
      errEl.textContent = "正在走 SSO 链路（登录 → bridge → 门户）…";
      try {
        state.pending = { username, password, execution: state.pending?.execution };
        await submitLogin(code);
        state.username = username;
        if (state.rememberUsername) tide.storage.set("username", username);
        else tide.storage.set("username", "");
        passEl.value = "";
        tide.notify("登录成功，正在获取门户通知");
        buildMain(el);
        loadPage(1);
      } catch (e2) {
        if (e2 && e2.fatal) { errEl.textContent = e2.fatal; }
        else {
          errEl.innerHTML = esc((e2 && e2.retry) || e2.message || "登录失败") +
            (e2 && e2.diag ? `<br><span style="font-size:10.5px;color:#A9B2BA;word-break:break-all">${e2.diag}</span>` : "");
        }
      } finally {
        loggingIn = false;
        const button = el.querySelector("[data-go]"); if (button) button.disabled = false;
        if (state.pending) delete state.pending.password;
      }
    };
    el.querySelector("[data-go]").addEventListener("click", doLogin);
    for (const input of [userEl, passEl, codeEl]) {
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") doLogin();
      });
    }
    setTimeout(() => (hasSaved ? passEl : userEl).focus(), 0);

    // 首次进入：拉登录页 + 验证码
    (async () => {
      try {
        await newSession();
        if (!state.pending?.execution || !state.captcha) {
          state.pending = { execution: await fetchLoginHtml() };
          await fetchCaptcha();
        }
      } catch (e) {
        errEl.textContent = e.message || e;
      }
    })();
  }

  function buildMain(el) {
    el.innerHTML = `<div class="pp-wrap">
      <div style="font-size:11px;letter-spacing:.3em;color:#7E8B94;margin:16px 0 4px">警 大 门 户 通 知 · 内 置 插 件</div>
      <div class="pp-toolbar">
        <button class="pp-btn pri" data-refresh>刷新</button>
        <input class="pp-kw" data-kw type="text" placeholder="关键词过滤：标题 / 发布人 / 单位 / 分类…">
        <label class="pp-toggle" data-hs><i></i>只看未读</label>
        <span style="flex:1"></span>
        <button class="pp-btn" data-relogin>重新登录</button>
      </div>
      <div class="pp-toolbar"><span class="pp-lab">月份</span><div class="pp-chips" data-months></div></div>
      <div class="pp-status" data-status></div>
      <div data-list></div>
      <div style="height:30px"></div>
    </div>`;

    ui = {
      status: el.querySelector("[data-status]"),
      months: el.querySelector("[data-months]"),
      list: el.querySelector("[data-list]"),
      kw: el.querySelector("[data-kw]"),
      hs: el.querySelector("[data-hs]"),
      count: document.createElement("b"),
    };
    ui.kw.value = state.filter.kw;
    ui.hs.classList.toggle("on", !!state.filter.hideSeen);
    let kwTimer = null;
    ui.kw.addEventListener("input", () => {
      clearTimeout(kwTimer);
      kwTimer = setTimeout(() => { state.filter.kw = ui.kw.value; saveFilter(); paintAll(); }, 200);
    });
    ui.kw.addEventListener("keydown", (e) => e.stopPropagation());
    ui.hs.addEventListener("click", () => { state.filter.hideSeen = !state.filter.hideSeen; saveFilter(); paintChips(); paintList(true); });
    el.querySelector("[data-refresh]").addEventListener("click", () => loadPage(1));
    el.querySelector("[data-relogin]").addEventListener("click", () => {
      state.token = ""; state.notices = []; state.details = {}; state.expanded.clear(); state.pending = null; state.captcha = ""; state.sid = null; ui = null;
      paintLogin(el);
    });

    io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting) && sentinelCb) sentinelCb();
    }, { root: el, rootMargin: "320px" });

    ui.list.addEventListener("click", async (e) => {
      const card = e.target.closest(".pp-card");
      if (!card) return;
      const rid = card.dataset.rid;
      const it = state.notices.find((x) => itemKey(x) === rid);
      if (!it) return;
      if (e.target.closest("[data-remind]")) { await toReminder(it); return; }
      if (e.target.closest("[data-retry]")) { loadDetail(rid); return; }
      if (!e.target.closest("[data-toggle]")) return;
      if (state.expanded.has(rid)) { state.expanded.delete(rid); paintList(); }
      else { state.expanded.add(rid); setSeen(rid); paintList(); loadDetail(rid); }
    });

    paintAll();
    if (!state.notices.length && !state.fetching) loadPage(1);
  }

  function render(el) {
    ensureStyle();
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#A9B2BA;font-size:12.5px">正在读取偏好…</div>';
    loadPrefs().then(async () => {
      await newSession();
      if (state.token) { buildMain(el); return; }
      // 有记住的学号：先试静默续期（CASTGC 5 天内有效时免验证码）
      if (state.username && await silentRenew()) {
        tide.notify("已通过 5 天票据静默续期门户会话");
        buildMain(el);
        loadPage(1);
      } else {
        try { state.pending = { execution: await fetchLoginHtml() }; await fetchCaptcha(); } catch (e) { state.captcha = ""; state.pending = state.pending || {}; state.pendingError = String(e.message || e); }
        paintLogin(el, state.pendingError);
      }
    });
  }

  tide.ui.registerView({ id: "cppu-notify", title: "警大通知", icon: "警", render });
})();
