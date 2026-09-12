// 任务详情抽屉（四象限右滑出）
import * as S from "../store.js";
import { el, QUADS, toast } from "../ui.js";
import { taskActions } from "../pluginHost.js";

export function openTaskDrawer(taskId) {
  document.querySelector(".drawer")?._close?.();
  document.querySelector(".drawer-mask")?.remove();

  const t = S.taskById(taskId);
  if (!t) return;

  const mask = el("div", { class: "drawer-mask", onclick: close });
  const body = el("div", { class: "dbody" });

  const title = el("h3", {}, t.title);
  const titleInput = el("input", { value: t.title, "aria-label": "任务名称" });
  titleInput.addEventListener("change", () => {
    const value = titleInput.value.trim();
    if (!value) { titleInput.value = t.title; toast("任务名称不能为空"); return; }
    S.updateTask(t.id, { title: value }); refresh();
  });
  const tagsInput = el("input", { value: (t.tags || []).join("，"), placeholder: "用逗号分隔" });
  tagsInput.addEventListener("change", () => S.updateTask(t.id, { tags: [...new Set(tagsInput.value.split(/[,，]/).map(x => x.trim()).filter(Boolean))] }));
  const quadBtns = QUADS.map((qd) => el("button", {
    class: t.quad === qd.q ? "on" : "", "data-q": qd.q,
    onclick: () => { S.updateTask(t.id, { quad: qd.q }); refresh(); },
  }, ["I", "II", "III", "IV"][qd.q - 1]));

  const estSel = el("select", {});
  for (const m of [15, 30, 45, 60, 90, 120, 180]) estSel.append(el("option", { value: m }, S.durLabel(m)));
  if (![15, 30, 45, 60, 90, 120, 180].includes(t.estMin)) estSel.append(el("option", { value: t.estMin }, S.durLabel(t.estMin)));
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
    el("div", { class: "kv" }, el("span", {}, "任务名称"), titleInput),
    el("div", { class: "kv" }, el("span", {}, "标签"), tagsInput),
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
    el("button", { class: "btn pri", onclick: () => { scheduleToToday(t); } }, "排入今天时间块"),
    el("button", {
      class: "btn ghost",
      onclick: () => { S.toggleTask(t.id); refresh(); },
    }, t.done ? "↩ 标记未完成" : "✓ 标记完成"),
    el("button", {
      class: "btn danger",
      onclick: () => {
        const undo = S.deleteTaskUndoable(t.id);
        close();
        toast(`已删除「${t.title}」`, { actionLabel: "撤销", action: undo });
      },
    }, "删除"),
  );

  const drawer = el("div", { class: "drawer" },
    el("div", { class: "dh" }, title, el("button", { class: "btn ghost sm", onclick: close }, "✕ 关闭")),
    body, foot,
  );
  drawer._close = close;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  document.body.append(mask, drawer);
  renderPlugActions();
  renderAtts();

  function refresh() {
    const cur = S.taskById(t.id);
    if (!cur) return close();
    title.textContent = cur.title;
    foot.children[1].textContent = cur.done ? "↩ 标记未完成" : "✓ 标记完成";
    quadBtns.forEach((b) => b.classList.toggle("on", Number(b.dataset.q) === cur.quad));
    estSel.value = String(cur.estMin);
    dueInput.value = cur.due || "";
    noteInput.value = cur.note || "";
    renderPlugActions();
  }
  function close() { document.removeEventListener("keydown", onKey); mask.remove(); drawer.remove(); }
}

// 找今天第一个放得下的空闲时段；失败时保留已有安排。
export function scheduleToToday(t) {
  try {
    const b = S.placeTask(t, S.todayStr());
    toast(`已排入今天 ${b.start} · ${S.durLabel(b.durMin)}`);
  } catch (e) { toast(e.message); }
}
