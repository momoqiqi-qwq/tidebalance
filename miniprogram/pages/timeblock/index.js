// 时间块视图 —— 概念稿 04「潮汐」的小程序版
// 任务池（点击自动安排到第一个空闲位）+ 24h/07:00 起时间轴
// 时间块用 movable-view 原生手势上下拖动，15 分钟吸附；点空白处加空白块
const parser = require("../../core/timeParser.js");
const store = require("../../core/store.js");

const DAY_START = 7 * 60;   // 07:00
const DAY_END = 24 * 60;    // 24:00
const HOUR_PX = 54;         // 每小时像素高
const PX = HOUR_PX / 60;    // 每分钟像素
const TOP_PAD = 10;
const CANVAS_H = ((DAY_END - DAY_START) / 60) * HOUR_PX + TOP_PAD;

const TAG_CAT = {
  论文: "work", 工作: "work", 学习: "study", 读书: "study",
  运动: "sport", 健身: "sport", 跑步: "sport", 生活: "life", 休息: "rest",
};
const CAT_NAMES = { work: "工作", study: "学习", sport: "运动", life: "生活", rest: "休息" };

Page({
  data: {
    curDate: "",
    dateLabel: "",
    sumLabel: "",
    canvasH: CANVAS_H,
    hours: [],
    blocks: [],
    pool: [],
    daysBar: [],
    placing: null,
    dragId: "",
    emptyDay: false,
    nowLine: { show: false, top: 0, label: "" },
    hint: { show: false, top: 0, label: "" },
    meter: [],
    legend: [],
    rhythm: [],
    tomorrow: [],
    tomEmpty: true,
    totalLabel: "",
    awakeLabel: "",
    quick: "",
  },

  onLoad() {
    const saved = store.getState().settings.lastDate;
    this.setData({ curDate: saved || store.todayStr() });
  },
  onShow() {
    // 捕获页「查看时间块」跳转：先定位到目标日期
    const app = getApp();
    if (app.globalData.pendingTimeblockDate) {
      this.setData({ curDate: app.globalData.pendingTimeblockDate });
      app.globalData.pendingTimeblockDate = null;
    }
    this._unsub = store.subscribe(() => this.refresh());
    this.refresh();
    this._timer = setInterval(() => this.refreshNowLine(), 30000);
  },
  onHide() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.data.placing) this.setData({ placing: null });
  },
  onUnload() { this.onHide(); },

  persistDate() {
    store.getState().settings.lastDate = this.data.curDate;
    store.saveNow();
  },

  /* ── 渲染 ── */
  refresh() {
    const curDate = this.data.curDate;
    const isToday = curDate === store.todayStr();

    // 时刻行
    const hours = [];
    for (let m = DAY_START; m <= DAY_END; m += 60) {
      hours.push({ label: store.hhmmOf(m), top: (m - DAY_START) * PX + TOP_PAD });
    }

    // 时间块
    const list = store.blocksOf(curDate).map((b) => {
      const h = Math.max(24, b.durMin * PX - 3);
      return {
        id: b.id,
        title: b.title,
        cat: b.cat,
        h,
        y: (store.mmOf(b.start) - DAY_START) * PX,
        tiny: b.durMin <= 25,
        showMeta: h > 44,
        timeLabel: b.start + " – " + store.hhmmOf(store.mmOf(b.start) + b.durMin),
        catLabel: CAT_NAMES[b.cat] || b.cat,
      };
    });

    // 任务池
    const pool = store.poolOf(curDate).map((t) => {
      const cat = TAG_CAT[(t.tags || [])[0] || ""] || "work";
      return {
        id: t.id,
        title: t.title,
        cat,
        catLabel: CAT_NAMES[cat] || cat,
        estLabel: store.durLabel(t.estMin),
        dueLabel: t.due ? "截止 " + t.due.slice(5) : "",
      };
    });

    // 「现在」红线
    const nowLine = this.calcNowLine();

    // 标题与合计
    const parts = curDate.split("-");
    const dateLabel = (+parts[1]) + "月" + (+parts[2]) + "日 · 周" + store.weekdayCN(curDate) + (isToday ? " · 今天" : "");
    const blocks = store.blocksOf(curDate);
    const total = blocks.reduce((a, b) => a + b.durMin, 0);
    const sumLabel = "已排 " + store.durLabel(total) + " · " + blocks.length + " 块";

    // 分类占比
    const byCat = {};
    for (const b of blocks) byCat[b.cat] = (byCat[b.cat] || 0) + b.durMin;
    const meter = Object.keys(byCat).map((c) => ({ cat: c, w: (byCat[c] / Math.max(total, 1)) * 100 }));
    const legend = Object.keys(byCat).map((c) => ({ cat: c, label: CAT_NAMES[c] + " " + store.durLabel(byCat[c]) }));

    // 近 7 天节奏
    const rhythm = [];
    for (let i = -6; i <= 0; i++) {
      const d = store.addDays(curDate, i);
      const v = store.blocksOf(d).reduce((a, b) => a + b.durMin, 0);
      rhythm.push({ i, h: Math.min(100, (v / 480) * 100), day: "周" + store.weekdayCN(d), today: i === 0 });
    }

    // 近 7 天日期条（当前日期往前 1 天到往后 5 天）
    const daysBar = [];
    for (let i = -1; i <= 5; i++) {
      const d = store.addDays(curDate, i);
      const dp = d.split("-");
      daysBar.push({
        date: d,
        md: (+dp[1]) + "/" + (+dp[2]),
        wk: d === store.todayStr() ? "今天" : (i === 0 ? "当前" : "周" + store.weekdayCN(d)),
        active: i === 0,
      });
    }

    // 明日预告
    const tom = store.blocksOf(store.addDays(curDate, 1)).slice(0, 4);
    const tomorrow = tom.map((b) => ({
      id: b.id,
      cat: b.cat,
      label: b.start + " " + b.title,
      dur: store.durLabel(b.durMin),
    }));

    this.setData({
      hours, blocks: list, pool, nowLine,
      dateLabel, sumLabel,
      daysBar,
      emptyDay: list.length === 0,
      meter, legend, rhythm, tomorrow,
      tomEmpty: tomorrow.length === 0,
      totalLabel: store.durLabel(total),
      awakeLabel: store.durLabel(DAY_END - DAY_START),
    });
  },

  calcNowLine() {
    if (this.data.curDate !== store.todayStr()) return { show: false, top: 0, label: "" };
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < DAY_START || min > DAY_END) return { show: false, top: 0, label: "" };
    return {
      show: true,
      top: (min - DAY_START) * PX + TOP_PAD,
      label: "现在 " + store.hhmmOf(min),
    };
  },
  refreshNowLine() {
    this.setData({ nowLine: this.calcNowLine() });
  },

  /* ── 日期导航 ── */
  onPrevDay() { this.shiftDate(-1); },
  onNextDay() { this.shiftDate(1); },
  onToday() { this.setData({ curDate: store.todayStr(), placing: null }); this.persistDate(); this.refresh(); },
  onDateChange(e) { this.setData({ curDate: e.detail.value, placing: null }); this.persistDate(); this.refresh(); },
  onDayTap(e) {
    const d = e.currentTarget.dataset.date;
    if (!d || d === this.data.curDate) return;
    this.setData({ curDate: d, placing: null });
    this.persistDate();
    this.refresh();
  },
  shiftDate(n) {
    this.setData({ curDate: store.addDays(this.data.curDate, n), placing: null });
    this.persistDate();
    this.refresh();
  },

  /* ── 任务池：点击自动安排 ── */
  onPoolTap(e) {
    const t = store.taskById(e.currentTarget.dataset.id);
    if (!t) return;
    const dur = Math.max(15, t.estMin || 30);
    const min = this.findSlot(dur);
    if (min === null) { wx.showToast({ title: "这一天已经排满了", icon: "none" }); return; }
    // 该任务若已在别处排程，先移除，避免重复
    store.getState().blocks.filter((b) => b.taskId === t.id).forEach((b) => store.removeBlock(b.id));
    store.addBlock({
      date: this.data.curDate,
      start: store.hhmmOf(min), durMin: dur,
      title: t.title, taskId: t.id,
      cat: TAG_CAT[(t.tags || [])[0] || ""] || "work",
    });
    wx.showToast({ title: "已排入 " + store.hhmmOf(min), icon: "none" });
  },

  // 长按任务卡进入「点轴放置」模式：找回桌面端拖拽意图的移动端方案
  onPoolLongPress(e) {
    const t = store.taskById(e.currentTarget.dataset.id);
    if (!t) return;
    wx.vibrateShort({ type: "medium" });
    this.setData({ placing: { id: t.id, title: t.title, dur: Math.max(15, t.estMin || 30) } });
  },
  onPlaceCancel() {
    this.setData({ placing: null });
  },

  findSlot(dur) {
    const busy = store.blocksOf(this.data.curDate)
      .map((b) => [store.mmOf(b.start), store.mmOf(b.start) + b.durMin])
      .sort((a, b) => a[0] - b[0]);
    let cursor = DAY_START;
    for (const seg of busy) {
      if (seg[1] <= cursor) continue;
      if (seg[0] - cursor >= dur) break;
      cursor = Math.max(cursor, seg[1]);
    }
    if (DAY_END - cursor < dur) return null;
    return cursor;
  },

  /* ── 时间块拖动 / 点按菜单 ── */
  onBlockTouchStart(e) {
    const id = e.currentTarget.dataset.id;
    const b = store.getState().blocks.find((x) => x.id === id);
    this.drag = b ? { id, durMin: b.durMin, moved: false, y: null } : null;
  },
  onBlockChange(e) {
    if (!this.drag) return;
    const src = e.detail.source;
    if (src !== "touch" && src !== "touch-out-of-bounds") return;
    if (!this.drag.moved) {
      this.drag.moved = true;
      wx.vibrateShort({ type: "light" });
      this.setData({ dragId: this.drag.id });
    }
    this.drag.y = e.detail.y;
    const min = this.snapMin(e.detail.y, this.drag.durMin);
    this.setData({
      hint: {
        show: true,
        top: (min - DAY_START) * PX + TOP_PAD,
        label: store.hhmmOf(min) + " – " + store.hhmmOf(min + this.drag.durMin),
      },
    });
  },
  onBlockTouchEnd() {
    if (this.drag) {
      if (this.drag.moved && this.drag.y !== null) {
        const min = this.snapMin(this.drag.y, this.drag.durMin);
        store.updateBlock(this.drag.id, { date: this.data.curDate, start: store.hhmmOf(min) });
      } else {
        this.blockMenu(this.drag.id);
      }
    }
    this.drag = null;
    this.setData({ dragId: "", hint: { show: false, top: 0, label: "" } });
  },
  snapMin(y, durMin) {
    const min = Math.round(y / PX / 15) * 15 + DAY_START;
    return Math.min(DAY_END - durMin, Math.max(DAY_START, min));
  },
  blockMenu(id) {
    const b = store.getState().blocks.find((x) => x.id === id);
    if (!b) return;
    const cats = ["work", "study", "sport", "life", "rest"];
    const items = ["时长 +15 分钟", "时长 −15 分钟", "换分类"];
    if (b.taskId) items.push("移回任务池");
    items.push("删除时间块");
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const label = items[res.tapIndex];
        if (label === "时长 +15 分钟") {
          store.updateBlock(id, { durMin: Math.min(480, b.durMin + 15) });
        } else if (label === "时长 −15 分钟") {
          store.updateBlock(id, { durMin: Math.max(15, b.durMin - 15) });
        } else if (label === "换分类") {
          store.updateBlock(id, { cat: cats[(cats.indexOf(b.cat) + 1) % cats.length] });
        } else if (label === "移回任务池") {
          store.updateBlock(id, { taskId: null });
        } else if (label === "删除时间块") {
          wx.showModal({
            title: "删除时间块",
            content: "「" + b.title + "」将被删除",
            confirmText: "删除",
            confirmColor: "#C43C3C",
            success: (r) => { if (r.confirm) store.removeBlock(id); },
          });
        }
      },
    });
  },

  /* ── 点空白处：放置模式 / 快速加块 ── */
  onCanvasTap(e) {
    // 点在时间块上时不触发（block 自己的 touchend 已处理）
    if (e.target.dataset.id) return;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const placing = this.data.placing;
    wx.createSelectorQuery().in(this)
      .select(".canvas")
      .boundingClientRect((rect) => {
        if (!rect) return;
        const y = touch.clientY - rect.top - TOP_PAD;
        if (y < -TOP_PAD || y > CANVAS_H - TOP_PAD) return;
        const min = this.snapMin(Math.max(0, y), placing ? placing.dur : 30);

        if (placing) {
          // 长按任务卡后：点时间轴即把任务放到该位置
          store.getState().blocks.filter((b) => b.taskId === placing.id).forEach((b) => store.removeBlock(b.id));
          const t = store.taskById(placing.id);
          store.addBlock({
            date: this.data.curDate,
            start: store.hhmmOf(min), durMin: placing.dur,
            title: placing.title, taskId: placing.id,
            cat: t ? (TAG_CAT[(t.tags || [])[0] || ""] || "work") : "work",
          });
          this.setData({ placing: null });
          wx.vibrateShort({ type: "light" });
          wx.showToast({ title: "已放到 " + store.hhmmOf(min), icon: "none" });
          return;
        }

        wx.showModal({
          title: "加一段 " + store.hhmmOf(min) + "（30 分钟）",
          editable: true,
          placeholderText: "这一段做什么？如「午休」",
          success: (res) => {
            if (!res.confirm) return;
            const title = (res.content || "").trim() || "空白时间";
            store.addBlock({
              date: this.data.curDate,
              start: store.hhmmOf(min), durMin: 30,
              title, taskId: null,
              cat: parser.guessCategory(title),
            });
          },
        });
      })
      .exec();
  },

  /* ── 底部快速输入 ── */
  onQuickInput(e) { this.setData({ quick: e.detail.value }); },
  onQuickAdd() {
    const title = (this.data.quick || "").trim();
    if (!title) return;
    const dur = 30;
    const min = this.findSlot(dur);
    if (min === null) { wx.showToast({ title: "这一天已经排满了", icon: "none" }); return; }
    store.addBlock({
      date: this.data.curDate,
      start: store.hhmmOf(min), durMin: dur,
      title, taskId: null,
      cat: parser.guessCategory(title),
    });
    this.setData({ quick: "" });
    wx.showToast({ title: "已放到 " + store.hhmmOf(min), icon: "none" });
  },
});
