# 潮衡 TideBalance · 微信小程序版

桌面端（Tauri）的微信小程序移植：**原生 WXML/WXSS/JS 开发**，无 npm 依赖、无构建步骤。
与桌面端共用同一套数据结构（单 JSON：`tasks / blocks / settings / plugins`）和同一份中文时间解析引擎，备份可互相导入恢复。

## 快速开始

1. 微信开发者工具 → **导入项目** → 选择本目录（`miniprogram/`）
2. AppID 默认 `touristappid`（测试号），正式发布前换成自己的小程序 appid
3. 编译运行，无需任何 install/build

## 目录结构

```
miniprogram/
├─ app.js / app.json / app.wxss     # 入口、页面与 tabBar 注册、设计系统（含暗色变量）
├─ theme.json                       # 深浅两套 导航栏/tabBar 主题（darkmode: true）
├─ project.config.json              # appid、es6/enhance 编译设置
├─ core/
│  ├─ store.js                      # 状态 + 派生 + wx 存储持久化（350ms 防抖写盘）
│  ├─ timeParser.js                 # 中文时间解析（自桌面端移植，去 lookbehind）
│  └─ captureFlow.js                # 捕获建块纯函数（buildCapture / durOptions / createFromCapture）
├─ pages/
│  ├─ quadrant/   # 四象限：2×2 象限块 + 任务列表；左滑快捷操作、跨象限搜索、隐藏已完成
│  ├─ timeblock/  # 时间块：近 7 天日期条 + 任务池（点按自动排程 / 长按点轴放置）
│  │              #   + movable 拖拽时间轴 + 概览
│  ├─ capture/    # 捕获：粘贴/读取剪贴板 → 解析预览（日期/时间/时长/分类可点改）→ 一键创建
│  ├─ settings/   # 设置：数据统计、备份导出/导入、关于
│  └─ task/       # 任务详情：象限/预估/截止/项目/备注、排入今天、附件预览、删除
└─ images/tab/                      # tabBar 图标（tools 脚本生成，选中态为两主题通用青色）
```

## 与桌面端的交互差异

| 桌面端 | 小程序版 | 原因 |
|---|---|---|
| 从微信窗口拖文本进来自动捕获 | 「捕获」tab：复制 → 读取剪贴板 → 解析预览（**日期/开始/时长/分类可直接点改**）→ 确认创建 | 小程序没有跨应用拖拽与全局粘贴监听 |
| 鼠标/触摸拖任务进时间轴 | 点任务卡**自动排到第一个空闲位**；**长按任务卡进入放置模式，点时间轴任意位置放置**；时间块用 movable 手势上下拖动微调（15 分钟吸附） | 跨容器拖拽在移动端手势冲突严重 |
| 时间块右键菜单 | 点时间块 → ActionSheet（时长±/换分类/移回任务池/删除） | 无右键 |
| 点时间轴空白快速加块 | 保留：点空白 → 弹窗输入标题 | — |
| 顶部日期切换 | ‹ ◎ › 导航 + picker + **近 7 天日期条**（横滑快切） | 移动端可达性 |
| 插件系统 | 不提供 | 插件依赖 Tauri 文件系统/Rust 网络桥 |

**移动端专属增强**（桌面端没有的）：暗色模式（跟随系统，`darkmode` + `prefers-color-scheme` 双主题变量）、任务卡**左滑快捷操作**（完成/删除，跟手拖动 + 吸附动画）、**跨象限任务搜索**（标题/备注/项目，结果卡带象限角标）、「隐藏已完成」开关（记住偏好）、捕获结果可调整预览、长按放置模式（带震动反馈）、任务图片附件点击放大（dataURL 自动落临时文件后 `previewImage`）、存储占用警告与保存失败提示、页面分享（朋友+朋友圈）。

## 关键实现备忘

- **持久化**：`wx.setStorageSync("tidebalance-data", state)`，与桌面端同字段名；设置页「导出备份」复制到剪贴板的 JSON 可直接粘进桌面端导入，反之亦然。
- **跨页跳转**：捕获页「查看时间块」通过 `getApp().globalData.pendingTimeblockDate` 把目标日期传给时间块页（switchTab 不能带参）。
- **时间轴几何**：07:00–24:00，54px/小时，15 分钟吸附；`movable-area` 顶部偏移 10px，与时刻行对齐，画布容器**垂直方向不允许内边距**（否则拖拽坐标错位）。
- **兼容性**：`timeParser` 的「X号」匹配改用捕获组代替 lookbehind（`(?<!…)`），否则 iOS < 16.4 的 JavaScriptCore 在解析模块时直接抛语法错误。
- **movable-view 细节**：`bindchange` 只认 `source === "touch"/"touch-out-of-bounds"`（setData 引发的 change 也会触发），未移动（tap）时弹操作菜单；拖动中的块加 `dragging` 半透明态。
- **暗色模式**：`app.json darkmode: true` + `theme.json` 管导航栏/tabBar；页面颜色全部走 CSS 变量，`@media (prefers-color-scheme: dark)` 覆盖一套变量即可。深青主色上的文字统一用 `--on-deep`（浅色主题白字 / 暗色主题深字），保证 `.btn.pri`、时间块、选中日期条在两套主题下对比度都达标。
- **长按放置**：`bindlongpress` 进入放置模式（`data.placing`），下一次点时间轴即在该位置创建块；切天、切 tab（onHide）自动取消。
- **左滑操作**：卡片外包 `swipe-wrap`（操作按钮绝对定位在底层，卡片 `translateX` 盖在上面）。touchmove 先做方向判定（|dx|>|dy| 才进入横滑，不干扰页面纵向滚动），拖动中关闭 CSS transition 保证跟手，松手按过半吸附。不使用 `catchtouchmove`，页面滚动不受影响。

## 工具链（仓库根 `tools/`，零依赖）

```bash
node tools/test-miniprogram-core.js        # store + timeParser + captureFlow 共 39 个用例（mock wx）
node tools/check-miniprogram.js            # JSON/页面四件套/图标/require 路径静态校验
node tools/gen-miniprogram-tab-icons.js    # 重新生成 tabBar 图标（SDF 光栅化 + 手写 PNG 编码）
```

## 待办 / 已知限制

- wx 单 key 存储上限 1MB、总量 10MB：含图片附件（dataURL）的桌面备份导入小程序时可能超限
- 未做国际化；tabBar 图标不支持按主题切换，选中态用的是两主题通用的中间亮度青色
