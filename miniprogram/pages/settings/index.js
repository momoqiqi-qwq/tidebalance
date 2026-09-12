// 设置页：数据统计、备份导出/导入（与桌面端同一 JSON 格式）、关于
const store = require("../../core/store.js");
const taskReminder = require("../../core/taskReminder.js");
const appMeta = require("../../core/appMeta.js");

Page({
  data: {
    stats: { tasks: 0, open: 0, done: 0, blocks: 0, kb: "0" },
    importText: "",
    reminder: { enabled: true, volume: 75, sound: "beep", customAudioName: "尚未导入" },
    soundOptions: ["内置提示音", "自定义音频"],
    about: appMeta,
  },

  onShow() { this.refresh(); },

  refresh() {
    const st = store.getState();
    const open = st.tasks.filter((t) => !t.done).length;
    let kb = "0";
    let total = 0;
    try {
      kb = String(Math.max(1, Math.round(JSON.stringify(st).length / 1024)));
    } catch (e) { /* 忽略 */ }
    try {
      total = wx.getStorageInfoSync().currentSize || 0; // 全部本地存储占用（KB，上限 10MB）
    } catch (e) { /* 忽略 */ }
    const rc = taskReminder.cfg();
    this.setData({
      reminder: { enabled: rc.enabled !== false, volume: Math.round((Number(rc.volume)||0)*100), sound: rc.sound || "beep", customAudioName: rc.customAudioName || "尚未导入" },
      stats: {
        tasks: st.tasks.length,
        open,
        done: st.tasks.length - open,
        blocks: st.blocks.length,
        kb,
        total,
        // 单 key 上限 1MB：主数据超 900KB 就该清理图片附件了；总量 >8MB 也会威胁写入
        warn: kb > 900 || total > 8192,
      },
    });
  },

  onReminderEnabled(e) { const c=taskReminder.cfg(); c.enabled=!!e.detail.value; store.saveNow(); this.refresh(); },
  onReminderVolume(e) { const c=taskReminder.cfg(); c.volume=Number(e.detail.value)/100; store.saveNow(); this.setData({"reminder.volume":Number(e.detail.value)}); },
  onSoundChange(e) { const c=taskReminder.cfg(); c.sound=+e.detail.value===1?"custom":"beep"; store.saveNow(); this.refresh(); },
  onTestSound() { taskReminder.play(); },
  onImportAudio() {
    wx.chooseMessageFile({count:1,type:"file",extension:["mp3","wav","m4a","aac","ogg"],success:(r)=>{
      const f=r.tempFiles&&r.tempFiles[0]; if(!f)return;
      if(f.size>8*1024*1024){wx.showToast({title:"音频请控制在 8MB 内",icon:"none"});return;}
      wx.saveFile({tempFilePath:f.path,success:(x)=>{const c=taskReminder.cfg(); c.customAudioPath=x.savedFilePath; c.customAudioName=f.name||"自定义音频"; c.sound="custom"; store.saveNow(); this.refresh(); wx.showToast({title:"提醒音已导入",icon:"none"});},fail:()=>wx.showToast({title:"音频保存失败",icon:"none"})});
    }});
  },

  onPlugins() { wx.navigateTo({ url: "/pages/plugins/index" }); },

  onExport() {
    wx.setClipboardData({
      data: JSON.stringify(store.getState(), null, 2),
      success: () => wx.showToast({ title: "备份 JSON 已复制到剪贴板", icon: "none" }),
    });
  },

  onImportText(e) { this.setData({ importText: e.detail.value }); },

  onImport() {
    const raw = (this.data.importText || "").trim();
    if (!raw) { wx.showToast({ title: "先把备份 JSON 粘贴到下面的框里", icon: "none" }); return; }
    try {
      const next = JSON.parse(raw);
      if (!Array.isArray(next.tasks)) throw new Error("缺少 tasks 字段");
      store.replaceAll(next);
      store.saveNow();
      this.setData({ importText: "" });
      this.refresh();
      wx.showToast({ title: "导入成功，已恢复备份", icon: "none" });
    } catch (e) {
      wx.showToast({ title: "导入失败：" + e.message, icon: "none" });
    }
  },

  onResetSeed() {
    wx.showModal({
      title: "恢复示例数据",
      content: "当前所有任务和时间块将被清空，替换为示例数据",
      confirmText: "清空恢复",
      confirmColor: "#C43C3C",
      success: (r) => {
        if (!r.confirm) return;
        store.replaceAll(store.seed());
        store.saveNow();
        this.refresh();
        wx.showToast({ title: "已恢复示例数据", icon: "none" });
      },
    });
  },
});
