# 潮衡插件图标说明

> 适用：潮衡 TideBalance 0.1.0+ ｜ 对应源码：`src/icons.js`、`src/shell.js`、`src/views/settings.js`、`public/icons/`
> 图标体系只有两处逻辑：`src/icons.js`（6 行）+ `src/shell.js` 的 `PLUGIN_ICONS`。没有构建步骤、没有图标字体、没有 SVG sprite。

---

## 一、两层图标体系

插件在界面上会用到**两种**图标，先分清你要改哪一层：

| 层 | 名字 | 数据来源 | 出现位置 | 规格 |
|---|---|---|---|---|
| **A 层** | 字形图标 glyph | `manifest.json` 的 `icon` → `tide.ui.registerView({ icon })` | 侧栏插件页短标识 | 单个汉字或单字符串 |
| **B 层** | 随包 PNG 图标 | `public/icons/<key>.png`，key 由 `src/icons.js` 的 `KEYS` 白名单放行 | 侧栏导航方块、插件市场卡片、设置页插件列表、关怀页 | **128×128 PNG / RGBA / 透明底** |
| — | 兜底 | `appIcon()` 内联映射 | 未知 key | 回落 `market.png`（拼图） |
| — | 小程序 tabBar | `miniprogram/images/tab/<name>.png` | 小程序底部导航 | **81×81**（内含 70×70 图形） |

一句话结论：
**侧栏文字标识用 A 层（一个字就够），凡是"方块图标"的视觉位置都走 B 层 PNG；插件没配 PNG 时显示拼图兜底，不会报错、不会出现裂图。**

---

## 二、B 层 PNG 图标规范

| 项目 | 要求 | 说明 |
|---|---|---|
| 尺寸 | **128 × 128 px** | 现有 13 个图标全部为 128×128；源素材从 512px 源图 LANCZOS 缩放而来 |
| 格式 | PNG，**RGBA（带 Alpha）** | 底色必须透明，卡片/侧栏自带底色 |
| 命名 | `<key>.png`，全小写 | key 通常等于插件 `id`（如 `chaoxing-notify.png`） |
| 位深 | 8 bit/通道 | 与现有素材一致 |
| 风格 | Magnific（原 Freepik）**Lineal Color** | 线性彩色插画风；换风格会与已有图标割裂 |
| 体积 | 建议 < 30 KB | 随包离线打包，进 APK |
| 位置 | `tidebalance/public/icons/` | Vite 会把 `public/` 原样拷到产物根，运行时路径 `/icons/<key>.png` |

> 图形本身要有**透明留白**：图案不要贴满画布边缘。现有素材的图形占画布约 80%，四周留白，因此在 30px 的侧栏方块里仍然清晰。

---

## 三、key 解析规则（`src/icons.js` 全文）

```js
import { el } from "./ui.js";
const KEYS = new Set(["quadrant", "timeblock", "elder", "market", "settings",
  "pomodoro", "weekly-report", "elder-care", "gx-news", "chaoxing-notify",
  "cppu-notify", "wechat-push", "capture"]);
export function appIcon(key) {
  const name = key === "shiguang-schedule" ? "timeblock" : KEYS.has(key) ? key : "market";
  return el("img", { class: "app-icon", src: `/icons/${name}.png`, alt: "", "aria-hidden": "true", width: 32, height: 32 });
}
```

规则逐条：

1. **别名优先**：`shiguang-schedule` → 复用 `timeblock.png`（时光课程表与时间块同源）。
2. **白名单**：`KEYS` 里的 key 直接用 `public/icons/<key>.png`。
3. **兜底**：不在 `KEYS` 且不是别名 → 一律 `market.png`（拼图）。
   **换句话说：只放 PNG 文件、不写进 `KEYS`，图标不会生效，会显示拼图。**
4. 输出元素固定为 `<img class="app-icon" width="32" height="32" aria-hidden="true">`，实际显示尺寸由 CSS 覆盖（见第六节）。

