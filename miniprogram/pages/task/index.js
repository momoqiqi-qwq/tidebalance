// 任务详情页（桌面端的任务抽屉）
const store = require("../../core/store.js");

const EST = [15, 30, 45, 60, 90, 120, 180];
const DAY_START = 7 * 60;
const DAY_END = 24 * 60;

Page({
  data: {
    t: null,
    quads: [
      { q: 1, rn: "I" }, { q: 2, rn: "II" }, { q: 3, rn: "III" }, { q: 4, rn: "IV" },
    ],
    estLabels: EST.map((m) => store.durLabel(m)),
    estIndex: 1,
    due: "",
    attachments: [],
    sched: [],
  },

  onLoad(options) {
    this.id = options.id;
    this.refresh();
  },
  onShow() { this.refresh(); },

  refresh() {
    const t = store.taskById(this.id);
    if (!t) { wx.navigateBack(); return; }
    this.setData({
      t: {
        id: t.id,
        title: t.title,
        quad: t.quad,
        done: t.done,
        project: t.project || "",
        note: t.note || "",
      },
      estIndex: Math.max(0, EST.indexOf(t.estMin || 30)),
      due: t.due || "",
      attachments: t.attachments || [],
      sched: store.getState().blocks
        .filter((b) => b.taskId === t.id)
        .map((b) => ({
          id: b.id,
          label: b.date.slice(5) + " " + b.start + " – " +
            store.hhmmOf(store.mmOf(b.start) + b.durMin) + " · " + b.title,
        })),
    });
  },

  onTitleBlur(e) {
    const v = (e.detail.value || "").trim();
    if (v) store.updateTask(this.id, { title: v });
    else this.refresh();
  },
  onQuadTap(e) {
    store.updateTask(this.id, { quad: +e.currentTarget.dataset.q });
  },
  onEstChange(e) {
    store.updateTask(this.id, { estMin: EST[+e.detail.value] });
  },
  onDueChange(e) {
    store.updateTask(this.id, { due: e.detail.value || null });
  },
  onDueClear() {
    store.updateTask(this.id, { due: null });
  },
  onProjectBlur(e) {
    store.updateTask(this.id, { project: (e.detail.value || "").trim() });
  },
  onNoteBlur(e) {
    store.updateTask(this.id, { note: e.detail.value });
  },
  onToggleDone() {
    wx.vibrateShort({ type: "light" });
    store.toggleTask(this.id);
  },

  // 图片附件预览：dataURL 先落成临时文件（previewImage 不支持 data URI）
  onAttTap(e) {
    const url = this.data.attachments[+e.currentTarget.dataset.i];
    if (!url) return;
    if (url.slice(0, 5) !== "data:") {
      wx.previewImage({ urls: [url] });
      return;
    }
    const m = url.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) { wx.showToast({ title: "图片格式不支持预览", icon: "none" }); return; }
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const filePath = wx.env.USER_DATA_PATH + "/att-" + Date.now() + "." + ext;
    wx.getFileSystemManager().writeFile({
      filePath,
      data: m[2],
      encoding: "base64",
      success: () => wx.previewImage({ urls: [filePath] }),
      fail: () => wx.showToast({ title: "图片打开失败", icon: "none" }),
    });
  },

  // 找今天第一个放得下的空闲时段（与桌面端 scheduleToToday 一致）
  onScheduleToday() {
    const t = store.taskById(this.id);
    if (!t) return;
    const date = store.todayStr();
    const dur = Math.max(15, t.estMin || 30);
    const busy = store.blocksOf(date)
      .map((b) => [store.mmOf(b.start), store.mmOf(b.start) + b.durMin])
      .sort((a, b) => a[0] - b[0]);
    store.getState().blocks.filter((b) => b.taskId === t.id).forEach((b) => store.removeBlock(b.id));
    let cursor = DAY_START;
    for (const seg of busy) {
      if (seg[1] <= cursor) continue;
      if (seg[0] - cursor >= dur) break;
      cursor = Math.max(cursor, seg[1]);
    }
    if (DAY_END - cursor < dur) {
      wx.showToast({ title: "今天排不下了，试试清理时间块", icon: "none" });
      return;
    }
    store.addBlock({
      date, start: store.hhmmOf(cursor), durMin: dur,
      title: t.title, taskId: t.id, cat: "work",
    });
    wx.showToast({ title: "已排入今天 " + store.hhmmOf(cursor), icon: "none" });
  },

  onDelete() {
    wx.showModal({
      title: "删除任务",
      content: "任务及其时间块安排将一并删除",
      confirmText: "删除",
      confirmColor: "#C43C3C",
      success: (r) => {
        if (!r.confirm) return;
        store.removeTask(this.id);
        wx.navigateBack();
      },
    });
  },
});
