// Le UI for the Shiguang-compatible course model. Modified 2026-09-09.
(function(){
 const M=modelScope.ShiguangModel;
 let table,week=1,host,mode='week',draft=null,pending=null,selectedPack=0;
 const days=['周一','周二','周三','周四','周五','周六','周日'];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const button=(label,action,extra='')=>`<button data-action="${action}" ${extra}>${label}</button>`;
 const field=(label,name,value,type='text',extra='')=>`<label>${label}<input name="${name}" aria-label="${label}" type="${type}" value="${esc(value)}" ${extra}></label>`;
 const textArea=(label,name,value)=>`<label>${label}<textarea name="${name}" aria-label="${label}">${esc(value)}</textarea></label>`;
 function styles(){if(document.getElementById('sg-style'))return;const s=document.createElement('style');s.id='sg-style';s.textContent=`
 .sg{max-width:1250px;margin:auto;padding:20px;color:#173e48}.sg button,.sg input,.sg select,.sg textarea{font:inherit;box-sizing:border-box}.sg button{cursor:pointer;border:1px solid #adc5cb;border-radius:9px;background:#fff;color:#174c59;min-height:44px;padding:9px 14px}.sg button:disabled{opacity:.45;cursor:default}.sg button:hover{background:#eef6f7}.sg button:focus-visible,.sg input:focus-visible,.sg textarea:focus-visible{outline:3px solid #2c9db3;outline-offset:2px}.sg .primary{background:#195569;color:#fff}.sg h2{margin:0 0 8px}.sg p{line-height:1.6}.sg .tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:18px 0}.sg .muted{color:#536d78;font-size:13px}.sg .grid{display:grid;grid-template-columns:repeat(7,minmax(140px,1fr));gap:10px;min-width:1030px}.sg .scroll{overflow-x:auto;padding-bottom:12px}.sg .day{background:#eef4f5;border-radius:12px;padding:10px;min-height:220px}.sg .day h3{font-size:15px;margin:4px 0 14px}.sg .course{display:block;width:100%;text-align:left;background:#fff;border-left:4px solid #398c9c;margin-bottom:10px;overflow-wrap:anywhere}.sg .course b,.sg .course span{display:block;margin:5px 0}.sg .course span{font-size:13px}.sg .conflict{border-left-color:#ba5c36}.sg .warning{background:#fff0dc;padding:12px;border-radius:10px}.sg .form{background:#f3f7f8;padding:20px;border-radius:14px;max-width:850px}.sg .fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sg label{display:block;font-size:14px;line-height:1.8}.sg input,.sg textarea,.sg select{display:block;width:100%;border:1px solid #b3cbd0;border-radius:8px;padding:10px;background:#fff;color:#183d47;min-height:44px}.sg textarea{min-height:110px;resize:vertical}.sg .error{color:#a02e2e;white-space:pre-wrap}.sg .today{max-width:650px}.sg footer{margin-top:28px;border-top:1px solid #d2dfe1;padding-top:14px;font-size:12px;color:#536d78}.sg footer a{color:inherit}@media(max-width:650px){.sg{padding:12px}.sg .fields{grid-template-columns:1fr}.sg .tools button{flex-grow:1}.sg .form{padding:14px}.sg .grid{min-width:1050px}.sg h2{font-size:23px}}`;
 document.head.append(s);}
 async function persist(next){await tide.storage.set('table',next);table=next;}
 function notice(e){const target=host.querySelector('[data-error]');if(target)target.textContent=e.message||String(e);else tide.notify(e.message||String(e));}
 function currentWeek(){return Math.max(1,Math.min(table.config.semesterTotalWeeks,M.weekOf(table.config.semesterStartDate,tide.util.today())));}
 function saveFile(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function card(c,conflict){return `<button class="course ${conflict?'conflict':''}" data-edit="${esc(c.id)}"><span>${esc(c.start)} – ${esc(c.end)}</span><b>${esc(c.name)}</b><span>${esc(c.position||'地点待填写')}</span><span>${esc(c.teacher)}</span>${conflict?'<span>与其他课程时间重叠</span>':''}</button>`;}
 function paint(){if(!host?.isConnected)return;
  const rows=M.occurrences(table,week),overlap=M.conflicts(rows),start=M.addDays(M.monday(table.config.semesterStartDate),(week-1)*7);
  let content='';
  if(mode==='week'||mode==='today'){
   const today=tide.util.today();
   const todayWeek=M.weekOf(table.config.semesterStartDate,today);
   const visible=mode==='today'?(todayWeek>=1&&todayWeek<=table.config.semesterTotalWeeks?M.occurrences(table,todayWeek).filter(c=>c.date===today):[]):rows;
   content=`<div class="tools">${button('上一周','prev',week===1?'disabled':'')}<strong>第 ${week} / ${table.config.semesterTotalWeeks} 周 · ${start}</strong>${button('下一周','next',week===table.config.semesterTotalWeeks?'disabled':'')}${button('回到本周','current')}${button(mode==='today'?'查看周课表':'只看今天',mode==='today'?'week':'today')}${button('添加课程','add','class="primary"')}${button('学期与节次','config')}${button('导入 / 导出','transfer')}${button('将本周加入时间块','blocks',rows.length?'':'disabled')}</div>`;
   if(overlap.size&&mode==='week')content+='<p class="warning">有课程时间重叠，已标记。请核对后再加入时间块。</p>';
   if(mode==='today')content+=`<div class="today">${visible.map(c=>card(c,M.conflicts(visible).has(c.id))).join('')||'<p>今天没有课程。</p>'}</div>`;
   else {const order=table.config.firstDayOfWeek===7?[6,0,1,2,3,4,5]:[0,1,2,3,4,5,6];content+=`<div class="scroll"><div class="grid">${order.map(i=>`<section class="day"><h3>${days[i]} · ${M.addDays(start,i).slice(5)}</h3>${rows.filter(c=>c.day===i+1).map(c=>card(c,overlap.has(c.id))).join('')||'<p class="muted">没有课程</p>'}</section>`).join('')}</div></div><p class="muted">点击课程可修改。手机上可横向滑动查看整周，也可切换“只看今天”。</p>`;}
  } else if(mode==='edit'){
   const c=draft;content=`<h3>${c.id?'编辑课程':'添加课程'}</h3><form class="form" data-form="course"><div class="fields">${field('课程名称','name',c.name,'text','required maxlength="120"')}${field('教师','teacher',c.teacher)}${field('教室 / 地点','position',c.position)}<label>星期<select name="day">${days.map((d,i)=>`<option value="${i+1}" ${c.day===i+1?'selected':''}>${d}</option>`).join('')}</select></label>${field('上课周次，如 1-16 或 1,3,5','weeks',(c.weeks||[]).join(','))}<label>时间方式<select name="isCustomTime"><option value="false" ${!c.isCustomTime?'selected':''}>按节次</option><option value="true" ${c.isCustomTime?'selected':''}>自定义时间</option></select></label>${field('开始节次','startSection',c.startSection||1,'number','min="1" max="40"')}${field('结束节次','endSection',c.endSection||2,'number','min="1" max="40"')}${field('自定义开始时间','customStartTime',c.customStartTime||'08:00','time')}${field('自定义结束时间','customEndTime',c.customEndTime||'09:40','time')}</div><div class="tools">${button('填入单周','odd','type="button"')}${button('填入双周','even','type="button"')}</div>${textArea('备注','remark',c.remark)}<p class="muted">按节次时使用学期作息表；自定义时间时忽略节次。</p><div class="tools"><button type="submit" class="primary">保存课程</button>${button('取消','week','type="button"')}${c.id?button('删除课程','delete','type="button"'):''}</div></form>`;
  } else if(mode==='config')content=`<h3>学期与节次</h3><form class="form" data-form="config">${field('第一周内的开学日期','semesterStartDate',table.config.semesterStartDate,'date')}${field('学期总周数','semesterTotalWeeks',table.config.semesterTotalWeeks,'number','min="1" max="60"')}<label>每周显示起始日<select name="firstDayOfWeek"><option value="1" ${table.config.firstDayOfWeek===1?'selected':''}>周一</option><option value="7" ${table.config.firstDayOfWeek===7?'selected':''}>周日</option></select></label>${textArea('每行一个节次：编号 开始时间 结束时间','slots',table.timeSlots.map(s=>`${s.number} ${s.startTime} ${s.endTime}`).join('\n'))}<p class="muted">开学日期所在周为第一周。缩短周数或删除课程引用的节次时会先校验；已有时间块不会自动改动。</p><div class="tools"><button type="submit" class="primary">保存学期设置</button>${button('返回课表','week','type="button"')}</div></form>`;
  else if(mode==='transfer') content=`<h3>时光课表导入 / 导出</h3><div class="form"><p>支持时光单课表 JSON，以及含 allTables 的 JSON 备份。先预览，再确认替换当前课表。暂不支持 CBOR、网页教务适配脚本。</p><label>选择 JSON 文件<input type="file" accept=".json,application/json" data-file></label>${textArea('或粘贴课表 JSON','json','')}<div class="tools">${button('预览导入','preview')}${button('导出 JSON','json')}${button('导出 ICS 日历','ics')}${button('返回课表','week')}</div><p class="muted">ICS 使用本地浮动时间，请在目标日历核对时区。下载文件由浏览器或系统下载能力处理。</p><div data-preview></div></div>`;
  host.innerHTML=`<div class="sg"><h2>时光课表</h2><p class="muted">一周的课程与安排 · 数据保存在本机</p>${content}<p class="error" role="alert" data-error></p><footer>课程数据格式源自 <a href="https://github.com/XingHeYuZhuan/shiguangschedule" target="_blank" rel="noopener">XingHeYuZhuan / 时光课程表</a> · <a href="/plugins/shiguang-schedule/LICENSE" target="_blank">Apache-2.0</a> · <a href="/plugins/shiguang-schedule/NOTICE.md" target="_blank">来源与修改说明</a></footer></div>`;
 }
 async function blocks(){
  const rows=M.occurrences(table,week);if(M.conflicts(rows).size)throw new Error('本周课程有冲突，请先修改后再加入时间块');
  const planned=[],skipped=[];
  for(const c of rows){const existing=tide.blocks.list(c.date);if(existing.some(b=>b.title===c.name&&b.start===c.start&&b.durMin===M.minutes(c.end)-M.minutes(c.start))){skipped.push(c);continue;}
   if(existing.some(b=>M.minutes(b.start)<M.minutes(c.end)&&M.minutes(b.start)+b.durMin>M.minutes(c.start)))throw new Error(`${c.date} ${c.start} 与已有时间块冲突，本次没有添加`);
   planned.push(c);
  }
  const made=[];try{for(const c of planned){const b=tide.blocks.create({date:c.date,start:c.start,durMin:M.minutes(c.end)-M.minutes(c.start),title:c.name,cat:'study',taskId:null});made.push(b.id);}}catch(e){made.forEach(id=>tide.blocks.remove(id));throw e;}
  tide.notify(`已添加 ${made.length} 个课程时间块，跳过 ${skipped.length} 个重复项`,{actionLabel:'查看',action:()=>tide.util.navigate('timeblock')});
 }
 function showPreview(){const target=host.querySelector('[data-preview]');const data=M.normalize(pending[selectedPack].data);target.innerHTML=`<label>选择课表<select data-pack>${pending.map((p,i)=>`<option value="${i}" ${i===selectedPack?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><p>${data.courses.length} 门课程 · ${data.timeSlots.length} 个节次 · ${data.config.semesterTotalWeeks} 周 · 开学 ${data.config.semesterStartDate}</p><p class="warning">确认后替换本插件当前课表，不会修改已加入的时间块。</p>${button('确认替换课表','import','class="primary"')}`;}
 async function action(a){switch(a){
 case 'prev':week=Math.max(1,week-1);break;case 'next':week=Math.min(table.config.semesterTotalWeeks,week+1);break;case 'current':week=currentWeek();mode='week';break;
 case 'week':case 'today':case 'config':case 'transfer':mode=a;break;
 case 'add':draft={name:'',teacher:'',position:'',day:1,weeks:Array.from({length:table.config.semesterTotalWeeks},(_,i)=>i+1)};mode='edit';break;
 case 'odd':case 'even':host.querySelector('[name="weeks"]').value=Array.from({length:table.config.semesterTotalWeeks},(_,i)=>i+1).filter(w=>w%2===(a==='odd'?1:0)).join(',');return;
 case 'delete':{const old=table;await persist({...table,courses:table.courses.filter(c=>c.id!==draft.id)});mode='week';tide.notify('课程已删除',{actionLabel:'撤销',action:async()=>{await persist(old);paint();}});break;}
 case 'preview':{const raw=host.querySelector('[name="json"]').value;if(raw.length>2*1024*1024)throw new Error('课表文件不能超过 2 MB');pending=M.packs(JSON.parse(raw));selectedPack=0;showPreview();return;}
 case 'import':{const next=M.normalize(pending[selectedPack].data);const old=table;await persist(next);week=currentWeek();mode='week';pending=null;tide.notify('课表已导入',{actionLabel:'撤销',action:async()=>{await persist(old);week=currentWeek();paint();}});break;}
 case 'json':saveFile('shiguang-le-time-management.json',JSON.stringify(table,null,2),'application/json');return;
 case 'ics':saveFile('shiguang-le-time-management.ics',M.ics(table),'text/calendar;charset=utf-8');return;
 case 'blocks':await blocks();return;
 }paint();}
 async function submit(form){const f=Object.fromEntries(new FormData(form));let next;
  if(form.dataset.form==='course'){const c={...draft,...f,id:draft.id||crypto.randomUUID(),day:Number(f.day),isCustomTime:f.isCustomTime==='true',weeks:M.weeks(f.weeks,table.config.semesterTotalWeeks)};next=M.normalize({...table,courses:[...table.courses.filter(x=>x.id!==c.id),c]});}
  else {const slots=f.slots.trim().split(/\r?\n/).filter(s=>s.trim()).map(line=>{const [number,startTime,endTime,...rest]=line.trim().split(/\s+/);if(rest.length)throw new Error('每行只填写编号、开始和结束时间');return {number,startTime,endTime};});next=M.normalize({...table,config:{...table.config,semesterStartDate:f.semesterStartDate,semesterTotalWeeks:Number(f.semesterTotalWeeks),firstDayOfWeek:Number(f.firstDayOfWeek)},timeSlots:slots});}
  await persist(next);week=Math.min(week,table.config.semesterTotalWeeks);mode='week';paint();tide.notify('课表已保存');
 }
 async function render(el){host=el;styles();host.textContent='正在读取课表…';try{table=M.normalize(await tide.storage.get('table',M.empty()));week=currentWeek();paint();}catch(e){host.textContent='课表读取失败：'+e.message;return;}
 host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.edit){draft={...table.courses.find(c=>c.id===b.dataset.edit)};mode='edit';paint();}else if(b.dataset.action)action(b.dataset.action).catch(notice);});
 host.addEventListener('submit',e=>{e.preventDefault();submit(e.target).catch(notice);});
 host.addEventListener('change',async e=>{try{if(e.target.matches('[data-file]')){const file=e.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error('课表文件不能超过 2 MB');host.querySelector('[name="json"]').value=await file.text();}if(e.target.matches('[data-pack]')){selectedPack=Number(e.target.value);showPreview();}}catch(err){notice(err);}});
 host.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))e.stopPropagation();});
 }
 tide.ui.registerView({id:'shiguang-schedule',title:'时光课表',icon:'课',render});
})();