已知的两个特例（不是通用规则，别照抄）：

- `src/views/settings.js`：考试日历直接写死一个字形 —— `rec.id === "exam-calendar" ? "考" : appIcon(rec.id)`；`weekly-report` 卡片额外加 `alt` 类（紫色渐变底）。
- `src/shell.js` 的 `PLUGIN_ICONS` 只影响**侧栏字形**，与 PNG 无关。

---

## 四、给插件加一个 PNG 图标（5 步）

以内置插件 `cn-holiday`（现在还是拼图兜底）为例：

**1. 在采集脚本里登记素材**（`tools/fetch-ui-icons.py` 第 4 行的 `items` 列表）：

```python
('cn-holiday', 'calendar', 1234567, 'Freepik'),
#  key           slug      icon-id   作者
```

**2. 生成 128×128 RGBA PNG**（脚本会把 `cdn-icons-png.magnific.com/512/<id//1000>/<id>.png` 缩放后写入 `tidebalance/public/icons/<key>.png`）：

```bash
python tools/fetch-ui-icons.py
# Downloaded and bundled 14 icons; mini tab icons synchronized.
```

自绘图标（离线、不联网）用等价的最小脚本即可：

```python
from PIL import Image
src = Image.open("my-art.png").convert("RGBA")
src.resize((128, 128), Image.Resampling.LANCZOS).save("tidebalance/public/icons/cn-holiday.png")
```

**3. 放行 key**：把 key 加进 `src/icons.js` 的 `KEYS` 集合（不加就是拼图）：

```js
const KEYS = new Set([..., "cn-holiday", "exam-calendar"]);
```

**4. 校验**（尺寸 + 哈希 + 授权三件套）：

```powershell
# 尺寸与位深
$b=[IO.File]::ReadAllBytes("tidebalance/public/icons/cn-holiday.png")
"$([int]$b[16]*16777216+[int]$b[17]*65536+[int]$b[18]*256+[int]$b[19]) x $([int]$b[20]*16777216+[int]$b[21]*65536+[int]$b[22]*256+[int]$b[23]) bitDepth=$($b[24]) colorType=$($b[25])"
# 期望：128 x 128 bitDepth=8 colorType=6（RGBA）
```

**5. 补授权**：`credits.json` 追加一条（脚本会自动写），并同步 `ATTRIBUTION.md` 列表 —— 见第九节。自绘素材同样要在 `ATTRIBUTION.md` 注明"原创，CC0/项目内使用"。

> 内置插件还要确保 `id` 已在 `pluginHost.js` 的 `BUILTIN_IDS` 里；外部插件（数据目录 `plugins/`）**没有 PNG 图层**，只能用 A 层字形 + 兜底拼图。

---

## 五、A 层字形图标规范

插件的短标识由插件自己声明，宿主按"宿主映射 → 插件声明 → 默认值"取第一个存在的：

```js
// src/shell.js
const PLUGIN_ICONS = { "pomodoro": "番", "weekly-report": "报", "elder-care": "护",
  "gx-news": "赛", "chaoxing-notify": "学", "cppu-notify": "警", "wechat-push": "微" };
// viewDef():  PLUGIN_ICONS[pluginId] || v.icon || "件"
```

写法要求：

| 要求 | 说明 |
|---|---|
| **1 个字符最佳，最多 2 个** | 侧栏/工坊表单都按 1–2 字符设计（`upload.html` 的 `maxlength="2"`） |
| **优先用汉字** | 汉字在任何系统字体下宽度稳定；emoji 在 Win/Android/Linux 上字形与配色都不同，会跳行 |
| **不要用多字词** | "番茄钟" 会把侧栏撑开；用 "番" |
| **避免同义撞车** | 现有已占用：番 报 护 赛 学 警 微 假 考 课 潮 |
| 保持稳定 | 字形是用户的"肌肉记忆"锚点，改版时不要随手改 |

