import { appIcon } from "../icons.js";
// 设置视图：数据、插件管理、关于
import { api } from "../api.js";
import * as S from "../store.js";
import { el, toast } from "../ui.js";
import { getRegistry, setEnabled, rescan, removeExternalPlugin, pluginViews, onNavChanged } from "../pluginHost.js";
import { THEMES, setTheme } from "../theme.js";

let info = null;
let navUnsub = null;
const selectedPlugins = new Set();

export function renderSettings(container) {
  // 插件是异步加载的：注册表变化（导航变化）时重渲染，避免卡片缺位
  navUnsub?.();
  navUnsub = onNavChanged(() => { if (container.isConnected) render(); });

  const wrap = el("div", { class: "set-wrap" });
  container.append(wrap);

  const render = async () => {
    if (!info) info = await api.appInfo().catch(() => null);
    const settings = S.getState().settings;

    /* 主题 */
    const themeCard = el("div", { class: "card set-card" },
      el("h2", {}, "主题"),
      el("p", { class: "desc" }, "换一套更适合当下环境的界面色彩。老人大字模式会提高对比度和触控面积。"),
    );
    const themeGrid = el("div", { class: "theme-grid" });
    for (const item of THEMES) {
      const on = (settings.theme || "classic") === item.id;
      themeGrid.append(el("button", {
        class: `theme-card theme-${item.id}${on ? " on" : ""}`,
        onclick: () => {
          setTheme(item.id);
          toast(`已切换到「${item.name}」`);
          render();
        },
      },
        el("span", { class: "theme-swatch" },
          el("i", {}), el("i", {}), el("i", {}),
        ),
        el("b", {}, item.name),
        el("small", {}, item.note),
      ));
    }
    themeCard.append(themeGrid);

    /* 数据 */
    const dataCard = el("div", { class: "card set-card" },
      el("h2", {}, "数据"),
      el("p", { class: "desc" }, "所有数据以单个 JSON 文件保存在本机，不上传任何服务器。导出备份可以在任何设备上导入恢复。"),
      el("div", { style: "margin:10px 0" }, el("div", { class: "path-code" }, info ? (info.data_dir || info.dataDir || "未知") : "读取中…")),
      el("div", { style: "display:flex;gap:9px;flex-wrap:wrap" },
        el("button", {
          class: "btn pri",
          onclick: () => {
            const blob = new Blob([JSON.stringify(S.getState(), null, 2)], { type: "application/json" });
            const a = el("a", { href: URL.createObjectURL(blob), download: `le-time-management-backup-${S.todayStr()}.json` });
            a.click(); URL.revokeObjectURL(a.href);
            toast("已导出备份文件");
          },
        }, "导出备份"),
        el("button", { class: "btn ghost", onclick: () => fileInput.click() }, "导入备份"),
        el("button", {
          class: "btn ghost",
          onclick: () => { S.saveNow(); toast("已手动保存"); },
        }, "立即保存"),
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
    const githubIcon = el("span", { class: "github-doc-icon", "aria-hidden": "true" });
    githubIcon.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.3-5.27-1.29-5.27-5.72 0-1.26.45-2.3 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.16 1.18A10.97 10.97 0 0 1 12 6.09c.98 0 1.95.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.77.11 3.06.74.8 1.19 1.84 1.19 3.1 0 4.44-2.71 5.42-5.29 5.71.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>';
    const docLink = el("button", {
      class: "plugin-doc-link",
      title: "打开 Le 插件开发文档",
      onclick: () => api.openExternal("https://github.com/momoqiqi-qwq/le-time-management"),
    }, githubIcon, el("span", {}, "插件开发文档"));

    const plugCard = el("div", { class: "card set-card" },
      el("div", { class: "plugin-title-row" }, el("h2", {}, "插件"), docLink),
      el("p", { class: "desc" },
        "插件可以往侧边栏加视图，也能给任务加自定义动作。内置插件随应用分发；用户插件可通过 ZIP 导入，或放到数据目录下的 plugins/ 文件夹。"),
    );
    const regs = getRegistry();
    const userRegs = regs.filter((r) => r.source !== "builtin");
    // 清掉已经不存在的选择，避免重扫后误操作。
    for (const id of [...selectedPlugins]) if (!userRegs.some((r) => r.id === id)) selectedPlugins.delete(id);

    const pluginImportInput = el("input", { type: "file", accept: ".zip,application/zip", multiple: true, style: "display:none" });
    pluginImportInput.addEventListener("change", async () => {
      const files = [...pluginImportInput.files];
      if (!files.length) return;
      try {
        const all = [];
        for (const file of files) {
          const bytes = [...new Uint8Array(await file.arrayBuffer())];
          const ids = await api.importPluginZip(bytes);
          all.push(...ids);
        }
        await rescan();
        toast(`已导入 ${[...new Set(all)].length} 个插件`);
        render();
      } catch (e) {
        toast(`插件导入失败：${e.message || e}`);
      } finally {
        pluginImportInput.value = "";
      }
    });
    plugCard.append(pluginImportInput);

    const selectedUserIds = () => userRegs.filter((r) => selectedPlugins.has(r.id)).map((r) => r.id);
    const saveZipBase64 = (b64, name) => {
      const raw = atob(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const toolbar = el("div", { class: "plugin-toolbar" },
      el("button", { class: "btn pri sm", onclick: () => pluginImportInput.click() }, "导入插件"),
      el("button", {
        class: "btn ghost sm",
        onclick: async () => {
          const ids = selectedUserIds();
          if (!ids.length) return toast("请先勾选要导出的用户插件");
          try {
            const b64 = await api.exportPluginsZip(ids);
            saveZipBase64(b64, `le-time-management-plugins-${S.todayStr()}.zip`);
            toast(`已导出 ${ids.length} 个插件`);
          } catch (e) { toast(`导出失败：${e.message || e}`); }
        },
      }, "导出所选"),
      el("button", {
        class: "btn ghost sm",
        onclick: () => {
          const allOn = userRegs.length > 0 && userRegs.every((r) => selectedPlugins.has(r.id));
          for (const r of userRegs) allOn ? selectedPlugins.delete(r.id) : selectedPlugins.add(r.id);
          render();
        },
      }, userRegs.length && userRegs.every((r) => selectedPlugins.has(r.id)) ? "取消全选" : "全选用户插件"),
      el("button", {
        class: "btn ghost sm",
        onclick: async () => { await S.saveNow(); toast("插件配置已保存"); },
      }, "保存配置"),
      el("button", {
        class: "btn danger sm",
        disabled: selectedUserIds().length ? null : true,
        onclick: async () => {
          const ids = selectedUserIds();
          if (!ids.length) return;
          const ok = window.confirm(`确定删除选中的 ${ids.length} 个用户插件？\n\n插件文件夹及对应插件状态都会被移除。`);
          if (!ok) return;
          let done = 0;
          for (const id of ids) {
            try { await removeExternalPlugin(id); selectedPlugins.delete(id); done++; }
            catch (e) { toast(`删除 ${id} 失败：${e.message || e}`); }
          }
          toast(`已删除 ${done} 个用户插件`);
          render();
        },
      }, `删除所选${selectedUserIds().length ? ` (${selectedUserIds().length})` : ""}`),
    );
    plugCard.append(toolbar);

    if (!regs.length) {
      plugCard.append(el("p", { class: "desc", style: "padding:8px 0" }, "尚未发现任何插件。"));
    }
    for (const rec of regs) {
      const man = rec.manifest || {};
      const selectable = rec.source !== "builtin";
      const selector = selectable ? el("label", { class: "plugin-select", title: "选择此用户插件" },
        el("input", {
          type: "checkbox",
          checked: selectedPlugins.has(rec.id) ? true : null,
          onchange: (e) => {
            e.currentTarget.checked ? selectedPlugins.add(rec.id) : selectedPlugins.delete(rec.id);
            render();
          },
        })) : el("span", { class: "plugin-select-spacer", title: "内置插件不可删除" });
      const actions = el("div", { style: "display:flex;gap:8px;align-items:center;flex:none" },
        el("button", {
          class: `switch${S.pluginState(rec.id).enabled !== false && rec.loaded ? " on" : ""}`,
          title: "启用 / 停用",
          onclick: async (e) => {
            const on = !e.currentTarget.classList.contains("on");
            await setEnabled(rec.id, on);
            toast(on ? `已启用「${man.name || rec.id}」` : `已停用「${man.name || rec.id}」`);
            render();
            if (on) {
              const view = pluginViews.find((v) => v.pluginId === rec.id);
              if (view) window.dispatchEvent(new CustomEvent("tide:navigate", { detail: `plug:${view.id}` }));
            }
          },
        }),
      );
      if (selectable) {
        actions.append(el("button", {
          class: "btn danger sm",
          title: "从用户插件目录删除",
          onclick: async () => {
            const ok = window.confirm(`删除用户插件「${man.name || rec.id}」？\n\n这会移除插件文件夹和本插件保存的状态。`);
            if (!ok) return;
            try {
              await removeExternalPlugin(rec.id);
              selectedPlugins.delete(rec.id);
              toast(`已删除「${man.name || rec.id}」`);
              render();
            } catch (e) { toast(`删除失败：${e.message || e}`); }
          },
        }, "删除"));
      }
      plugCard.append(el("div", { class: "plug-card" },
        selector,
        el("div", { class: `plug-ic${rec.id === "weekly-report" ? " alt" : ""}` }, rec.id === "exam-calendar" ? "考" : appIcon(rec.id)),
        el("div", { class: "plug-info" },
          el("div", { class: "pn" }, man.name || rec.id,
            el("span", { class: "src" }, rec.source === "builtin" ? "内置" : "用户目录"),
            ...(man.version ? [el("span", { class: "src" }, `v${man.version}`)] : [])),
          el("div", { class: "pd" }, man.description || "（无描述）"),
          el("div", { class: "pm" },
            `作者 ${man.author || "未知"} · 权限 ${(man.permissions || []).join(" / ") || "无"}`,
            pluginViews.some((v) => v.pluginId === rec.id) ? " · 提供了视图" : ""),
          rec.error ? el("div", { class: "perr" }, `加载失败：${rec.error}`) : null,
        ),
        actions,
      ));
    }
    plugCard.append(el("div", { style: "padding-top:12px;display:flex;gap:9px" },
      el("button", {
        class: "btn ghost sm",
        onclick: async () => { await rescan(); toast("已重新扫描插件目录"); render(); },
      }, "重新扫描"),
    ));

    /* 局域网联动 */
    const st = S.getState().settings;
    st.lanPort ??= 27123;
    st.lanToken ??= Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);
    let lanStatus = { running: false, url: "" };
    try { lanStatus = await api.lanStatus(); } catch {}

    const lanCard = el("div", { class: "card set-card" },
      el("h2", {}, "局域网联动"),
      el("p", { class: "desc" },
        "启动后，手机连同一 Wi-Fi，用相机扫码或浏览器打开链接，即可查看今日时间块/任务、勾选完成、快速添加——改动实时回写Le时间管理。配对令牌用于防蹭访问。"),
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
            }, "启动服务"),
            el("span", { style: "font-size:11px;color:var(--ink-2)" }, "令牌已自动生成，随链接/二维码分发"),
          ),
        );
      }
    };
    renderLan();

    /* 关于 */
    const aboutCard = el("div", { class: "card set-card" },
      el("h2", {}, "关于Le时间管理"),
      el("p", { class: "desc" },
        `Le v${info ? info.version : "?"} · 运行于 ${info ? info.os : "?"} · Tauri 2 构建`,
        el("br"), "设计融合：03「权衡」四象限决策台 + 04「潮汐」时间块规划轴。",
        el("br"), "本地保存 · 设备联动由你开启",
        el("br"), el("a", { href: "/icons/ATTRIBUTION.md", target: "_blank" }, "图标：Magnific / Freepik · Eucalyp、wanicon、Good Ware、Kiranshastry、Smashicons")),
    );

    wrap.replaceChildren(themeCard, dataCard, lanCard, plugCard, aboutCard);
  };
  render();
}

function pluginIcon(id, fallback) {
  return ({
    "pomodoro": "番",
    "weekly-report": "报",
    "elder-care": "护",
    "gx-news": "赛",
    "chaoxing-notify": "学",
    "cppu-notify": "警",
    "wechat-push": "微",
  })[id] || fallback || "件";
}
