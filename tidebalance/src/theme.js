import * as S from "./store.js";

export const THEMES = [
  { id: "classic", name: "经典潮衡", note: "温暖纸面，适合日常任务管理" },
  { id: "fresh", name: "清爽海盐", note: "更亮、更轻，长时间看也不累" },
  { id: "night", name: "夜间护眼", note: "低亮度深色界面，适合夜晚使用" },
  { id: "elder", name: "老人大字", note: "高对比、大触点，给长辈直接点" },
];

export function applyTheme(id) {
  const theme = THEMES.some((x) => x.id === id) ? id : "classic";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
  return theme;
}

export function setTheme(id) {
  const theme = applyTheme(id);
  S.getState().settings.theme = theme;
  S.saveNow();
  return theme;
}

export function initTheme() {
  const st = S.getState().settings;
  st.theme = applyTheme(st.theme);
}
