// Shared reminder rules. Generated CommonJS counterpart lives in miniprogram/core/careModel.js.
export function dayOf(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function careState(state) {
  state.plugins ||= {};
  const c = state.plugins.elderCare ||= {};
  c.reminders = Array.isArray(c.reminders) ? c.reminders : [];
  c.records ||= {};
  c.settings ||= { voice: true, large: true, contactName: "", contactPhone: "" };
  c.devices = Array.isArray(c.devices) ? c.devices : [];
  // Import the legacy care plugin once without deleting its original storage.
  if (!c.migratedPlugin) {
    const old = state.plugins["elder-care"]?.storage?.reminders;
    for (const r of Array.isArray(old) ? old : []) {
      if (!c.reminders.some(x => x.id === r.id || (x.title === r.title && x.time === r.time && x.repeat === r.repeat))) c.reminders.push({ ...r });
    }
    c.migratedPlugin = true;
  }
  for (const r of c.reminders) r.date ||= dayOf();
  return c;
}
export function addReminder(c, patch, now = new Date()) {
  const title = String(patch.title || "").trim();
  if (!title) throw new Error("请先写提醒名称");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.time || "")) throw new Error("请选择有效时间");
  const r = { id: `care_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, title,
    time: patch.time, repeat: ["daily", "once", "weekdays"].includes(patch.repeat) ? patch.repeat : "daily",
    date: patch.date || dayOf(now), enabled: true, dur: Number(patch.dur) || 15,
    message: String(patch.message || ""), tag: patch.tag || "日常" };
  c.reminders.push(r);
  return r;
}
export function occurs(r, now = new Date()) {
  if (!r.enabled) return false;
  if (r.repeat === "once") return r.date === dayOf(now);
  if (r.repeat === "weekdays") return ![0, 6].includes(now.getDay());
  return true;
}
export function todayItems(c, now = new Date()) {
  const day = dayOf(now);
  const list = c.reminders.filter(r => occurs(r, now)).map(r => {
    const key = `${r.id}@${day}`;
    const rec = c.records[key] || {};
    const [h, m] = r.time.split(":").map(Number);
    const date = new Date(now); date.setHours(h, m, 0, 0);
    return { ...r, key, dueAt: rec.snoozeUntil || date.getTime(), status: rec.status || "pending", deliveredAt: rec.deliveredAt || 0 };
  });
  // A snooze crossing midnight still belongs to its original occurrence.
  for (const [key, rec] of Object.entries(c.records)) {
    if (!rec.snoozeUntil || key.endsWith(`@${day}`) || rec.status === "done" || dayOf(new Date(rec.snoozeUntil)) !== day) continue;
    const r = c.reminders.find(x => key === `${x.id}@${rec.day}` && x.enabled);
    if (r) list.push({ ...r, key, dueAt: rec.snoozeUntil, status: rec.status || "pending", deliveredAt: rec.deliveredAt || 0 });
  }
  return list.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.dueAt - b.dueAt);
}
export function recordAction(c, key, action, now = Date.now()) {
  const day = key.slice(key.lastIndexOf("@") + 1);
  const r = c.records[key] ||= { day };
  if (action === "done") { r.status = "done"; r.completedAt = now; delete r.snoozeUntil; }
  else if (action === "undo") { r.status = "pending"; delete r.completedAt; }
  else if (action === "snooze") { r.status = "pending"; r.snoozeUntil = now + 10 * 60000; r.deliveredAt = 0; }
  else if (action === "delivered") r.deliveredAt = now;
  return r;
}
export function dueItems(c, now = new Date()) {
  return todayItems(c, now).filter(r => r.status !== "done" && r.dueAt <= now.getTime() && !r.deliveredAt);
}
export function reminderPayload(r, deviceId, now = Date.now()) {
  return { version: 1, event: "care.reminder", eventId: r.key, deviceId, title: r.title, message: r.message || "到时间了，请按自己的节奏安排。", time: r.time, sentAt: now };
}