`tide.ui.registerView({ id, title, icon, render })` 与 `manifest.json` 的 `icon` 建议**写成同一个字**（内置插件都是这么做的）：

```json
{ "id": "my-plugin", "name": "我的插件", "icon": "潮", ... }
```
```js
tide.ui.registerView({ id: "my-plugin", title: "我的插件", icon: "潮", render });
```

任务动作（`registerTaskAction`）与弹出菜单的 `icon` 是**纯文本前缀**，只接受字形，不接受 PNG：

```js
tide.ui.registerTaskAction({ id: "drink", label: "标记为小目标", icon: "☕", run(task) {} });
```

---

## 六、各处的实际渲染尺寸

PNG 一律 128×128，CSS 负责缩放到目标尺寸（`src/styles.css`）：

| 位置 | 选择器 | 显示尺寸 | 容器 |
|---|---|---|---|
| 默认（`appIcon` 通用） | `.app-icon` | 30 × 30 | 行内，`object-fit: contain` |
| 侧栏导航图标 | `.nav button .ic` | 38 × 38（方块底） | 圆角 11px，底色 `#EDF5F6`；选中 `#FFF2BD` |
| 插件市场卡片 | `.mcard .mi .app-icon` | 40 × 40 | 卡片 `.mi` 40×40 圆角 12px，底色 `#E1EEF3` |
| 设置页插件列表 | `.plug-ic .app-icon` | 40 × 40 | 深蓝→海蓝渐变底；`weekly-report` 用 `.alt` 紫渐变 |
| 窄屏（≤760px）侧栏 | `.nav button .ic .app-icon` | 27 × 27 | 图标方块缩到 32×32 |
| 关怀页徽标 | `.care-header .elder-badge .app-icon` | 30 × 30（白底圆形） | 深色横幅上 |
| 关怀页空态 | `.care-empty .app-icon` | 64 × 64 | 虚线框中央 |

要点：**为 27px 渲染做设计**。细节在 27px 下会糊成一团，图标主体要占满、笔画要粗、颜色对比要强。

---

## 七、小程序 tabBar 图标

小程序的 5 个 tab 图标由桌面端同一批素材派生，脚本在 `tools/sync-tab-icons.py`：

```python
for name in ['quadrant', 'timeblock', 'elder', 'capture', 'settings']:
    icon = Image.open(root / f'tidebalance/public/icons/{name}.png').convert('RGBA').resize((70,70), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (81,81))
    canvas.alpha_composite(icon, (5,5))          # 70×70 居中 + 四周 5px 留白
    for suffix in ['', '-on']:
        canvas.save(out / f'{name}{suffix}.png')
```

- 输出到 `miniprogram/images/tab/`，命名 `<name>.png` 与 `<name>-on.png`（选中态）。
- 重新生成：`node tools/gen-miniprogram-tab-icons.js`（内部调 python 脚本），或构建时由 `tools/fetch-ui-icons.py` 一并同步。
- 在 `miniprogram/app.json` 的 `tabBar.list[].iconPath` 引用；选中态用 `selectedIconPath`。
- **现状**：5 组 `-on` 与常态文件**逐字节相同**（`Get-FileHash` 校验一致），即选中态目前只靠文字颜色区分。要让选中态"亮起来"，在 `sync-tab-icons.py` 里给 `-on` 单独做处理（例如提高饱和度 / 换成主色描边），再重新生成。
- 小程序**没有插件宿主**，所以外部插件不需要也不能提供 tabBar 图标。

---

## 八、应用图标（与插件图标不是一回事）

| 目标 | 位置 | 生成方式 |
|---|---|---|
| Windows / Linux / Android 应用图标 | `src-tauri/icons/`（`32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`），由 `tauri.conf.json` 的 `bundle.icon` 引用 | `npm run tauri icon <1024源图.png>`（自动出全套 + Android mipmap） |
| Web 页签图标 | `index.html` 里 `<link rel="icon" href="/app-icon.png" />` | **当前 `tidebalance/public/app-icon.png` 不存在**，浏览器会 404 → 放一张 PNG（建议 512×512）到 `public/app-icon.png`，或把这一行改指向已存在的图标 |

