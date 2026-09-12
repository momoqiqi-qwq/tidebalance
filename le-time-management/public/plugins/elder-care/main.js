(function () {
  const SITES = [
    { id: "si", name: "国家社会保险公共服务平台", url: "https://si.12333.gov.cn", tag: "社保公共服务", appHint: "掌上12333、电子社保卡或浏览器" },
    { id: "m12333", name: "人社通（全国社保查询）", url: "https://m12333.cn", tag: "全国社保查询", appHint: "掌上12333或浏览器" },
    { id: "gjzwfw", name: "国家政务服务平台", url: "https://gjzwfw.www.gov.cn", tag: "政务服务", appHint: "国家政务服务平台 App 或小程序" },
    { id: "bj", name: "北京市社会保险网上服务平台", url: "https://rsj.beijing.gov.cn", tag: "北京社保", appHint: "北京人社、京通或浏览器" },
    { id: "hrss", name: "人力资源和社会保障政务服务平台", url: "https://www.12333.gov.cn", tag: "人社服务", appHint: "掌上12333或浏览器" },
  ];
  const PRESETS = [
    { title: "晨起量血压", time: "07:30", dur: 15, message: "记得量血压并记录数值。", tag: "健康" },
    { title: "早餐后吃药", time: "08:00", dur: 10, message: "早餐后按药盒顺序吃药，喝一杯温水。", tag: "用药" },
    { title: "上午喝水", time: "10:00", dur: 5, message: "该喝水了，顺手活动一下肩颈。", tag: "喝水" },
    { title: "午餐前测血糖", time: "11:30", dur: 10, message: "如需控糖，午餐前测一次血糖。", tag: "健康" },
    { title: "午休", time: "13:00", dur: 45, message: "午休一会儿，起身时慢一点。", tag: "休息" },
    { title: "下午散步", time: "16:30", dur: 30, message: "天气合适就出门慢走，带好手机和钥匙。", tag: "运动" },
    { title: "晚餐后吃药", time: "19:00", dur: 10, message: "晚餐后按医嘱吃药。", tag: "用药" },
    { title: "睡前检查门窗", time: "21:00", dur: 10, message: "睡前检查门窗、燃气和充电设备。", tag: "安全" },
    { title: "复诊/取药准备", time: "09:00", dur: 30, message: "带医保卡、病历、检查单和常用药清单。", tag: "就医" },
    { title: "养老金资格认证", time: "09:30", dur: 30, message: "检查养老金资格认证是否到期，必要时联系子女协助。", tag: "养老" },
    { title: "给子女报平安", time: "20:30", dur: 10, message: "给子女发一条平安消息。", tag: "家人" }
  ];
  const DEFAULT_BLE = {
    enabled: false,
    childName: "",
    childContact: "",
    serviceUuid: "",
    characteristicUuid: "",
    prefix: "ELDER_REMIND"
  };
  const repeatText = { once: "仅今天", daily: "每天", weekdays: "工作日" };
  const catMap = { "健康": "life", "用药": "life", "喝水": "rest", "休息": "rest", "运动": "sport", "安全": "life", "就医": "life", "养老": "life", "家人": "life" };
  const state = { reminders: [], ble: { ...DEFAULT_BLE }, tab: "reminders", now: Date.now() };
  let ui = null, device = null, characteristic = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function uid() { return "er_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function today() { return tide.util.today(); }
  function isAndroid() { return /Android/i.test(navigator.userAgent || ""); }
  function saveReminders() { return tide.storage.set("reminders", state.reminders); }
  function saveBle() { return tide.storage.set("ble", state.ble); }
  function minOf(hhmm) {
    const [h, m] = String(hhmm || "00:00").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  function shouldFire(r, d) {
    if (!r.enabled) return false;
    const nowMin = d.getHours() * 60 + d.getMinutes();
    if (nowMin !== minOf(r.time)) return false;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${r.time}`;
    if (r.lastFired === key) return false;
    if (r.repeat === "weekdays" && [0, 6].includes(d.getDay())) return false;
    return key;
  }
  async function fireReminder(r, key) {
    r.lastFired = key;
    await saveReminders();
    const child = state.ble.childName || state.ble.childContact;
    const suffix = child ? `，也可以提醒她联系 ${child}` : "";
    tide.notify(`${r.title}：${r.message || "到时间了"}${suffix}`, { ms: 9000 });
    await sendBle(r).catch(() => {});
    paint();
  }
  function ensureTicker() {
    if (window.__tideElderTicker) clearInterval(window.__tideElderTicker);
    window.__tideElderTicker = setInterval(() => {
      state.now = Date.now();
      const d = new Date();
      for (const r of state.reminders) {
        const key = shouldFire(r, d);
        if (key) fireReminder(r, key);
      }
      paintStatus();
    }, 30000);
  }

  function ensureStyle() {
    if (document.getElementById("elder-care-style")) return;
    const st = document.createElement("style");
    st.id = "elder-care-style";
    st.textContent = `
      .ec-wrap{max-width:1120px;margin:0 auto;color:#17262C;background:#F8F3E7;padding:20px;border-radius:18px}
      .ec-head{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end;margin:0 0 18px}
      .ec-kicker{display:inline-flex;align-items:center;min-height:34px;padding:0 14px;border-radius:999px;background:#16586A;color:#fff;font-size:18px;font-weight:800;letter-spacing:0;margin-bottom:10px}
      .ec-title{font-size:40px;font-weight:900;letter-spacing:0;line-height:1.16}
      .ec-sub{font-size:21px;color:#52646C;line-height:1.55;margin-top:8px;max-width:760px}
      .ec-tabs{display:flex;gap:10px;flex-wrap:wrap}
      .ec-tab,.ec-btn{min-height:56px;border:2px solid #D8C8AC;background:#fff;border-radius:14px;padding:0 20px;font-size:20px;font-weight:800;color:#16586A;cursor:pointer;transition:transform .08s ease,background .1s ease,border-color .1s ease}
      .ec-tab.on,.ec-btn.pri{background:#16586A;border-color:#16586A;color:#fff}
      .ec-btn.danger{background:#FBE7E4;border-color:#E8B8B0;color:#A2372D}
      .ec-btn:active,.ec-tab:active,.ec-site:active,.ec-preset:active{transform:scale(.99)}
      .ec-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(330px,.9fr);gap:16px}
      .ec-card{background:#FFFDF6;border:2px solid #E4D7BF;border-radius:18px;padding:22px;box-shadow:0 1px 8px rgba(51,40,20,.07)}
      .ec-card h3{font-size:26px;margin-bottom:16px;line-height:1.2}
      .ec-sites{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .ec-site{display:flex;flex-direction:column;gap:8px;text-align:left;background:#fff;border:2px solid #E4D7BF;border-radius:16px;padding:18px}
      .ec-site b{font-size:23px;line-height:1.35}
      .ec-site span{font-size:18px;color:#16586A;font-weight:800}
      .ec-site small{font-size:18px;color:#52646C;line-height:1.5}
      .ec-site-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:8px}
      .ec-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
      .ec-preset{min-height:112px;border:2px solid #E4D7BF;background:#F7EDDB;border-radius:16px;padding:18px;text-align:left;cursor:pointer;transition:transform .08s ease,border-color .1s ease}
      .ec-preset:hover{border-color:#16586A}
      .ec-preset b{display:block;font-size:22px;line-height:1.35;margin-bottom:8px}
      .ec-preset span{font-size:19px;color:#52646C;line-height:1.45}
      .ec-list{display:flex;flex-direction:column;gap:12px}
      .ec-row{display:grid;grid-template-columns:120px 1fr auto;gap:16px;align-items:center;border:2px solid #E4D7BF;background:#fff;border-radius:16px;padding:18px}
      .ec-time{font-size:36px;font-weight:900;color:#16586A;font-variant-numeric:tabular-nums}
      .ec-row b{font-size:24px;line-height:1.35}
      .ec-row p{font-size:19px;color:#52646C;line-height:1.5;margin-top:6px}
      .ec-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}
      .ec-form{display:grid;grid-template-columns:1fr 150px 140px;gap:12px;align-items:end}
      .ec-field label{display:block;font-size:18px;font-weight:800;color:#52646C;margin-bottom:7px}
      .ec-field input,.ec-field select,.ec-field textarea{width:100%;height:58px;border:2px solid #D8C8AC;border-radius:14px;background:#fff;padding:0 16px;box-sizing:border-box;font-size:21px;color:#17262C}
      .ec-field textarea{height:124px;padding:14px 16px;resize:vertical;line-height:1.5}
      .ec-span{grid-column:1/-1}
      .ec-status{font-size:20px;color:#52646C;margin:10px 0 14px}
      .ec-browser{position:fixed;inset:0;background:#F2EFEA;z-index:70;display:flex;flex-direction:column}
      .ec-browser-h{min-height:68px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:2px solid #E4DFD6;background:#fff}
      .ec-browser-h b{flex:1;font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ec-browser iframe{flex:1;border:0;background:#fff}
      .ec-note{font-size:19px;color:#52646C;line-height:1.6;background:#F7EDDB;border-radius:14px;padding:16px 18px}
      @media(max-width:760px){.ec-wrap{padding:14px 14px 86px;border-radius:0}.ec-head,.ec-grid,.ec-row{grid-template-columns:1fr}.ec-title{font-size:34px}.ec-sub{font-size:20px}.ec-tab,.ec-btn{flex:1;min-width:118px}.ec-form{grid-template-columns:1fr}.ec-actions{justify-content:stretch}.ec-actions .ec-btn{flex:1 1 128px}.ec-time{font-size:34px}}
    `;
    document.head.append(st);
  }

  async function openSite(site) {
    if (isAndroid()) {
      const shell = document.createElement("div");
      shell.className = "ec-browser";
      shell.innerHTML = `<div class="ec-browser-h"><button class="ec-btn" data-back>返回</button><b>${esc(site.name)}</b><button class="ec-btn" data-out>外部打开</button></div><iframe src="${esc(site.url)}" title="${esc(site.name)}"></iframe>`;
      shell.querySelector("[data-back]").addEventListener("click", () => shell.remove());
      shell.querySelector("[data-out]").addEventListener("click", () => tide.util.openUrl(site.url));
      document.body.append(shell);
    } else {
      tide.util.openUrl(site.url);
    }
  }
  async function copySite(site, label = "链接已复制") {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(site.url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = site.url;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.append(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      tide.notify(label);
    } catch (_) {
      tide.notify(`请手动复制：${site.url}`, { ms: 9000 });
    }
  }
  async function guideSite(site) {
    await copySite(site, "链接已复制，可去浏览器打开");
    tide.notify(`建议打开 ${site.appHint}，或在浏览器粘贴链接继续办理`, { ms: 9000 });
  }
  async function guideApp(site) {
    await copySite(site, "链接已复制");
    tide.notify(`请打开手机里已有的 ${site.appHint}，搜索“${site.name}”或用浏览器粘贴链接`, { ms: 9000 });
  }
  function guideSupport(site) {
    tide.notify(`微信小程序端可点“客服协助”，把“${site.name}”入口发给客服继续引导`, { ms: 9000 });
  }

  function createTodayBlock(r) {
    const task = tide.tasks.create({ title: r.title, quad: 1, estMin: r.dur || 15, due: today(), tags: ["长辈照护", r.tag || "提醒"], note: r.message || "" });
    tide.blocks.create({ date: today(), start: r.time, durMin: r.dur || 15, title: r.title, taskId: task.id, cat: catMap[r.tag] || "life" });
    tide.notify(`已排入今天 ${r.time}：${r.title}`);
  }
  async function addReminder(data) {
    state.reminders.push({ id: uid(), title: data.title, time: data.time || "09:00", dur: data.dur || 15, repeat: data.repeat || "daily", enabled: true, tag: data.tag || "照护", message: data.message || "" });
    await saveReminders();
    paint();
  }
  async function toggleReminder(id) {
    const r = state.reminders.find((x) => x.id === id);
    if (!r) return;
    r.enabled = !r.enabled;
    await saveReminders();
    paint();
  }
  async function removeReminder(id) {
    state.reminders = state.reminders.filter((x) => x.id !== id);
    await saveReminders();
    paint();
  }

  async function connectBle() {
    if (!navigator.bluetooth) {
      tide.notify("当前环境不支持 Web Bluetooth；可在 Android Chrome/WebView 或支持的浏览器里使用");
      return;
    }
    const svc = state.ble.serviceUuid.trim();
    const chr = state.ble.characteristicUuid.trim();
    if (!svc || !chr) {
      tide.notify("先填写硬件的 Service UUID 和 Characteristic UUID");
      return;
    }
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [svc] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(svc);
    characteristic = await service.getCharacteristic(chr);
    tide.notify(`已连接蓝牙设备：${device.name || "未命名设备"}`);
    paintStatus();
  }
  async function sendBle(r) {
    if (!state.ble.enabled || !characteristic) return false;
    const payload = `${state.ble.prefix}|${r.time}|${r.title}|${r.message || ""}|${state.ble.childContact || ""}`;
    await characteristic.writeValue(new TextEncoder().encode(payload.slice(0, 180)));
    return true;
  }

  function paintSites() {
    return `<div class="ec-card"><h3>养老办事入口</h3><div class="ec-sites">${SITES.map((s) => `<div class="ec-site">
      <b>${esc(s.name)}</b>
      <span>${esc(s.tag)} · ${esc(s.url.replace(/^https?:\/\//, ""))}</span>
      <small>建议打开：${esc(s.appHint)}</small>
      <div class="ec-site-actions">
        <button class="ec-btn pri" data-guide="${s.id}">复制并引导</button>
        <button class="ec-btn" data-copy="${s.id}">复制链接</button>
        <button class="ec-btn" data-site="${s.id}">${isAndroid() ? "应用内打开" : "浏览器打开"}</button>
        <button class="ec-btn" data-app="${s.id}">已有 App</button>
        <button class="ec-btn" data-support="${s.id}">客服引导</button>
      </div>
    </div>`).join("")}</div><div class="ec-note" style="margin-top:12px">办事入口会先保留可复制链接。Windows 直接跳浏览器；Android 可应用内打开，也会提示使用手机里已有的官方 App。</div></div>`;
  }
  function paintReminders() {
    return `<div class="ec-grid">
      <div class="ec-card"><h3>常用预设</h3><div class="ec-presets">${PRESETS.map((p, i) => `<button class="ec-preset" data-preset="${i}"><b>${esc(p.time)} · ${esc(p.title)}</b><span>${esc(p.message)}</span></button>`).join("")}</div></div>
      <div class="ec-card"><h3>自定义提醒</h3>
        <div class="ec-form">
          <div class="ec-field"><label>要提醒什么</label><input data-title placeholder="如：喝水、复诊、联系子女"></div>
          <div class="ec-field"><label>时间</label><input data-time type="time" value="09:00"></div>
          <div class="ec-field"><label>重复</label><select data-repeat><option value="daily">每天</option><option value="weekdays">工作日</option><option value="once">仅今天</option></select></div>
          <div class="ec-field ec-span"><label>提醒内容</label><textarea data-message placeholder="给长辈看的提示，也会发送给已连接的蓝牙硬件"></textarea></div>
          <div class="ec-span"><button class="ec-btn pri" data-add>添加提醒</button></div>
        </div>
      </div>
      <div class="ec-card ec-span"><h3>时间提醒板块</h3><div class="ec-list">${state.reminders.length ? state.reminders.map((r) => `<div class="ec-row">
        <div class="ec-time">${esc(r.time)}</div>
        <div><b>${esc(r.title)}</b><p>${esc(repeatText[r.repeat] || r.repeat)} · ${esc(r.message || "到时间提醒")} ${r.enabled ? "" : " · 已停用"}</p></div>
        <div class="ec-actions"><button class="ec-btn" data-block="${r.id}">排到今天</button><button class="ec-btn" data-test="${r.id}">试提醒</button><button class="ec-btn" data-toggle="${r.id}">${r.enabled ? "停用" : "启用"}</button><button class="ec-btn danger" data-del="${r.id}">删除</button></div>
      </div>`).join("") : `<div class="ec-note">还没有提醒。点左侧预设，或在上方自定义一条。</div>`}</div></div>
    </div>`;
  }
  function paintHardware() {
    return `<div class="ec-card"><h3>蓝牙硬件联动</h3>
      <div class="ec-note">适合连接自制提醒器、腕带或家用中控。到点后应用会写入一条短文本；硬件收到后可以响铃、亮灯，或提示长辈给子女发送平安消息。</div>
      <div class="ec-form" style="margin-top:12px">
        <div class="ec-field"><label>子女姓名</label><input data-child value="${esc(state.ble.childName)}" placeholder="如：小张"></div>
        <div class="ec-field"><label>联系方式</label><input data-contact value="${esc(state.ble.childContact)}" placeholder="手机号或设备识别码"></div>
        <div class="ec-field"><label>启用蓝牙</label><select data-enabled><option value="false">关闭</option><option value="true"${state.ble.enabled ? " selected" : ""}>开启</option></select></div>
        <div class="ec-field ec-span"><label>Service UUID</label><input data-service value="${esc(state.ble.serviceUuid)}" placeholder="硬件提供的 BLE service UUID"></div>
        <div class="ec-field ec-span"><label>Characteristic UUID</label><input data-char value="${esc(state.ble.characteristicUuid)}" placeholder="可写入的 characteristic UUID"></div>
        <div class="ec-span"><button class="ec-btn pri" data-saveble>保存蓝牙设置</button> <button class="ec-btn" data-connect>连接蓝牙设备</button></div>
      </div>
    </div>`;
  }
  function paintStatus() {
    if (!ui) return;
    const next = state.reminders.filter((r) => r.enabled).sort((a, b) => minOf(a.time) - minOf(b.time))[0];
    ui.status.textContent = next ? `下一条提醒：${next.time} · ${next.title}${characteristic ? " · 蓝牙已连接" : ""}` : "还没有启用的提醒";
  }
  function paint() {
    if (!ui) return;
    const body = ui.body;
    body.innerHTML = state.tab === "sites" ? paintSites() : state.tab === "hardware" ? paintHardware() : paintReminders();
    paintStatus();
    wireBody(body);
  }
  function wireBody(body) {
    body.querySelectorAll("[data-site]").forEach((b) => b.addEventListener("click", () => openSite(SITES.find((s) => s.id === b.dataset.site))));
    body.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copySite(SITES.find((s) => s.id === b.dataset.copy))));
    body.querySelectorAll("[data-guide]").forEach((b) => b.addEventListener("click", () => guideSite(SITES.find((s) => s.id === b.dataset.guide))));
    body.querySelectorAll("[data-app]").forEach((b) => b.addEventListener("click", () => guideApp(SITES.find((s) => s.id === b.dataset.app))));
    body.querySelectorAll("[data-support]").forEach((b) => b.addEventListener("click", () => guideSupport(SITES.find((s) => s.id === b.dataset.support))));
    body.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => addReminder(PRESETS[Number(b.dataset.preset)])));
    body.querySelector("[data-add]")?.addEventListener("click", () => {
      const title = body.querySelector("[data-title]").value.trim();
      if (!title) { tide.notify("先写提醒名称"); return; }
      addReminder({
        title,
        time: body.querySelector("[data-time]").value || "09:00",
        repeat: body.querySelector("[data-repeat]").value,
        message: body.querySelector("[data-message]").value.trim()
      });
    });
    body.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => toggleReminder(b.dataset.toggle)));
    body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => removeReminder(b.dataset.del)));
    body.querySelectorAll("[data-block]").forEach((b) => b.addEventListener("click", () => {
      const r = state.reminders.find((x) => x.id === b.dataset.block);
      if (r) createTodayBlock(r);
    }));
    body.querySelectorAll("[data-test]").forEach((b) => b.addEventListener("click", () => {
      const r = state.reminders.find((x) => x.id === b.dataset.test);
      if (r) {
        tide.notify(`${r.title}：${r.message || "到时间了"}`, { ms: 9000 });
        sendBle(r).catch(() => tide.notify("蓝牙消息发送失败，请检查设备连接"));
      }
    }));
    body.querySelector("[data-saveble]")?.addEventListener("click", async () => {
      state.ble = {
        ...state.ble,
        enabled: body.querySelector("[data-enabled]").value === "true",
        childName: body.querySelector("[data-child]").value.trim(),
        childContact: body.querySelector("[data-contact]").value.trim(),
        serviceUuid: body.querySelector("[data-service]").value.trim(),
        characteristicUuid: body.querySelector("[data-char]").value.trim()
      };
      await saveBle();
      tide.notify("蓝牙设置已保存");
      paint();
    });
    body.querySelector("[data-connect]")?.addEventListener("click", () => connectBle().catch((e) => tide.notify(`蓝牙连接失败：${e.message || e}`)));
  }

  function render(el) {
    ensureStyle();
    el.innerHTML = `<div class="ec-wrap">
      <div class="ec-head">
        <div><div class="ec-kicker">长 辈 照 护 · 内 置 插 件</div><div class="ec-title">养老办事和日常提醒</div><div class="ec-sub">把常用养老网站、健康提醒和家人联络放在一个地方，适合给老人或照护者日常使用。</div></div>
        <div class="ec-tabs"><button class="ec-tab on" data-tab="reminders">提醒</button><button class="ec-tab" data-tab="sites">办事入口</button><button class="ec-tab" data-tab="hardware">蓝牙联动</button></div>
      </div>
      <div class="ec-status" data-status></div>
      <div data-body></div>
    </div>`;
    ui = { status: el.querySelector("[data-status]"), body: el.querySelector("[data-body]") };
    el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      el.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
      paint();
    }));
    Promise.all([
      tide.storage.get("reminders", []),
      tide.storage.get("ble", DEFAULT_BLE)
    ]).then(([reminders, ble]) => {
      state.reminders = Array.isArray(reminders) ? reminders : [];
      state.ble = { ...DEFAULT_BLE, ...(ble || {}) };
      // Reminders are dispatched by the app-wide care runtime.
      paint();
    });
  }

  tide.care.registerChannel({ id: "ble", label: "长辈照护 · 蓝牙提醒器", async send(payload) {
    if (!characteristic) throw new Error("请先在长辈照护插件连接蓝牙设备");
    const bytes = new TextEncoder().encode(JSON.stringify(payload) + "\n");
    for (let i = 0; i < bytes.length; i += 20) await characteristic.writeValue(bytes.slice(i, i + 20));
    return { accepted: true };
  } });
  tide.ui.registerView({ id: "elder-care", title: "长辈照护", icon: "护", render });
})();
