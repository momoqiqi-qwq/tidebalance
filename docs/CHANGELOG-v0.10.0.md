# Le时间管理 v0.10.0

## 新增

- 插件中心：搜索、启用/停用、内置/用户来源筛选。
- 设置 → 插件：搜索、筛选、逐项运行时 API 权限开关。
- 全局搜索/命令面板：Ctrl/Cmd+K，搜索任务、时间块、插件和常用命令。
- 桌面全局快捷键：默认 Ctrl/Cmd+Shift+Space 打开命令面板，Ctrl/Cmd+Shift+A 快速捕获，可在设置修改。
- 可选 WebDAV JSON 快照同步：手动上传/下载，密码不保存。
- 日程冲突检测 2.0：冲突预览、替代时段、一键改排。
- 插件 API：新增 `blocks.preview()`、`blocks.createSmart()`。
- 微信小程序插件页新增搜索和筛选。

## 优化

- 快速捕获和警大通知“转提醒”接入冲突检测，减少静默重叠。
- 插件声明权限升级为 `tide` API 运行时校验，撤销权限后立即生效。
- 关于页同步更新本版本功能与 Tauri Global Shortcut 开源依赖说明。

## 警大通知登录说明

- 仍然只保存学号，不保存密码。
- 图片验证码仍需人工输入，本版本未加入 OCR。
- 当前应用运行期间若 SSO CASTGC/Cookie 仍有效，会优先尝试静默续期；退出应用后内存 Cookie 会丢失，因此不能承诺重启后自动登录。

## 兼容与构建

- 主数据 JSON 继续兼容 v0.9.x；新增的同步/快捷键/插件权限配置都放在 settings/plugin state 内。
- 桌面端新增 `@tauri-apps/plugin-global-shortcut` / `tauri-plugin-global-shortcut` 依赖。
