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

  // 插件网络桥：Tauri 端由 Rust 发请求（绕开 CORS），浏览器端直接 fetch
  async httpGet(url) {
    if (isTauri) return invoke("http_get", { url });
    const r = await fetch(url);
    return { status: r.status, body: await r.text(), finalUrl: r.url, contentType: r.headers.get("content-type") || "" };
  },

  async openExternal(url) {
    if (isTauri) return invoke("open_external", { url });
    window.open(url, "_blank");
  },

  // 会话化 HTTP：Tauri 端带 Cookie Jar（登录态跨请求保持）；浏览器端用 include 凭据
  async httpSessionNew() {
    if (isTauri) return invoke("http_session_new");
    return "browser";
  },

  async httpFetch(sid, method, url, opts = {}) {
    if (isTauri) {
      return invoke("http_fetch", { sid, method, url, headers: opts.headers || null, body: opts.body || null, binary: opts.binary || null });
    }
    const r = await fetch(url, {
      method, headers: opts.headers, body: opts.body, credentials: "include",
    });
    const body = opts.binary ? btoa(String.fromCharCode(...new Uint8Array(await r.arrayBuffer())))
      : await r.text();
    return { status: r.status, body, finalUrl: r.url, contentType: r.headers.get("content-type") || "", cookies: [] };
  },

  async desEncryptHex(plain, key) {
    if (isTauri) return invoke("des_ecb_encrypt_hex", { plain, key });
    throw new Error("DES 加密仅支持在 Tauri 环境使用");
  },

  // 局域网联动服务
  async lanStart(port, token) {
    if (!isTauri) throw new Error("仅 Tauri 环境可用");
    return invoke("lan_start", { port, token });
  },
  async lanStop() {
    if (isTauri) return invoke("lan_stop");
  },
  async lanStatus() {
    if (!isTauri) return { running: false };
    return invoke("lan_status");
  },
};
