// Tauri 命令封装 —— 在纯浏览器里跑时自动降级到 localStorage（便于前端独立调试）
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke(cmd, args = {}) {
  if (!isTauri) throw new Error(`命令 ${cmd} 仅在 Tauri 环境可用`);
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}

const LS_KEY = "tidebalance-data";

export const api = {
  isTauri,

  async loadData() {
    if (isTauri) return invoke("load_data");
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
    throw new Error("no data");
  },

  async saveData(data) {
    if (isTauri) return invoke("save_data", { data });
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  },

  async listPlugins() {
    if (!isTauri) return [];
    return invoke("list_plugins");
  },

  async readPluginFile(relPath) {
    return invoke("read_plugin_file", { relPath });
  },

  async appInfo() {
    if (!isTauri) return { version: "web-dev", os: "browser", dataDir: "localStorage（浏览器调试模式）" };
    return invoke("app_info");
  },
};
