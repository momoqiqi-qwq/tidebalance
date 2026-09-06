// 捕获建块流程（纯函数，供捕获页使用、可被 Node 测试覆盖）
// 对应桌面端 capture.js 的 handleText：解析 → 组装任务/时间块字段
const parser = require("./timeParser.js");
const store = require("./store.js");

// 时长可选项（分钟）；解析出的非整刻时长会动态插入
const DUR_STEPS = [15, 30, 45, 60, 90, 120, 180];

function buildCapture(text, base) {
  const p = parser.parseWhen(text, base);
  const cat = parser.guessCategory(text);
  const dur = p.endMin !== null ? p.endMin - p.startMin : 60;
  const estMin = p.endMin !== null ? dur : 60;
  return {
    title: p.title,
    cat,
    quad: parser.guessQuad(p.date, base),
    estMin,
    due: p.date,
    hasDate: !!p.date,
    hasTime: p.startMin !== null,
    // 无时间时给 09:00 兜底（与桌面端一致）
    start: p.startMin !== null ? store.hhmmOf(p.startMin) : "09:00",
    dur,
    note: text.length > 120 ? text.slice(0, 120) + "…" : text,
  };
}

// 时长选择器：把解析出的时长并入档位，返回 {values, index}
function durOptions(estMin) {
  const values = DUR_STEPS.slice();
  if (!values.includes(estMin)) {
    values.push(estMin);
    values.sort((a, b) => a - b);
  }
  return { values, index: values.indexOf(estMin) };
}

function createFromCapture(cap, edit) {
  // edit: {date, start, durMin, cat}（用户可在预览卡上调整）
  const task = store.addTask({
    title: cap.title,
    quad: cap.quad,
    estMin: edit.durMin,
    due: edit.date || null,
    tags: ["捕获"],
    note: cap.note,
  });
  let hasBlock = false;
  if (edit.date) {
    store.addBlock({
      date: edit.date,
      start: edit.start,
      durMin: edit.durMin,
      title: cap.title,
      taskId: task.id,
      cat: edit.cat,
    });
    hasBlock = true;
  }
  return { task, hasBlock };
}

module.exports = { buildCapture, durOptions, createFromCapture, DUR_STEPS };
