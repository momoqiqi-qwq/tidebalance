// 设置视图：数据、插件管理、关于
import { api } from "../api.js";
import * as S from "../store.js";
import { el, toast } from "../ui.js";
import { getRegistry, setEnabled, rescan, pluginViews, onNavChanged } from "../pluginHost.js";

let info = null;
let navUnsub = null;

export function renderSettings(container) {
  // 插件是异步加载的：注册表变化（导航变化）时重渲染，避免卡片缺位
  navUnsub?.();
  navUnsub = onNavChanged(() => { if (container.isConnected) render(); });

  const wrap = el("div", { class: "set-wrap" });
  container.append(wrap);

  const render = async () => {
    if (!info) info = await api.appInfo().catch(() => null);

    /* 数据 */
    const dataCard = el("div", { class: "card set-card" },
      el("h2", {}, "🗄 数据"),
      el("p", { class: "desc" }, "所有数据以单个 JSON 文件保存在本机，不上传任何服务器。导出备份可以在任何设备上导入恢复。"),
      el("div", { style: "margin:10px 0" }, el("div", { class: "path-code" }, info ? (info.data_dir || info.dataDir || "未知") : "读取中…")),
      el("div", { style: "display:flex;gap:9px;flex-wrap:wrap" },
        el("button", {
          class: "btn pri",
          onclick: () => {
            const blob = new Blob([JSON.stringify(S.getState(), null, 2)], { type: "application/json" });
            const a = el("a", { href: URL.createObjectURL(blob), download: `tidebalance-backup-${S.todayStr()}.json` });
            a.click(); URL.revokeObjectURL(a.href);
            toast("已导出备份文件");
          },
        }, "⇪ 导出备份"),
        el("button", { class: "btn ghost", onclick: () => fileInput.click() }, "⇩ 导入备份"),
        el("button", {
          class: "btn ghost",
          onclick: () => { S.saveNow(); toast("已手动保存"); },
        }, "✓ 立即保存"),
      ),
    );
    const fileInput = el("input", { type: "file", accept: ".json", style: "display:none" });
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try {
        const next = JSON.parse(await f.text());
        if (!Array.isArray(next.tasks)) throw new Error("缺少 tasks 字段");
        S.replaceAll(next);
        await S.saveNow();
        toast("导入成功，已恢复备份");
        render();
      } catch (e) {
        toast(`导入失败：${e.message}`);
      }
    });
    dataCard.append(fileInput);

    /* 插件 */
    const plugCard = el("div", { class: "card set-card" },
      el("h2", {}, "◈ 插件"),
      el("p", { class: "desc" },
        "插件可以往侧边栏加视图（比如番茄钟、周报），也能给任务加自定义动作。内置插件随应用分发；",
        el("b", {}, "用户插件"),
        " 只要把文件夹放进数据目录下的 plugins/ 文件夹（每个插件含 manifest.json + main.js）就能被发现。API 文档见项目 README。"),
    );
    const regs = getRegistry();
    if (!regs.length) {
      plugCard.append(el("p", { class: "desc", style: "padding:8px 0" }, "尚未发现任何插件。"));
    }
    for (const rec of regs) {
      const man = rec.manifest || {};
      plugCard.append(el("div", { class: "plug-card" },
        el("div", { class: `plug-ic${rec.id === "weekly-report" ? " alt" : ""}` }, (man.icon || "◈")),
        el("div", { class: "plug-info" },
          el("div", { class: "pn" }, man.name || rec.id,
            el("span", { class: "src" }, rec.source === "builtin" ? "内置" : "用户目录"),
            ...(man.version ? [el("span", { class: "src" }, `v${man.version}`)] : [])),
          el("div", { class: "pd" }, man.description || "（无描述）"),
          el("div", { class: "pm" },
            `作者 ${man.author || "未知"} · 权限 ${(man.permissions || []).join(" / ") || "无"}`,
            pluginViews.some((v) => v.pluginId === rec.id) ? " · 提供了视图" : ""),
          rec.error ? el("div", { class: "perr" }, `⚠ 加载失败：${rec.error}`) : null,
        ),
        el("button", {
          class: `switch${S.pluginState(rec.id).enabled !== false && rec.loaded ? " on" : ""}`,
          title: "启用 / 停用",
          onclick: async (e) => {
            const on = !e.currentTarget.classList.contains("on");
            await setEnabled(rec.id, on);
            toast(on ? `已启用「${man.name || rec.id}」` : `已停用「${man.name || rec.id}」`);
            render();
          },
        }),
      ));
    }
    plugCard.append(el("div", { style: "padding-top:12px;display:flex;gap:9px" },
      el("button", {
        class: "btn ghost sm",
        onclick: async () => {
          await rescan();
          toast("已重新扫描插件目录");
          render();
        },
      }, "⟳ 重新扫描"),
    ));

    /* 局域网联动 */
    const st = S.getState().settings;
    st.lanPort ??= 27123;
    st.lanToken ??= Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);
    let lanStatus = { running: false, url: "" };
    try { lanStatus = await api.lanStatus(); } catch {}

    const lanCard = el("div", { class: "card set-card" },
      el("h2", {}, "📱 局域网联动（手机控制）"),
      el("p", { class: "desc" },
        "启动后，手机连同一 Wi-Fi，用相机扫码或浏览器打开链接，即可查看今日时间块/任务、勾选完成、快速添加——改动实时回写潮衡。配对令牌用于防蹭访问。"),
    );
    const lanBody = el("div", { style: "margin-top:10px" });
    lanCard.append(lanBody);

    const renderLan = () => {
      lanBody.replaceChildren();
      if (lanStatus.running) {
        lanBody.append(
          el("div", { class: "path-code" }, lanStatus.url),
          el("div", { style: "display:flex;gap:14px;margin-top:12px;align-items:center" },
            el("img", { src: `${lanStatus.url.replace("/m?", "/qr.svg?")}`, style: "width:132px;height:132px;border-radius:10px;border:1px solid var(--line);background:#fff" }),
            el("div", { style: "flex:1" },
              el("p", { class: "desc" }, "手机相机扫码 → 浏览器打开即可使用；也可把链接发到手机。"),
              el("div", { style: "display:flex;gap:8px;margin-top:10px" },
                el("button", { class: "btn ghost sm", onclick: () => { navigator.clipboard?.writeText(lanStatus.url); toast("链接已复制"); } }, "复制链接"),
                el("button", {
                  class: "btn danger sm",
                  onclick: async () => { await api.lanStop(); st.lanAuto = false; S.saveNow(); renderLan(); },
                }, "停止服务"),
              ),
            ),
          ),
        );
      } else {
        const portIn = el("input", { type: "number", value: st.lanPort, style: "width:110px;height:34px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:#fff" });
        lanBody.append(
          el("div", { style: "display:flex;gap:8px;align-items:center;margin-top:4px" },
            el("span", { style: "font-size:12px;color:var(--ink-2)" }, "端口"),
            portIn,
            el("button", {
              class: "btn pri sm",
              onclick: async () => {
                st.lanPort = Number(portIn.value) || 27123;
                st.lanAuto = true;
                S.saveNow();
                try {
                  lanStatus = { running: true, url: await api.lanStart(st.lanPort, st.lanToken) };
                  toast("联动服务已启动");
                  renderLan();
                } catch (e) { toast(`启动失败：${e.message || e}`); }
              },
            }, "▶ 启动服务"),
            el("span", { style: "font-size:11px;color:var(--ink-2)" }, "令牌已自动生成，随链接/二维码分发"),
          ),
        );
      }
    };
    renderLan();

    /* 关于 */
    const aboutCard = el("div", { class: "card set-card" },
      el("h2", {}, "☀ 关于潮衡"),
      el("p", { class: "desc" },
        `TideBalance v${info ? info.version : "?"} · 运行于 ${info ? info.os : "?"} · Tauri 2 构建`,
        el("br"), "设计融合：03「权衡」四象限决策台 + 04「潮汐」时间块规划轴。",
        el("br"), "本地优先 · 无账号 · 无联网"),
    );

    wrap.replaceChildren(dataCard, lanCard, plugCard, aboutCard);
  };
  render();
}
