import * as S from "../store.js";
import * as M from "../careModel.js";
import { getCare, careChanged, speak, listenOnce, actOnReminder, showReminder, deliverDevice, careChannels, validateDeviceUrl } from "../care.js";
import { el, toast } from "../ui.js";
import { appIcon } from "../icons.js";
import { parseWhen } from "../timeParser.js";

const REPEATS = { daily: "每天", weekdays: "工作日", once: "仅这一天" };
const PRESETS = [
  { title: "喝一杯水", time: "10:00", message: "喝点水，歇一歇。", tag: "喝水" },
  { title: "按医嘱用药", time: "08:00", message: "请核对药盒和医嘱；已经服用就不要重复服用。", tag: "用药" },
  { title: "出门散散步", time: "16:30", message: "按自己的体力安排，带好手机和钥匙。", tag: "运动" },
];
const button = (text, run, primary = false) => el("button", { class: primary ? "elder-primary" : "elder-mini", onclick: run }, text);

export function renderElder(container) {
  container.classList.add("elder-root");
  const wrap = el("div", { class: "elder-wrap care-home" });
  container.append(wrap);
  let tab = "today", stopVoice = () => {}, draft = {}, destroyed = false;
  const redraw = () => { if (!destroyed) render(); };
  const select = id => { stopVoice(); tab = id; render(); };
  const rows = el("div", { class: "care-today-list" });
  const headline = el("h2", {});
  function refreshToday() {
    const c = getCare(), items = M.todayItems(c), next = items.find(r => r.status !== "done");
    headline.textContent = next ? `接下来，${next.title}` : items.length ? "今天的安排都做好了" : "今天，按自己的节奏来";
    rows.replaceChildren(...(items.length ? items.map(r => el("article", { class: `care-item${r.status === "done" ? " completed" : ""}` },
      el("div", { class: "care-clock" }, new Date(r.dueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })),
      el("div", { class: "care-item-copy" }, el("h3", {}, r.title), el("p", {}, r.message || "一件一件来，不用着急。"), el("small", {}, r.status === "done" ? "今天已做好" : r.dueAt < Date.now() ? "还没确认，方便时再处理" : REPEATS[r.repeat])),
      el("div", { class: "care-item-actions" },
        button(r.status === "done" ? "撤销完成" : "我做好了", () => actOnReminder(r.key, r.status === "done" ? "undo" : "done"), r.status !== "done"),
        ...(r.status === "done" ? [] : [button("10 分钟后提醒", () => { actOnReminder(r.key, "snooze"); toast("好的，10 分钟后再提醒"); })]),
        button("读给我听", () => speak(`${r.title}。${r.message}`)),
      ))): [el("div", { class: "care-empty" }, appIcon("timeblock"), el("h3", {}, "先加一件熟悉的小事"), el("p", {}, "喝水、散步，或记住一次约定。"), button("添加我的提醒", () => select("add"), true))]));
  }
  function render() {
    const c = getCare();
    wrap.classList.toggle("care-extra-large", !!c.settings.large);
    wrap.replaceChildren(
      el("header", { class: "care-header" }, el("div", {}, el("div", { class: "elder-badge" }, appIcon("elder"), "安心日常"), el("p", {}, `${new Date().getMonth() + 1}月${new Date().getDate()}日 · 星期${S.weekdayCN(S.todayStr())}`)),
        button(c.settings.large ? "标准大字" : "字再大一点", () => { c.settings.large = !c.settings.large; careChanged(); render(); })),
      el("nav", { class: "care-tabs", "aria-label": "安心日常" }, ...[["today", "今天的安排"], ["add", "添加提醒"], ["family", "家人协助"]].map(([id, label]) => el("button", { class: tab === id ? "on" : "", "aria-current": tab === id ? "page" : null, onclick: () => select(id) }, label))),
    );
    if (tab === "today") {
      wrap.append(el("section", { class: "care-welcome" }, headline, el("p", {}, "不赶进度，照顾好自己就很好。"), button("听听今天的安排", () => {
        const items = M.todayItems(c).filter(r => r.status !== "done");
        speak(items.length ? items.map(r => `${r.time}，${r.title}`).join("。") : "今天没有未完成的安排，按自己的节奏来。");
      })), rows);
      refreshToday();
      if (c.settings.contactPhone) wrap.append(el("a", { class: "care-call", href: `tel:${c.settings.contactPhone}` }, `联系${c.settings.contactName || "家人"} · ${c.settings.contactPhone}`));
      const unresolved = (c.alerts || []).filter(a => !a.resolved);
      for (const alert of unresolved) wrap.append(el("section", { class: "care-alert" }, el("h3", {}, "设备报告疑似跌倒"), el("p", {}, "请联系长辈核实情况。设备事件不等于已确认跌倒，也不会自动拨打电话。"), button("已核实，关闭提示", () => { alert.resolved = true; careChanged(); render(); })));
    } else if (tab === "add") renderForm(c);
    else renderFamily(c);
    wrap.append(el("p", { class: "care-boundary" }, "应用打开时提供提醒。关闭应用或小程序后，本地提醒可能停止；全天提醒需由已配置的家庭设备或服务负责。"));
  }
  function renderForm(c) {
    const form = el("form", { class: "elder-panel care-form" });
    const name = el("input", { class: "elder-input", value: draft.title || "", placeholder: "例如：每天早上八点提醒我用药", required: "", "aria-label": "提醒名称", oninput: e => { draft.title = e.target.value; } });
    const time = el("input", { class: "elder-input", type: "time", value: draft.time || "09:00", required: "", "aria-label": "提醒时间", oninput: e => { draft.time = e.target.value; } });
    const date = el("input", { class: "elder-input", type: "date", value: draft.date || S.todayStr(), required: "", "aria-label": "提醒日期", oninput: e => { draft.date = e.target.value; } });
    const repeat = el("select", { class: "elder-input", "aria-label": "重复方式", onchange: e => { draft.repeat = e.target.value; } });
    Object.entries(REPEATS).forEach(([value, label]) => repeat.append(el("option", { value }, label))); repeat.value = draft.repeat || "daily";
    const message = el("textarea", { class: "elder-textarea", placeholder: "可补充一句话，例如：带好钥匙", "aria-label": "提醒内容", oninput: e => { draft.message = e.target.value; } }); message.value = draft.message || "";
    const voiceStatus = el("p", { role: "status" });
    const parseText = text => {
      const parsed = parseWhen(text);
      draft.title = parsed.title || text; name.value = draft.title;
      if (parsed.startMin != null) { draft.time = S.hhmmOf(parsed.startMin); time.value = draft.time; }
      if (parsed.date) { draft.date = parsed.date; date.value = draft.date; }
      draft.repeat = /工作日/.test(text) ? "weekdays" : /每天|每日/.test(text) ? "daily" : "once"; repeat.value = draft.repeat;
      voiceStatus.textContent = "请核对名称、日期和时间，确认后再保存。";
    };
    const voice = button("说出提醒", () => { stopVoice(); stopVoice = listenOnce(parseText, status => { voiceStatus.textContent = status; }); });
    voice.type = "button";
    const parse = button("识别这句话的时间", () => parseText(name.value)); parse.type = "button";
    form.append(el("h2", {}, "记住一件小事"), el("p", {}, "说出来或写下来，核对时间后保存。"),
      el("div", { class: "care-presets" }, ...PRESETS.map(p => { const b = button(p.title, () => { draft = { ...p, repeat: "daily" }; render(); }); b.type = "button"; return b; })),
      el("label", {}, "提醒什么", name), el("div", { class: "care-actions" }, voice, parse), voiceStatus,
      el("div", { class: "care-form-grid" }, el("label", {}, "几点提醒", time), el("label", {}, "重复", repeat), el("label", {}, "日期（仅一次时使用）", date)),
      el("label", {}, "补充说明", message), el("p", { class: "care-hint" }, "用药时间和内容请按医嘱填写。语音输入由设备的语音服务处理。"),
      el("button", { class: "elder-primary", type: "submit" }, draft.id ? "保存修改" : "保存提醒"));
    form.addEventListener("submit", e => {
      e.preventDefault();
      try {
        const patch = { title: name.value, time: time.value, date: date.value, repeat: repeat.value, message: message.value, tag: draft.tag };
        if (patch.repeat === "once" && patch.date < S.todayStr()) throw new Error("请选择今天或以后的日期");
        if (draft.id) {
          const old = c.reminders.find(r => r.id === draft.id); const added = M.addReminder(c, patch); c.reminders.pop();
          if (old) { Object.assign(old, added, { id: draft.id }); for (const key of Object.keys(c.records)) if (key.startsWith(`${draft.id}@`) && c.records[key].status !== "done") delete c.records[key]; }
        } else M.addReminder(c, patch);
        draft = {}; careChanged(); select("today"); toast("提醒已保存");
      } catch (error) { toast(error.message); }
    });
    wrap.append(form);
  }
  function renderFamily(c) {
    const contactName = el("input", { class: "elder-input", value: c.settings.contactName || "", placeholder: "家人的称呼", "aria-label": "家人称呼" });
    const phone = el("input", { class: "elder-input", type: "tel", value: c.settings.contactPhone || "", placeholder: "家人电话号码", "aria-label": "家人电话" });
    wrap.append(el("section", { class: "elder-panel" }, el("h2", {}, "家人协助设置"), el("p", {}, "设置好后，让长辈回到“今天的安排”安心使用。"),
      el("label", { class: "care-check" }, el("input", { type: "checkbox", ...(c.settings.voice ? { checked: "" } : {}), onchange: e => { c.settings.voice = e.target.checked; careChanged(); } }), "到点读出提醒"),
      el("div", { class: "care-form-grid" }, contactName, phone), button("保存家人联系方式", () => {
        if (phone.value && !/^\+?[\d\s-]{5,20}$/.test(phone.value)) { toast("请填写正确的电话号码"); return; }
        c.settings.contactName = contactName.value.trim(); c.settings.contactPhone = phone.value.trim(); careChanged(); toast("已保存，长辈可以点号码联系家人");
      })),
      el("section", { class: "elder-panel" }, el("h2", {}, "管理提醒"), ...(c.reminders.length ? c.reminders.map(r => el("div", { class: "care-manage-row" },
        el("div", {}, el("b", {}, `${r.time} ${r.title}`), el("p", {}, `${REPEATS[r.repeat]}${r.repeat === "once" ? ` · ${r.date}` : ""} · ${r.enabled ? "已开启" : "已暂停"}`)),
        el("div", { class: "care-actions" }, button("修改", () => { draft = { ...r }; select("add"); }), button("试听", () => showReminder(r, true)), button(r.enabled ? "暂停" : "开启", () => { r.enabled = !r.enabled; careChanged(); render(); }), button("删除", () => {
          const index = c.reminders.indexOf(r); c.reminders.splice(index, 1); careChanged(); render();
          toast("提醒已删除", { actionLabel: "撤销", action: () => { c.reminders.splice(index, 0, r); careChanged(); redraw(); } });
        })))) : [el("p", {}, "还没有提醒，可以先添加一条。")])));
    renderDevices(c);
    wrap.append(el("section", { class: "elder-panel" }, el("h2", {}, "最近完成记录"), ...Object.entries(c.records).filter(([, r]) => r.status === "done").sort((a,b) => b[1].completedAt - a[1].completedAt).slice(0, 15).map(([key, rec]) => el("p", {}, `${rec.day} · ${c.reminders.find(r => key.startsWith(`${r.id}@`))?.title || "已删除的提醒"} · 已做好`)),
      button("查看社区扩展", () => window.dispatchEvent(new CustomEvent("tide:navigate", { detail: "market" })))));
  }
  function renderDevices(c) {
    const section = el("section", { class: "elder-panel" }, el("h2", {}, "让提醒到达音箱和药盒"), el("p", {}, "连接家庭网关，或选择社区插件提供的提醒设备。填写后可先测试，再开启到点发送。"));
    for (const device of c.devices) section.append(el("div", { class: "care-manage-row" }, el("div", {}, el("b", {}, device.name), el("p", { class: "device-status", "data-device-status": device.id }, device.lastStatus || "尚未测试")),
      el("div", { class: "care-actions" }, button("测试设备", async () => { await deliverDevice(device, { title: "Le时间管理连接测试", message: "这是一条测试提醒。", time: "00:00", key: `test-${Date.now()}` }); }),
      button(device.enabled ? "关闭到点发送" : "开启到点发送", () => { device.enabled = !device.enabled; careChanged(); render(); }),
      button("移除", () => { c.devices = c.devices.filter(d => d.id !== device.id); careChanged(); render(); } ))));
    const name = el("input", { class: "elder-input", placeholder: "设备名称，例如：客厅音箱", required: "", "aria-label": "设备名称" });
    const channel = el("select", { class: "elder-input", "aria-label": "提醒通道" }, el("option", { value: "webhook" }, "家庭网关（HTTP）"), ...careChannels().map(ch => el("option", { value: ch.id }, ch.label)));
    const url = el("input", { class: "elder-input", type: "url", placeholder: "网关提供的接收地址", "aria-label": "网关地址" });
    const token = el("input", { class: "elder-input", type: "password", placeholder: "访问令牌（可选）", "aria-label": "网关令牌", autocomplete: "off" });
    const form = el("form", { class: "care-form", onsubmit: e => {
      e.preventDefault();
      try {
        if (!name.value.trim()) throw new Error("请填写设备名称");
        const address = channel.value === "webhook" ? validateDeviceUrl(url.value) : "";
        c.devices.push({ id: S.uid("device"), name: name.value.trim(), channel: channel.value, url: address, token: token.value.trim(), enabled: false });
        careChanged(); render(); toast("设备已保存，测试成功后可开启到点发送");
      } catch (error) { toast(error.message); }
    } }, name, channel, url, token, el("p", { class: "care-hint" }, "开启后，提醒标题与内容会发送到你配置的设备地址。这里显示的是网关接收结果，长辈仍需自行确认完成。"), el("button", { class: "elder-primary", type: "submit" }, "保存设备"));
    section.append(form); wrap.append(section);
  }
  const changed = () => {
    if (tab === "today") refreshToday();
    for (const d of getCare().devices) {
      const node = [...wrap.querySelectorAll("[data-device-status]")].find(n => n.dataset.deviceStatus === d.id);
      if (node) node.textContent = d.lastStatus || "尚未测试";
    }
  };
  window.addEventListener("care:changed", changed);
  const channelChanged = () => { if (tab === "family") render(); };
  window.addEventListener("care:channels", channelChanged);
  render();
  container._unsub = () => { destroyed = true; stopVoice(); window.removeEventListener("care:changed", changed); window.removeEventListener("care:channels", channelChanged); };
}
