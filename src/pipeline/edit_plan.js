'use strict';
// One plan for both the timeline and the render: titles, highlights, styles, motions, cuts, B-roll and every sound with
// its exact time. The Studio shows this plan, the user edits it, and the renderer executes the same plan.
const fs=require('fs'),path=require('path');
const PATHS=require('../../config/paths.js');
const referenceProfile=require('../../config/approved_reference.json');
const {createReferenceHighlights,speechBoundaries}=require('../editing/reference_editor');
const {applyTypographyVariety,HOOK_STYLES,MOTIONS}=require('../typography/brand_rules');
const {correctSubtitles,cleanFptTranscript}=require('../speech/transcript_formatter');
const {polishText,reviewTexts}=require('../speech/text_quality');
const {deriveSmartHookFromSubtitles}=require('../speech/subtitle_generator');
const {buildCues,titleTimeline}=require('../typography/kinetic_overlay');
const {SfxDirector,familiesFor}=require('../audio/sfx_director');
const {chooseStyle,recentSounds,load:loadStyleHistory}=require('../editing/style_history');
const {selectBrollSpecs,getBrollWarnings}=require('../broll/broll_compositor');
const {prepareHighlightsForRender,boundaries,scheduleSfx,normalize,wordTimeline,findPhrase}=require('../editing/timeline_rules');
const {punchCuts,timelineLength,frameGrid}=require('./base_cache');
const {inspectPlan}=require('./quality_gate');
const {subStyle}=require('../typography/subtitle_style');
const {normalizeFx,KINDS:FX_KINDS,TRANSITIONS,OPENERS,openerEffects}=require('./picture_fx');
const {FPS}=require('./clip_assembler');

