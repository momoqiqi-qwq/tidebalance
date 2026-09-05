// 番茄专注插件 —— 演示 registerView / storage / notify / events / tasks
(function () {
  const MODES = [
    { id: "focus", label: "专注 25", min: 25 },
    { id: "break", label: "短休 5", min: 5 },
    { id: "long", label: "长休 15", min: 15 },
  ];
  const R = 86, CIRC = 2 * Math.PI * R;

  let mode = MODES[0], left = 25 * 60, timer = null, currentTaskId = "";
  let box, timeText, ring, taskSel, dotsBox;

  function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function paint() {
    timeText.textContent = fmt(left);
    const done = 1 - left / (mode.min * 60);
    ring.style.strokeDashoffset = String(CIRC * (1 - done));
  }

  function stop() { clearInterval(timer); timer = null; }

  function tick() {
    left -= 1;
    if (left <= 0) {
      stop();
      left = 0; paint();
      finish();
      return;
    }
    paint();
  }

  async function finish() {
    const isFocus = mode.id === "focus";
    const n = ((await tide.storage.get("doneCount", 0)) || 0) + (isFocus ? 1 : 0);
    const mins = ((await tide.storage.get("focusMin", 0)) || 0) + (isFocus ? 25 : 0);
    await tide.storage.set("doneCount", n);
    await tide.storage.set("focusMin", mins);
    tide.notify(isFocus ? `完成 1 个番茄！今日累计 ${n} 个 / ${mins} 分钟` : "休息结束，回来继续吧 🍃");
    tide.events.emit("pomodoro:finished", { mode: mode.id, taskId: currentTaskId || null });
    renderDots();
    if (isFocus && currentTaskId) {
      const t = tide.tasks.list().find((x) => x.id === currentTaskId);
      if (t) tide.notify(`下一个番茄继续：「${t.title}」`);
    }
  }

  function renderDots() {
    tide.storage.get("doneCount", 0).then((n) => {
      dotsBox.replaceChildren();
      for (let i = 0; i < Math.min(8, n); i++) {
        const d = document.createElement("span");
        d.style.cssText = "width:11px;height:11px;border-radius:50%;display:inline-block;background:#2EC4B6;";
        dotsBox.append(d);
      }
      const lab = document.createElement("span");
      lab.style.cssText = "font-size:11px;color:#7E8B94;margin-left:8px";
      lab.textContent = `累计 ${n} 个番茄 · ${n * 25} 分钟`;
      dotsBox.append(lab);
    });
  }

  function render(el2) {
    box = el2;
    el2.innerHTML = "";

    const card = document.createElement("div");
    card.style.cssText = "max-width:520px;margin:30px auto;text-align:center;background:#fff;border:1px solid #E4DFD6;border-radius:18px;padding:34px 30px;box-shadow:0 2px 10px rgba(34,48,58,.07)";

    const title = document.createElement("div");
    title.style.cssText = "font-size:11px;letter-spacing:.3em;color:#7E8B94;margin-bottom:14px";
    title.textContent = "番 茄 专 注 · 内 置 插 件";

    // 模式切换
    const modes = document.createElement("div");
    modes.style.cssText = "display:flex;justify-content:center;gap:8px;margin-bottom:22px";
    MODES.forEach((m) => {
      const b = document.createElement("button");
      b.textContent = m.label;
      b.dataset.m = m.id;
      b.style.cssText = "font-size:12px;border-radius:16px;padding:7px 16px;border:1px solid #E4DFD6;color:#7E8B94;cursor:pointer";
      b.addEventListener("click", () => {
        stop(); mode = m; left = m.min * 60;
        modes.querySelectorAll("button").forEach((x) => {
          const on = x.dataset.m === m.id;
          x.style.background = on ? "#0F4C5C" : "#fff";
          x.style.color = on ? "#fff" : "#7E8B94";
          x.style.borderColor = on ? "#0F4C5C" : "#E4DFD6";
        });
        paint();
      });
      modes.append(b);
    });

    // 环
    const ringWrap = document.createElement("div");
    ringWrap.style.cssText = "position:relative;width:220px;height:220px;margin:0 auto 18px";
    ringWrap.innerHTML = `
      <svg width="220" height="220" viewBox="0 0 220 220" style="transform:rotate(-90deg)">
        <circle cx="110" cy="110" r="${R}" fill="none" stroke="#EFEAE1" stroke-width="9"></circle>
        <circle class="ring" cx="110" cy="110" r="${R}" fill="none" stroke="#2EC4B6" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"></circle>
      </svg>`;
    ring = ringWrap.querySelector(".ring");
    timeText = document.createElement("div");
    timeText.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:300;font-variant-numeric:tabular-nums";
    timeText.textContent = fmt(left);
    ringWrap.append(timeText);

    // 任务选择
    taskSel = document.createElement("select");
    taskSel.style.cssText = "width:100%;max-width:340px;height:36px;border:1px solid #E4DFD6;border-radius:9px;padding:0 10px;background:#fff;margin-bottom:18px";
    fillTasks();
    const selLab = document.createElement("div");
    selLab.style.cssText = "font-size:11px;color:#7E8B94;margin-bottom:6px";
    selLab.textContent = "专注哪个任务（可选）";

    // 控制
    const ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;justify-content:center;gap:10px";
    const startBtn = mkBtn("▶ 开始", "#0F4C5C", "#fff");
    startBtn.addEventListener("click", () => {
      if (timer) { stop(); startBtn.textContent = "▶ 继续"; }
      else { timer = setInterval(tick, 1000); startBtn.textContent = "⏸ 暂停"; }
    });
    const resetBtn = mkBtn("↺ 重置", "#fff", "#7E8B94", true);
    resetBtn.addEventListener("click", () => { stop(); left = mode.min * 60; paint(); startBtn.textContent = "▶ 开始"; });
    ctrl.append(startBtn, resetBtn);

    dotsBox = document.createElement("div");
    dotsBox.style.cssText = "display:flex;justify-content:center;align-items:center;gap:6px;margin-top:22px";
    renderDots();

    card.append(title, modes, ringWrap, selLab, taskSel, ctrl, dotsBox);
    el2.append(card);
    paint();
  }

  function fillTasks() {
    taskSel.innerHTML = "";
    taskSel.append(Object.assign(document.createElement("option"), { value: "", textContent: "（不关联任务）" }));
    for (const t of tide.tasks.list().filter((x) => !x.done)) {
      const o = document.createElement("option");
      o.value = t.id; o.textContent = t.title;
      taskSel.append(o);
    }
    currentTaskId = taskSel.value;
    taskSel.addEventListener("change", () => { currentTaskId = taskSel.value; });
  }

  function mkBtn(text, bg, fg, ghost) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = `min-width:110px;height:40px;border-radius:20px;font-size:13.5px;font-weight:600;cursor:pointer;background:${bg};color:${fg};border:${ghost ? "1px solid #E4DFD6" : "none"}`;
    return b;
  }

  tide.ui.registerView({ id: "pomodoro", title: "番茄专注", icon: "🍅", render });
  tide.events.on("tasks:changed", () => { if (taskSel) fillTasks(); });
})();
