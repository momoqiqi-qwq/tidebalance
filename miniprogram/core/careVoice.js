const config = require('../care-config.js');
let audio, recorder;
function plugin() {
  if (!config.wechatSI) return null;
  try { return requirePlugin('WechatSI'); } catch (_) { return null; }
}
function available() { return !!plugin(); }
function speak(text) {
  const p = plugin();
  if (!p) { wx.showToast({ title: '朗读服务尚未开通，可请家人协助', icon: 'none' }); return; }
  p.textToSpeech({ lang: 'zh_CN', tts: true, content: text,
    success: res => { if (!res.filename) return; if (audio) audio.destroy(); audio = wx.createInnerAudioContext(); audio.src = res.filename; audio.onError(() => wx.showToast({ title: '朗读播放失败', icon: 'none' })); audio.play(); },
    fail: () => wx.showToast({ title: '朗读暂不可用，请查看文字', icon: 'none' }) });
}
function start(onResult, onStatus) {
  const p = plugin();
  if (!p) { wx.showToast({ title: '请点输入框，用键盘上的麦克风说话', icon: 'none', duration: 3000 }); return; }
  recorder = p.getRecordRecognitionManager();
  recorder.onStart = () => onStatus('正在听，再点一次结束');
  recorder.onStop = res => { onStatus(''); if (res.result) onResult(res.result); else wx.showToast({ title: '没听清，请重试', icon: 'none' }); };
  recorder.onError = () => { onStatus(''); wx.showToast({ title: '语音未能启动，可直接输入', icon: 'none' }); };
  recorder.start({ duration: 30000, lang: 'zh_CN' });
}
function stop() { if (recorder) recorder.stop(); }
function cleanup() { if (recorder) { recorder.onStop = () => {}; recorder.stop(); recorder = null; } if (audio) { audio.destroy(); audio = null; } }
module.exports = { available, speak, start, stop, cleanup };
