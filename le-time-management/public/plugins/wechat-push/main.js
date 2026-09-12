// 微信提醒推送 —— 时间块开始前 N 分钟，经 Server酱 推送到微信
(function () {
  const SCT = (key, title, desp) =>
    `https://sctapi.ftqq.com/${encodeURIComponent(key)}.send?title=${encodeURIComponent(title)}&desp=${encodeURIComponent(desp)}`;

  const state = { enabled: false, key: "", lead: 5, timer: null, pushed: [], log: [], ui: null };

  async function loadPrefs() {
    state.enabled = !!(await tide.storage.get("enabled", false));
    state.key = (await tide.storage.get("key", "")) || "";
    state.lead = (await tide.storage.get("lead", 5)) || 5;
    state.pushed = (await tide.storage.get("pushed", [])) || [];
    state.log = (await tide.storage.get("log", [])) || [];
  }
  const save = () => Promise.all([
    tide.storage.set("enabled", state.enabled),
    tide.storage.set("key", state.key),
    tide.storage.set("lead", state.lead),
    tide.storage.set("pushed", state.pushed),
    tide.storage.set("log", state.log),
  ]);

  function startTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(tick, 60 * 1000);
  }

  async function tick() {
    if (!state.enabled || !state.key) return;
    const d = tide.util.today();
    state.pushed = state.pushed.filter((k) => k.startsWith(d)); // 只保留今天
    const blocks = await tide.blocks.list(d);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const b of blocks) {
      const [h, m] = b.start.split(":").map(Number);
      const delta = h * 60 + m - nowMin;
      const key = d + "|" + b.id;
      if (delta >= 0 && delta <= state.lead && !state.pushed.includes(key)) {
        state.pushed.push(key);
        await push(`⏰ ${b.start} ${b.title}`, `${b.start} – ${tide.util.hhmmOf(tide.util.mmOf(b.start) + b.durMin)} · ${b.durMin} 分钟\n\n来自Le时间管理·时间块提醒`);
      }
    }
    save();
  }

  async function push(title, desp) {
    if (!state.key) { tide.notify("请先在设置里填写 Server酱 SendKey"); return false; }
    try {
      const res = await tide.http.get(SCT(state.key, title, desp));
      let ok = false;
      try { ok = JSON.parse(res.body).code === 0; } catch {}
      const line = `${new Date().toTimeString().slice(0, 5)} ${ok ? "✓ 已推送" : "✗ 推送失败(HTTP " + res.status + ")"}：${title.slice(0, 24)}`;
      state.log.unshift(line);
      state.log = state.log.slice(0, 8);
      if (!ok) tide.notify("Server酱推送失败，请检查 SendKey");
      save();
      paintLog();
      return ok;
    } catch (e) {
      tide.notify(`推送出错：${e.message || e}`);
      return false;
    }
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  function ensureStyle() {
    if (document.getElementById("wp-push-style")) return;
    const st = document.createElement("style");
    st.id = "wp-push-style";
    st.textContent = `
      .wp-wrap{max-width:560px;margin:0 auto}
      .wp-btn{font-size:12px;border:1px solid #E4DFD6;border-radius:8px;padding:7px 13px;background:#fff;cursor:pointer;color:#22303A}
      .wp-btn:hover{border-color:#0F4C5C;color:#0F4C5C}
      .wp-toggle{font-size:12px;color:#7E8B94;cursor:pointer;display:flex;gap:6px;align-items:center;user-select:none}
      .wp-toggle i{width:34px;height:19px;border-radius:10px;background:#D8D2C6;display:inline-block;position:relative;transition:.15s}
      .wp-toggle i::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s}
      .wp-toggle.on i{background:#2EC4B6}
      .wp-toggle.on i::after{left:17px}
    `;
    document.head.append(st);
  }

  let ui = null;
  function render(el) {
    ensureStyle();
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "wp-wrap";
    wrap.style.maxWidth = "560px";
    wrap.innerHTML = `
      <div style="font-size:11px;letter-spacing:.3em;color:#7E8B94;margin:14px 0 12px">微 信 提 醒 推 送 · 内 置 插 件</div>
      <div style="background:#fff;border:1px solid #E4DFD6;border-radius:16px;padding:20px 22px">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">Server酱 推送通道</div>
        <div style="font-size:11.5px;color:#7E8B94;line-height:1.8">1. 用微信扫码登录 <b>sct.ftqq.com</b>，复制你的 SendKey<br>2. 在该网站关注「方糖」服务号（消息发到微信）<br>3. 粘贴 SendKey 到下面，开启开关。时间块开始前会自动推送</div>
        <div style="margin-top:12px">
          <div style="font-size:11px;color:#7E8B94;margin-bottom:4px">SendKey</div>
          <input data-key type="text" placeholder="SCT…" style="width:100%;height:36px;border:1px solid #E4DFD6;border-radius:9px;padding:0 11px;background:#fff">
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:12px">
          <label class="wp-toggle" data-en>开启推送<i></i></label>
          <span style="flex:1"></span>
          <span style="font-size:12px;color:#7E8B94">提前</span>
          <select data-lead style="height:32px;border:1px solid #E4DFD6;border-radius:8px;background:#fff;padding:0 8px">
            <option value="3">3 分钟</option><option value="5">5 分钟</option><option value="10">10 分钟</option><option value="15">15 分钟</option>
          </select>
          <button class="wp-btn" data-test>发测试消息</button>
        </div>
        <div data-log style="margin-top:14px;border-top:1px dashed #EFEAE1;padding-top:8px"></div>
      </div>`;
    el.append(wrap);
    ui = { log: wrap.querySelector("[data-log]"), key: wrap.querySelector("[data-key]"), en: wrap.querySelector("[data-en]"), lead: wrap.querySelector("[data-lead]") };

    loadPrefs().then(() => {
      ui.key.value = state.key;
      ui.lead.value = String(state.lead);
      paintEn();
      paintLog();
      if (state.enabled) startTimer();
    });

    function paintEn() {
      const on = state.enabled && !!state.key;
      ui.en.classList.toggle("on", on);
    }
    ui.en.addEventListener("click", async () => {
      state.key = ui.key.value.trim();
      state.enabled = !state.enabled;
      if (state.enabled && !state.key) { state.enabled = false; tide.notify("请先填写 SendKey"); return; }
      await save();
      paintEn();
      if (state.enabled) { startTimer(); tick(); tide.notify("微信推送已开启"); }
      else { if (state.timer) clearInterval(state.timer); tide.notify("微信推送已关闭"); }
    });
    ui.lead.addEventListener("change", async () => { state.lead = Number(ui.lead.value); await save(); });
    wrap.querySelector("[data-test]").addEventListener("click", async () => {
      state.key = ui.key.value.trim();
      await save();
      await push("Le时间管理测试推送", "如果你在微信里看到这条消息，说明推送通道正常 ✓");
    });
  }

  function paintLog() {
    if (!ui || !ui.log) return;
    ui.log.innerHTML = state.log.length
      ? state.log.map((l) => `<div style="font-size:11px;color:#7E8B94;padding:3px 0">${esc(l)}</div>`).join("")
      : `<div style="font-size:11px;color:#A9B2BA">还没有推送记录</div>`;
  }

  tide.ui.registerView({ id: "wechat-push", title: "微信推送", icon: "微", render });
  startTimer(); // 插件加载即跑，界面只是配置入口
  loadPrefs().then(() => { if (state.enabled && state.key) tick(); });
})();
