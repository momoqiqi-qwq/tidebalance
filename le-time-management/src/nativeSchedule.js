import { api } from "./api.js";

// Serialize lifecycle changes so a late startup can never cover a different plugin.
let control = Promise.resolve();
function send(action, bounds) {
  const result = control.catch(() => {}).then(() => api.nativeSchedule(action, bounds));
  control = result;
  return result;
}

export function renderNativeSchedule(container) {
  const region = document.createElement("div");
  region.className = "native-schedule-region";
  region.style.cssText = "width:100%;height:100%;min-height:360px;position:relative";
  container.style.cssText = "height:100%;padding:0;overflow:hidden";
  container.append(region);
  const message = document.createElement("p");
  message.textContent = "正在打开时光课程表…";
  region.append(message);
  let disposed = false, ready = false, raf = 0, lastBounds = "";
  function resize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (disposed || !ready) return;
      const r = region.getBoundingClientRect(), scale = window.devicePixelRatio || 1;
      const bounds = { x: Math.round(r.x * scale), y: Math.round(r.y * scale),
        width: Math.max(1, Math.round(r.width * scale)), height: Math.max(1, Math.round(r.height * scale)) };
      const key = JSON.stringify(bounds);
      if (key === lastBounds) return;
      lastBounds = key;
      send("show", bounds).then(() => { if (!disposed) message.textContent = ""; })
        .catch(e => { if (!disposed) { lastBounds = ""; message.textContent = String(e); } });
    });
  }
  const observer = new ResizeObserver(resize);
  observer.observe(region);
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", resize, true);
  // The host's page animation changes position without resizing the region.
  container.closest(".view")?.addEventListener("animationend", resize);
  api.nativeSchedule("status").then(status => {
    if (disposed) return;
    if (!status.available) {
      message.textContent = "此版本尚未包含原版课表运行时。原版界面需要安装包含原生课表的客户端。";
      return;
    }
    if (status.platform === "android") {
      const open = () => send("show").catch(e => { if (!disposed) message.textContent = String(e); });
      message.textContent = "时光课程表";
      const button = document.createElement("button");
      button.textContent = "进入课表";
      button.addEventListener("click", open);
      region.append(button);
      open();
      return;
    }
    ready = true;
    resize();
  }).catch(e => { if (!disposed) message.textContent = `原版课表无法启动：${e.message || e}`; });
  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", resize, true);
    container.closest(".view")?.removeEventListener("animationend", resize);
    send("hide").catch(() => {});
  };
}
