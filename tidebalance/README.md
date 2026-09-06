# 潮衡 TideBalance

把概念稿 **03「权衡」四象限决策台** 与 **04「潮汐」时间块规划轴** 合成的本地优先时间管理平台。

- **四象限**：重要/紧急四象限管理任务，点卡片开详情抽屉，可一键「排入今天时间块」
- **时间块**：左侧任务池拖进一天的时间轴（鼠标/触摸通用，安卓可拖），「现在」红线、7 天节奏、明日预告
- **捕获**：把聊天文字、网页文本、链接、图片**拖进窗口**（或截图后 Ctrl+V），自动解析中文时间（"明天下午3点到4点"、"9月10日 14:00"、"下周一晚上8点半"）并在对应时间创建时间块
- **插件系统**：内置「番茄专注」「周度报告」两个插件演示；支持把插件放进数据目录 `plugins/` 动态加载
- **本地优先**：数据就是一个 JSON 文件，存在本机应用数据目录，无账号、无联网
- **Tauri 2**：一套代码打包 Windows / Linux / Android

## 目录结构

```
tidebalance/
├─ index.html / vite.config.js / package.json   # 前端（Vite + 原生 JS）
├─ src/
│  ├─ main.js            # 启动入口
│  ├─ shell.js           # 侧栏 + 顶栏 + 视图路由
│  ├─ store.js           # 状态与持久化（防抖写盘）
│  ├─ api.js             # Tauri 命令封装（浏览器模式降级 localStorage）
│  ├─ ui.js              # toast / 弹出菜单 / 指针拖拽
│  ├─ pluginHost.js      # 插件宿主
│  └─ views/
│     ├─ quadrant.js     # 四象限视图
│     ├─ drawer.js       # 任务详情抽屉
│     ├─ timeblock.js    # 时间块视图
│     └─ settings.js     # 设置（数据 / 插件管理 / 关于）
├─ public/plugins/       # 内置插件（番茄专注、周度报告、竞赛消息雷达、学习通通知）
└─ src-tauri/            # Rust 侧：数据读写(原子写)、插件目录扫描、应用信息
```

## 开发与构建

前置：Node ≥ 18、Rust ≥ 1.77（Windows 需 VS C++ 构建工具与 WebView2，Linux 需 webkit2gtk-4.1）。

```bash
npm install

# 桌面开发模式（热重载）
npm run tauri dev

# 桌面打包
npm run tauri build          # Windows 出 nsis/msi；Linux 出 deb/appimage
```

### Linux 依赖

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Android

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
# 安装 Android Studio（含 SDK + NDK），并设置 ANDROID_HOME / NDK_HOME
npm run tauri android init   # 生成 gen/android 工程（图标已由 tauri icon 生成到对应 mipmap）
npm run tauri android dev    # 真机/模拟器调试
npm run tauri android build  # 产出 APK/AAB
```

界面已做移动端适配：窄屏下侧栏变为底部导航，四象限/时间块单列排布，拖拽用指针事件实现（触摸可用）。

## 捕获：从微信 / 网页把事件拖进来

三种入口（拖放已在窗口配置中启用原生 HTML5 拖放 `dragDropEnabled: false`）：

1. **拖文本/链接**：在浏览器、支持拖拽的应用里选中文字或地址栏图标，直接拖到潮衡窗口任意位置
2. **拖图片/文件**：把聊天里的图片、Explorer 里的截图文件拖进来（微信聊天窗口的图片可直接拖出）
3. **粘贴兜底**：微信不支持拖文字，就在聊天里选中 → 复制（截图用 Alt+A 会自动进剪贴板）→ 切到潮衡按 `Ctrl+V`

行为规则：

- 文本命中日期+时间 → **自动创建任务 + 对应时间的时间块**（识别区间可给时长，如"2点到4点"→2小时），toast 可「查看/调整」
- 只命中日期 → 时间块先放当天 09:00，toast 一键调整
- 没有日期 → 存入任务池（默认象限按期限远近猜 I / II，分类按关键词猜：会议→工作、考试→学习、健身→运动、聚餐→生活）
- 图片/截图 → 弹出确认卡：预览 + 标题 + 日期/时间/时长/分类，确认后图片作为附件存在任务上（四象限卡片显示 📷，抽屉里看大图）

解析器在 `src/timeParser.js`，纯规则实现（相对日、星期、X月X日、X号、月底、时段词、X点半、HH:MM、区间连接词），不联网、零依赖。图片内的文字识别（OCR）暂未内置——如需"截图里自动认时间"，后续可接 tesseract（离线）或系统 OCR。

## 插件开发指南

每个插件是一个文件夹：

```
plugins/
└─ my-plugin/
   ├─ manifest.json
   └─ main.js
