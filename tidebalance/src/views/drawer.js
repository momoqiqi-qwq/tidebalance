// 任务详情抽屉（四象限右滑出）
import * as S from "../store.js";
import { el, QUADS, toast } from "../ui.js";
import { taskActions } from "../pluginHost.js";

export function openTaskDrawer(taskId) {
  document.querySelector(".drawer")?.remove();
  document.querySelector(".drawer-mask")?.remove();

  const t = S.taskById(taskId);
  if (!t) return;

  const mask = el("div", { class: "drawer-mask", onclick: close });
  const body = el("div", { class: "dbody" });

  const title = el("h3", {}, t.title);
  const quadBtns = QUADS.map((qd) => el("button", {
    class: t.quad === qd.q ? "on" : "", "data-q": qd.q,
    onclick: () => { S.updateTask(t.id, { quad: qd.q }); refresh(); },
  }, ["I", "II", "III", "IV"][qd.q - 1]));

  const estSel = el("select", {});
  for (const m of [15, 30, 45, 60, 90, 120, 180]) estSel.append(el("option", { value: m }, S.durLabel(m)));
  estSel.value = String(t.estMin);
  estSel.addEventListener("change", () => { S.updateTask(t.id, { estMin: Number(estSel.value) }); refresh(); });

  const dueInput = el("input", { type: "date", value: t.due || "" });
  dueInput.addEventListener("change", () => { S.updateTask(t.id, { due: dueInput.value || null }); refresh(); });

  const projInput = el("input", { type: "text", value: t.project || "", placeholder: "无" });
  projInput.addEventListener("change", () => { S.updateTask(t.id, { project: projInput.value.trim() }); refresh(); });

  const noteInput = el("textarea", { placeholder: "补充说明…" });
  noteInput.value = t.note || "";
  noteInput.addEventListener("change", () => { S.updateTask(t.id, { note: noteInput.value }); refresh(); });

  const plugBox = el("div", { class: "plug-actions" });
  const renderPlugActions = () => {
    plugBox.replaceChildren();
    if (!taskActions.length) return;
    plugBox.append(el("div", { class: "lab" }, "插 件 动 作"));
    for (const a of taskActions) {
      plugBox.append(el("button", {
        class: "btn ghost sm",
        onclick: () => { try { a.run(JSON.parse(JSON.stringify(S.taskById(t.id)))); } catch (e) { toast(`插件动作出错：${e.message}`); } },
      }, a.icon ? `${a.icon} ` : "", a.label));
    }
  };

  const attBox = el("div", {});
  const renderAtts = () => {
    attBox.replaceChildren();
    const atts = (S.taskById(t.id)?.attachments) || [];
    if (!atts.length) return;
    attBox.append(el("div", { class: "lab" }, "图 片 附 件"), el("div", { class: "att-imgs" },
      ...atts.map((u) => el("img", { src: u, onclick: () => window.open(u, "_blank") }))));
  };

  body.append(
    el("div", { class: "kv" }, el("span", {}, "所属象限"), el("span", { class: "quadpick" }, ...quadBtns)),
    el("div", { class: "kv" }, el("span", {}, "预估耗时"), estSel),
    el("div", { class: "kv" }, el("span", {}, "截止日期"), dueInput),
    el("div", { class: "kv" }, el("span", {}, "所属项目"), projInput),
    el("div", { class: "kv", style: "align-items:flex-start" }, el("span", { style: "padding-top:8px" }, "备注"), noteInput),
    attBox,
    el("div", { class: "lab" }, "快 捷 操 作"),
    plugBox,
  );

  const foot = el("div", { class: "dfoot" },
    el("button", { class: "btn pri", onclick: () => { scheduleToToday(t); } }, "🕐 排入今天时间块"),
    el("button", {
      class: "btn ghost",
      onclick: () => { S.toggleTask(t.id); refresh(); },
    }, t.done ? "↩ 标记未完成" : "✓ 标记完成"),
    el("button", {
      class: "btn danger",
      onclick: () => {
        const t2 = S.removeTask(t.id);
        close();
        toast(`已删除「${t2.title}」`, { actionLabel: "撤销", action: () => S.addTask(t2) });
      },
    }, "删除"),
  );

  const drawer = el("div", { class: "drawer" },
    el("div", { class: "dh" }, title, el("button", { class: "btn ghost sm", onclick: close }, "✕ 关闭")),
    body, foot,
  );
  document.body.append(mask, drawer);
  renderPlugActions();
  renderAtts();

  function refresh() {
    const cur = S.taskById(t.id);
    if (!cur) return close();
    title.textContent = cur.title;
    quadBtns.forEach((b) => b.classList.toggle("on", Number(b.dataset.q) === cur.quad));
    estSel.value = String(cur.estMin);
    dueInput.value = cur.due || "";
    noteInput.value = cur.note || "";
    renderPlugActions();
  }
  function close() { mask.remove(); drawer.remove(); }
}

// 找今天第一个放得下的空闲时段
export function scheduleToToday(t) {
  const date = S.todayStr();
  const busy = S.blocksOf(date).map((b) => [S.mmOf(b.start), S.mmOf(b.start) + b.durMin]).sort((a, b) => a[0] - b[0]);
  const DAY_START = 7 * 60, DAY_END = 24 * 60, dur = Math.max(15, t.estMin);
  // 已有该任务的排程就先移除，避免重复
  S.getState().blocks.filter((b) => b.taskId === t.id).forEach((b) => S.removeBlock(b.id));
  let cursor = DAY_START;
  for (const [s, e] of busy) {
    if (e <= cursor) continue;
    if (s - cursor >= dur) break;
    cursor = Math.max(cursor, e);
  }
  if (DAY_END - cursor < dur) { toast("今天排不下了，试试清理时间块或改天"); return; }
  S.addBlock({ date, start: S.hhmmOf(cursor), durMin: dur, title: t.title, taskId: t.id, cat: "work" });
  toast(`已排入今天 ${S.hhmmOf(cursor)} · ${S.durLabel(dur)}`);
}
