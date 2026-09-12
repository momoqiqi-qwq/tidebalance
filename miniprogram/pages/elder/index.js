const store = require("../../core/store.js");
const care = require("../../core/care.js");
const model = require("../../core/careModel.js");
const voice = require("../../core/careVoice.js");
const { parseWhen } = require("../../core/timeParser.js");

const SITES = [
  { id: "si", name: "国家社会保险公共服务平台", url: "https://si.12333.gov.cn", tag: "社保公共服务", appHint: "掌上12333、电子社保卡或浏览器" },
  { id: "m12333", name: "人社通（全国社保查询）", url: "https://m12333.cn", tag: "全国社保查询", appHint: "掌上12333或浏览器" },
  { id: "gjzwfw", name: "国家政务服务平台", url: "https://gjzwfw.www.gov.cn", tag: "政务服务", appHint: "国家政务服务平台 App 或小程序" },
  { id: "bj", name: "北京市社会保险网上服务平台", url: "https://rsj.beijing.gov.cn", tag: "北京社保", appHint: "北京人社、京通或浏览器" },
  { id: "hrss", name: "人力资源和社会保障政务服务平台", url: "https://www.12333.gov.cn", tag: "人社服务", appHint: "掌上12333或浏览器" },
];
const PRESETS = [
  { title: "晨起量血压", time: "07:30", dur: 15, message: "记得量血压并记录数值。", tag: "健康" },
  { title: "早餐后吃药", time: "08:00", dur: 10, message: "早餐后按药盒顺序吃药，喝一杯温水。", tag: "用药" },
  { title: "上午喝水", time: "10:00", dur: 5, message: "该喝水了，顺手活动一下肩颈。", tag: "喝水" },
  { title: "午餐前测血糖", time: "11:30", dur: 10, message: "如需控糖，午餐前测一次血糖。", tag: "健康" },
  { title: "午休", time: "13:00", dur: 45, message: "午休一会儿，起身时慢一点。", tag: "休息" },
  { title: "下午散步", time: "16:30", dur: 30, message: "天气合适就出门慢走，带好手机和钥匙。", tag: "运动" },
  { title: "晚餐后吃药", time: "19:00", dur: 10, message: "晚餐后按医嘱吃药。", tag: "用药" },
  { title: "睡前检查门窗", time: "21:00", dur: 10, message: "睡前检查门窗、燃气和充电设备。", tag: "安全" },
  { title: "复诊/取药准备", time: "09:00", dur: 30, message: "带医保卡、病历、检查单和常用药清单。", tag: "就医" },
  { title: "养老金资格认证", time: "09:30", dur: 30, message: "检查养老金资格认证是否到期，必要时联系子女协助。", tag: "养老" },
  { title: "给子女报平安", time: "20:30", dur: 10, message: "给子女发一条平安消息。", tag: "家人" },
];
const REPEATS = [
  { id: "daily", label: "每天" },
  { id: "weekdays", label: "工作日" },
  { id: "once", label: "仅今天" },
];
const CAT = { "健康": "life", "用药": "life", "喝水": "rest", "休息": "rest", "运动": "sport", "安全": "life", "就医": "life", "养老": "life", "家人": "life" };

