const store = require('./store.js');
const PRESET_OFFSETS = [1440,120,60,30,10,5,0];
function norm(a){ return [...new Set((Array.isArray(a)?a:[]).map(Number).filter(n=>isFinite(n)&&n>=0&&n<=43200).map(Math.round))].sort((a,b)=>b-a); }
function cfg(){ const s=store.getState().settings; s.taskReminder=s.taskReminder||{}; const c=s.taskReminder; if(c.enabled===undefined)c.enabled=true; if(c.volume===undefined)c.volume=.75; if(!c.sound)c.sound='beep'; if(!Array.isArray(c.defaultOffsets))c.defaultOffsets=[60,10,0]; c.defaultOffsets=norm(c.defaultOffsets); s.taskReminderLog=s.taskReminderLog||{}; return c; }
function dueAt(t){ if(!t||!t.due)return null; const tm=/^\d{2}:\d{2}$/.test(t.dueTime||'')?t.dueTime:'23:59'; const ts=new Date(t.due+'T'+tm+':00').getTime(); return isFinite(ts)?ts:null; }
function offsets(t){ if(t.reminderEnabled===false)return[]; return Array.isArray(t.reminderOffsets)?norm(t.reminderOffsets):cfg().defaultOffsets; }
function label(o){ if(o===0)return '已到截止时间'; if(o<60)return '还有 '+o+' 分钟截止'; if(o%1440===0)return '还有 '+(o/1440)+' 天截止'; if(o%60===0)return '还有 '+(o/60)+' 小时截止'; return '还有 '+Math.floor(o/60)+' 小时 '+(o%60)+' 分钟截止'; }
let timer=null,audio=null;
function play(){ const c=cfg(); if(!c.enabled||c.volume<=0)return; try{ if(audio){audio.stop();audio.destroy();} audio=wx.createInnerAudioContext(); audio.volume=Math.max(0,Math.min(1,Number(c.volume)||0)); audio.src=c.sound==='custom'&&c.customAudioPath?c.customAudioPath:'/sounds/reminder.wav'; audio.play(); }catch(e){} }
function tick(){ const c=cfg(); if(!c.enabled)return; const now=Date.now(), log=store.getState().settings.taskReminderLog; for(const t of store.getState().tasks){ if(!t||t.done||t.reminderEnabled===false)continue; const due=dueAt(t); if(!due)continue; for(const o of offsets(t)){ const at=due-o*60000; const key=t.id+':'+due+':'+o; if(now>=at&&now-at<=90000&&!log[key]){ log[key]=now; play(); wx.showModal({title:'任务提醒',content:t.title+' · '+label(o),showCancel:false,confirmText:'知道了'}); store.saveNow(); return; } } } }
function start(){ cfg(); stop(); tick(); timer=setInterval(tick,15000); }
function stop(){ if(timer){clearInterval(timer);timer=null;} }
module.exports={PRESET_OFFSETS,norm,cfg,dueAt,offsets,label,play,start,stop};
