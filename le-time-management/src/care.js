import * as S from "./store.js";
import * as M from "./careModel.js";
import { api } from "./api.js";
import { el, toast } from "./ui.js";

const channels = new Map();
let activeNotice = null;
const nativeVoice = () => api.isTauri && /Android/i.test(navigator.userAgent);
const invokeVoice = (action, text) => window.__TAURI_INTERNALS__.invoke("care_voice", { action, text: text || null });
export const getCare = () => M.careState(S.getState());
export function careChanged() {
  S.saveNow().catch(() => toast("提醒暂未保存成功，请检查设备存储"));
  window.dispatchEvent(new CustomEvent("care:changed"));
}
export function speak(text) {
  if (nativeVoice()) { invokeVoice("speak", text).catch(e => toast(String(e))); return true; }
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { toast("此设备暂不支持朗读，可在家人协助中连接音箱"); return false; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN"; utterance.rate = 0.85;
  utterance.onerror = () => toast("朗读未能播放，请检查声音设置");
  window.speechSynthesis.speak(utterance);
  return true;
}
export function listenOnce(onText, onStatus) {
  if (nativeVoice()) {
    let canceled = false; onStatus("请在系统语音窗口说出提醒");
    invokeVoice("listen").then(result => { if (!canceled && result.text) onText(result.text); }).catch(e => { if (!canceled) toast(String(e)); }).finally(() => onStatus(""));
    return () => { canceled = true; };
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { toast("此设备不支持应用内听写，请用输入法的麦克风输入"); return () => {}; }
  const recognition = new Recognition();
  recognition.lang = "zh-CN"; recognition.interimResults = false; recognition.maxAlternatives = 1;
  recognition.onresult = e => onText(e.results[0][0].transcript);
  recognition.onstart = () => onStatus("正在听，请说提醒内容…");
  recognition.onend = () => onStatus("");
  recognition.onerror = e => { onStatus(""); toast(e.error === "not-allowed" ? "未获得麦克风权限，可以直接输入" : "没有听清，可以再试一次或直接输入"); };
  try { recognition.start(); } catch { toast("暂时无法启动语音输入"); }
  return () => recognition.abort();
}
export function registerCareChannel(pluginId, def) {
  if (!def || typeof def.send !== "function" || !def.id || !def.label) throw new Error("提醒通道需要 id、label 和 send");
  const id = `${pluginId}:${def.id}`;
  channels.set(id, { ...def, id, pluginId });
  window.dispatchEvent(new CustomEvent("care:channels"));
  return id;
}
export function removeCareChannels(pluginId) {
  for (const [id, c] of channels) if (c.pluginId === pluginId) channels.delete(id);
  window.dispatchEvent(new CustomEvent("care:channels"));
}
export function careChannels() { return [...channels.values()].map(({ id, label }) => ({ id, label })); }
export function validateDeviceUrl(raw) {
  const url = new URL(raw);
  const local = url.hostname === "localhost" || /^127\./.test(url.hostname) || /^192\.168\./.test(url.hostname) || /^10\./.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) throw new Error("设备地址请使用 HTTPS，家庭局域网可使用 HTTP");
  return url.href;
}
async function withTimeout(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("连接超时，请检查设备")), 8000); })]); }
  finally { clearTimeout(timer); }
}
export async function deliverDevice(device, item) {
  const payload = M.reminderPayload(item, device.id);
  device.lastStatus = "正在发送";
  window.dispatchEvent(new CustomEvent("care:changed"));
  try {
    if (device.channel === "webhook") {
      const url = validateDeviceUrl(device.url);
      const result = await withTimeout(api.httpFetch(await api.httpSessionNew(), "POST", url, { headers: { "Content-Type": "application/json", ...(device.token ? { Authorization: `Bearer ${device.token}` } : {}) }, body: JSON.stringify(payload) }));
      if (result.status < 200 || result.status >= 300) throw new Error(`设备返回 HTTP ${result.status}`);
      device.lastStatus = "网关已接收（不等于长辈已听到）";
    } else {
      const channel = channels.get(device.channel);
      if (!channel) throw new Error("对应插件未启用，请在扩展中检查");
      const result = await withTimeout(Promise.resolve().then(() => channel.send(payload)));
      if (!result || result.accepted !== true) throw new Error("设备未确认接收");
      device.lastStatus = "通道已接收（不等于长辈已听到）";
    }
    device.lastAt = Date.now(); careChanged(); return true;
  } catch (e) { device.lastStatus = `发送失败：${e.message}`; device.lastAt = Date.now(); careChanged(); return false; }
}
export function receiveCareEvent(pluginId, event) {
  if (!event || event.type !== "fall" || !event.id || !event.deviceId) throw new Error("设备事件需要 type=fall、id、deviceId");
  const c = getCare();
  if (!c.devices.some(d => d.enabled && d.channel.startsWith(`${pluginId}:`) && d.id === event.deviceId)) throw new Error("该设备未启用");
  c.alerts ||= [];
  if (c.alerts.some(a => a.id === event.id && a.pluginId === pluginId)) return;
  c.alerts.unshift({ id: event.id, deviceId: event.deviceId, pluginId, type: "fall", at: Date.now(), resolved: false });
  c.alerts = c.alerts.slice(0, 100);
  careChanged();
  toast("设备报告疑似跌倒，请核实长辈情况", { ms: 15000, actionLabel: "查看", action: () => window.dispatchEvent(new CustomEvent("tide:navigate", { detail: "elder" })) });
}
export function actOnReminder(key, action) {
  M.recordAction(getCare(), key, action); careChanged();
  if (activeNotice?.key === key) activeNotice.close();
}
export function showReminder(item, test = false) {
  if (activeNotice) return;
  const close = () => { panel.remove(); activeNotice = null; window.speechSynthesis?.cancel(); if (nativeVoice()) invokeVoice("stop").catch(() => {}); };
  const panel = el("section", { class: "care-notice", role: "dialog", "aria-modal": "true", "aria-label": "日常提醒" },
    el("small", {}, test ? "提醒试听" : "到时间了"),
    el("h2", {}, item.title), el("p", {}, item.message || "按自己的节奏，一件一件来。"),
    ...(test ? [el("button", { class: "elder-primary", onclick: close }, "关闭试听")] : [
      el("button", { class: "elder-primary", onclick: () => actOnReminder(item.key, "done") }, "我做好了"),
      el("button", { class: "elder-mini", onclick: () => actOnReminder(item.key, "snooze") }, "10 分钟后提醒"),
      el("button", { class: "elder-mini", onclick: close }, "先看看安排"),
    ]));
  document.body.append(panel); activeNotice = { key: item.key, close };
  panel.querySelector("button").focus();
  if (getCare().settings.voice) speak(`${item.title}。${item.message || "按自己的节奏，一件一件来。"}`);
}
export function initCare() {
  getCare(); careChanged();
  let busy = false;
  const tick = () => {
    if (busy || activeNotice || document.hidden) return;
    const item = M.dueItems(getCare())[0];
    if (!item) return;
    busy = true;
    M.recordAction(getCare(), item.key, "delivered"); careChanged();
    showReminder(item);
    Promise.allSettled(getCare().devices.filter(d => d.enabled).map(d => deliverDevice(d, item))).finally(() => { busy = false; });
  };
  const timer = setInterval(tick, 15000);
  document.addEventListener("visibilitychange", tick);
  return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); activeNotice?.close(); };
}