const round=n=>Math.round(n*1000)/1000;
const safeProject=name=>(name||'FPT_Telecom_Auto').replace(/[^a-zA-Z0-9_-]/g,'_');
const filled=cfg=>Boolean(cfg)&&['line1','line2','line3','line4'].some(k=>String(cfg[k]||'').trim());
// A transition at each picture cut that also gets a cut sound (cuts 2.2 s apart, outside Hook and Outro), in an order
// that changes per video. Each one is a block on the timeline: fx['auto:cut<i>'] = {off} removes it, {kind} changes it.
// A cut is heard as a whoosh (7.2), whatever the transition.
const CUT_SOUND=['whoosh'];
// Not crowded (user, 24/11/2026: "đừng nhồi nhét, bị giật khung hình"): one transition every 4.5 s at most, none where a
// B-roll already changes the picture, and only the smooth kinds; glitch and bounce stay available by hand.
const AUTO_TRANSITIONS=['whip','zoom_blur','pull_out','whip_v','push_in','spin'],TRANSITION_GAP=4.5,BROLL_EDGE=.35;
function autoTransitions({scenes,hookDur,outroStart,totalDur,seed,fx,brolls=[]}){
  const kinds=AUTO_TRANSITIONS,h=[...String(seed)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7),order=kinds.map((_,i)=>kinds[(i+h)%kinds.length]);
  const out=[],recent=[];let lastCut=-1e9,n=0;
  scenes.forEach((scene,i)=>{
    if(!i||scene.start-lastCut<TRANSITION_GAP||scene.start<=hookDur+.6||scene.start>=outroStart-1)return;
    if(brolls.some(b=>Math.abs(Number(b.start)-scene.start)<BROLL_EDGE||Math.abs(Number(b.end)-scene.start)<BROLL_EDGE))return;
    lastCut=scene.start;
    const own=fx?.['auto:cut'+i]||{};if(own.off)return;
    let kind=order[n++%order.length];while(recent.slice(-2).includes(kind))kind=order[n++%order.length];
    if(TRANSITIONS[own.kind])kind=own.kind;
    const start=round(Math.max(0,scene.start-TRANSITIONS[kind].pre)),end=round(Math.min(totalDur,start+FX_KINDS[kind].dur));
    if(end-start>=.2){out.push({uid:'cut'+i,kind,start,end,auto:true,cut:i,chosen:!!TRANSITIONS[own.kind]});recent.push(kind);}
  });
  return out;
}
function wrapSafeLine(text,maxChars=22){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean)return '';
  const words=clean.split(' ');
  if(words.length<=5&&clean.length<=maxChars)return clean;
  const mid=Math.ceil(words.length/2);
  return words.slice(0,mid).join(' ')+'\n'+words.slice(mid).join(' ');
}
// Stable identity lets a sound or a style follow its item while the user moves things around.
function withIds(items,prefix){
  const seen=new Set();
  return items.map((item,i)=>{let uid=String(item.uid||prefix+(item.id??i+1));while(seen.has(uid))uid+='b';seen.add(uid);return {...item,uid};});
}
function prepareContent(job,{subtitles=[],highlights=[],totalDur}){
  const subs=correctSubtitles(subtitles);
  let cues=highlights.map(h=>({...h,text:h.edited?polishText(h.text,{typed:true}):cleanFptTranscript(h.text)}));
  if(!cues.length&&subs.length&&job.autoHighlight!==false)cues=createReferenceHighlights(subs,totalDur,{cuts:(job.clipWindows||[]).map(w=>Number(w.timelineStart)).filter(t=>t>0)});
  return {subtitles:subs,highlights:withIds(cues,'h')};
}
// scenes: [{start,duration}] on the output timeline.
function createEditPlan({job,seed,subtitles,highlights,totalDur,scenes=[],brolls=null,illustrations=[],autoOutroCta=null,history=loadStyleHistory(),strictSpeech=false}){
  const project=seed||safeProject(job.projectName);
  // Looks the user just rejected ("Đổi phong cách") count as the most recent videos.
  if(Array.isArray(job.previousLooks))history=[...job.previousLooks.slice(0,6).map((h,i)=>({...h,project:'~'+i,typos:Array.isArray(h?.typos)?h.typos:[],sfx:Array.isArray(h?.sfx)?h.sfx:[]})),...history];
  const manualOutro=job.titleMode!=='auto'&&job.outro&&['line1','line2','line3'].some(k=>String(job.outro[k]||'').trim());
  let {hookDur,outroDur,outroStart}=manualOutro&&!speechBoundaries(subtitles,totalDur).outroDur?boundaries(totalDur):speechBoundaries(subtitles,totalDur);
  // 3.5 s unless the user drags the Hook on the timeline. B-roll never overlaps it, so a first B-roll is its limit.
  let hookStart=0,outroEnd=round(totalDur);
  const given=v=>v!=null&&Number.isFinite(Number(v)),wantedHook=Number(job.hookDur);
  if(given(job.hookDur)){
    const firstBroll=Math.min(outroStart,...(Array.isArray(job.brollCutaways)?job.brollCutaways:[]).filter(b=>b&&b.enabled!==false&&Number.isFinite(Number(b.start))).map(b=>Number(b.start)));
    hookDur=round(Math.max(.4,Math.min(wantedHook,firstBroll>.4?firstBroll:wantedHook,totalDur)));
  }
  if(given(job.hookStart))hookStart=round(Math.max(0,Math.min(Number(job.hookStart),hookDur-.4)));
  // The user may pull the Outro earlier or later on the timeline; without it the spoken CTA decides.
  const movedOutro=Number(job.outroStart);
  if(job.outroStart!=null&&Number.isFinite(movedOutro)&&movedOutro>=0&&movedOutro<totalDur-.3){outroStart=round(Math.max(hookDur,movedOutro));outroDur=round(totalDur-outroStart);}
  if(given(job.outroEnd)){outroEnd=round(Math.max(outroStart+.4,Math.min(Number(job.outroEnd),totalDur)));outroDur=round(outroEnd-outroStart);}
  const others=history.filter(h=>h.project!==project);
  const smart=deriveSmartHookFromSubtitles(subtitles);
  // ---- titles
  const typed=value=>polishText(String(value??'').trim(),{typed:true});
  const hook={line1:'',line2:'',line3:'',line4:'',y:320,scale:1.3};
  if(job.hook&&job.titleMode!=='auto')for(const k of ['line1','line2','line3','line4'])hook[k]=typed(job.hook[k]);
  else if(smart.hook)Object.assign(hook,smart.hook);
  hook.y=320;hook.scale=1.3;
  hook.style=chooseStyle('hookStyle',HOOK_STYLES,project,{requested:job.hookStyle,history});
  const wantedOutro=(job.titleMode==='auto'||!job.outro)?smart.outro:job.outro;
  const outro={line1:typed(wantedOutro?.line1),line2:typed(wantedOutro?.line2),line3:typed(wantedOutro?.line3),y:320,scale:1.3,
    style:chooseStyle('outroStyle',HOOK_STYLES.filter(s=>s!==hook.style),project,{requested:job.outroStyle,history})};
  const hasOutro=outroDur>=.1&&filled(outro);
  if(!filled(hook)&&job.titleMode!=='auto')hookDur=0;
  const titles=(Array.isArray(job.extraTitles)?job.extraTitles.slice(0,24):[]).map((t,i)=>{
    const start=round(Math.max(0,Number(t.start)||0)),end=round(Math.min(totalDur,Number(t.end)||0));
    return {uid:String(t.uid||'t'+i),line1:typed(t.line1),line2:typed(t.line2),line3:typed(t.line3),line4:typed(t.line4),y:320,scale:1.3,style:HOOK_STYLES.includes(t.style)?t.style:hook.style,start,end};
  }).filter(t=>filled(t)&&t.end-t.start>=.3);
  const outroCta=(!job.outroCta||job.outroCta==='220K Ngoại hạng Anh')?(autoOutroCta||smart.outroCta||''):job.outroCta;
  // ---- highlights (styled after the B-roll they sit on)
  const brollSource=brolls||selectBrollSpecs(job,subtitles,hookDur,hasOutro?outroStart:totalDur);
  const styled=applyTypographyVariety(prepareHighlightsForRender(withIds(highlights,'h').filter(h=>h&&String(h.text||'').trim())
    .map(h=>({...h,text:wrapSafeLine(h.text),start:Number(h.start),end:Number(h.end)||Number(h.start)+2,y:350,scale:1.4}))
    .sort((a,b)=>a.start-b.start),hookDur,outroStart,totalDur),
    {seed:project,videos:others.slice(0,6).map(h=>h.typos||[]),brolls:brollSource});
  const items=styled.map(h=>({...h,dur:round(h.end-h.start)})).filter(h=>h.dur>=.35||h.timingPolicy==='preserve_all');
  const hlSpecs=items.map((h,i)=>({uid:h.uid,file:'hl_'+i+'.png',timingPolicy:h.timingPolicy,text:h.text,y:350,scale:1.4,typo:h.typo,motion:h.motion,sfx:h.sfx,
    autoDetected:h.autoDetected,edited:h.edited,start:round(h.start),dur:h.dur}));
  if(hasOutro)hlSpecs.push({file:'hl_outro.png',text:outro.line3||outro.line1||'',y:320,scale:1.3,start:outroStart,dur:outroDur});
  // ---- every displayed word follows its own recognised time
  const spoken=wordTimeline(subtitles);
  const wordOffsets=(text,start,limit)=>{
    let cursor=spoken.findIndex(w=>w.start>=start-.08);
    return text.split(/\s+/).map(word=>{
      const token=normalize(word).split(' ')[0];
      if(cursor<0||!token)return null;
      const hit=spoken.findIndex((w,i)=>i>=cursor&&i<cursor+6&&w.token===token&&w.start<limit);
      if(hit<0)return null;
      cursor=hit+normalize(word).split(' ').length;
      return round(spoken[hit].start-start);
    });
  };
  const spokenAt=(line,from,to)=>{
    const words=normalize(line).split(' ').filter(Boolean);
    for(let n=Math.min(3,words.length);n>0;n--){
      const hit=findPhrase(spoken,words.slice(0,n).join(' ')).find(m=>m.start>=from-.05&&m.start<to);
      if(hit)return hit.start-from;
    }
    return null;
  };
  const titleSync=(cfg,from,to)=>({...cfg,spokenAt:['line1','line2','line3','line4'].map(k=>cfg[k]?spokenAt(cfg[k],from,to):null)});
  const typographyPlan={totalDur,hookStart,hookDur,outroStart,outroEnd,hook:titleSync(hook,hookStart,hookDur),outro:hasOutro?titleSync(outro,outroStart,outroEnd):null,titles:titles.map(t=>titleSync(t,t.start,t.end)),
    highlights:hlSpecs.filter(h=>h.file!=='hl_outro.png').map(h=>{const text=h.text.replace(/\s+/g,' ');return {...h,text,wordOffsets:wordOffsets(text,h.start,h.start+h.dur+.1)};})};
  const brollSpecs=withIds(brollSource,'b').map(s=>({...s,hostFocusY:s.hostFocusY??job.hostFocusY??.55,
    easeIn:given(job.fx?.['in:'+s.uid]?.dur)?Number(job.fx['in:'+s.uid].dur):undefined,easeOut:given(job.fx?.['out:'+s.uid]?.dur)?Number(job.fx['out:'+s.uid].dur):undefined}));
  // ---- sound
  const cues=buildCues({...typographyPlan,highlights:[]}),hookTimes=titleTimeline(cues.find(c=>c.kind==='hook')),outroTimes=titleTimeline(cues.find(c=>c.kind==='outro'));
  const overrides=job.sfxOverrides&&typeof job.sfxOverrides==='object'?job.sfxOverrides:{};
  // Cutting the head or tail of a sound moves neither its hit nor its neighbours.
  const trimSound=(sound,o)=>{
    const head=Math.max(0,Number(o?.trimIn)||0),tail=Math.max(0,Number(o?.trimOut)||0);
    if(!head&&!tail)return sound;
    const full=sound.duration,a=Math.min(head,full-.06),duration=round(Math.max(.05,full-a-tail));
    return {...sound,from:round(sound.from+a),lead:round(sound.lead-a),duration,full,trimIn:round(a),trimOut:round(Math.max(0,full-a-duration))};
  };
  const director=new SfxDirector({seed:project,recent:recentSounds(others)});
  const candidates=[],moments=[],muted=[],userEvents=[];
  const place=(anchor,label,families,start,vol,{priority=20,minGap=.85,group=null,only=false,prefer=null}={})=>moments.push({start,act(){
    const o=overrides[anchor]||{};
    if(o.muted){muted.push({anchor,label,start:round(start),muted:true});return;}
    const moved=o.user&&Number.isFinite(Number(o.offset))?Number(o.offset):0,when=round(Math.max(0,Math.min(totalDur-.05,start+moved)));
    const sound=(o.id&&director.prefer(o.id,when,{force:Boolean(o.user&&o.chosen)}))||(prefer&&director.prefer(prefer,when))||director.pick(families,{start:when,only});
    if(!sound)return;
    if(moved)userEvents.push(when);
    candidates.push({...trimSound(sound,o),anchor,label,start:when,base:round(start),vol:o.user&&Number.isFinite(Number(o.vol))?Math.max(0,Math.min(1,Number(o.vol))):vol,
      priority:o.user?200+priority:priority,minGap,group,user:Boolean(o.user)});
  }});
  const openAt=hookTimes?hookStart:0;
  const recipe=hookTimes?.sfx||{open:['whoosh','impact'],line:'pop',land:'tone'};
  // The second layer lands when the first line settles, so a whoosh or riser is heard whole instead of cut at frame 0.
  const settle=hookTimes?Math.max(openAt+.26,hookTimes.lines[0]+.26):.26;
  // The opening: a strong picture effect on the first frames of the Hook, a different kind from the last videos, with
  // an impact on frame 0 and its own second hit as the first line settles, both louder.
  const openFx=job.fx&&typeof job.fx==='object'?job.fx['auto:open']||{}:{};
  const opener=hookTimes&&!openFx.off?chooseStyle('openerStyle',Object.keys(OPENERS),project,{requested:openFx.recipe,history}):null,openSfx=opener?OPENERS[opener].sfx:null;
  place('hook:open','Mở màn',openSfx?[openSfx[0],recipe.open[0]]:[recipe.open[0]],openAt,openSfx?.6:.44,{priority:100,group:'opener'});
  place('hook:settle','Hook vào vị trí',openSfx?[openSfx[1],recipe.open[1]]:[recipe.open[1]],settle,openSfx?.5:.36,{priority:99,group:'opener'});
  if(hookTimes){
    hookTimes.lines.slice(1).forEach((t,i)=>place('hook:line'+(i+2),'Hook dòng '+(i+2),[recipe.line],t,.28,{priority:96,group:'opener'}));
    place('hook:land','Hook hoàn chỉnh',[recipe.land],hookTimes.landed,.3,{priority:97,group:'opener'});
    hookTimes.spoken.forEach((t,i)=>{if(i&&t!=null&&t>hookTimes.landed+.7&&t<hookDur-.4)place('hook:spoken'+(i+1),'Nhấn dòng '+(i+1),['pop','tone'],t,.24,{priority:40,minGap:.6});});
  }
  let lastCut=0;
  const autoFx=[...(opener?openerEffects(opener,openAt,totalDur):[]),...autoTransitions({scenes,hookDur,outroStart,totalDur,seed:project,fx:job.fx&&typeof job.fx==='object'?job.fx:{},brolls:brollSpecs})];
  scenes.forEach((scene,i)=>{
    if(!i||scene.start-lastCut<2.2||scene.start<=hookDur||scene.start>=outroStart-1)return;
    lastCut=scene.start;
    const tr=autoFx.find(e=>e.cut===i);
    // the cut is heard only where a transition marks it, so sounds do not pile up on every jump cut
    if(tr)place('cut:'+i,'Chuyển cảnh'+(tr?' · '+FX_KINDS[tr.kind].name:''),tr?CUT_SOUND:['whoosh'],scene.start,.3,{priority:70,minGap:.95,only:true});
  });
  brollSpecs.forEach(b=>{if(b.start>hookDur&&b.start<outroStart)place('broll:'+b.uid,'B-roll '+(b.name||''),['whoosh','riser'],b.start,.32,{priority:70,minGap:.95,only:true});});
  // A price or a gift keeps its own sound even when it arrives together with a cut.
  items.forEach(h=>{const families=familiesFor(h.text);place('hl:'+h.uid,h.text.replace(/\s+/g,' '),families,h.start,referenceProfile.audio.sfxHighlight,{priority:['cash','bell'].includes(families[0])?80:60,prefer:h.sfxChosen?h.sfx:null});});
  titles.forEach(t=>{const times=titleTimeline(cues.find(c=>c.uid===t.uid));if(times)place('title:'+t.uid,'Tiêu đề '+t.line1,[times.sfx.open[0]],t.start,.4,{priority:85});});
  if(outroTimes&&hasOutro){
    place('outro:in','Outro vào',['bell','riser','tone'],outroTimes.lines[0],.45,{priority:90});
    if(outroStart+1.05<outroEnd-.1)place('outro:cash','Chốt ưu đãi',['cash','run'],outroStart+1.05,.42,{priority:90});
  }
  illustrations.forEach((b,i)=>place('illus:'+i,'Minh họa',['whoosh','tone'],b.start,.4,{priority:90}));
  for(const c of Array.isArray(job.customSfx)?job.customSfx.slice(0,60):[]){
    const start=round(Number(c.start));if(!Number.isFinite(start)||start<0||start>=totalDur)continue;
    moments.push({start,act(){const sound=director.prefer(c.id,start,{force:true});if(!sound)return;userEvents.push(start);
      candidates.push({...trimSound(sound,c),anchor:'custom:'+c.uid,label:'Tự thêm',start,base:start,vol:Number.isFinite(Number(c.vol))?Math.max(0,Math.min(1,Number(c.vol))):.36,priority:300,minGap:.2,group:null,user:true});}});
  }
  moments.sort((a,b)=>a.start-b.start).forEach(m=>m.act());
  const sfx=scheduleSfx(candidates,totalDur);
  const events=[0,openAt,settle,...titles.map(t=>t.start),...(hookTimes?[...hookTimes.lines,hookTimes.landed,...hookTimes.spoken.filter(t=>t!=null)]:[]),...scenes.map(s=>s.start),...brollSpecs.map(b=>b.start),
    ...hlSpecs.map(h=>h.start),...(outroTimes?[...outroTimes.lines,outroStart+1.05]:[]),...illustrations.map(b=>b.start),...userEvents];
  const outroText=normalize([outro.line1,outro.line2,outro.line3].join(' '));
  const hiddenSubs=new Set(hasOutro?subtitles.filter(s=>s.start>=outroStart+.3&&s.start<outroEnd&&outroText.includes(normalize(s.text))):[]);
  const lastSpoken=Math.max(0,...subtitles.map(s=>Number(s.end)||0)),fx=job.fx&&typeof job.fx==='object'?job.fx:{};
  let fadeDur=round(Math.max(.35,Math.min(1,totalDur-lastSpoken)));
  if(fx.fade?.off)fadeDur=.02;else if(given(fx.fade?.dur))fadeDur=round(Math.max(.1,Math.min(Number(fx.fade.dur),totalDur-.2)));
  const customFx=normalizeFx(job.customFx,totalDur);
  return {customFx,autoFx,opener,seed:project,totalDur,hookStart,hookDur,outroDur,outroStart,outroEnd,titles,hook,outro,hasOutro,outroCta,subtitles,highlights:items,hlSpecs,typographyPlan,hookTimes,outroTimes,
    brolls:brollSpecs,sfx,mutedSfx:muted,events,settle,scenes,hiddenSubs,userAudio:userEvents.length>0||muted.length>0||sfx.some(s=>s.user),
    fade:{start:round(Math.max(0,totalDur-fadeDur)),duration:fadeDur},strictSpeech};
}
const gateInput=plan=>({totalDur:plan.totalDur,subtitles:plan.subtitles,highlights:plan.hlSpecs,brolls:plan.brolls,sfx:plan.sfx,hookDur:plan.hookDur,outroStart:plan.hasOutro?plan.outroStart:plan.totalDur,strictSpeech:plan.strictSpeech,events:plan.events,userAudio:plan.userAudio,openAt:plan.hookTimes?plan.hookStart:0});
const easeOf=(b,key)=>round(Math.max(.03,Math.min(b[key]??.25,(b.end-b.start)/2)));
// What the Studio needs: plain data, no local paths.
function planForClient(job,windows){
  const totalDur=timelineLength(windows),frames=frameGrid(windows.map(w=>w.timelineDur));
  let cursor=0;const scenes=frames.map(f=>{const s={start:round(cursor/FPS),duration:round(f/FPS)};cursor+=f;return s;});
  const content=prepareContent(job,{subtitles:job.subtitles||[],highlights:job.highlights||[],totalDur});
  const plan=createEditPlan({job,seed:job.styleSeed||safeProject(job.projectName),...content,totalDur,scenes});
  const gate=inspectPlan(gateInput(plan)),punched=punchCuts(windows,job.fx||{});
  const asset=file=>'/assets/'+path.relative(PATHS.assets,file).split(path.sep).map(encodeURIComponent).join('/');
  return {totalDur,hookStart:plan.hookStart,hookDur:plan.hookDur,outroStart:plan.outroStart,outroEnd:plan.outroEnd,titles:plan.typographyPlan.titles,outroDur:plan.outroDur,seed:plan.seed,
    hook:plan.typographyPlan.hook,outro:plan.typographyPlan.outro,hookTimes:plan.hookTimes,outroTimes:plan.outroTimes,
    highlights:plan.highlights.map(h=>{const spec=plan.typographyPlan.highlights.find(x=>x.uid===h.uid);return {...h,text:spec.text,wordOffsets:spec.wordOffsets};}),
    hiddenSubs:plan.subtitles.map((s,i)=>plan.hiddenSubs.has(s)?i:-1).filter(i=>i>=0),subtitles:plan.subtitles,subStyle:subStyle(job.subStyle),brolls:plan.brolls,customFx:plan.customFx,autoFx:plan.autoFx,
    sfx:plan.sfx.map(s=>({anchor:s.anchor,label:s.label,id:s.id,family:s.family,start:s.start,base:s.base,vol:s.vol,gain:s.gain,from:s.from,lead:s.lead,duration:s.duration,full:s.full??s.duration,trimIn:s.trimIn||0,trimOut:s.trimOut||0,user:s.user,url:asset(s.file)})),
    mutedSfx:plan.mutedSfx,scenes,fade:plan.fade,
    effects:[...scenes.flatMap((s,i)=>i?[{key:'cut:'+i,kind:'cut',start:s.start,duration:punched.has(i)?punched.get(i):.04,on:punched.has(i),eligible:punchCuts(windows,{}).has(i)}]:[]),
      ...plan.brolls.flatMap(b=>[{key:'in:'+b.uid,kind:'broll-in',start:b.start,duration:easeOf(b,'easeIn')},...(b.layout==='top_half'?[]:[{key:'out:'+b.uid,kind:'broll-out',start:round(b.end-easeOf(b,'easeOut')),duration:easeOf(b,'easeOut')}])]),
      ...(job.fx?.fade?.off?[]:[{key:'fade',kind:'fade',start:plan.fade.start,duration:plan.fade.duration}]),
      ...(plan.opener?[{key:'auto:open',kind:'opener',recipe:plan.opener,name:OPENERS[plan.opener].name,start:Math.min(...plan.autoFx.filter(e=>e.group==='open').map(e=>e.start)),duration:round(Math.max(...plan.autoFx.filter(e=>e.group==='open').map(e=>e.end))-Math.min(...plan.autoFx.filter(e=>e.group==='open').map(e=>e.start))),auto:true,chosen:!!job.fx?.['auto:open']?.recipe}]:[]),
      ...plan.autoFx.filter(e=>e.group!=='open').map(e=>({key:'auto:'+e.uid,kind:'transition',fxKind:e.kind,start:e.start,duration:round(e.end-e.start),auto:true,chosen:e.chosen})),
      ...plan.customFx.map(e=>({key:'fx:'+e.uid,kind:e.kind,start:e.start,duration:round(e.end-e.start),custom:true}))],
    repeats:gate.repeats,
    warnings:[...getBrollWarnings(plan.subtitles).map(w=>({code:w.code,text:w.text})),...gate.errors.map(e=>({code:e.code,text:e.detail,blocking:true})),...gate.warnings.map(w=>({code:w.code,text:w.detail})),
      ...reviewTexts(plan.subtitles).map(r=>({code:'spelling',text:'Kiểm tra chính tả: "'+r.word+'" trong "'+r.text+'"',index:r.index}))]};
}
module.exports={createEditPlan,prepareContent,planForClient,gateInput,safeProject,MOTIONS};
