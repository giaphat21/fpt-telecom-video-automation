'use strict';
// Live preview: plays the assembled clips and draws titles, Highlights, Sub, B-roll and sound on top, with the same
// typography engine that renders the MP4. Nothing has to be exported to see or hear an edit.
const Live=(()=>{
  const W=1080,H=1920,SCALE=.5;
  const video=()=>document.getElementById('previewVideo'),screen=()=>document.querySelector('.phone-screen');
  let canvas,ctx,mode='none',preview=null,plan=null,specs=[],spans=[],fxList=[],ready=false,raf=0,finalUrl=null,subs=[],brolls=[];
  let music=[],subStyle='chuan';
  let audio=null,buffers=new Map(),voices=[],bgm=null,soundOn=true;
  const media=new Map();
  const listeners=new Set();
  const status=text=>{const el=document.getElementById('liveStatus');if(el)el.textContent=text||'';};
  async function boot(){
    canvas=document.getElementById('liveCanvas');canvas.width=W*SCALE;canvas.height=H*SCALE;ctx=canvas.getContext('2d');
    const engine=window.FptEngine.typography;
    await Promise.all(engine.FONTS.map(async([file,alias])=>{const face=new FontFace(alias,'url(/assets/fonts/'+file+')');document.fonts.add(await face.load());}));
    engine.configure((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
    ready=true;
    const v=video();
    v.addEventListener('play',()=>{startAudio();loop();emit();});
    v.addEventListener('pause',()=>{stopAudio();emit();draw();});
    v.addEventListener('seeking',()=>{if(!v.paused){stopAudio();}});
    v.addEventListener('seeked',()=>{if(wanted!=null){const t=wanted;wanted=null;v.currentTime=t;return;}if(!v.paused)startAudio();draw();emit();});
    v.addEventListener('loadeddata',()=>draw());
    v.addEventListener('timeupdate',()=>{if(v.paused)emit();});
    v.addEventListener('click',()=>{if(mode==='live')toggle();});
    document.getElementById('modeLive').onclick=()=>setMode('live');
    document.getElementById('modeFinal').onclick=()=>setMode('final');
  }
  const emit=()=>listeners.forEach(fn=>fn(time(),!video().paused));
  const time=()=>video().currentTime||0;
  function setMode(next){
    if(next==='final'&&!finalUrl)return;
    if(next==='live'&&!preview)return;
    const v=video(),at=time(),was=mode;mode=next;
    if(was!==next){v.pause();stopAudio();v.src=next==='live'?preview.url:finalUrl;v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(at,Math.max(0,(v.duration||at)-.05));},{once:true});}
    v.controls=next!=='live';
    screen().classList.toggle('live',next==='live');
    document.getElementById('modeLive').setAttribute('aria-pressed',next==='live');
    document.getElementById('modeFinal').setAttribute('aria-pressed',next==='final');
    document.querySelector('.preview-mode').classList.toggle('show',Boolean(preview));
    document.getElementById('modeFinal').disabled=!finalUrl;
    draw();
  }
  function setPreview(next){
    const changed=preview?.key!==next?.key;preview=next;
    for(const b of next?.brolls||[])mediaFor(b.url);
    if(bgm){bgm.pause();bgm=null;}
    if(next?.music){bgm=new Audio(next.music.url);bgm.preload='auto';bgm.volume=Math.min(1,next.music.volume/next.voiceGain);}
    if(changed&&mode==='live'){const v=video(),at=time(),playing=!v.paused;v.src=next.url;v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(at,v.duration||at);if(playing)v.play().catch(()=>{});},{once:true});}
    else if(mode!=='live')setMode('live');
    draw();
  }
  function setFinal(url){finalUrl=url;setMode('final');}
  function clear(){const v=video();v.pause();stopAudio();preview=null;plan=null;specs=[];spans=[];finalUrl=null;mode='none';screen().classList.remove('live');v.controls=true;document.querySelector('.preview-mode').classList.remove('show');status('');if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);}
  function mediaFor(url){
    if(!url)return null;
    if(!media.has(url)){const el=document.createElement('video');el.src=url;el.muted=true;el.loop=true;el.playsInline=true;el.preload='auto';el.addEventListener('seeked',()=>draw());media.set(url,el);}
    return media.get(url);
  }
  // data: {plan, highlights, subtitles, brolls, dragging}
  function update(data){
    plan=data.plan;subs=data.subtitles;brolls=data.brolls;music=data.music||[];subStyle=data.subStyle||'chuan';
    if(!ready||!plan)return;
    // Looks are built when the playhead comes near and kept; dragging one block never rebuilds the others.
    const known=new Map((plan.highlights||[]).map(p=>[p.uid,p]));
    const hook=plan.hook&&plan.hookDur>(plan.hookStart||0)?{kind:'hook',cfg:plan.hook,start:plan.hookStart||0,end:plan.hookDur}:null,outro=plan.outro?{kind:'outro',cfg:plan.outro,start:plan.outroStart,end:plan.outroEnd??plan.totalDur}:null;
    specs=[hook,outro,...(data.titles||[]).map(x=>({kind:'title',cfg:{...x,y:320,scale:1.3,spokenAt:plan.titles?.find(p=>p.uid===x.uid)?.spokenAt},start:x.start,end:x.end}))].filter(Boolean);
    data.highlights.forEach((h,index)=>{
      const p=known.get(h.uid),text=String(h.text).replace(/\s+/g,' ').trim(),start=Number(h.start),end=Number(h.end);if(!text||!(end-start>.03))return;
      specs.push({kind:'highlight',start,end,cfg:{index,text,y:350,scale:1.4,typo:h.typo||p?.typo||'fpt_orange_block',motion:h.motion||p?.motion||'pop_bounce',timingPolicy:'preserve_all',
        wordOffsets:p&&Math.abs(p.start-start)<.002&&p.text===text?p.wordOffsets:undefined}});
    });
    spans=specs.filter(s=>s.kind==='highlight');fxList=data.fx||[];
    if(!soundOn||video().paused)void 0;else{stopAudio();startAudio();}
    draw();
  }
  // ---- titles and Highlights
  const cueCache=new Map();
  function cueOf(s){
    const key=s.kind+'|'+(s.end-s.start).toFixed(3)+'|'+JSON.stringify(s.cfg);let cue=cueCache.get(key);
    if(!cue){
      const engine=window.FptEngine.typography,dur=s.end-s.start;
      try{cue=s.kind==='highlight'?engine.buildHighlight({...s.cfg,start:0,dur}):engine.buildTitle(s.kind,s.cfg,0,dur);}catch(error){console.error(error);}
      cueCache.set(key,cue||null);if(cueCache.size>60)cueCache.delete(cueCache.keys().next().value);
    }else{cueCache.delete(key);cueCache.set(key,cue);}
    return cue?Object.assign(Object.create(Object.getPrototypeOf(cue)),cue,{start:s.start,end:s.end,dur:s.end-s.start}):null;
  }
  let drawerKey='',drawer=null;
  function typography(t){
    const near=specs.filter(s=>t>=s.start-.05&&t<s.end+.05),key=near.map(s=>s.kind+s.start+'|'+s.end+JSON.stringify(s.cfg)).join('~')+spans.length+(near[0]?.kind!=='highlight'?JSON.stringify(spans.map(s=>[s.start,s.end])):'');
    if(!near.length)return null;
    if(key!==drawerKey){drawerKey=key;drawer=window.FptEngine.typography.frameDrawer(near.map(cueOf).filter(Boolean),spans);}
    return drawer(t);
  }
  // ---- drawing
  const ease=p=>Math.pow(1-Math.min(Math.max(p,0),1),3);
  function cover(image,sw,sh,x,y,w,h,zoom=1){
    if(!sw||!sh)return;const s=Math.max(w/sw,h/sh)*zoom,cw=w/s,ch=h/s;ctx.drawImage(image,(sw-cw)/2,(sh-ch)/2,cw,ch,x,y,w,h);
  }
  const easeOf=(b,key,dur)=>Math.max(.03,Math.min(plan.brolls?.find(p=>p.uid===b.uid)?.[key]??.25,dur/2));
  function drawBroll(b,t){
    const place=preview.brolls.find(p=>p.uid===b.uid)||{},el=mediaFor(place.url);if(!el)return;
    const dur=b.end-b.start,local=t-b.start,fadeIn=easeOf(b,'easeIn',dur),fadeOut=easeOf(b,'easeOut',dur),enter=ease(local/fadeIn),leave=b.layout==='top_half'?0:Math.pow(Math.max(0,(local-(dur-fadeOut))/fadeOut),3),zoom=1+.05*local/dur;
    const want=el.duration?local%el.duration:local;
    if(video().paused){if(Math.abs(el.currentTime-want)>.06&&!el.seeking)el.currentTime=want;if(!el.paused)el.pause();}
    else{if(el.paused)el.play().catch(()=>{});if(Math.abs(el.currentTime-want)>.35)el.currentTime=want;}
    if(el.readyState<2)return;
    const alpha=Math.min(1,local/fadeIn)*Math.min(1,(dur-local)/fadeOut);
    ctx.save();
    if(b.layout==='cutaway'){ctx.globalAlpha=Math.max(0,alpha);cover(el,el.videoWidth,el.videoHeight,0,0,W,H,zoom+.1*ease(local/.35));}
    else if(b.layout==='top_half'){
      const v=video(),focus=b.focusChosen?b.hostFocusY:place.hostFocusY??b.hostFocusY??.55,cropY=Math.max(0,Math.min(H-1140,H*focus-1140*.3)),k=v.videoHeight/H;
      if(v.readyState>=2)ctx.drawImage(v,0,cropY*k,v.videoWidth,1140*k,0,780,W,1140);
      ctx.beginPath();ctx.rect(0,0,W,780);ctx.clip();cover(el,el.videoWidth,el.videoHeight,0,-780*enter,W,780,zoom);ctx.restore();ctx.save();
      ['#0066B3','#F37021','#00A651'].forEach((c,i)=>{ctx.fillStyle=c;ctx.fillRect(i*360,774,360,12);});
    }else{
      const card=preview.card,x=card.x,y=((place.cardParts||[]).filter(p=>t>=p.start-.001).at(-1)?.y??place.cardY??card.y)+150*enter+90*leave+3*Math.sin(local*2.2)*(1-enter);
      ctx.globalAlpha=Math.max(0,alpha);
      ctx.save();ctx.beginPath();ctx.roundRect(x,y,card.width,card.height,34);ctx.clip();cover(el,el.videoWidth,el.videoHeight,x,y,card.width,card.height,zoom);ctx.restore();
      ctx.strokeStyle='#fff';ctx.lineWidth=10;ctx.beginPath();ctx.roundRect(x,y,card.width,card.height,34);ctx.stroke();
      ctx.strokeStyle='#F37021';ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(x-7,y-7,card.width+14,card.height+14,41);ctx.stroke();
      ['#0066B3','#F37021','#00A651'].forEach((c,i)=>{ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(x+card.width/2-138+i*94,y+card.height-5,88,12,6);ctx.fill();});
    }
    ctx.restore();
  }
  const SPLIT='\u0001';
  // Same table of looks as the export (src/typography/subtitle_style.js).
  function drawSub(c,s,t,styleId,cx,cy){
    const {subtitleIcon,styleSubtitleKeywords,SUB_STYLES,subStyle:known}=window.FptEngine.subtitle,S=SUB_STYLES[known(styleId)],mono=x=>x.replace(/\uFE0F/g,'').replace(/([\u26A1\u{1F4B0}\u{1F441}\u26BD\u{1F381}])/gu,'$1\uFE0E');
    const local=(t-s.start)*1000,pop=local<85?.7+.48*local/85:local<175?1.18-.18*(local-85)/90:1,icon=mono(subtitleIcon(s.text));
    let words;
    if(S.active){
      const shown=s.text.trim().split(/\s+/),times=(s.words||[]).map(w=>Number(w.startMs)/1000).filter(Number.isFinite),at=shown.map((_,i)=>times.length===shown.length?times[i]:s.start+(s.end-s.start)*i/shown.length);
      let now=0;at.forEach((x,i)=>{if(t>=x)now=i;});
      words=[{text:icon,kind:'n'}].concat(shown.flatMap((w,i)=>[{text:w,kind:i===now?'a':'n'},{text:' ',kind:'n'}])).filter(w=>w.text);
    }else{
      const text=styleSubtitleKeywords(icon+s.text,SPLIT+'K',SPLIT+'N'),runs=text.split(SPLIT).filter(Boolean).map(r=>/^[KN]/.test(r)&&text.includes(SPLIT)?{key:r[0]==='K',text:r.slice(1)}:{key:false,text:r}).filter(r=>r.text);
      words=runs.flatMap(r=>r.text.split(/(\s+)/).filter(Boolean).map(w=>({text:w,kind:r.key?'k':'n'})));
    }
    const look={n:{fill:S.text,line:S.outline,w:S.w,size:43},k:{fill:S.key||S.text,line:S.keyOutline||S.outline,w:S.kw||S.w,size:43*(S.scale||100)/100},a:{fill:S.active,line:S.activeOutline,w:(S.w||9)-1,size:43*(S.scale||100)/100}};
    const font=k=>'bold '+look[k].size.toFixed(1)+'px Arial, "Segoe UI Symbol", "Segoe UI Emoji", sans-serif',lines=[[]];let width=0;
    for(const w of words){c.font=font(w.kind);w.w=c.measureText(w.text).width;if(width+w.w>700&&/\S/.test(w.text)&&width){lines.push([]);width=0;}lines.at(-1).push(w);width+=w.w;}
    c.save();c.translate(cx,cy);c.scale(pop,pop);c.lineJoin='round';c.textBaseline='alphabetic';
    lines.forEach((line,i)=>{
      while(line.length&&!/\S/.test(line.at(-1).text))line.pop();
      const sum=line.reduce((a,w)=>a+w.w,0),x=-sum/2,y=-12-(lines.length-1-i)*(S.box?78:56);
      if(S.box){c.fillStyle=S.box;c.fillRect(x-16,y-46,sum+32,72);}
      for(const pass of S.box?[1]:[0,1]){let q=x;for(const w of line){c.font=font(w.kind);const L=look[w.kind];
        if(!pass){c.strokeStyle=L.line;c.lineWidth=L.w*2;c.shadowColor='rgba(0,0,0,.45)';c.shadowOffsetX=c.shadowOffsetY=3;c.strokeText(w.text,q,y);}
        else{c.shadowColor='transparent';c.fillStyle=L.fill;c.fillText(w.text,q,y);}q+=w.w;}}
    });
    c.restore();
  }
  function draw(){
    if(!ctx||mode!=='live'||!plan)return;
    const t=time();
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(SCALE,0,0,SCALE,0,0);
    const f0=fxList.length?window.FptEngine.fx.frameFx(fxList,t):null,moving=f0&&(f0.zoom!==1||f0.dx||f0.dy||f0.blur>.2);
    if(moving){const v=video();if(v.readyState>=2){ctx.save();if(f0.blur>.2)ctx.filter='blur('+(f0.blur*SCALE).toFixed(1)+'px)';const z=f0.zoom,mx=(z-1)*W/2,my=(z-1)*H/2;ctx.drawImage(v,-mx-Math.max(-mx,Math.min(mx,f0.dx)),-my-Math.max(-my,Math.min(my,f0.dy)),W*z,H*z);ctx.restore();}}
    let used=new Set();
    for(const b of brolls)if(b.enabled!==false&&t>=b.start&&t<b.end){drawBroll(b,t);used.add(preview.brolls.find(p=>p.uid===b.uid)?.url);}
    media.forEach((el,url)=>{if(!used.has(url)&&!el.paused)el.pause();});
    if(f0&&f0.light){ctx.fillStyle=f0.light>0?'rgba(255,255,255,'+Math.min(1,f0.light)+')':'rgba(0,0,0,'+Math.min(1,-f0.light)+')';ctx.fillRect(0,0,W,H);}
    const layer=typography(t);if(layer)ctx.drawImage(layer,0,window.FptEngine.typography.TOP);
    const sub=subs.find((s,i)=>t>=s.start&&t<s.end&&!plan.hiddenSubs?.includes(i));
    if(sub&&sub.text)drawSub(ctx,sub,t,sub.subStyle||subStyle,540,1580);
    const f=plan.fade;if(f&&t>f.start){ctx.fillStyle='rgba(0,0,0,'+Math.min(1,(t-f.start)/f.duration)+')';ctx.fillRect(0,0,W,H);}
  }
  function loop(){cancelAnimationFrame(raf);const tick=()=>{if(video().paused)return;draw();syncMusic(false);emit();raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);}
  // ---- sound
  function context(){if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();return audio;}
  function buffer(url){
    const clean=url.split('#')[0];
    if(!buffers.has(clean))buffers.set(clean,fetch(clean).then(r=>r.arrayBuffer()).then(b=>context().decodeAudioData(b)).catch(()=>null));
    return buffers.get(clean);
  }
  // The piece of music under the playhead, at its own place in the song and its own level.
  function syncMusic(force){
    if(!bgm)return;const t=time(),piece=plan&&!plan.musicOff&&!video().paused&&mode==='live'?music.find(m=>t>=m.start&&t<m.end):null;
    if(!piece){if(!bgm.paused)bgm.pause();return;}
    const want=piece.offset+t-piece.start,length=bgm.duration||1e9,left=piece.end-t;
    if(force||bgm.paused||Math.abs(bgm.currentTime-want%length)>.35)bgm.currentTime=want%length;
    bgm.volume=Math.max(0,Math.min(1,(piece.vol??preview.music.volume)/preview.voiceGain*Math.min(1,left/.12)));
    if(bgm.paused)bgm.play().catch(()=>{});
  }
  function stopAudio(){for(const v of voices){try{v.stop();}catch(_){}}voices=[];if(bgm)bgm.pause();}
  async function startAudio(){
    if(mode!=='live'||!plan||!preview)return;
    const token=startAudio.token={},ac=context();
    syncMusic(true);
    const hits=plan.sfx,loaded=await Promise.all(hits.map(s=>buffer(s.url)));
    if(token!==startAudio.token||video().paused)return;
    stopSfxOnly();
    const now=ac.currentTime,t=time();
    hits.forEach((s,i)=>{
      if(!loaded[i])return;
      const begin=Math.max(0,s.start-s.lead),early=Math.max(0,s.lead-s.start),delay=begin-t,length=Math.max(.05,s.duration-early);
      if(delay<-length)return;
      const skip=Math.max(0,-delay),src=ac.createBufferSource(),gain=ac.createGain();
      src.buffer=loaded[i];gain.gain.value=s.gain*s.vol/preview.voiceGain;src.connect(gain).connect(ac.destination);
      const at=now+Math.max(0,delay),left=length-skip,fade=Math.min(.09,length/3);
      gain.gain.setValueAtTime(gain.gain.value,Math.max(at,at+left-fade));gain.gain.linearRampToValueAtTime(0.0001,at+left);
      src.start(at,s.from+early+skip,left);voices.push(src);
    });
  }
  function stopSfxOnly(){for(const v of voices){try{v.stop();}catch(_){}}voices=[];}
  async function audition(s){
    const b=await buffer(s.url);if(!b)return;const ac=context(),src=ac.createBufferSource(),gain=ac.createGain();
    src.buffer=b;gain.gain.value=(s.gain||1)*(s.vol??.4);src.connect(gain).connect(ac.destination);src.start(0,s.from||0,s.duration||undefined);
  }
  function toggle(){const v=video();if(!v.getAttribute('src'))return;if(v.paused){if(v.ended||v.currentTime>=(v.duration||1e9)-.05)v.currentTime=0;v.play().catch(()=>{});}else v.pause();}
  let wanted=null;
  function seek(t){
    const v=video();if(!v.getAttribute('src'))return;
    t=Math.max(0,Math.min(v.duration||t,t));
    if(v.seeking){wanted=t;return;}
    wanted=null;v.currentTime=t;
  }
  function subSample(target,styleId,text){
    const c=target.getContext('2d'),words=text.split(/\s+/);c.setTransform(1,0,0,1,0,0);c.fillStyle='#6d7a70';c.fillRect(0,0,target.width,target.height);
    const k=target.width/560;c.setTransform(k,0,0,k,0,0);drawSub(c,{text,start:0,end:9,words:words.map((_,i)=>({startMs:i*500}))},1.1,styleId,280,target.height/k/2+24);
  }
  return {subSample,boot,update,setPreview,setFinal,setMode,clear,toggle,seek,time,draw,audition,status,onTime:fn=>listeners.add(fn),get mode(){return mode;},get hasMedia(){return Boolean(video().getAttribute('src'));},get playing(){return !video().paused;},get preview(){return preview;},get isReady(){return ready;}};
})();
