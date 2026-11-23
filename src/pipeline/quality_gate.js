const PATHS=require('../../config/paths.js');

'use strict';
const fs=require('fs'),path=require('path'),{execFileSync,spawnSync}=require('child_process');
const {wordTimeline,normalize}=require('../editing/timeline_rules');
const {BRAND_STYLES}=require('../typography/brand_rules');
const profile=require('../../config/approved_reference.json');
function inspectPlan(plan){
  const errors=[],warnings=[],total=Number(plan.totalDur),eps=.002;
  const highlights=plan.highlights.filter(h=>h.file!=='hl_outro.png').map(h=>({...h,end:h.end??h.start+h.dur})).sort((a,b)=>a.start-b.start);
  const brolls=[...(plan.brolls||[])].sort((a,b)=>a.start-b.start);
  const sfx=[...(plan.sfx||[])].sort((a,b)=>a.start-b.start),words=wordTimeline(plan.subtitles||[]);
  const fail=(code,detail)=>errors.push({code,detail}),repeats=new Set();
  if(!Number.isFinite(total)||total<=0)fail('invalid_duration','Thời lượng không hợp lệ.');
  if(!plan.subtitles?.length)fail('missing_subtitles','Thiếu Sub text.');
  const spans=[...highlights,...brolls,...(plan.subtitles||[])];
  for(const h of spans)if(!Number.isFinite(h.start)||!Number.isFinite(h.end)||h.start<0||h.end<=h.start||h.end>total+.1)
    fail('invalid_span','Mốc thời gian không hợp lệ: '+(h.text||h.name||''));
  highlights.forEach((h,i)=>{
    if(h.y!==profile.highlight.y || Math.abs(h.scale-profile.highlight.scale)>.001)fail('text_geometry','Sai vị trí/kích thước Highlight.');
    if(i && h.start<highlights[i-1].end+profile.highlight.gap-eps)fail('highlight_overlap','Highlight chồng nhau.');
    if(highlights.slice(Math.max(0,i-2),i).some(p=>p.typo===h.typo)){fail('repeated_typography','Kiểu chữ bị lặp liền nhau: '+h.text);repeats.add(h.uid);}
    if(words.length && !words.some(w=>h.start>=w.start-.18 && h.start<=w.end+.18 && normalize(h.text).split(' ').includes(w.token)))
      warnings.push({code:'review_word_anchor',detail:h.text,start:h.start});
  });
  if(highlights.length>=4 && new Set(highlights.map(h=>h.typo)).size<4)fail('insufficient_variety','Cần ít nhất 4 kiểu Highlight.');
  // Speech is the only clock. Strict while this run produced the words itself; user edits are reported, not blocked.
  const warn=(code,detail)=>warnings.push({code,detail});
  const speech=(code,detail,item)=>(item?.edited||!(plan.strictSpeech||item?.origin==='asr')?warn:fail)(code,detail);
  const sound=(code,detail,...hits)=>(hits.some(s=>s.user)?warn:fail)(code,detail),audio=plan.userAudio?warn:fail;
  [...(plan.subtitles||[])].sort((a,b)=>a.start-b.start).forEach((s,i,all)=>{
    const own=wordTimeline([s]);
    if(own.length&&Math.abs(Number(s.start)-own[0].start)>.12)speech('subtitle_drift','Sub lệch lời nói: '+s.text,s);
    if(i&&Number(s.start)<Number(all[i-1].end)-.08)speech('subtitle_overlap','Hai câu Sub chồng nhau: '+s.text,s);
  });
  for(const h of highlights.filter(h=>h.autoDetected&&words.length)){
    const wanted=normalize(h.text).split(' ').filter(Boolean),heard=words.filter(w=>w.start>=h.start-.2&&w.start<=h.end+.6).map(w=>w.token);
    if(wanted.filter(t=>heard.includes(t)).length<wanted.length*.8)speech('highlight_not_spoken','Highlight không có trong lời nói tại thời điểm đó: '+h.text,h);
  }
  if(plan.events)for(const s of sfx)if(!plan.events.some(e=>Math.abs(e-s.start)<=.05))fail('sfx_unanchored','SFX không gắn với hình/chữ nào tại '+s.start+'s.');
  brolls.forEach((b,i)=>{
    if(b.start<plan.hookDur-eps || b.end>plan.outroStart+eps)fail('broll_title_overlap','B-roll lấn Hook/Outro.');
    if(i && b.start<brolls[i-1].end-eps)fail('broll_overlap','Hai B-roll chồng thời gian.');
    if(b.timingSource==='spoken_context' && (!Number.isFinite(b.speechStart) || !Number.isFinite(b.speechEnd) || Math.abs(b.start-b.speechStart)>.001 || Math.abs(b.end-b.speechEnd)>.001))fail('broll_speech_drift','B-roll không khớp điểm bắt đầu/kết thúc đoạn nói.');
  });
  const openAt=plan.openAt||0;
  if(!sfx.some(s=>Math.abs(s.start-openAt)<.02)||sfx.filter(s=>s.start<openAt+.5).length<2)audio('opener_sfx','Mở đầu phải có âm thanh ngay khung hình đầu và ít nhất hai âm trong 0,5 giây.');
  const uses=new Map();sfx.forEach(s=>uses.set(s.file,(uses.get(s.file)||0)+1));
  if([...uses.values()].some(n=>n>Math.max(2,Math.ceil(sfx.length*.25))))audio('sfx_overuse','Một âm thanh lặp quá nhiều lần trong video.');
  const looks=new Map();highlights.forEach(h=>looks.set(h.typo,(looks.get(h.typo)||0)+1));
  const ceiling=Math.max(2,Math.ceil(highlights.length/BRAND_STYLES.length)+1);
  for(const [style,n] of looks)if(n>ceiling){fail('typography_overuse','Một kiểu chữ lặp quá nhiều lần trong video.');highlights.filter(h=>h.typo===style).slice(ceiling).forEach(h=>repeats.add(h.uid));}
  sfx.forEach((s,i)=>{
    if(!Number.isFinite(s.start)||s.start<0||s.start>=total)fail('sfx_bounds','SFX ngoài video.');
    for(const p of sfx.slice(0,i)){
      if(s.group==='opener'&&p.group==='opener')continue;
      if(s.start-p.start<Math.max(s.minGap||.85,p.minGap||.85)-eps)sound('sfx_collision','SFX quá sát nhau tại '+s.start+'s.',s,p);
      if(s.file===p.file && s.start-p.start<3.5-eps)sound('sfx_repeat','SFX lặp quá gần tại '+s.start+'s.',s,p);
    }
  });
  return {profile:profile.id,passed:errors.length===0,errors,warnings,repeats:[...repeats].filter(Boolean),counts:{highlights:highlights.length,brolls:brolls.length,sfx:sfx.length}};
}
function requirePlan(plan,reportPath){
  const report=inspectPlan(plan);fs.writeFileSync(reportPath,JSON.stringify({preflight:report},null,2));
  // Pressing export is the decision. Only a plan that cannot be rendered at all stops here.
  const impossible=report.errors.filter(e=>e.code==='invalid_duration');
  if(impossible.length)throw new Error(impossible.map(e=>e.detail).join(' '));
  return report;
}
function inspectOutput(videoPath,totalDuration,reportPath){
  const workspace=PATHS.root;
  const ffmpeg=path.join(workspace,'node_modules/ffmpeg-static/ffmpeg.exe');
  const probe=path.join(workspace,'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');
  const data=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-show_format','-of','json',videoPath],{encoding:'utf8'}));
  const v=data.streams.find(s=>s.codec_type==='video'),a=data.streams.find(s=>s.codec_type==='audio'),errors=[];
  const fps=v?.avg_frame_rate?.split('/').map(Number);
  if(!v||v.codec_name!=='h264'||v.width!==1080||v.height!==1920||!fps||Math.abs(fps[0]/fps[1]-30)>.01||v.pix_fmt!=='yuv420p')errors.push('Video không đúng chuẩn 1080×1920, 30 fps, yuv420p.');
  if(!a||a.sample_rate!=='48000'||a.channels!==2)errors.push('Thiếu âm thanh stereo 48 kHz.');
  if(Math.abs(Number(data.format.duration)-totalDuration)>.12)errors.push('Thời lượng xuất lệch timeline.');
  if(a&&v&&Math.abs(Number(a.duration)-Number(v.duration))>.12)errors.push('Luồng hình và tiếng lệch độ dài.');
  const warnings=[];let loudness=null;
  const decode=spawnSync(ffmpeg,['-hide_banner','-nostats','-xerror','-i',videoPath,'-vf','blackdetect=d=0.25:pix_th=0.06','-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
  if(decode.status!==0)errors.push('Video không giải mã hoàn chỉnh.');
  else{
    for(const m of decode.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g))if(Number(m[1])<totalDuration-1.3)errors.push('Có đoạn hình đen ở '+m[1]+'s.');
    const i=[...decode.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);loudness=i?Number(i[1]):null;
    if(loudness!=null&&(loudness<-18||loudness>-8))warnings.push({code:'loudness',detail:'Âm lượng tổng '+loudness+' LUFS, ngoài khoảng khuyến nghị -18…-8.'});
  }
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  report.output={passed:errors.length===0,errors,warnings,loudnessLUFS:loudness,width:v?.width,height:v?.height,codec:v?.codec_name,pixelFormat:v?.pix_fmt,encoding:{crf:17,preset:'fast',resampling:'lanczos'},fps:fps?fps[0]/fps[1]:null,duration:Number(data.format.duration),audio:a?.codec_name};
  report.passed=report.preflight.passed&&report.output.passed;
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  if(decode.status!==0||!v||!a)throw new Error('Tệp MP4 xuất ra không phát được: '+errors.join(' '));
  return report;
}
module.exports={inspectPlan,requirePlan,inspectOutput};
