// Copyright (C) 2025 XingHeYuZhuan. Apache-2.0; see LICENSE.
// Modified for Le: JS implementation of CourseImportExport.kt data models,
// validation, calendar calculation, week selection and calendar export. 2026-09-09.
(function(root) {
  const fail = message => { throw new Error(message); };
  const int = (v,min,max,label) => Number.isInteger(Number(v)) && Number(v)>=min && Number(v)<=max ? Number(v) : fail(label+'超出范围');
  const time = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '') ? t : fail('时间须为 HH:MM');
  const minutes = t => { time(t); const [h,m]=t.split(':').map(Number);return h*60+m; };
  const date = s => { if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) fail('请选择开学日期');const d=new Date(s+'T12:00:00');if(Number.isNaN(+d)||format(d)!==s) fail('日期无效');return d; };
  function format(d) {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function addDays(s,n){const d=date(s);d.setDate(d.getDate()+n);return format(d);}
  function monday(s){const d=date(s);return addDays(s,-((d.getDay()+6)%7));}
  function weekOf(start,today){return Math.floor((Date.UTC(...monday(today).split('-').map((n,i)=>Number(n)-(i===1?1:0)))-Date.UTC(...monday(start).split('-').map((n,i)=>Number(n)-(i===1?1:0))))/604800000)+1;}
  function weeks(text,total=20){
    const result=new Set();
    for(const part of String(text).replace(/，/g,',').split(',').map(s=>s.trim()).filter(Boolean)) {
      const m=part.match(/^(\d+)(?:-(\d+))?$/);if(!m) fail('周次请填写 1-16 或 1,3,5');
      const a=int(m[1],1,total,'周次'),b=int(m[2]||m[1],a,total,'周次');for(let n=a;n<=b;n++)result.add(n);
    }
    if(!result.size) fail('至少选择一个上课周');return [...result].sort((a,b)=>a-b);
  }
  function empty(today=format(new Date())) {return {courses:[],timeSlots:[{number:1,startTime:'08:00',endTime:'08:45'},{number:2,startTime:'08:55',endTime:'09:40'},{number:3,startTime:'10:00',endTime:'10:45'},{number:4,startTime:'10:55',endTime:'11:40'},{number:5,startTime:'14:00',endTime:'14:45'},{number:6,startTime:'14:55',endTime:'15:40'},{number:7,startTime:'16:00',endTime:'16:45'},{number:8,startTime:'16:55',endTime:'17:40'}],config:{semesterStartDate:monday(today),semesterTotalWeeks:20,defaultClassDuration:45,defaultBreakDuration:10,firstDayOfWeek:1}};}
  function normalize(raw,today=format(new Date())){
    if(!raw||!Array.isArray(raw.courses))fail('未找到 courses 数组，请导入拾光单课表 JSON');
    if(raw.courses.length>1000)fail('单课表最多 1000 门课程');
    const base=empty(today),config={...base.config,...raw.config};date(config.semesterStartDate || (config.semesterStartDate=base.config.semesterStartDate));
    config.semesterTotalWeeks=int(config.semesterTotalWeeks,1,60,'学期周数');config.firstDayOfWeek=int(config.firstDayOfWeek,1,7,'每周起始日');
    if(![1,7].includes(config.firstDayOfWeek))fail('每周起始日只支持周一或周日');
    const slots=raw.timeSlots?.length ? raw.timeSlots : base.timeSlots;
    if(!Array.isArray(slots)||slots.length>40)fail('节次表无效');
    const timeSlots=slots.map(s=>({number:int(s.number,1,40,'节次'),startTime:time(s.startTime),endTime:time(s.endTime),alias:String(s.alias||'').slice(0,50)})).sort((a,b)=>a.number-b.number);
    for(let i=0;i<timeSlots.length;i++){const s=timeSlots[i];if(minutes(s.endTime)<=minutes(s.startTime))fail('每节课结束时间须晚于开始时间');if(i && (s.number===timeSlots[i-1].number||s.startTime<timeSlots[i-1].endTime))fail('节次编号重复或时间重叠');}
    const ids=new Set();
    const courses=raw.courses.map((c,i)=>{
      const id=String(c.id||'course-'+i);if(ids.has(id))fail('课程 ID 重复');ids.add(id);
      const name=String(c.name||'').trim();if(!name)fail('课程名称不能为空');
      const result={id,name:name.slice(0,120),teacher:String(c.teacher||'').slice(0,100),position:String(c.position||'').slice(0,150),day:int(c.day,1,7,'星期'),weeks:weeks(Array.isArray(c.weeks)?c.weeks.join(','):'',config.semesterTotalWeeks),isCustomTime:!!c.isCustomTime,startSection:null,endSection:null,customStartTime:null,customEndTime:null,color:Number.isInteger(c.color)?c.color:0,remark:String(c.remark||'').slice(0,300)};
      if(result.isCustomTime){result.customStartTime=time(c.customStartTime);result.customEndTime=time(c.customEndTime);}
      else {result.startSection=int(c.startSection,1,40,'开始节次');result.endSection=int(c.endSection,result.startSection,40,'结束节次');for(let n=result.startSection;n<=result.endSection;n++)if(!timeSlots.some(s=>s.number===n))fail('课程引用了不存在的节次 '+n);}
      const [start,end]=times(result,{timeSlots});if(minutes(end)<=minutes(start))fail('课程结束须晚于开始');return result;
    });return {courses,timeSlots,config};
  }
  function times(c,table){return c.isCustomTime?[c.customStartTime,c.customEndTime]:[table.timeSlots.find(s=>s.number===c.startSection)?.startTime,table.timeSlots.find(s=>s.number===c.endSection)?.endTime];}
  function occurrences(table,week){const start=addDays(monday(table.config.semesterStartDate),(week-1)*7);return table.courses.filter(c=>c.weeks.includes(week)).map(c=>({...c,date:addDays(start,c.day-1),start:times(c,table)[0],end:times(c,table)[1]})).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));}
  function conflicts(rows){const ids=new Set();for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(rows[i].date===rows[j].date&&rows[i].start<rows[j].end&&rows[j].start<rows[i].end){ids.add(rows[i].id);ids.add(rows[j].id);}return ids;}
  function packs(raw){if(Array.isArray(raw?.allTables)){if(!raw.allTables.length)fail('备份中没有课表');return raw.allTables.map(x=>({name:String(x.tableName||'未命名课表'),data:x.tableData}));}return [{name:'导入课表',data:raw}];}
  const escapeIcs=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  function ics(table){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Le//Shiguang Schedule//ZH','CALSCALE:GREGORIAN'];
    for(let w=1;w<=table.config.semesterTotalWeeks;w++)for(const c of occurrences(table,w))lines.push('BEGIN:VEVENT','UID:'+encodeURIComponent(c.id)+'-'+c.date+'@le','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART:'+c.date.replace(/-/g,'')+'T'+c.start.replace(':','')+'00','DTEND:'+c.date.replace(/-/g,'')+'T'+c.end.replace(':','')+'00','SUMMARY:'+escapeIcs(c.name),'LOCATION:'+escapeIcs(c.position),'DESCRIPTION:'+escapeIcs([c.teacher,c.remark].filter(Boolean).join('\n')),'END:VEVENT');lines.push('END:VCALENDAR');
    // RFC5545 folding: count UTF-8 octets, never split a Unicode code point.
    return lines.map(line=>{let result='',bytes=0;for(const ch of line){const n=new TextEncoder().encode(ch).length;if(bytes+n>75){result+='\r\n ';bytes=1;}result+=ch;bytes+=n;}return result;}).join('\r\n')+'\r\n';
  }
  root.ShiguangModel={empty,normalize,weeks,times,occurrences,conflicts,packs,ics,weekOf,monday,addDays,format,minutes};
})(typeof module!=='undefined'?module.exports:globalThis);
