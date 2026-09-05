// 时间块视图 —— 概念稿 04「潮汐」：任务池 + 24h 时间轴 + 右侧概览
import * as S from "../store.js";
import { el, popmenu, toast, pointerDrag } from "../ui.js";

const DAY_START = 7 * 60;    // 07:00
const DAY_END = 24 * 60;     // 24:00
const HOUR_PX = 62;
const PX_PER_MIN = HOUR_PX / 60;

export function renderTimeblock(container) {
  let curDate = S.getState().settings.lastDate || S.todayStr();
  container.classList.add("tb-root");
  const wrap = el("div", { class: "tb-wrap" });
  container.append(wrap);

  const persistDate = () => { S.getState().settings.lastDate = curDate; S.saveNow(); };

  /* ── 左：任务池 ── */
  const poolList = el("div", { class: "plist" });
  const poolTitle = el("div", { class: "pt" });
  const pool = el("div", { class: "pool" }, poolTitle, poolList);

  function poolCard(t) {
    const card = el("div", { class: "ptask", "data-task": t.id, title: "拖入右侧时间轴，或点击自动安排" },
      el("div", { class: "n" }, t.title),
      el("div", { class: "m" },
        el("span", { class: `cat-pill cat-${catOf(t)}` }, catLabelOf(t)),
        el("span", {}, S.durLabel(t.estMin)),
        t.due ? el("span", {}, `截止 ${t.due.slice(5)}`) : null,
      ),
    );
    card.addEventListener("pointerdown", (e) => {
      pointerDrag(e, { type: "task", task: t }, {
        ghostHTML: (() => { const g = el("div", { class: `block cat-block-${catOf(t)}`, style: "width:190px;padding:9px 13px" }, el("div", { class: "bn" }, t.title)); return g; })(),
        onMove: (ev) => showHint(ev, t.estMin),
        onDrop: (d) => { hideHint(); dropTask(d, t); },
        onClick: () => { hideHint(); autoPlace(t); },
      });
    });
    return card;
  }

  function renderPool() {
    const items = S.poolOf(curDate);
    poolTitle.textContent = `待安排 · ${items.length} 件`;
    poolList.replaceChildren(
      ...(items.length ? items.map(poolCard) : [el("div", { class: "empty" }, "全部安排完了 🎉", el("br"), "也可以在下方添加空白时间块")]),
    );
  }

  /* ── 中：时间轴 ── */
  const canvas = el("div", { class: "tl-canvas" });
  const scroll = el("div", { class: "tl-scroll" }, canvas);
  const dateLabel = el("b", {});
  const sumLabel = el("span", { class: "sum" });
  const tlHead = el("div", { class: "tl-head" },
    dateLabel,
    el("div", { class: "dnav" },
      el("button", { title: "前一天", onclick: () => { curDate = S.addDays(curDate, -1); persistDate(); renderAll(); } }, "‹"),
      el("button", { title: "回到今天", onclick: () => { curDate = S.todayStr(); persistDate(); renderAll(); } }, "◎"),
      el("button", { title: "后一天", onclick: () => { curDate = S.addDays(curDate, 1); persistDate(); renderAll(); } }, "›"),
    ),
    sumLabel,
  );
  const timeline = el("div", { class: "timeline" }, tlHead, scroll);

  const quickInput = el("input", { placeholder: "＋ 加一段空白时间，如「午休」——回车放到第一个空闲位" });
  quickInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const v = quickInput.value.trim();
    if (!v) return;
    autoPlace({ title: v, estMin: 30, id: null, __cat: "rest" });
    quickInput.value = "";
  });
  const addbar = el("div", { class: "tl-addbar" }, quickInput);
  timeline.append(addbar);

  const hint = el("div", { class: "drop-hint", style: "display:none" });
  let hintTimer = null;
  function showHint(ev, durMin) {
    const rect = canvas.getBoundingClientRect();
    if (ev.clientY < rect.top - 30 || ev.clientY > rect.bottom + 30) { hint.style.display = "none"; return; }
    const min = Math.round((ev.clientY - rect.top - 10) / PX_PER_MIN / 15) * 15 + DAY_START;
    hint.style.display = "";
    hint.style.top = `${(min - DAY_START) * PX_PER_MIN + 10}px`;
    hint.dataset.label = `${S.hhmmOf(min)} – ${S.hhmmOf(min + durMin)}`;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 2500);
  }
  function hideHint() { hint.style.display = "none"; }

  function dropTask({ y }, t) {
    const rect = canvas.getBoundingClientRect();
    if (y < rect.top - 40 || y > rect.bottom + 40) return;
    const min = Math.min(DAY_END - 15, Math.max(DAY_START, Math.round((y - rect.top - 10) / PX_PER_MIN / 15) * 15 + DAY_START));
    const dur = Math.max(15, t.estMin);
    if (t.id) {
      // 若该任务已在别处排程，先移除
      S.getState().blocks.filter((b) => b.taskId === t.id).forEach((b) => S.removeBlock(b.id));
      S.addBlock({ date: curDate, start: S.hhmmOf(min), durMin: dur, title: t.title, taskId: t.id, cat: catOf(t) });
    } else {
      S.addBlock({ date: curDate, start: S.hhmmOf(min), durMin: dur, title: t.title, taskId: null, cat: t.__cat || "rest" });
    }
  }

  function autoPlace(t) {
    const dur = Math.max(15, t.estMin);
    const busy = S.blocksOf(curDate).map((b) => [S.mmOf(b.start), S.mmOf(b.start) + b.durMin]).sort((a, b) => a[0] - b[0]);
    let cursor = DAY_START;
    for (const [s, e] of busy) {
      if (e <= cursor) continue;
      if (s - cursor >= dur) break;
      cursor = Math.max(cursor, e);
    }
    if (DAY_END - cursor < dur) { toast("这一天已经排满了"); return; }
    if (t.id) {
      S.getState().blocks.filter((b) => b.taskId === t.id).forEach((b) => S.removeBlock(b.id));
      S.addBlock({ date: curDate, start: S.hhmmOf(cursor), durMin: dur, title: t.title, taskId: t.id, cat: catOf(t) });
    } else {
      S.addBlock({ date: curDate, start: S.hhmmOf(cursor), durMin: dur, title: t.title, taskId: null, cat: t.__cat || "rest" });
    }
  }

  function blockEl(b) {
    const top = (S.mmOf(b.start) - DAY_START) * PX_PER_MIN;
    const h = Math.max(22, b.durMin * PX_PER_MIN - 3);
    const node = el("div", {
      class: `block cat-block-${b.cat}${b.durMin <= 25 ? " tiny" : ""}`,
      style: `top:${top}px;height:${h}px`,
      "data-block": b.id,
    },
      el("div", { class: "bn" }, b.title),
      h > 40 ? el("div", { class: "bm" }, `${b.start} – ${S.hhmmOf(S.mmOf(b.start) + b.durMin)} · ${catLabelOf(b)}`) : null,
    );
    node.addEventListener("pointerdown", (e) => {
      pointerDrag(e, { type: "block", block: b }, {
        ghostHTML: (() => { const g = el("div", { class: `block cat-block-${b.cat}`, style: `width:${node.offsetWidth}px;height:${Math.min(h, 44)}px;padding:9px 13px` }, el("div", { class: "bn" }, b.title)); return g; })(),
        onMove: (ev) => showHint(ev, b.durMin),
        onDrop: (d) => {
          hideHint();
          const rect = canvas.getBoundingClientRect();
          if (d.y < rect.top - 40 || d.y > rect.bottom + 40) return;
          const min = Math.min(DAY_END - b.durMin, Math.max(DAY_START, Math.round((d.y - rect.top - 10) / PX_PER_MIN / 15) * 15 + DAY_START));
          S.updateBlock(b.id, { date: curDate, start: S.hhmmOf(min) });
        },
        onClick: (ev) => { hideHint(); blockMenu(ev, b); },
      });
    });
    node.addEventListener("contextmenu", (e) => { e.preventDefault(); blockMenu(e, b); });
    return node;
  }

  function blockMenu(ev, b) {
    popmenu(ev.clientX, ev.clientY, [
      { label: "时长 +15 分钟", icon: "＋", run: () => S.updateBlock(b.id, { durMin: Math.min(480, b.durMin + 15) }) },
      { label: "时长 −15 分钟", icon: "－", run: () => S.updateBlock(b.id, { durMin: Math.max(15, b.durMin - 15) }) },
      { label: "换分类", icon: "◈", run: () => {
        const cats = ["work", "study", "sport", "life", "rest"];
        S.updateBlock(b.id, { cat: cats[(cats.indexOf(b.cat) + 1) % cats.length] });
      } },
      "-",
      ...(b.taskId ? [{ label: "移回任务池", icon: "↩", run: () => S.updateBlock(b.id, { taskId: null }) }] : []),
      { label: "删除时间块", icon: "✕", warn: true, run: () => {
        const b2 = S.removeBlock(b.id);
        toast("已删除时间块", { actionLabel: "撤销", action: () => S.addBlock(b2) });
      } },
    ]);
  }

  function renderCanvas() {
    hideHint();
    canvas.replaceChildren(hint);
    for (let m = DAY_START; m <= DAY_END; m += 60) {
      const row = el("div", { class: "hour-row" }, el("span", { class: "h" }, S.hhmmOf(m)));
      canvas.append(row);
    }
    for (const b of S.blocksOf(curDate)) canvas.append(blockEl(b));
    // 现在指示线
    if (curDate === S.todayStr()) {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      if (min >= DAY_START && min <= DAY_END) {
        canvas.append(el("div", { class: "now-line", style: `top:${(min - DAY_START) * PX_PER_MIN + 10}px` },
          el("span", { class: "t" }, `现在 ${S.hhmmOf(min)}`)));
      }
    }
    const [y, m, d] = curDate.split("-").map(Number);
    dateLabel.textContent = `${m}月${d}日 · 周${S.weekdayCN(curDate)}${curDate === S.todayStr() ? " · 今天" : ""}`;
    const total = S.blocksOf(curDate).reduce((a, b) => a + b.durMin, 0);
    sumLabel.innerHTML = `已排 <b>${S.durLabel(total)}</b> · ${S.blocksOf(curDate).length} 个时间块`;
  }

  /* ── 右：概览 ── */
  const aside = el("div", { class: "tb-aside" });
  function renderAside() {
    const blocks = S.blocksOf(curDate);
    const total = blocks.reduce((a, b) => a + b.durMin, 0);
    const awake = DAY_END - DAY_START;
    const byCat = {};
    for (const b of blocks) byCat[b.cat] = (byCat[b.cat] || 0) + b.durMin;
    const meter = el("div", { class: "meter" });
    const legend = el("div", { class: "legend" });
    const colors = { work: "var(--deep)", study: "var(--grape)", sport: "var(--coral)", life: "var(--sun)", rest: "var(--mint)" };
    const names = { work: "深度工作", study: "学习", sport: "运动", life: "生活", rest: "休息" };
    for (const [cat, min] of Object.entries(byCat)) {
      meter.append(el("i", { style: `width:${(min / Math.max(total, 1)) * 100}%;background:${colors[cat]}` }));
      legend.append(el("span", {}, el("i", { style: `background:${colors[cat]}` }), `${names[cat]} ${S.durLabel(min)}`));
    }

    // 本周节奏（当日往前 6 天的排程量）
    const rh = el("div", { class: "rhythm" });
    for (let i = -6; i <= 0; i++) {
      const d = S.addDays(curDate, i);
      const v = S.blocksOf(d).reduce((a, b) => a + b.durMin, 0);
      rh.append(el("div", { class: "r", style: i === 0 ? "background:#DCEAEF" : "" },
        el("i", { style: `height:${Math.min(100, (v / 480) * 100)}%` }),
        el("em", {}, S.weekdayCN(d))));
    }

    // 明日预告
    const nextDate = S.addDays(curDate, 1);
    const tom = S.blocksOf(nextDate).slice(0, 4);

    aside.replaceChildren(
      el("div", { class: "acard" },
        el("div", { class: "at" }, "这 天 已 排"),
        el("div", { class: "big" }, S.durLabel(total), el("small", {}, `/ ${S.durLabel(awake)} 清醒时间`)),
        meter, legend,
      ),
      el("div", { class: "acard rh-wrap" },
        el("div", { class: "at" }, "近 7 天节奏"),
        rh,
      ),
      el("div", { class: "acard tomorrow" },
        el("div", { class: "at" }, "明 天 预 告"),
        ...(tom.length ? tom.map((b) => el("div", { class: "trow" },
          el("span", { class: "td", style: `background:var(--${ { work: "deep", study: "grape", sport: "coral", life: "sun", rest: "mint" }[b.cat] || "deep" })` }),
          el("span", { class: "tt" }, `${b.start} ${b.title}`),
          el("span", { class: "du" }, S.durLabel(b.durMin)),
        )) : [el("div", { class: "trow" }, el("span", { class: "tt", style: "color:var(--ink-3)" }, "明天还是空的，去前面安排一下吧"))]),
      ),
    );
  }

  /* ── 拼装 ── */
  function renderAll() { renderPool(); renderCanvas(); renderAside(); }
  wrap.append(pool, timeline, aside);
  renderAll();
  const un = S.subscribe(renderAll);
  container._unsub = un;
}

function catOf(t) {
  if (t.__cat) return t.__cat;
  const tag = (t.tags || [])[0] || "";
  const map = { 论文: "work", 工作: "work", 学习: "study", 读书: "study", 运动: "sport", 健身: "sport", 跑步: "sport", 生活: "life", 休息: "rest" };
  return map[tag] || "work";
}
function catLabelOf(x) {
  const c = x.cat || (x.__cat ?? catOf(x));
  return { work: "工作", study: "学习", sport: "运动", life: "生活", rest: "休息" }[c] || c;
}
