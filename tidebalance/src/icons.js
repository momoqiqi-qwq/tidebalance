import { el } from "./ui.js";
const KEYS = new Set(["quadrant", "timeblock", "elder", "market", "settings", "pomodoro", "weekly-report", "elder-care", "gx-news", "chaoxing-notify", "cppu-notify", "wechat-push", "capture"]);
export function appIcon(key) {
  const name = key === "shiguang-schedule" ? "timeblock" : KEYS.has(key) ? key : "market";
  return el("img", { class: "app-icon", src: `/icons/${name}.png`, alt: "", "aria-hidden": "true", width: 32, height: 32 });
}
