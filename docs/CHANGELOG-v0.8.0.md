# Le时间管理 v0.8.0

## 加载性能

- 内置插件 manifest 改为直接读取构建期生成的 `pluginCatalog.js`，减少启动时 12 次本地资源请求。
- 插件代码仍并行读取，但注册执行之间主动让出 UI 主线程，降低课程表、考试日历等大插件连续解析造成的界面卡顿。
- 插件入口代码增加内存 Promise 缓存与 `force-cache`，同一次运行中重扫/启停不重复读取相同内置入口。
- Tauri `http_get` 改为共享 `reqwest::Client`，复用 TCP/TLS 连接池；连接超时 6 秒、普通请求总超时 15 秒。
- 登录态 HTTP 会话保留独立 Cookie Jar，同时加入连接池和 6 秒连接超时，总超时调整为 18 秒。

## PushPlus 微信推送

- `微信提醒推送` 升级至 1.1.0，新增 PushPlus（pushplus.plus）主通道。
- 使用 POST JSON 调用 `/send`，渠道固定为 `wechat`，支持 Token、可选 Topic 群组编码与测试消息。
- 支持时间块开始前推送和任务截止多级预警推送。
- Token/SendKey 默认密码框显示，可手动显示/隐藏。
- 兼容 v0.7.0 及以前保存的 Server酱 SendKey，不强制迁移。

## 说明

PushPlus 属于第三方推送服务。Le时间管理只在用户开启推送时，将提醒标题/内容和用户配置的 Token 发送给 PushPlus；Token 保存在本地插件存储中。
