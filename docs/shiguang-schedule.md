# 时光课程表插件

> 本文以下“使用／复用范围”描述的是早期 JavaScript 原型，已不作为原版移植的验收结果。当前正在直接集成用户提供的 Kotlin/Compose 工程，进度和构建方法见 [原版移植记录](shiguang-native-port.md)。

入口：Le时间管理侧栏“拾光课表”，插件市场可停用。Windows / Android 共用 JavaScript 入口，当前工作区已注册；旧安装包需重新构建才包含它。微信小程序尚未移植此插件。

## 使用
1. 在“学期与节次”设置第一周内的开学日期、学期周数及作息时间。默认作息是可编辑起点，不代表任何学校的实际作息。
2. 添加课程：课程名、老师、教室、星期、节次或自定义时间，周次可写 `1-16`、`1,3,5`，也可点击单周/双周。
3. 切换周次，或只看今天。点击课程修改；删除后可使用提示中的撤销。
4. “导入 / 导出”支持拾光单课表 JSON；含 allTables 的 JSON 备份可选择其中一个课表。先预览，再确认替换，不影响已有时间块。CBOR 二进制备份、学校网页适配脚本、WebDAV 和系统小组件尚未移植。
5. “将本周加入时间块”添加本周全部课程。名称、日期、时间及长度相同的项目跳过；任何时间冲突会使本次添加停止。后续修改课表不自动覆盖已经创建的时间块。
6. JSON 可用于拾光兼容的课表备份；ICS 为全学期逐次事件、本地浮动时间，导入目标日历时核对时区。文件下载依赖宿主浏览器/WebView 支持，Android 下载和原生文件选择尚未真机验收。

## 复用范围

上游：XingHeYuZhuan/shiguangschedule，输入为用户提供的 shiguangschedule-main.zip。课程导入导出 DTO 从 Kotlin 数据模型移植为 JavaScript；未嵌入 Kotlin/Compose UI。课程色值和备注随 JSON 保留，界面使用Le时间管理统一配色。许可证原文与来源校验值保存在插件目录 LICENSE、NOTICE.md，页面底部可查阅。

插件目录：`le-time-management/public/plugins/shiguang-schedule/`。维护 model.js 与 ui.js 后运行 `node tools/build-schedule-plugin.js` 生成独立入口 main.js。

验证：`node le-time-management/scripts/test-schedule.mjs`；`npm --prefix le-time-management run build`。本次完成模型与时间块回归测试，及浏览器新增课程、单周切换、再次编辑、删除验收。
