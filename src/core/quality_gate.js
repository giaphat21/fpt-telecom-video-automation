const PATHS=require('../../config/paths.js');

'use strict';
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const {wordTimeline,normalize}=require('./timeline_rules');
const profile=require('../../config/approved_reference.json');
function inspectPlan(plan){
  const errors=[],warnings=[],total=Number(plan.totalDur),eps=.002;
  const highlights=plan.highlights.filter(h=>h.file!=='hl_outro.png').map(h=>({...h,end:h.end??h.start+h.dur})).sort((a,b)=>a.start-b.start);
  const brolls=[...(plan.brolls||[])].sort((a,b)=>a.start-b.start);
  const sfx=[...(plan.sfx||[])].sort((a,b)=>a.start-b.start),words=wordTimeline(plan.subtitles||[]);
  const fail=(code,detail)=>errors.push({code,detail});
  if(!Number.isFinite(total)||total<=0)fail('invalid_duration','Thời lượng không hợp lệ.');
  if(!plan.subtitles?.length)fail('missing_subtitles','Thiếu Sub text.');
  const spans=[...highlights,...brolls,...(plan.subtitles||[])];
  for(const h of spans)if(!Number.isFinite(h.start)||!Number.isFinite(h.end)||h.start<0||h.end<=h.start||h.end>total+.1)
    fail('invalid_span','Mốc thời gian không hợp lệ: '+(h.text||h.name||''));
  highlights.forEach((h,i)=>{
    if(h.y!==profile.highlight.y || Math.abs(h.scale-profile.highlight.scale)>.001)fail('text_geometry','Sai vị trí/kích thước Highlight.');
    if(i && h.start<highlights[i-1].end+profile.highlight.gap-eps)fail('highlight_overlap','Highlight chồng nhau.');
    if(highlights.slice(Math.max(0,i-2),i).some(p=>p.typo===h.typo))fail('repeated_typography','Kiểu chữ bị lặp liền nhau.');
    if(words.length && !words.some(w=>h.start>=w.start-.18 && h.start<=w.end+.18 && normalize(h.text).split(' ').includes(w.token)))
      warnings.push({code:'review_word_anchor',detail:h.text,start:h.start});
  });
  if(highlights.length>=4 && new Set(highlights.map(h=>h.typo)).size<4)fail('insufficient_variety','Cần ít nhất 4 kiểu Highlight.');
  brolls.forEach((b,i)=>{
    if(b.start<plan.hookDur-eps || b.end>plan.outroStart+eps)fail('broll_title_overlap','B-roll lấn Hook/Outro.');
    if(i && b.start<brolls[i-1].end-eps)fail('broll_overlap','Hai B-roll chồng thời gian.');
    if(b.timingSource==='spoken_context' && (!Number.isFinite(b.speechStart) || !Number.isFinite(b.speechEnd) || Math.abs(b.start-b.speechStart)>.001 || Math.abs(b.end-b.speechEnd)>.001))fail('broll_speech_drift','B-roll không khớp điểm bắt đầu/kết thúc đoạn nói.');
  });
  if(sfx.filter(s=>s.start===0).length!==2)fail('opener_sfx','Mở đầu phải có Ting và Whoosh.');
  sfx.forEach((s,i)=>{
    if(!Number.isFinite(s.start)||s.start<0||s.start>=total)fail('sfx_bounds','SFX ngoài video.');
    for(const p of sfx.slice(0,i)){
      if(s.group==='opener'&&p.group==='opener')continue;
      if(s.start-p.start<Math.max(s.minGap||.95,p.minGap||.95)-eps)fail('sfx_collision','SFX quá sát nhau.');
      if(s.file===p.file && s.start-p.start<3.5-eps)fail('sfx_repeat','SFX lặp quá gần.');
    }
  });
  return {profile:profile.id,passed:errors.length===0,errors,warnings,counts:{highlights:highlights.length,brolls:brolls.length,sfx:sfx.length}};
}
function requirePlan(plan,reportPath){
  const report=inspectPlan(plan);fs.writeFileSync(reportPath,JSON.stringify({preflight:report},null,2));
  if(!report.passed)throw new Error('Kiểm tra chất lượng chưa đạt: '+report.errors.map(e=>e.detail).join(' '));
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
  try{execFileSync(ffmpeg,['-v','error','-xerror','-i',videoPath,'-f','null','-'],{stdio:'pipe'});}catch(e){errors.push('Video không giải mã hoàn chỉnh.');}
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  report.output={passed:errors.length===0,errors,width:v?.width,height:v?.height,codec:v?.codec_name,pixelFormat:v?.pix_fmt,encoding:{crf:17,preset:'fast',resampling:'lanczos'},fps:fps?fps[0]/fps[1]:null,duration:Number(data.format.duration),audio:a?.codec_name};
  report.passed=report.preflight.passed&&report.output.passed;
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  if(errors.length)throw new Error('Kiểm tra video xuất chưa đạt: '+errors.join(' '));
  return report;
}
module.exports={inspectPlan,requirePlan,inspectOutput};
