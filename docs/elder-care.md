# 安心日常：功能与设备接入

Windows / Android 共用 `tidebalance/src/views/elder.js`；微信小程序入口为 `miniprogram/pages/elder/`。

## 日常使用

新用户默认进入安心日常。今天的安排、添加提醒、家人协助三个入口，大字与更大字切换。提醒支持每天、工作日、指定日期一次；完成、撤销完成、10 分钟后提醒、编辑、暂停和删除。本地保存，不要求账号。已有长辈照护插件的提醒自动迁移并由统一引擎调度，避免两个计时器重复提醒。

用药预设只是填写入口，具体时间和内容由用户按医嘱核对后保存。语音结果也必须核对并保存，不会直接生成未确认的用药计划。

## 各端能力与边界

| 能力 | Windows / Android | 微信小程序 |
|---|---|---|
| 大字提醒、今日完成、稍后提醒 | 已实现 | 已实现 |
| 朗读与语音输入 | Windows 使用设备 Web Speech 支持；Android 使用原生 TTS 和系统语音识别 | WechatSI 可选适配，默认未启用；可用输入法麦克风 |
| 家人联系 | 保存姓名电话，调用拨号链接（取决于系统） | 调用微信拨号确认 |
| 音箱/药盒 | HTTP 网关或社区插件通道 | HTTPS 网关、原生 BLE |
| 跌倒事件 | 已提供插件事件接口、去重及待核实提示 | 尚未接入跌倒传感器 |

**当前提醒引擎在前台运行。** 关闭应用、小程序切后台或系统休眠时，不保证本地提醒继续运行。全天提醒需设备/服务保存并执行计划；本版发送到点事件，不会自动把未来计划同步到设备。没有内置某品牌音箱控制、云端家庭账号同步或远程家属消息投递；家人协助配置目前保存在当前设备。

Android 原生语音依赖设备已安装中文 TTS 和语音识别服务；无服务、取消、权限或连接失败均显示反馈。小程序后台和蓝牙权限依赖微信及系统设置。本次未连接实体药盒、音箱、跌倒传感器或 Android 真机，不能视为硬件联调完成。

## 小程序语音配置

管理员先在微信公众平台给本小程序申请并启用 WechatSI，获取控制台允许使用的版本号。在 `miniprogram/app.json` 根级添加：

```json
"plugins": { "WechatSI": { "version": "控制台批准的版本号", "provider": "wx069ba97219f66d99" } }
```

再将 `miniprogram/care-config.js` 的 `wechatSI` 改为 `true`，使用开发者工具真机测试录音授权、中文识别、朗读和取消。未启用前 UI 提示使用输入法语音。[腾讯官方示例](https://github.com/Tencent/Face2FaceTranslator)。网关需加入微信 request 合法域名并使用 HTTPS，开发环境例外不代表正式版支持。

## 设备网关协议

在家人协助填写设备名称、地址、可选令牌，先测试再开启。HTTP POST，Content-Type 为 application/json，可选 Authorization: Bearer。桌面支持 HTTPS 和局域网 HTTP，小程序正式版使用合法域名 HTTPS。

```json
{"version":1,"event":"care.reminder","eventId":"reminder-id@2026-09-09","deviceId":"configured-id","title":"散步","message":"带好钥匙","time":"16:30","sentAt":1788939000000}
```

2xx 只代表网关接收，不代表老人听到或已完成。接收端校验令牌、字段并限制请求大小；按 eventId 和 sentAt 识别重复投递与稍后提醒。失败不会无限重试，界面保留错误。令牌随当前应用数据保存在本机，导出/备份前需自行移除。

BLE 使用相同 JSON 加换行符，UTF-8 编码，串行每次写入至多 20 字节。硬件需缓存分片直到换行再解析（不可对单片独立解码中文）。服务和特征 UUID 由硬件方提供，不能连接任意药盒便自动识别协议。

## 社区插件接口

现有插件的初始化函数接收 tide。注册提醒通道：

```js
tide.care.registerChannel({
  id: "speaker",
  label: "家庭音箱",
  async send(payload) {
    // 在插件中调用真实设备协议；收到网关确认后才返回。
    await sendToConfiguredDevice(payload);
    return { accepted: true };
  }
});
```

通道自动命名为 `插件id:speaker`，在家人协助选择并配置设备；关闭插件后移除通道，已保存设备显示不可用。不要运行不信任的插件：现有 JS 插件在应用上下文执行，并非隔离沙箱。

真实传感器事件经插件校验来源后可调用：

```js
tide.care.reportEvent({ type: "fall", id: "sensor-event-unique-id", deviceId: "家人协助中的设备id" });
```

仅接受该插件名下已启用设备；同插件相同事件 id 去重。界面显示“疑似跌倒，请核实”，需人工确认，不替代紧急呼叫，也没有模拟传感器自动检测。

## 图标与维护

13 个 Magnific 彩色线条图标离线打包在 `tidebalance/public/icons`。来源、作者、校验值见 `credits.json`，设置中可查看署名。小程序 Tab 图标由 `node tools/gen-miniprogram-tab-icons.js` 同步（需要 Python Pillow）。

共享提醒模型修改后运行 `node tools/sync-care-model.js`。验证命令：

```
node tidebalance/scripts/test-care.mjs
node tidebalance/scripts/test-interactions.mjs
node tools/test-miniprogram-core.js
node tools/check-miniprogram.js
npm --prefix tidebalance run build
```
