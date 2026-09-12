const S = require('./store.js');
const M = require('./careModel.js');
const Voice = require('./careVoice.js');
let timer, showing = false, connection = null, discoverHandler = null, scanTimer = null;
const subs = new Set();
function state() { return M.careState(S.getState()); }
function changed() { S.saveNow(); subs.forEach(fn => fn()); }
function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function act(key, action) { M.recordAction(state(), key, action); changed(); }
function start() { stop(); state(); timer = setInterval(tick, 15000); tick(); }
function stop() { if (timer) clearInterval(timer); timer = null; Voice.cleanup(); }
function tick() {
  if (showing) return;
  const item = M.dueItems(state())[0];
  if (!item) return;
  M.recordAction(state(), item.key, 'delivered'); changed();
  fire(item);
  for (const d of state().devices.filter(x => x.enabled)) deliver(d, item);
  if (state().ble && state().ble.enabled) sendBle(item).catch(() => {});
}
function fire(item, test = false) {
  if (showing) return;
  showing = true;
  wx.vibrateLong({ fail: () => {} });
  if (state().settings.voice && Voice.available()) Voice.speak(item.title + '。' + (item.message || '到时间了'));
  wx.showModal({ title: test ? '提醒试听' : item.title, content: (test ? item.title + '\n' : '') + (item.message || '按自己的节奏，一件一件来。'),
    confirmText: test ? '关闭' : '我做好了', cancelText: '稍后提醒', showCancel: !test,
    success: res => { if (!test) act(item.key, res.confirm ? 'done' : 'snooze'); }, complete: () => { showing = false; } });
}
function deliver(device, item) {
  device.lastStatus = '正在发送'; changed();
  return new Promise(resolve => wx.request({ url: device.url, method: 'POST', timeout: 8000,
    header: { 'content-type': 'application/json', ...(device.token ? { Authorization: 'Bearer ' + device.token } : {}) },
    data: M.reminderPayload(item, device.id),
    success: res => { device.lastStatus = res.statusCode >= 200 && res.statusCode < 300 ? '网关已接收，仍需长辈确认' : '发送失败：HTTP ' + res.statusCode; resolve(res.statusCode >= 200 && res.statusCode < 300); },
    fail: () => { device.lastStatus = '发送失败，请检查地址、网络和小程序合法域名'; resolve(false); }, complete: () => { device.lastAt = Date.now(); changed(); } }));
}
function call(name, args = {}) { return new Promise((resolve, reject) => wx[name]({ ...args, success: resolve, fail: reject })); }
function stopScan() {
  clearTimeout(scanTimer);
  if (discoverHandler) { wx.offBluetoothDeviceFound(discoverHandler); discoverHandler = null; }
  wx.stopBluetoothDevicesDiscovery({ fail: () => {} });
}
let connecting = false;
async function connectBle(config, status) {
  if (connecting) throw new Error("正在连接，请稍候");
  connecting = true;
  try { return await connectBleOnce(config, status); } finally { connecting = false; stopScan(); }
}
async function connectBleOnce(config, status) {
  stopScan();
  if (!config.serviceId || !config.characteristicId) throw new Error('先填写硬件提供的两个 UUID');
  await call('openBluetoothAdapter');
  const devices = new Map();
  discoverHandler = res => { for (const d of res.devices || []) if (d.name || d.localName) devices.set(d.deviceId, d); };
  wx.onBluetoothDeviceFound(discoverHandler);
  await call('startBluetoothDevicesDiscovery', { allowDuplicatesKey: false });
  status('搜索中，请稍候选择你的设备…');
  await new Promise(resolve => { scanTimer = setTimeout(resolve, 4000); });
  stopScan();
  const list = [...devices.values()].filter(d => !config.namePrefix || (d.name || d.localName).includes(config.namePrefix)).slice(0, 6);
  if (!list.length) throw new Error('没有发现设备，请靠近设备并开启蓝牙');
  const selected = await call('showActionSheet', { itemList: list.map(d => d.name || d.localName) });
  const device = list[selected.tapIndex];
  await call('createBLEConnection', { deviceId: device.deviceId, timeout: 10000 });
  try {
    const services = await call('getBLEDeviceServices', { deviceId: device.deviceId });
    const service = services.services.find(s => s.uuid.toLowerCase() === config.serviceId.toLowerCase());
    if (!service) throw new Error('设备没有这个服务 UUID');
    const result = await call('getBLEDeviceCharacteristics', { deviceId: device.deviceId, serviceId: service.uuid });
    const characteristic = result.characteristics.find(c => c.uuid.toLowerCase() === config.characteristicId.toLowerCase() && (c.properties.write || c.properties.writeNoResponse));
    if (!characteristic) throw new Error('设备没有可写的对应特征');
    if (connection && connection.deviceId !== device.deviceId) wx.closeBLEConnection({ deviceId: connection.deviceId, fail: () => {} });
    connection = { deviceId: device.deviceId, serviceId: service.uuid, characteristicId: characteristic.uuid, writeType: characteristic.properties.write ? "write" : "writeNoResponse" };
    status('已连接：' + (device.name || device.localName));
  } catch (error) { wx.closeBLEConnection({ deviceId: device.deviceId, fail: () => {} }); throw error; }
}
// UTF-8 encoding and ordered 20-byte BLE chunks, newline-delimited JSON protocol.
function utf8(text) {
  const encoded = unescape(encodeURIComponent(text));
  return Uint8Array.from(encoded, c => c.charCodeAt(0));
}
let sending = Promise.resolve();
function sendBle(item) {
  const run = async () => {
    if (!connection) throw new Error('蓝牙尚未连接');
    const bytes = utf8(JSON.stringify(M.reminderPayload(item, connection.deviceId)) + '\n');
    for (let i = 0; i < bytes.length; i += 20) await call('writeBLECharacteristicValue', { ...connection, value: bytes.slice(i, i + 20).buffer });
    state().ble.lastStatus = '蓝牙写入成功，仍需长辈确认'; changed();
  };
  const current = sending.then(run).catch(e => { if (state().ble) { state().ble.lastStatus = '蓝牙发送失败，请重新连接'; changed(); } throw e; });
  sending = current.catch(() => {}); return current;
}
module.exports = { state, changed, subscribe, act, start, stop, fire, deliver, connectBle, sendBle, utf8 };