function uid() { return "er_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function elderState() { const c = care.state(); c.ble ||= {}; return c; }
function minOf(hhmm) {
  const p = String(hhmm || "00:00").split(":");
  return (+p[0] || 0) * 60 + (+p[1] || 0);
}

Page({
  data: {
    tab: "today",
    todayItems: [], careSettings: {}, voiceStatus: "", voiceAvailable: false, editId: null,
    gateway: { name: "", url: "", token: "" }, devices: [], records: [],
    sites: SITES.map((s) => Object.assign({}, s, { host: s.url.replace(/^https?:\/\//, "") })),
    presets: PRESETS,
    reminders: [],
    repeatLabels: REPEATS.map((r) => r.label),
    form: { title: "", time: "09:00", repeatIndex: 0, message: "", date: store.todayStr() },
    ble: { childName: "", childContact: "", namePrefix: "", serviceId: "", characteristicId: "" },
    bleStatus: "未连接蓝牙设备",
    nextLabel: "还没有提醒",
  },

  onShow() {
    this._unsub = care.subscribe(() => this.refresh());
    this.setData({ ble: Object.assign({}, this.data.ble, elderState().ble), careSettings: Object.assign({}, elderState().settings), voiceAvailable: voice.available() });
    this.refresh();
  },
  onHide() { if (this._unsub) this._unsub(); this._unsub = null; voice.cleanup(); },
  onUnload() { this.onHide(); },
  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const es = elderState();
    const reminders = es.reminders
      .slice()
      .sort((a, b) => minOf(a.time) - minOf(b.time))
      .map((r) => Object.assign({}, r, { repeatLabel: (REPEATS.find((x) => x.id === r.repeat) || REPEATS[0]).label }));
    const todayItems = model.todayItems(es).map(r => Object.assign({}, r, { displayTime: store.hhmmOf(new Date(r.dueAt).getHours() * 60 + new Date(r.dueAt).getMinutes()) }));
    const next = todayItems.find(r => r.status !== "done");
    this.setData({
      reminders,
      todayItems, devices: es.devices,
      records: Object.entries(es.records).filter(([,r]) => r.status === "done").sort((a,b) => b[1].completedAt - a[1].completedAt).slice(0,15).map(([key,r]) => ({ key, day:r.day, title: es.reminders.find(x => key.startsWith(x.id + "@"))?.title || "已删除的提醒" })),
      bleStatus: es.ble.lastStatus || this.data.bleStatus,
      nextLabel: next ? "接下来 " + next.displayTime + " · " + next.title : "今天，按自己的节奏来",
    });
  },
  saveElder() {
    care.changed();
    this.refresh();
  },

  onTab(e) { voice.cleanup(); this.setData({ tab: e.currentTarget.dataset.tab, voiceStatus: "" }); },
  onDone(e) { care.act(e.currentTarget.dataset.key, e.currentTarget.dataset.done ? "undo" : "done"); },
  onSnooze(e) { care.act(e.currentTarget.dataset.key, "snooze"); wx.showToast({ title: "10 分钟后再提醒", icon: "none" }); },
  onReadToday() { const items = this.data.todayItems.filter(r => r.status !== "done"); voice.speak(items.length ? items.map(r => r.displayTime + "，" + r.title).join("。") : "今天没有未完成的安排。按自己的节奏来。"); },
  onRead(e) { const r = this.findReminder(e.currentTarget.dataset.id); if (r) voice.speak(r.title + "。" + (r.message || "")); },
  onLarge() { const c = elderState(); c.settings.large = !c.settings.large; this.setData({ careSettings: { ...this.data.careSettings, large: c.settings.large } }); care.changed(); },
  onContactInput(e) { this.setData({ ["careSettings." + e.currentTarget.dataset.k]: e.detail.value }); },
  onSaveContact() {
    const contact = this.data.careSettings;
    if (contact.contactPhone && !/^\+?[\d\s-]{5,20}$/.test(contact.contactPhone)) { wx.showToast({ title: "请检查电话号码", icon: "none" }); return; }
    Object.assign(elderState().settings, contact); care.changed(); wx.showToast({ title: "已保存", icon: "none" });
  },
  onCallFamily() { const phone = elderState().settings.contactPhone; if (phone) wx.makePhoneCall({ phoneNumber: phone }); else wx.showToast({ title: "请家人先填写联系电话", icon: "none" }); },
  onVoice() { if (this.data.voiceStatus) { voice.stop(); return; } voice.start(text => this.applyParsed(text), text => this.setData({ voiceStatus: text })); },
  onParse() { this.applyParsed(this.data.form.title); },
  applyParsed(text) {
    const p = parseWhen(text);
    this.setData({ "form.title": p.title || text, "form.time": p.startMin == null ? this.data.form.time : store.hhmmOf(p.startMin), "form.date": p.date || store.todayStr(), "form.repeatIndex": /工作日/.test(text) ? 1 : /每天|每日/.test(text) ? 0 : 2 });
    wx.showToast({ title: "请核对时间再保存", icon: "none" });
  },
  onDateChange(e) { this.setData({ "form.date": e.detail.value }); },
  onEdit(e) { const r = this.findReminder(e.currentTarget.dataset.id); if (!r) return; this.setData({ tab: "reminders", editId: r.id, form: { title:r.title, time:r.time, date:r.date, message:r.message, repeatIndex: Math.max(0, REPEATS.findIndex(x => x.id === r.repeat)) } }); wx.pageScrollTo({ scrollTop: 0 }); },
  onCancelEdit() { this.setData({ editId: null, form: { title: "", time: "09:00", repeatIndex: 0, message: "", date: store.todayStr() } }); },
  onGatewayInput(e) { this.setData({ ["gateway." + e.currentTarget.dataset.k]: e.detail.value }); },
  onSaveGateway() {
    const d = this.data.gateway;
    if (!d.name.trim() || !/^https:\/\/[^\s/@]+(?:[/:][^\s]*)?$/.test(d.url)) { wx.showToast({ title: "填写设备名称和 HTTPS 地址", icon: "none" }); return; }
    elderState().devices.push({ ...d, id: store.uid("device"), channel: "webhook", enabled:false });
    this.setData({ gateway: { name:"", url:"", token:"" } }); care.changed();
  },
  onTestDevice(e) { const d = elderState().devices.find(x => x.id === e.currentTarget.dataset.id); if (d) care.deliver(d, { key: "test-" + Date.now(), title: "潮衡连接测试", message: "这是一条测试提醒", time:"00:00" }); },
  onToggleDevice(e) { const d = elderState().devices.find(x => x.id === e.currentTarget.dataset.id); if (d) { d.enabled = !d.enabled; care.changed(); } },
  onDeleteDevice(e) { elderState().devices = elderState().devices.filter(x => x.id !== e.currentTarget.dataset.id); care.changed(); },
  siteOf(e) {
    return SITES[+e.currentTarget.dataset.i];
  },
  copySite(s, title) {
    wx.setClipboardData({
      data: s.url,
      success: () => wx.showToast({ title: title || "链接已复制", icon: "none" }),
      fail: () => wx.showToast({ title: "复制失败，请手动复制", icon: "none" }),
    });
  },
  onCopySite(e) {
    const s = this.siteOf(e);
    this.copySite(s);
  },
  onBrowserGuide(e) {
    const s = this.siteOf(e);
    this.copySite(s, "已复制，去浏览器打开");
    wx.showModal({
      title: "去浏览器打开",
      content: "链接已经复制。请打开手机浏览器，粘贴到地址栏访问。\n\n如果手机里已有「" + s.appHint + "」，也可以直接打开对应 App 办理。",
      confirmText: "知道了",
      showCancel: false,
    });
  },
  onOpenApp(e) {
    const s = this.siteOf(e);
    this.copySite(s, "已复制链接");
    wx.showModal({
      title: "打开已有 App",
      content: "微信小程序不能直接拉起所有外部 App。请打开手机里已有的「" + s.appHint + "」，搜索「" + s.name + "」或把链接粘贴到浏览器继续办理。",
      confirmText: "知道了",
      showCancel: false,
    });
  },
  onOpenSite(e) {
    const s = this.siteOf(e);
    this.copySite(s, "已复制链接");
    wx.showModal({
      title: s.name,
      content: "优先建议：打开「" + s.appHint + "」。\n\n也可以去浏览器粘贴链接打开；若本小程序已配置业务域名，可继续尝试在小程序内打开。",
      confirmText: "小程序内打开",
      cancelText: "稍后打开",
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: "/pages/webview/index?title=" + encodeURIComponent(s.name) + "&url=" + encodeURIComponent(s.url) });
        }
      },
    });
  },
  onPreset(e) {
    const p = PRESETS[+e.currentTarget.dataset.i];
    const es = elderState();
    this.setData({ form: { title:p.title, time:p.time, message:p.message, repeatIndex:0, date:store.todayStr() }, editId: null });
    wx.showToast({ title: "请核对时间后保存", icon: "none" });
    return;
    this.saveElder();
    wx.showToast({ title: "已添加提醒", icon: "none" });
  },
  onFormInput(e) {
    this.setData({ ["form." + e.currentTarget.dataset.k]: e.detail.value });
  },
  onTimeChange(e) { this.setData({ "form.time": e.detail.value }); },
  onRepeatChange(e) { this.setData({ "form.repeatIndex": +e.detail.value }); },
  onAddReminder() {
    const title = (this.data.form.title || "").trim();
    if (!title) { wx.showToast({ title: "先写提醒名称", icon: "none" }); return; }
    const c = elderState(), f = this.data.form;
    if (REPEATS[f.repeatIndex].id === "once" && f.date < store.todayStr()) { wx.showToast({ title: "请选择今天或以后的日期", icon:"none" }); return; }
    try {
      const r = model.addReminder(c, { title, time:f.time, date:f.date, repeat:REPEATS[f.repeatIndex].id, message:f.message });
      if (this.data.editId) { c.reminders.pop(); const old = c.reminders.find(x => x.id === this.data.editId); if (old) Object.assign(old, r, { id: old.id }); for (const key of Object.keys(c.records)) if (key.startsWith(this.data.editId + "@") && c.records[key].status !== "done") delete c.records[key]; }
    } catch(error) { wx.showToast({ title:error.message, icon:"none" }); return; }
    this.setData({ editId:null, tab:"today" });
    this.setData({ form: { title: "", time: "09:00", repeatIndex: 0, message: "", date: store.todayStr() } });
    this.saveElder();
    wx.showToast({ title: "已添加提醒", icon: "none" });
  },
  findReminder(id) {
    return elderState().reminders.find((r) => r.id === id);
  },
  onToggle(e) {
    const r = this.findReminder(e.currentTarget.dataset.id);
    if (!r) return;
    r.enabled = !r.enabled;
    this.saveElder();
  },
  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    const es = elderState();
    es.reminders = es.reminders.filter((r) => r.id !== id);
    this.saveElder();
  },
  onBlockToday(e) {
    const r = this.findReminder(e.currentTarget.dataset.id);
    if (!r) return;
    const task = store.addTask({ title: r.title, quad: 1, estMin: r.dur || 15, due: store.todayStr(), tags: ["长辈照护", r.tag || "提醒"], note: r.message || "" });
    store.addBlock({ date: store.todayStr(), start: r.time, durMin: r.dur || 15, title: r.title, taskId: task.id, cat: CAT[r.tag] || "life" });
    wx.showToast({ title: "已排入今天 " + r.time, icon: "none" });
  },
  onTestReminder(e) {
    const r = this.findReminder(e.currentTarget.dataset.id);
    if (!r) return;
    this.fireReminder(r);
  },
  fireReminder(r) { care.fire(r, true); },
  onBleInput(e) {
    this.setData({ ["ble." + e.currentTarget.dataset.k]: e.detail.value });
  },
  onSaveBle() {
    elderState().ble = Object.assign({}, this.data.ble);
    store.saveNow();
    wx.showToast({ title: "蓝牙设置已保存", icon: "none" });
  },
  async onConnectBle() {
    try { await care.connectBle(this.data.ble, bleStatus => this.setData({ bleStatus })); }
    catch(error) { this.setData({ bleStatus: error.message || error.errMsg || "连接未完成" }); }
  },
  onBleEnabled(e) { this.setData({ "ble.enabled": e.detail.value }); },
  onTestBle() { care.sendBle({ title:"潮衡连接测试", message:"这是一条测试提醒", time:"00:00", key:"test-" + Date.now() }).catch(() => {}); },
  onVoiceEnabled(e) { this.setData({ "careSettings.voice": e.detail.value }); elderState().settings.voice = e.detail.value; care.changed(); },
});
