# 潮衡 TideBalance

### ✨ 项目简介

**潮衡**是一款本地优先的时间管理桌面/移动应用，把 **03「权衡」四象限决策台** 与 **04「潮汐」时间块规划轴** 两个设计方向融合成一个产品：先用四象限决定"该做什么"，再把任务拖进一天的时间格子里。基于 **Tauri 2 + 原生 JS** 构建，一套代码可打包 Windows / Linux / Android；数据只存在本机单个 JSON 文件里，无账号、无联网。它还能"听懂"中文时间——把微信聊天、网页文字直接拖进来，自动提取日期并在对应时间创建事件。

### 🎨 主要特点

- 🀫 **四象限决策**：重要/紧急四象限管理任务，象限面积按权重变形，详情抽屉一键改象限/耗时/截止
- 🌊 **时间块规划**：任务池拖进 24 小时时间轴（鼠标/触摸通用），15 分钟吸附、"现在"红线、7 天节奏、明日预告
- 📥 **中文时间捕获**：拖入/粘贴聊天文字、网页链接、截图 → 自动解析"明天下午3点到4点"这类表达 → 在对应时间创建事件
- 🧩 **插件系统**：内置「番茄专注」「周度报告」「竞赛消息雷达」「学习通通知」「警大门户通知」，第三方插件放进 `plugins/` 目录即可被发现，提供视图注册 / 任务动作 / 存储 / 事件 / HTTP 会话 / DES+RSA 加密 / 中文时间解析 API
- 🔒 **本地优先**：单 JSON 存储、原子写入、备份导出/导入，不上传任何数据
- 📱 **多平台**：Windows 安装器已验证，Linux（deb/AppImage）与 Android（APK）一套代码构建

### 📦 包含模块

1. **四象限视图**（`src/views/quadrant.js`）—— 象限网格、任务卡片、详情抽屉
2. **时间块视图**（`src/views/timeblock.js`）—— 任务池、时间轴画布、拖拽调度、统计侧栏
3. **捕获引擎**（`src/capture.js` + `src/timeParser.js`）—— 全局拖放/粘贴入口、零依赖中文时间解析器
4. **插件宿主**（`src/pluginHost.js`）—— 沙箱加载、受控 API、内置插件（`public/plugins/`）
5. **Rust 后端**（`src-tauri/`）—— 数据原子读写、插件目录扫描、应用信息
6. **设置中心**（`src/views/settings.js`）—— 数据管理、插件启停、重新扫描

### 🛠️ 如何使用

1. **直接运行**：下载 Release 中的 `TideBalance_x64-setup.exe` 安装，或用仓库内构建产物 `tidebalance.exe`
2. **从源码构建**：

   ```bash
   cd tidebalance
   npm install
   npm run tauri dev      # 开发模式
   npm run tauri build    # 打包 Windows NSIS/MSI、Linux deb/AppImage
   npm run tauri android build   # Android APK（需 SDK/NDK，步骤见 README）
   ```

3. **捕获事件**：复制一条带时间的消息（如"周五下午4点半 项目周会"），到潮衡按 `Ctrl+V`，事件自动落在对应时间
4. **写一个插件**：建一个含 `manifest.json` + `main.js` 的文件夹放进数据目录 `plugins/`，回到设置点「重新扫描」

### ❓ 效果演示

| 四象限（权衡） | 时间块（潮汐） |
|---|---|
| ![四象限](ui-概念稿/renders/03.png) | ![时间块](ui-概念稿/renders/04.png) |

粘贴「明天下午3点到4点 与导师讨论开题修改」后的真实结果：任务自动进入象限 I（截止 09/07），时间块落在明天 15:00–16:00，右侧「明日预告」同步显示。

### 🙏 贡献

欢迎 Issue 与 PR：时间解析规则扩充（`src/timeParser.js`）、新内置插件、Linux/Android 适配反馈都特别有价值。插件开发 API 文档见 [`tidebalance/README.md`](./tidebalance/README.md)。

> 本 README 按照 [App-Showcase-Template](https://github.com/yxs2003/App-Showcase-Template) 的展示流程编写。