```

`manifest.json`：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "author": "you",
  "icon": "✨",
  "description": "它做什么",
  "permissions": ["ui", "tasks", "blocks", "storage", "notify", "events", "http", "openUrl", "timeParse"],
  "entry": "main.js"
}
```

把文件夹放进 **设置 → 数据** 里显示的目录下的 `plugins/` 子目录（Android 上暂不支持外部目录扫描，可用内置插件方式），回到设置点「重新扫描」即可。

`main.js` 在严格模式的函数沙箱中执行，唯一入口是注入的 `tide` 对象：

```js
// 视图：往侧边栏加一页
tide.ui.registerView({
  id: "my-view", title: "我的页", icon: "✨",
  render(el) { el.textContent = "你好"; },
});

// 任务动作：出现在任务详情抽屉
tide.ui.registerTaskAction({
  id: "drink", label: "标记为小目标", icon: "☕",
  run(task) { tide.tasks.update(task.id, { tags: [...(task.tags||[]), "小目标"] }); },
});

// 数据（均为异步/同步安全拷贝）
tide.tasks.list(); tide.tasks.create({ title: "新任务", quad: 2 });
tide.blocks.list("2026-09-05"); tide.blocks.create({ start: "10:00", durMin: 45, title: "读书" });

// 插件私有存储（随主数据一起持久化）
await tide.storage.set("count", 1); await tide.storage.get("count", 0);

// 通知与事件
tide.notify("完成了一件事");
tide.events.on("pomodoro:finished", (e) => {});
tide.events.emit("my-plugin:something", {});

// 网络：Rust 端抓取，绕开 WebView CORS（仅 http/https）
const res = await tide.http.get("https://api.example.com/list?page=1");
// res = { status, body, finalUrl, contentType }

// 会话化请求：Cookie Jar 保持登录态（适合需要登录的接口，如学习通）
const sid = await tide.http.session();
await tide.http.fetch(sid, "POST", "https://example.com/login", {
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "uname=a&password=b",
});
const r2 = await tide.http.fetch(sid, "GET", "https://example.com/feed");
// r2 = { status, body, finalUrl, contentType, cookies }

// 打开系统浏览器
tide.util.openUrl("https://example.com");

// 复用主程序的中文时间解析（捕获引擎同款）
const p = tide.util.parseWhen("明天下午3点到4点 讨论开题"); // { date, startMin, endMin, title }
tide.util.guessCategory(text); // 按关键词猜分类 work/study/sport/life/rest
tide.util.guessQuad(dateStr);  // 按期限猜象限
tide.util.navigate("timeblock"); // 跳转到指定视图

// DES-ECB/PKCS5 加密（RustCrypto 实现，超星等平台登录加密用）
const hexPwd = await tide.util.desEncryptHex("password", "u2oh6Vu^");

// 工具
tide.util.today(); tide.util.addDays("2026-09-05", 1);
tide.util.mmOf("09:30"); tide.util.hhmmOf(570); tide.util.durLabel(90);
```

- 内置插件 `public/plugins/gx-news/`（竞赛消息雷达）：`tide.http.get` 抓取摩课云竞赛平台公告、关键词/类型/月份/已读过滤、`openUrl` 打开详情、`parseWhen` 一键转提醒。
- 内置插件 `public/plugins/chaoxing-notify/`（学习通通知）：需要登录态的示例——`http.session/fetch` 保持 Cookie、`desEncryptHex` 在本机完成超星 DES 登录加密（改造自 chaoxing-notify-skill）。注意：学习通「消息中心」接口有平台 IP 白名单，被拒时插件会明确提示；课程列表与通知分享码查询不受影响。

## 设计来源

- 03 [权衡 · 四象限决策台](../ui-概念稿/03-权衡-四象限决策.html)
- 04 [潮汐 · 时间块规划轴](../ui-概念稿/04-潮汐-时间块规划.html)
