// 生成小程序 tabBar 图标（零依赖：SDF 光栅化 + 手写 PNG 编码）
// 用法：node tools/gen-miniprogram-tab-icons.js
// 输出：miniprogram/images/tab/{quadrant,timeblock,capture,settings}{,-on}.png
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 81; // 微信推荐的 tabBar 图标尺寸
const OUT_DIR = path.join(__dirname, "..", "miniprogram", "images", "tab");

const GRAY = [138, 151, 158];   // 未选中 #8A979E
// 选中态：中等亮度青 #4FA3B8 —— 浅色 tab（白底）与暗色 tab（#10181D）下都有足够对比
const DEEP = [79, 163, 184];

/* ── SDF 工具 ── */
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const aaFill = (d) => sat(0.5 - d);

function rrectD(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}
const rrect = (px, py, cx, cy, hw, hh, r) => aaFill(rrectD(px, py, cx, cy, hw, hh, r));
function ring(px, py, cx, cy, rOuter, rInner) {
  const dist = Math.hypot(px - cx, py - cy);
  const mid = (rOuter + rInner) / 2;
  const half = (rOuter - rInner) / 2;
  return aaFill(Math.abs(dist - mid) - half);
}

/* ── 四个图标形状（81×81 画布，y 向下） ── */
const ICONS = {
  // 四象限：2×2 圆角方块
  quadrant(x, y) {
    return Math.max(
      rrect(x, y, 24, 24, 14, 14, 7),
      rrect(x, y, 57, 24, 14, 14, 7),
      rrect(x, y, 24, 57, 14, 14, 7),
      rrect(x, y, 57, 57, 14, 14, 7),
    );
  },
  // 时间块：三根高低不一的竖条
  timeblock(x, y) {
    return Math.max(
      rrect(x, y, 23, 50.5, 5, 20.5, 5),
      rrect(x, y, 40.5, 42.5, 5, 28.5, 5),
      rrect(x, y, 58, 54.5, 5, 16.5, 5),
    );
  },
  // 捕获：圆角方框 + 加号
  capture(x, y) {
    const outline = aaFill(Math.abs(rrectD(x, y, 40.5, 40.5, 28.5, 28.5, 14)) - 2.5);
    return Math.max(
      outline,
      rrect(x, y, 40.5, 40.5, 12, 4.5, 4.5),
      rrect(x, y, 40.5, 40.5, 4.5, 12, 4.5),
    );
  },
  // 设置：三条滑杆 + 圆环旋钮
  settings(x, y) {
    return Math.max(
      rrect(x, y, 40.5, 23, 28.5, 4.5, 4.5), ring(x, y, 54, 23, 10, 4),
      rrect(x, y, 40.5, 40.5, 28.5, 4.5, 4.5), ring(x, y, 29, 40.5, 10, 4),
      rrect(x, y, 40.5, 58, 28.5, 4.5, 4.5), ring(x, y, 46, 58, 10, 4),
    );
  },
};

/* ── PNG 编码 ── */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── 主流程 ── */
fs.mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const [name, shape] of Object.entries(ICONS)) {
  for (const [suffix, color] of [["", GRAY], ["-on", DEEP]]) {
    const rgba = Buffer.alloc(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const a = shape(x + 0.5, y + 0.5);
        const i = (y * SIZE + x) * 4;
        rgba[i] = color[0];
        rgba[i + 1] = color[1];
        rgba[i + 2] = color[2];
        rgba[i + 3] = Math.round(a * 255);
      }
    }
    const file = path.join(OUT_DIR, `${name}${suffix}.png`);
    fs.writeFileSync(file, encodePng(SIZE, SIZE, rgba));
    count++;
    console.log("生成", path.relative(path.join(__dirname, ".."), file));
  }
}
console.log(`完成：${count} 张图标`);
