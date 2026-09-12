Page({
  data: { url: "" },
  onLoad(q) {
    const url = decodeURIComponent(q.url || "");
    this.setData({ url });
    if (q.title) wx.setNavigationBarTitle({ title: decodeURIComponent(q.title) });
  },
});