---

## 九、授权与署名（硬性要求）

随包图标来自 **Magnific（原 Freepik）Lineal Color** 素材库，署名信息是仓库的一部分，**新增图标必须同步补**：

| 文件 | 作用 |
|---|---|
| `public/icons/credits.json` | 结构化台账：`key / author / source / cdn / sha256`（由采集脚本自动写） |
| `public/icons/ATTRIBUTION.md` | 人类可读清单：`- <key>: [作者](来源页)` |
| 设置 → 关于 | 展示 `图标：Magnific / Freepik · Eucalyp、wanicon、Good Ware、Kiranshastry、Smashicons`，并链到 `/icons/ATTRIBUTION.md` |

`sha256` 字段记录的是**落地文件**的哈希，用于确认素材未被意外替换：

```powershell
(Get-FileHash tidebalance/public/icons/cn-holiday.png -Algorithm SHA256).Hash.ToLower()
```

红线：素材遵循原作者与平台许可，**不得把素材作为独立图标库转售**；二次分发本项目时保留 `ATTRIBUTION.md` 与设置页署名。自绘或 CC0 素材请在同一清单里注明授权来源。

---

## 十、当前图标清单（13 个 PNG）

| key | 作者 | 用途 |
|---|---|---|
| quadrant | Freepik | 四象限视图 |
| timeblock | wanicon | 时间块视图（`shiguang-schedule` 也复用） |
| elder | Eucalyp | 安心日常视图 |
| market | Freepik | 插件市场（**同时也是所有未知 key 的兜底**） |
| settings | Good Ware | 设置视图 |
| pomodoro | Freepik | 番茄专注插件 |
| weekly-report | Freepik | 周度报告插件 |
| elder-care | Kiranshastry | 长辈照护插件 |
| gx-news | Freepik | 竞赛消息雷达插件 |
| chaoxing-notify | Freepik | 学习通通知插件 |
| cppu-notify | Freepik | 警大门户通知插件 |
| wechat-push | Smashicons | 微信提醒推送插件 |
| capture | Freepik | 捕获页 / 小程序捕获 tab |

完整来源链接与 sha256 见 `public/icons/credits.json`。

---

## 十一、已知缺口（可直接当作待办）

| 缺口 | 表现 | 修法 |
|---|---|---|
| `cn-holiday` 无 PNG | 侧栏/市场/设置里显示拼图兜底 | 第四节 5 步 |
| `exam-calendar` 无 PNG | 设置页写死显示 "考" 字形，市场卡片显示拼图 | 同上；顺带把 `settings.js` 的写死分支删掉 |
| `public/app-icon.png` 缺失 | 浏览器 favicon 404 | 第八节 |
| 小程序 `-on` 与常态同图 | tab 选中态只有文字变色 | 第七节 |
| 外部插件无 PNG 通道 | 用户插件只能用字形 + 拼图 | 若要做，需在 `appIcon()` 增加从插件目录读图的分支 |

---

## 十二、提交前自检清单

- [ ] PNG 是 **128×128、RGBA、透明底**（`colorType=6`）
- [ ] 文件名 = 插件 `id`，全小写，放 `tidebalance/public/icons/`
- [ ] key 已加进 `src/icons.js` 的 `KEYS`（否则拼图兜底）
- [ ] `manifest.json` 的 `icon` 与 `registerView({ icon })` 是同一个字，长度 1–2
- [ ] `credits.json` 与 `ATTRIBUTION.md` 都已补记录（含页码链接与作者）
- [ ] 27px（窄屏侧栏）下图形仍可辨认
- [ ] `npm run tauri dev` 进 设置 → 插件、插件市场、侧栏三处各看一眼，无裂图、无拼图兜底
- [ ] 内置插件：`id` 已在 `pluginHost.js` 的 `BUILTIN_IDS` 中
