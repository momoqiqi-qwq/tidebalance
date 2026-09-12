# Le时间管理 v0.9.1

## 关于与版本治理

- 设置页“关于”升级为结构化产品信息：当前版本、运行平台、技术框架、本版本说明、主要开源项目与许可证入口。
- 微信小程序同步更新“关于”内容，不再保留过期的 v0.7.0 文案。
- 新增 `tools/sync-version.js`，以桌面端 `package.json` 为版本单一事实源；构建前自动检查 Tauri、Cargo 和小程序元数据是否一致。
- Rust 包版本与产品版本对齐，HTTP User-Agent 自动使用当前 Cargo 包版本。

## 代码优化

- 将桌面端“关于”从大型 `settings.js` 中拆为独立 `views/aboutCard.js`，降低设置页复杂度。
- 移除设置页未使用的 `pluginIcon()` 死代码。
- `app_info` 增加 CPU 架构信息，关于页可显示更完整的运行环境。
- 新增可随应用打开的 `CHANGELOG.md` 与 `OPEN_SOURCE_NOTICES.md`。

## 兼容性

- 不改变任务、时间块、插件状态、提醒设置和备份 JSON 结构。
- v0.9.0 数据可直接继续使用。
