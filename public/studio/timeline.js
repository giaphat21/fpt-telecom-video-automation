'use strict';
// Timeline editor. It shows the server's edit plan (exactly what will be rendered) and sends every change back through it:
// nothing on screen is estimated, and nothing in the video is missing from a track.
let timelineCurrentTime=0,timelineZoom=1,isTimelineScrubbing=false,selectedTimelineItem=null,studioPlan=null;
const STYLE_NAMES={fpt_editorial_stack:'Editorial FPT',fpt_offset_echo:'Echo ba màu',fpt_bracket_focus:'Khung tiêu điểm',fpt_ribbon_cut:'Ruy băng cắt',fpt_price_burst:'Nổ giá',fpt_voucher_3d:'Vé ưu đãi',fpt_football_match:'Trận cầu',fpt_speed_hud:'HUD tốc độ',fpt_camera_smart:'Camera AI',fpt_neon_glass:'Kính FPT',fpt_split_kicker:'Dòng đôi',fpt_tricolor_slab:'Dải 3 màu',fpt_orange_block:'Khối cam',fpt_blue_pill:'Viên xanh dương',fpt_green_badge:'Thẻ xanh lá',fpt_stack_outline:'Viền nổi',fpt_logo_blocks:'Khối logo',fpt_fiber_line:'Sợi quang',fpt_signal_bars:'Vạch sóng',fpt_wifi_wave:'Sóng Wi-Fi',fpt_router_led:'Đèn router',fpt_data_stream:'Dòng dữ liệu',fpt_speed_gauge:'Đồng hồ tốc độ',fpt_connect_nodes:'Nút kết nối',neg_wall_block:'Vấp tường',neg_weak_signal:'Sóng yếu',neg_lag_glitch:'Giật lag',neg_strike_cross:'Gạch bỏ',neg_warning_tape:'Băng cảnh báo',neg_crack_sink:'Nứt vỡ',neg_wifi_off:'Mất Wi-Fi',neg_down_trend:'Tụt dốc',
  slab_stack:'Dải nghiêng',logo_blocks:'Khối logo',mega_outline:'Chữ lớn viền',glass_card:'Thẻ kính',ribbon_wave:'Ruy băng',signal_pop:'Bật tín hiệu',ticket_banner:'Vé ưu đãi',fiber_neon:'Sợi quang',type_terminal:'Gõ chữ',stamp_seal:'Đóng dấu',swing_tag:'Thẻ đung đưa',curtain_bar:'Mở rèm',glitch_cut:'Nhiễu sóng',wave_bounce:'Chữ nhảy sóng',corner_frame:'Khung góc',spotlight_ring:'Xoay vào',arrow_rush:'Lao tới',tri_blocks:'Ba khối nối mạng',neon_glow:'Neon phát sáng',extrude_pop:'Chữ khối 3D',split_open:'Mở đôi',light_beam:'Tia sáng quét'};
const MOTION_NAMES={pop_bounce:'Bật nảy',slide_left:'Trượt trái',slide_right:'Trượt phải',slam_drop:'Dập xuống'};
const TL=(()=>{
  const TRACKS=[
    {id:'video',name:'Video',h:38,c:'#2a4a7f'},{id:'broll',name:'B-roll',h:34,c:'#8a4a1f'},{id:'title',name:'Tiêu đề',h:34,c:'#c9560f'},{id:'highlight',name:'Highlight',h:40,c:'#0066b3'},
    {id:'sub',name:'Sub text',h:36,c:'#3c6f63'},{id:'fx',name:'Hiệu ứng',h:30,c:'#5d6573'},{id:'sfx',name:'SFX',h:62,c:'#00803f'},{id:'voice',name:'Giọng nói',h:40,c:'#7d8491'},{id:'music',name:'Nhạc nền',h:28,c:'#4a5160'}];
  const FAMILY={whoosh:'#2b6ca8',impact:'#7a3b12',riser:'#7c5a12',pop:'#00803f',run:'#1f7a74',tone:'#0a6f9e',mech:'#4f5968',bell:'#b25a10',cash:'#8a6a00'};
  const $=id=>document.getElementById(id),r3=n=>Math.round(n*1000)/1000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),fmt=n=>Number(n||0).toFixed(2);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows=new Map(),els=new Map();
  let px=60,built=false,frame=0,planTimer=0,planVersion=0,prepareTimer=0,prepareKey='',prepareVersion=0,snapOn=true,undoStack=[],redoStack=[],drag=null,planBusy=false,needsPlan=false;
  const isOpen=()=>$('tlCollapseBtn').getAttribute('aria-expanded')==='true';
  const total=()=>getTimelineTotalDuration();
  // ---- build the static frame once
  function build(){
    if(built)return;built=true;
    const heads=$('tlHeads'),inner=$('timelineCanvasInner');
    heads.innerHTML='<div class="tl-head" style="height:24px;--c:transparent">Thời gian</div>'+TRACKS.map(t=>`<div class="tl-head" style="height:${t.h}px;--c:${t.c}">${t.name}<small id="tlCount_${t.id}"></small></div>`).join('');
    TRACKS.forEach((t,i)=>{const row=document.createElement('div');row.className='tl-row'+(i%2?' alt':'');row.style.setProperty('--row',t.h+'px');row.dataset.track=t.id;inner.insertBefore(row,$('timelinePlayhead'));rows.set(t.id,row);});
    const wave=document.createElement('canvas');wave.className='tl-wave';rows.get('voice').appendChild(wave);
    const ruler=document.createElement('canvas');$('timelineRuler').appendChild(ruler);
    const wrap=$('timelineScrollWrap');
    wrap.addEventListener('pointerdown',onDown);
    let scrolling=0;wrap.addEventListener('scroll',()=>{if(!scrolling)scrolling=requestAnimationFrame(()=>{scrolling=0;drawCanvases();visibleOnly();});},{passive:true});
    wrap.addEventListener('wheel',e=>{
      if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();
      const rect=wrap.getBoundingClientRect(),x=e.clientX-rect.left,t=(x+wrap.scrollLeft)/px;
      setZoom(timelineZoom*(e.deltaY<0?1.18:1/1.18),t);wrap.scrollLeft=t*px-x;drawCanvases();
    },{passive:false});
    Live.onTime((t,playing)=>{if(isTimelineScrubbing)return;timelineCurrentTime=t;playhead(playing);});
  }
  function measure(){const wrap=$('timelineScrollWrap'),d=total();px=Math.max(14,(wrap.clientWidth||800)/d*timelineZoom);return Math.max(wrap.clientWidth||800,Math.ceil(d*px));}
  const MAX_ZOOM=40;
  function setZoom(z,anchor=null){
    const wrap=$('timelineScrollWrap'),x=timelineCurrentTime*px-wrap.scrollLeft;
    timelineZoom=clamp(z,1,MAX_ZOOM);$('tlZoom').value=Math.log(timelineZoom)/Math.log(MAX_ZOOM)*100;paint();
    if(anchor==null&&x>=0&&x<=wrap.clientWidth){wrap.scrollLeft=timelineCurrentTime*px-x;drawCanvases();}
  }
  // A one-minute video squeezed into the window cannot be read: open at a size where every word is legible.
  function comfortable(){const wrap=$('timelineScrollWrap'),fitPx=(wrap.clientWidth||900)/total();return fitPx>=58?1:clamp(78/fitPx,1,MAX_ZOOM);}
  let zoomedFor='';
  // ---- what is on each track
  function model(){
    const out=[],plan=studioPlan,sel=selectedTimelineItem;
    const add=(track,type,index,key,start,end,label,extra={})=>out.push({track,type,index,key,start,end,label,sel:sel&&sel.type===type&&String(sel.index)===String(index),...extra});
    currentClipWindows.forEach((c,i)=>add('video','video',i,'v'+i,c.timelineStart||0,(c.timelineStart||0)+(c.timelineDur||1),'#'+(i+1)+' '+String(c.fileRef||'').replace(/^[0-9a-f-]{36}_/,''),{color:i%2?'#34568f':'#2a4a7f',trim:!c.estimated,title:'Cảnh '+(i+1)+': '+fmt(c.trimStart)+'–'+fmt(c.trimEnd)+'s của '+c.fileRef}));
    currentBrollCutaways.forEach((b,i)=>{if(b.enabled===false||(b.brollId&&ALL_BROLL_TOPICS.includes(b.brollId)&&!enabledBrollIds.has(b.brollId)))return;
      add('broll','broll',i,'b'+(b.uid||b.id||i),Number(b.start),Number(b.end),(b.icon||'')+' '+(b.name||'B-roll'),{trim:true,edited:b.timingSource==='manual',title:(LAYOUT_INFO[b.layout]?.label||b.layout)+' · '+fmt(b.start)+'–'+fmt(b.end)+'s'});});
    const hookText=['hook1','hook2','hook3','hook4'].map(id=>$(id).value.trim()).filter(Boolean).join(' · '),outroText=['outro1','outro2','outro3'].map(id=>$(id).value.trim()).filter(Boolean).join(' · ');
    const look=s=>STYLE_NAMES[s]||'';
    if(hookText&&(plan?.hook||currentClipWindows.length))add('title','hook',0,'hook',plan?.hookStart||0,plan?.hookDur??3.5,'Hook · '+look(plan?.hook?.style)+' · '+hookText,{color:'#c9560f',trim:Boolean(plan),edited:hookDurManual!=null||hookStartManual!=null,ticks:(plan?.hookTimes?.lines||[]).concat(plan?.hookTimes?.landed??[],(plan?.hookTimes?.spoken||[]).filter(x=>x!=null)),title:'Hook: '+hookText});
    if(plan?.outro&&outroText)add('title','outro',0,'outro',plan.outroStart,plan.outroEnd??plan.totalDur,'Outro · '+look(plan.outro.style)+' · '+outroText,{color:'#00803f',trim:true,edited:outroStartManual!=null||outroEndManual!=null,ticks:plan.outroTimes?.lines,title:'Outro: '+outroText});
    extraTitles.forEach(x=>add('title','title',x.uid,'t'+x.uid,x.start,x.end,look(x.style)+' · '+[x.line1,x.line2,x.line3,x.line4].filter(Boolean).join(' · '),{color:'#9a3f86',trim:true,edited:true,title:'Tiêu đề: '+x.line1}));
    const badSubs=new Map((plan?.warnings||[]).filter(w=>w.code==='spelling').map(w=>[w.index,w.text]));
    currentHighlights.forEach((h,i)=>add('highlight','highlight',i,'h'+(h.uid||i),Number(h.start),Number(h.end)||Number(h.start)+2,h.text,{trim:true,edited:h.edited||h.styleFrom==='user',title:h.text+'\n'+(STYLE_NAMES[h.typo]||'Tự chọn')+' · '+(MOTION_NAMES[h.motion]||'')+' · '+fmt(h.start)+'–'+fmt(h.end)+'s'}));
    currentSubtitles.forEach((s,i)=>add('sub','sub',i,'s'+(s.id??i)+'_'+i,Number(s.start),Number(s.end),s.text,{trim:true,edited:s.edited,bad:badSubs.has(i),title:badSubs.get(i)||s.text+'\n'+fmt(s.start)+'–'+fmt(s.end)+'s'}));
    const FX={'cut':'Zoom cảnh','broll-in':'B-roll vào','broll-out':'B-roll ra','fade':'Tối dần'},kinds=window.FptEngine.fx.KINDS;
    customFx.forEach(e=>add('fx','fx','fx:'+e.uid,'cfx'+e.uid,e.start,e.end,kinds[e.kind].name,{color:'#7a4fa3',trim:true,edited:true,min:22,title:kinds[e.kind].name+' · '+fmt(e.start)+'–'+fmt(e.end)+'s'}));
    (plan?.effects||[]).filter(e=>!e.custom&&!(e.kind==='cut'&&!e.on)).forEach(e=>add('fx','fx',e.key,'fx'+e.key,e.start,e.start+e.duration,FX[e.kind],{color:e.kind==='cut'?'#6b5a2e':e.kind==='fade'?'#23262d':'#4b5a6b',fixed:true,trimLeft:e.kind==='broll-out'||e.kind==='fade',trimRight:e.kind==='broll-in'||(e.kind==='cut'&&e.on),off:e.kind==='cut'&&!e.on,min:18,title:FX[e.kind]+' · '+fmt(e.start)+'s'+(e.kind==='cut'?(e.on?' · đang bật':' · đang tắt'):'')}));
    const lanes=[-1,-1,-1];
    [...(plan?.sfx||[]),...(plan?.mutedSfx||[])].sort((a,b)=>a.start-b.start).forEach(s=>{
      const from=Math.max(0,s.start-(s.lead||0)),to=from+Math.max(.1,s.duration||.3);
      let lane=lanes.findIndex(end=>from>=end);if(lane<0)lane=lanes.indexOf(Math.min(...lanes));lanes[lane]=Math.max(from+34/px,to);
      add('sfx','sfx',s.anchor,'x'+s.anchor,from,to,s.id||'đã tắt',{color:FAMILY[s.family]||'#444',lane,hit:s.start-from,trim:!s.muted,off:s.muted,edited:s.user,min:30,title:s.label+(s.id?' · '+s.id:'')+' · '+fmt(s.start)+'s'});
    });
    if(currentClipWindows.length&&Live.preview?.music&&!musicOff())musicPieces().forEach(m=>add('music','music',m.uid,'m'+m.uid,m.start,m.end,'♪ '+Live.preview.music.name+' · từ giây '+fmt(m.offset),{trim:true,color:'#3a4150',edited:Boolean(musicSegments),title:'Nhạc nền '+fmt(m.start)+'–'+fmt(m.end)+'s, lấy từ giây '+fmt(m.offset)+' của bài'}));
    return out;
  }
  const musicPieces=()=>musicSegments||[{uid:'all',start:0,end:total(),offset:Live.preview?.music?.start||0,vol:Live.preview?.music?.volume??.18}];
  // The default single piece becomes editable the moment it is touched.
  function ownMusic(){if(!musicSegments)musicSegments=musicPieces().map(m=>({...m}));return musicSegments;}
  const musicOff=()=>$('disableBgmToggle').checked;
  // ---- paint: reuse elements, touch only what changed
  function render(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;paint();});}
  function paint(){
    syncClipWindows();
    if(!isOpen())return;
    build();
    const width=measure();$('timelineCanvasInner').style.width=width+'px';
    if(zoomedFor!==studioSeed&&total()>2&&$('timelineScrollWrap').clientWidth>100&&analysed()){zoomedFor=studioSeed;timelineZoom=comfortable();$('tlZoom').value=Math.log(timelineZoom)/Math.log(MAX_ZOOM)*100;$('timelineCanvasInner').style.width=measure()+'px';}
    items=model();counts={};for(const it of items)counts[it.track]=(counts[it.track]||0)+1;
    visibleOnly();
    TRACKS.forEach(t=>{const c=$('tlCount_'+t.id);if(c)c.textContent=counts[t.id]&&!['voice','music'].includes(t.id)?counts[t.id]:'';});
    drawCanvases();playhead(false);issues();
  }
  let items=[],counts={};
  // Only blocks near the visible part exist in the page: the cost of an edit does not grow with the length of the video.
  function visibleOnly(){
    if(!built)return;
    const wrap=$('timelineScrollWrap'),from=(wrap.scrollLeft-400)/px,to=(wrap.scrollLeft+wrap.clientWidth+400)/px,alive=new Set();
    for(const it of items){
      if((it.end<from||it.start>to)&&drag?.key!==it.key)continue;
      alive.add(it.key);
      let el=els.get(it.key);
      if(!el){el=document.createElement('div');el.innerHTML='<span></span>';el.dataset.key=it.key;els.set(it.key,el);rows.get(it.track).appendChild(el);}
      el._item=it;
      const track=TRACKS.find(t=>t.id===it.track),left=it.start*px,w=Math.max(it.min||10,(it.end-it.start)*px-1.5);
      const cls='tl-b'+(it.track==='sfx'?' tl-s':'')+(it.sel?' sel':'')+(it.off?' off':'')+(it.bad?' bad':'')+(it.edited?' edited':'')+(it.fixed?' fixed':'')+(drag?.key===it.key?' drag':'');
      const sig=[cls,left.toFixed(2),w.toFixed(2),it.label,it.color,it.lane,it.hit,it.title,it.trim,it.trimLeft,it.trimRight,(it.ticks||[]).join()].join('|');
      if(el._sig===sig)continue;el._sig=sig;
      el.className=cls;el.style.transform='translateX('+left.toFixed(2)+'px)';el.style.width=w.toFixed(2)+'px';el.style.setProperty('--c',it.color||track.c);
      if(it.lane!=null){el.style.top=(3+it.lane*18)+'px';el.style.bottom='auto';el.style.height='16px';}
      el.firstChild.textContent=w<26?'':it.label;el.title=it.title||it.label;
      el.querySelectorAll('.tl-h,.tl-hit,.tl-tick').forEach(n=>n.remove());
      const part=(c,style)=>{const n=document.createElement('i');n.className=c;Object.assign(n.style,style||{});el.appendChild(n);};
      if(it.trim||it.trimLeft)part('tl-h l');
      if(it.trim||it.trimRight)part('tl-h r');
      if(it.hit!=null)part('tl-hit',{left:(it.hit*px).toFixed(1)+'px'});
      (it.ticks||[]).forEach(t=>part('tl-tick',{left:((t-it.start)*px).toFixed(1)+'px'}));
    }
    for(const [key,el] of els)if(!alive.has(key)){el.remove();els.delete(key);}
  }
  function fit(canvas,h){const wrap=$('timelineScrollWrap'),w=wrap.clientWidth,dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';}const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);return [c,w,wrap.scrollLeft];}
  function drawCanvases(){
    if(!built||!isOpen())return;
    const [c,w,sx]=fit($('timelineRuler').firstChild,24),d=total();
    const step=[.1,.2,.5,1,2,5,10,30].find(s=>s*px>=58)||60,minor=step/5;
    c.font="10px 'JetBrains Mono',monospace";c.fillStyle='#8d94a1';
    for(let t=Math.floor(sx/px/minor)*minor;t<=d+.001&&t*px-sx<w;t+=minor){
      const x=t*px-sx,major=Math.abs(t/step-Math.round(t/step))<.001;c.fillStyle=major?'#5f6673':'#2b2f37';c.fillRect(x,major?12:18,1,12);
      if(major){c.fillStyle='#8d94a1';c.fillText((step<1?t.toFixed(1):Math.round(t))+'s',x+4,11);}
    }
    const peaks=Live.preview?.peaks,[v,vw,vsx]=fit(rows.get('voice').firstChild,38);
    if(peaks?.length){v.fillStyle='#8f97a5';for(let x=0;x<vw;x++){const a=Math.floor((x+vsx)/px*100),b=Math.max(a+1,Math.floor((x+1+vsx)/px*100));let p=0;for(let i=a;i<b&&i<peaks.length;i++)p=Math.max(p,peaks[i]);if(a<peaks.length){const h=Math.max(1,p/255*32);v.fillRect(x,19-h/2,1,h);}}}
    else if(currentClipWindows.length){v.fillStyle='#6b7280';v.font='11px sans-serif';v.fillText('Đang dựng sóng âm…',10,23);}
  }
  function playhead(follow){
    if(!built)return;
    const x=timelineCurrentTime*px,wrap=$('timelineScrollWrap');
    $('timelinePlayhead').style.transform='translateX('+x.toFixed(1)+'px)';
    const f=t=>Math.floor(t/60)+':'+(t%60).toFixed(2).padStart(5,'0');
    $('timelineTimeDisplay').textContent=f(timelineCurrentTime)+' / '+f(total());
    $('tlPlayBtn').textContent=Live.playing?'Dừng':'Phát';
    if(follow&&(x<wrap.scrollLeft||x>wrap.scrollLeft+wrap.clientWidth-40))wrap.scrollLeft=Math.max(0,x-wrap.clientWidth*.15);
  }
  function issues(){
    const list=studioPlan?.repeats||[],button=$('tlFixStyles');
    button.hidden=!list.length;if(list.length)button.textContent='Tự đổi '+list.length+' kiểu chữ bị lặp';
  }
  // Repeated looks get another one that fits the rules; everything else keeps its choice.
  function fixStyles(){
    const ids=new Set(studioPlan?.repeats||[]);if(!ids.size)return;remember();
    currentHighlights.forEach(h=>{if(ids.has(h.uid)){delete h.styleFrom;delete h.typo;}});
    changed({now:true});note('Đã đổi kiểu cho '+ids.size+' cụm bị lặp.');
  }
  // ---- plan and preview
  function changed({prepare=false,now=false}={}){
    render();pushLive();
    clearTimeout(planTimer);planTimer=setTimeout(()=>{planTimer=0;refreshPlan();},now?0:160);
    if(prepare){clearTimeout(prepareTimer);prepareTimer=setTimeout(refreshPreview,450);}
  }
  const analysed=()=>currentSubtitles.length>0&&currentClipWindows.length>0&&currentClipWindows.every(w=>!w.estimated);
  function pushLive(){
    if(studioPlan)studioPlan.musicOff=musicOff();
    Live.update({plan:studioPlan,highlights:currentHighlights,subtitles:currentSubtitles,brolls:currentBrollCutaways,titles:extraTitles,fx:customFx,music:Live.preview?.music?musicPieces():[],subStyle:subStyleId});
  }
  async function refreshPlan(){
    if(!analysed())return;
    if(drag||planBusy){needsPlan=true;return;}
    const version=++planVersion;planBusy=true;needsPlan=false;
    try{
      const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(buildRenderPayload())}),data=await response.json();
      if(!response.ok||!data.ok)throw Error(data.error||'Không lập được kế hoạch dựng.');
      if(version===planVersion&&!drag&&!needsPlan&&analysed())adopt(data.plan);
    }catch(error){Live.status(error.message);}
    finally{planBusy=false;if(needsPlan)changed({now:true});}
  }
  // Remember what the plan chose, so editing one item never reshuffles the others.
  function adopt(plan){
    const first=!studioPlan;
    if(!currentHighlights.length&&!highlightsTouched&&plan.highlights.length){
      currentHighlights=plan.highlights.map(h=>({...h,styleFrom:'plan'}));renderHighlightsList();
    }else{
      const byId=new Map(plan.highlights.map(h=>[h.uid,h]));
      currentHighlights.forEach((h,i)=>{if(!h.uid)h.uid='h'+(h.id??i+1);const p=byId.get(h.uid);if(!p)return;if(h.styleFrom!=='user'){h.typo=p.typo;h.styleFrom='plan';}h.motion=p.motion;if(!h.edited){h.start=p.start;h.end=p.end;}});
    }
    plan.brolls.forEach((p,i)=>{const b=activeBrolls()[i];if(b&&!b.uid)b.uid=p.uid;});
    plan.sfx.forEach(s=>{if(!s.anchor.startsWith('custom:'))sfxOverrides[s.anchor]={...(sfxOverrides[s.anchor]||{}),id:s.id};});
    if(plan.hook)hookStyle=plan.hook.style;
    if(plan.outro)outroStyle=plan.outro.style;
    studioPlan=plan;render();pushLive();
    if(first)refreshPreview();
    if(selectedTimelineItem&&!$('tlInspector').contains(document.activeElement))inspector();
  }
  const activeBrolls=()=>currentBrollCutaways.filter(b=>b.enabled!==false&&(!ALL_BROLL_TOPICS.includes(b.brollId)||enabledBrollIds.has(b.brollId)));
  async function refreshPreview(){
    if(!analysed())return;
    const payload=buildRenderPayload(),key=JSON.stringify([payload.clipWindows,payload.voiceSpeed,payload.fx,payload.brollCutaways.map(b=>[b.uid,b.brollId,b.file,b.layout,b.start,b.end]),payload.customBgm,payload.bgmMode,payload.disableBgm]);
    if(key===prepareKey)return;
    const version=++prepareVersion;prepareKey=key;Live.status('Đang chuẩn bị xem trước…');
    try{
      const response=await fetch('/api/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();
      if(!response.ok||!data.ok)throw Error(data.error||'Không dựng được bản xem trước.');
      if(version!==prepareVersion)return;
      Live.setPreview(data.preview);Live.status('Xem trước trực tiếp: chữ, B-roll và âm thanh như bản xuất');render();pushLive();
    }catch(error){if(version===prepareVersion){prepareKey='';Live.status('Chưa xem trước được: '+error.message);}}
  }
  // ---- undo
  const snapshot=()=>structuredClone({currentSubtitles,currentHighlights,currentClipWindows,currentBrollCutaways,sfxOverrides,customSfx,fxState,customFx,hookStyle,outroStyle,outroStartManual,outroEndManual,hookStartManual,hookDurManual,extraTitles,musicSegments,subStyleId,userEditedHook,highlightsTouched,titles:['hook1','hook2','hook3','hook4','outro1','outro2','outro3'].map(id=>$(id).value)});
  let pending=null;
  function remember(){undoStack.push(snapshot());if(undoStack.length>80)undoStack.shift();redoStack=[];buttons();}
  // Typing creates one undo step per pause, not one per letter.
  function rememberTyping(){if(!pending)remember();clearTimeout(pending);pending=setTimeout(()=>{pending=null;},900);}
  function restore(s){
    currentSubtitles=s.currentSubtitles;currentHighlights=s.currentHighlights;currentClipWindows=s.currentClipWindows;currentBrollCutaways=s.currentBrollCutaways;sfxOverrides=s.sfxOverrides;customSfx=s.customSfx;fxState=s.fxState;customFx=s.customFx;hookStyle=s.hookStyle;outroStyle=s.outroStyle;outroStartManual=s.outroStartManual;outroEndManual=s.outroEndManual;hookStartManual=s.hookStartManual;hookDurManual=s.hookDurManual;extraTitles=s.extraTitles;musicSegments=s.musicSegments;subStyleId=s.subStyleId;syncSubStyle();userEditedHook=s.userEditedHook;highlightsTouched=s.highlightsTouched;
    ['hook1','hook2','hook3','hook4','outro1','outro2','outro3'].forEach((id,i)=>{$(id).value=s.titles[i];});
    selectedTimelineItem=null;lists();inspector();changed({prepare:true,now:true});
  }
  function undo(){if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop());buttons();}
  function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop());buttons();}
  function buttons(){$('tlUndo').disabled=!undoStack.length;$('tlRedo').disabled=!redoStack.length;}
  // The side lists are rebuilt only while they are open, once per frame at most.
  let listFrame=0;
  function lists(){if(listFrame)return;listFrame=requestAnimationFrame(()=>{listFrame=0;renderSubList();renderHighlightsList();renderBrollQueue();});}
  // ---- pointer
  function snapPoints(skip){
    const pts=[0,total(),timelineCurrentTime];
    for(const it of items){if(it.key===skip)continue;if(['video','broll','title','highlight','sub','music'].includes(it.track))pts.push(it.start,it.end);}
    for(const s of currentSubtitles)for(const w of s.words||[]){const t=Number(w.startMs)/1000;if(Number.isFinite(t))pts.push(t);}
    return pts;
  }
  function snap(t,points){
    const line=$('tlSnap');line.style.display='none';
    if(!snapOn||!points)return t;
    let best=null;for(const p of points)if(Math.abs(p-t)*px<7&&(best==null||Math.abs(p-t)<Math.abs(best-t)))best=p;
    if(best==null)return t;
    line.style.display='block';line.style.left=(best*px)+'px';return best;
  }
  function onDown(e){
    if(e.button>0)return;
    const wrap=$('timelineScrollWrap'),block=e.target.closest('.tl-b');
    if(!block){scrub(e);return;}
    e.preventDefault();
    // Keyboard shortcuts belong to the timeline after a click on it, not to a text box that had the focus before.
    if(document.activeElement&&document.activeElement!==document.body)document.activeElement.blur();
    const it=block._item,handle=e.target.closest('.tl-h');
    select(it.type,it.index,{seek:false});
    const side=handle?(handle.classList.contains('l')?'l':'r'):null;
    if(it.off||(!side&&it.fixed))return;
    const before=snapshot(),startX=e.clientX,points=snapPoints(it.key);
    drag={key:it.key,type:it.type,item:it,side,start:it.start,end:it.end,moved:false};
    wrap.setPointerCapture(e.pointerId);
    let x=startX,queued=0;
    const apply=()=>{
      queued=0;if(!drag)return;
      const dt=(x-startX)/px;if(!drag.moved&&Math.abs(x-startX)<3)return;drag.moved=true;
      const len=it.end-it.start;let a=it.start,b=it.end;
      if(side==='l')a=clamp(snap(it.start+dt,points),0,b-.08);
      else if(side==='r')b=Math.max(a+.08,snap(it.end+dt,points));
      else if(it.type==='sfx'){const hit=snap(it.start+it.hit+dt,points);a=Math.max(-it.hit,hit-it.hit);b=a+len;}
      else{a=Math.max(0,it.start+dt);const s1=snap(a,points);if(s1!==a)a=s1;else{const s2=snap(a+len,points);a=s2-len;}a=Math.max(0,a);b=a+len;}
      [a,b]=limits(it,a,b,side);
      drag.start=a;drag.end=b;
      const el=els.get(it.key);if(!el)return;el.style.willChange='transform';el.style.transform='translateX('+(a*px).toFixed(2)+'px)';el.style.width=Math.max(10,(b-a)*px-1.5).toFixed(2)+'px';el.classList.add('drag');
      previewDrag(it,a,b);
    };
    const move=ev=>{x=ev.clientX;if(!queued)queued=requestAnimationFrame(apply);};
    const up=()=>{
      wrap.removeEventListener('pointermove',move);wrap.removeEventListener('pointerup',up);wrap.removeEventListener('pointercancel',up);
      if(queued){cancelAnimationFrame(queued);apply();}
      $('tlSnap').style.display='none';
      const d=drag;drag=null;{const el=els.get(it.key);if(el){el.classList.remove('drag');el.style.willChange='';}}
      if(d?.moved){undoStack.push(before);redoStack=[];buttons();commit(it,r3(d.start),r3(d.end),side);}
      else if(!side)seekTimeline(it.type==='sfx'?it.start+it.hit:it.start);
      if(needsPlan)changed({now:true});
    };
    wrap.addEventListener('pointermove',move);wrap.addEventListener('pointerup',up);wrap.addEventListener('pointercancel',up);
  }
  // Highlights keep their gap, B-roll stays between Hook and Outro and never overlaps: the same rules the export enforces.
  const titleItems=()=>items.filter(i=>i.track==='title');
  const hookLimit=()=>Math.max(.4,Math.min(total(),...activeBrolls().map(b=>Number(b.start)),...titleItems().filter(i=>i.type!=='hook'&&i.start>=(studioPlan?.hookStart||0)+.05).map(i=>i.start)));
  function limits(it,a,b,side){
    const len=b-a,kind=it.type,min={highlight:.2,sub:.08,broll:.2,sfx:.05,music:.1,fx:.03}[kind]||.4;
    let lo=0,hi=total(),others=[];const gap=kind==='highlight'?.08:0;
    if(kind==='highlight')others=currentHighlights.filter((_,i)=>i!==Number(it.index));
    else if(kind==='broll'){const self=currentBrollCutaways[it.index];others=activeBrolls().filter(b=>b!==self);if(studioPlan){lo=studioPlan.hookDur;hi=studioPlan.outro?studioPlan.outroStart:hi;}}
    else if(['hook','outro','title'].includes(kind)){
      others=titleItems().filter(i=>i.key!==it.key);
      const rolls=activeBrolls();
      if(kind==='hook')hi=Math.min(hi,...rolls.map(r=>Number(r.start)));
      if(kind==='outro')lo=Math.max(lo,...rolls.map(r=>Number(r.end)));
    }else if(kind==='music')others=musicPieces().filter(m=>m.uid!==it.index&&'m'+m.uid!==it.key);
    else if(kind==='sfx'){const s=sfxOf(it.index);if(side==='l')lo=Math.max(0,it.start-(s?.trimIn||0));if(side==='r')hi=it.end+(s?.trimOut||0);}
    else if(kind==='fx'&&String(it.index).startsWith('fx:')){if(side==='l')a=clamp(a,0,b-.08);else if(side==='r')b=clamp(b,a+.08,hi);else{a=clamp(a,0,hi-len);b=a+len;}return [a,b];}
    else if(kind==='fx'){
      const b0=currentBrollCutaways.find(x=>x.uid===String(it.index).replace(/^(in|out):/,'')),half=b0?(b0.end-b0.start)/2:.8;
      const max=String(it.index).startsWith('cut:')?.8:it.index==='fade'?total()-.5:half,low=it.index==='fade'?.1:.06;
      return side==='l'?[clamp(a,b-max,b-low),b]:[a,clamp(b,a+low,a+max)];
    }else if(kind==='video')return side?[a,b]:[Math.max(0,a),Math.max(0,a)+len];
    if(kind==='music'&&side==='l'){const m=musicPieces().find(x=>'m'+x.uid===it.key||x.uid===it.index);if(m)lo=Math.max(lo,m.start-m.offset);}
    if(kind!=='sub'&&kind!=='sfx')for(const o of others){const os=Number(o.start),oe=Number(o.end);if(oe<=it.start+.02)lo=Math.max(lo,oe+gap);if(os>=it.end-.02)hi=Math.min(hi,os-gap);}
    if(side==='l')a=clamp(a,lo,b-min);else if(side==='r')b=clamp(b,a+min,hi);
    else if(kind!=='sfx'){a=clamp(a,lo,Math.max(lo,hi-len));b=Math.min(hi,a+len);}
    return [a,b];
  }
  function previewDrag(it,a,b){
    const time=$('tlPropStart'),end=$('tlPropEnd');if(time)time.value=fmt(it.type==='sfx'?a+it.hit:a);if(end)end.value=fmt(b);
    const target=it.type==='highlight'?currentHighlights:it.type==='sub'?currentSubtitles:it.type==='broll'?currentBrollCutaways:null;
    if(target){const o=target[it.index];o.start=a;o.end=b;pushLive();}
    else if(it.type==='hook'&&studioPlan){studioPlan.hookStart=a;studioPlan.hookDur=b;pushLive();}
    else if(it.type==='outro'&&studioPlan){studioPlan.outroStart=a;studioPlan.outroEnd=b;pushLive();}
    else if(it.type==='title'){const x=extraTitles.find(x=>x.uid===it.index);x.start=a;x.end=b;pushLive();}
    else if(it.type==='fx'&&String(it.index).startsWith('fx:')){const e=customFx.find(x=>'fx:'+x.uid===it.index);e.start=a;e.end=b;pushLive();}
  }
  function shiftWords(item,delta){if(Array.isArray(item.words))item.words=item.words.map(w=>({...w,...(w.startMs!=null?{startMs:Math.round(w.startMs+delta*1000)}:{}),...(w.endMs!=null?{endMs:Math.round(w.endMs+delta*1000)}:{}),...(w.start!=null?{start:r3(w.start+delta)}:{}),...(w.end!=null?{end:r3(w.end+delta)}:{})}));}
  function commit(it,a,b,side){
    if(it.type==='highlight'){const h=currentHighlights[it.index];h.start=a;h.end=b;h.edited=true;lists();changed();}
    else if(it.type==='sub'){const s=currentSubtitles[it.index];s.start=a;s.end=b;s.edited=true;if(!side)shiftWords(s,a-it.start);lists();changed();}
    else if(it.type==='broll'){const o=currentBrollCutaways[it.index];Object.assign(o,{start:a,end:b,duration:r3(b-a),timingSource:'manual'});lists();changed({prepare:true});}
    else if(it.type==='outro'){outroStartManual=a;outroEndManual=Math.abs(b-total())<.02?null:b;changed({now:true});}
    else if(it.type==='hook'){hookStartManual=a<.02?null:a;hookDurManual=b;changed({now:true});}
    else if(it.type==='title'){const x=extraTitles.find(x=>x.uid===it.index);x.start=a;x.end=b;changed({now:true});}
    else if(it.type==='music'){
      const list=ownMusic(),m=list.find(x=>x.uid===it.index)||list[0];
      if(side==='l')m.offset=r3(Math.max(0,m.offset+a-m.start));
      m.start=a;m.end=b;selectedTimelineItem={type:'music',index:m.uid};changed({now:true});
    }
    else if(it.type==='fx'&&String(it.index).startsWith('fx:')){const e=customFx.find(x=>'fx:'+x.uid===it.index);e.start=a;e.end=b;changed({now:true});}
    else if(it.type==='fx'){fxState[it.index]={...(fxState[it.index]||{}),off:undefined,dur:r3(b-a)};changed({prepare:String(it.index).startsWith('cut:'),now:true});}
    else if(it.type==='sfx'){
      if(!side)moveSfx(it.index,a+it.hit);
      else{
        const s=sfxOf(it.index),custom=customSfx.find(c=>'custom:'+c.uid===it.index),patch=side==='l'?{trimIn:r3(Math.max(0,(s.trimIn||0)+a-it.start))}:{trimOut:r3(Math.max(0,(s.trimOut||0)+it.end-b))};
        if(custom)Object.assign(custom,patch);else sfxOverrides[it.index]={...(sfxOverrides[it.index]||{}),user:true,...patch};
        changed({now:true});
      }
    }
    else if(it.type==='video'){if(side){const delta=side==='l'?a-it.start:b-it.end;trimClip(it.index,side,delta);}else reorderClip(Number(it.index),a+(b-a)/2);}
    inspector();
  }
  function sfxOf(anchor){return studioPlan?.sfx.find(s=>s.anchor===anchor)||studioPlan?.mutedSfx.find(s=>s.anchor===anchor);}
  function moveSfx(anchor,at){
    const custom=customSfx.find(c=>'custom:'+c.uid===anchor);
    if(custom)custom.start=r3(Math.max(0,at));
    else{const s=sfxOf(anchor);sfxOverrides[anchor]={...(sfxOverrides[anchor]||{}),user:true,offset:r3(at-s.base)};}
    changed({now:true});
  }
  // Trimming a clip ripples: everything after it, and every word time, moves with the picture.
  function ripple(from,to,delta){
    const move=item=>{
      const s=Number(item.start),e=Number(item.end);
      if(delta<0&&e<=to+.001&&s>=from-.001)return null;
      if(s>=to-.001){item.start=r3(s+delta);item.end=r3(e+delta);shiftWords(item,delta);if(item.speechStart!=null){item.speechStart=r3(item.speechStart+delta);item.speechEnd=r3(item.speechEnd+delta);}}
      else if(delta<0&&e>from&&s<from&&e<=to){item.end=r3(from);if(item.speechEnd!=null)item.timingSource='manual';}
      else if(delta<0&&s>=from&&s<to){item.start=r3(from);item.end=r3(e+delta);shiftWords(item,delta);item.timingSource='manual';}
      return item.end-item.start>.05?item:null;
    };
    currentSubtitles=currentSubtitles.map(move).filter(Boolean);currentHighlights=currentHighlights.map(move).filter(Boolean);currentBrollCutaways=currentBrollCutaways.map(move).filter(Boolean);
    customSfx=customSfx.filter(c=>!(delta<0&&c.start>=from&&c.start<to)).map(c=>c.start>=to?{...c,start:r3(c.start+delta)}:c);
    extraTitles=extraTitles.map(move).filter(Boolean);customFx=customFx.map(move).filter(Boolean);
    if(hookDurManual!=null&&hookDurManual>=to)hookDurManual=Math.max(.4,r3(hookDurManual+delta));
    if(outroStartManual!=null&&outroStartManual>=to)outroStartManual=r3(outroStartManual+delta);
  }
  // Moving a clip takes its words, Highlights, B-roll and added sounds with it.
  function reorderClip(index,center){
    const old=currentClipWindows.map(c=>({...c})),rest=old.filter((_,i)=>i!==index);
    let pos=0,cursor=0;for(const c of rest){if(center>cursor+c.timelineDur/2+(pos>=index?old[index].timelineDur:0))pos++;cursor+=c.timelineDur;}
    if(pos===index){TL.render();return;}
    const order=[...rest];order.splice(pos,0,old[index]);
    const owner=time=>{const i=old.findIndex(c=>time>=c.timelineStart-.001&&time<c.timelineStart+c.timelineDur-.001);return i<0?old.length-1:i;};
    const at=new Map();let x=0;order.forEach(c=>{at.set(old.indexOf(c),x-c.timelineStart);x+=c.timelineDur;});
    const shift=item=>{const d=at.get(owner(Number(item.start)+.01))||0;if(!d)return item;item.start=r3(item.start+d);item.end=r3(item.end+d);shiftWords(item,d);if(item.speechStart!=null){item.speechStart=r3(item.speechStart+d);item.speechEnd=r3(item.speechEnd+d);}return item;};
    currentSubtitles=currentSubtitles.map(shift).sort((a,b)=>a.start-b.start);currentHighlights=currentHighlights.map(shift).sort((a,b)=>a.start-b.start);currentBrollCutaways=currentBrollCutaways.map(shift).sort((a,b)=>a.start-b.start);
    customSfx=customSfx.map(c=>({...c,start:r3(c.start+(at.get(owner(c.start))||0))}));
    currentClipWindows=order;syncClipWindows();selectedTimelineItem={type:'video',index:pos};lists();changed({prepare:true,now:true});
  }
  function trimClip(index,side,delta){
    const c=currentClipWindows[index],speed=currentVoiceSpeed;
    if(side==='l')delta=clamp(delta,-c.trimStart/speed,c.timelineDur-.25);else delta=clamp(delta,-(c.timelineDur-.25),((c.rawDur||c.trimEnd)-c.trimEnd)/speed);
    const start=c.timelineStart,end=c.timelineStart+c.timelineDur;
    if(side==='l'){c.trimStart=r3(c.trimStart+delta*speed);if(delta>0)ripple(start,start+delta,-delta);else ripple(start,start,-delta);}
    else{c.trimEnd=r3(c.trimEnd+delta*speed);if(delta<0)ripple(end+delta,end,delta);else ripple(end,end,delta);}
    syncClipWindows();lists();changed({prepare:true,now:true});
  }
  function scrub(e){
    const wrap=$('timelineScrollWrap');isTimelineScrubbing=true;wrap.setPointerCapture(e.pointerId);
    const was=Live.playing;if(was)Live.toggle();
    let x=e.clientX,queued=0;
    const go=()=>{queued=0;const rect=wrap.getBoundingClientRect();seekTimeline((x-rect.left+wrap.scrollLeft)/px);};
    const move=ev=>{x=ev.clientX;if(!queued)queued=requestAnimationFrame(go);};
    const up=()=>{wrap.removeEventListener('pointermove',move);wrap.removeEventListener('pointerup',up);wrap.removeEventListener('pointercancel',up);isTimelineScrubbing=false;if(was)Live.toggle();};
    wrap.addEventListener('pointermove',move);wrap.addEventListener('pointerup',up);wrap.addEventListener('pointercancel',up);go();
    if(!e.target.closest('#timelineRuler'))select(null);
  }
  // ---- inspector
  function select(type,index,{seek=true}={}){
    selectedTimelineItem=type?{type,index}:null;
    if(type&&!isOpen())toggleTimelineCollapse(true);
    render();inspector();
    if(type&&seek){const it=items.find(i=>i.type===type&&String(i.index)===String(index));const start=it?.start??(type==='sub'?currentSubtitles[index]?.start:type==='highlight'?currentHighlights[index]?.start:null);if(start!=null){const at=Number(start)+(it?.hit||0),wrap=$('timelineScrollWrap'),x=at*px;seekTimeline(at);if(built&&(x<wrap.scrollLeft||x>wrap.scrollLeft+wrap.clientWidth-80))wrap.scrollLeft=Math.max(0,x-wrap.clientWidth*.3);}}
  }
  const field=(label,html)=>'<label>'+label+html+'</label>';
  const timeFields=(a,b)=>field('Từ (giây)','<input class="w-time" id="tlPropStart" type="number" step="0.01" min="0" value="'+fmt(a)+'">')+(b==null?'':field('Đến (giây)','<input class="w-time" id="tlPropEnd" type="number" step="0.01" min="0" value="'+fmt(b)+'">'));
  const sfxOptions=current=>{const groups=new Map();for(const s of allSfx){if(!groups.has(s.cat))groups.set(s.cat,[]);groups.get(s.cat).push(s);}return [...groups].map(([cat,list])=>'<optgroup label="'+esc(cat)+'">'+list.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===current?'selected':'')+'>'+esc(s.name===s.id?s.id:s.name+' ('+s.id+')')+'</option>').join('')+'</optgroup>').join('');};
  function inspector(){
    const box=$('tlInspector'),sel=selectedTimelineItem;
    if(!sel){box.innerHTML='<div class="hint">Chọn một đoạn để sửa. Kéo để dời, kéo hai đầu để đổi độ dài, Ctrl + lăn chuột để phóng to. Phím: Space phát · S hoặc Ctrl+B cắt · Q/W bỏ phần trái/phải kim · Ctrl+C, Ctrl+X, Ctrl+V · Ctrl+D nhân đôi · Delete xóa · ←/→ từng khung hình · Ctrl+Z hoàn tác.</div>';return;}
    const bind=(id,fn,event='change')=>{const el=$(id);if(el)el.addEventListener(event,()=>fn(el.value,el));};
    const head=(title,tag='')=>'<h4>'+esc(title)+(tag?'<span class="tag">'+esc(tag)+'</span>':'')+'</h4>';
    const del='<button type="button" class="tl-btn" id="tlDel">Xóa</button>';
    if(sel.type==='highlight'){
      const h=currentHighlights[sel.index];if(!h){selectedTimelineItem=null;return inspector();}
      const anchor='hl:'+h.uid,s=sfxOf(anchor);
      box.innerHTML=head('Highlight '+(Number(sel.index)+1),(STYLE_NAMES[h.typo]||'')+(h.styleFrom==='user'?' · bạn chọn':' · tự luân phiên'))+'<div class="tl-fields">'+field('Nội dung','<input class="w-text" id="tlText" value="'+esc(h.text.replace(/\s+/g,' '))+'">')+timeFields(h.start,h.end)+
        field('Chuyển động','<select class="w-sel" id="tlMotion">'+Object.entries(MOTION_NAMES).map(([k,n])=>'<option value="'+k+'" '+(h.motion===k?'selected':'')+'>'+n+'</option>').join('')+'</select>')+sfxFields(s,anchor)+del+'</div><div class="tl-styles" id="tlStyles"></div>';
      bind('tlText',v=>{rememberTyping();h.text=v;h.edited=true;renderHighlightsList();changed();},'input');
      bind('tlMotion',v=>{remember();h.motion=v;h.styleFrom=h.styleFrom==='user'?'user':'plan';changed({now:true});});
      bindTimes((a,b)=>{const it=itemOf('highlight',sel.index);if(it){const [x,y]=limits(it,a,b,a!==it.start?'l':'r');commit(it,r3(x),r3(y),'l');}});
      bindSfx(anchor);
      const near=currentHighlights.map((x,i)=>({x,i})).sort((p,q)=>p.x.start-q.x.start),pos=near.findIndex(n=>n.x===h),blocked=new Set([pos-2,pos-1,pos+1,pos+2].map(i=>near[i]?.x.typo).filter(Boolean));
      gallery($('tlStyles'),Object.keys(window.FptEngine.typography.STYLES),h.typo,blocked,name=>({totalDur:9,highlights:[{text:h.text.replace(/\s+/g,' '),typo:name,motion:'pop_bounce',start:0,dur:4,end:4,y:350,scale:1.4}]}),name=>{remember();h.typo=name;h.styleFrom='user';renderHighlightsList();changed({now:true});inspector();});
    }else if(sel.type==='sub'){
      const s=currentSubtitles[sel.index];if(!s){selectedTimelineItem=null;return inspector();}
      const warn=(studioPlan?.warnings||[]).find(w=>w.code==='spelling'&&w.index===sel.index);
      box.innerHTML=head('Sub '+(Number(sel.index)+1),s.edited?'đã sửa tay':'theo lời nói')+'<div class="tl-fields">'+field('Nội dung','<input class="w-text" id="tlText" spellcheck="true" lang="vi" value="'+esc(s.text)+'">')+timeFields(s.start,s.end)+field('Áp dụng kiểu cho','<select class="w-sel" id="tlSubScope"><option value="all">Tất cả các câu</option><option value="one" '+(s.subStyle?'selected':'')+'>Chỉ câu này</option></select>')+del+(warn?'<span class="note">'+esc(warn.text)+'</span>':'')+'</div><div class="tl-styles" id="tlStyles"></div>';
      subGallery($('tlStyles'),s);
      bind('tlText',v=>{rememberTyping();s.text=v;s.edited=true;renderSubList();changed();},'input');
      bindTimes((a,b)=>{const it=itemOf('sub',sel.index);if(it)commit(it,r3(a),r3(Math.max(a+.08,b)),'l');});
    }else if(['hook','outro','title'].includes(sel.type)){
      const kind=sel.type,extra=kind==='title'?extraTitles.find(x=>x.uid===sel.index):null;if(kind==='title'&&!extra){selectedTimelineItem=null;return inspector();}
      const ids=kind==='hook'?['hook1','hook2','hook3','hook4']:kind==='outro'?['outro1','outro2','outro3']:['line1','line2','line3','line4'],cfg=kind==='hook'?studioPlan?.hook:kind==='outro'?studioPlan?.outro:extra;
      const a=kind==='hook'?studioPlan?.hookStart||0:kind==='outro'?studioPlan?.outroStart:extra.start,b=kind==='hook'?studioPlan?.hookDur:kind==='outro'?studioPlan?.outroEnd:extra.end;
      const value=id=>extra?extra[id]||'':$(id).value,moved=kind==='hook'?hookDurManual!=null||hookStartManual!=null:kind==='outro'?outroStartManual!=null||outroEndManual!=null:false;
      box.innerHTML=head({hook:'Hook mở đầu',outro:'Outro',title:'Tiêu đề thêm'}[kind],STYLE_NAMES[cfg?.style]||'')+'<div class="tl-fields">'+ids.map((id,i)=>field('Dòng '+(i+1),'<input class="w-sel" data-title="'+id+'" value="'+esc(value(id))+'">')).join('')+timeFields(a,b)+(moved?'<button type="button" class="tl-btn" id="tlAuto">'+(kind==='hook'?'Về 3,5 giây':'Theo lời kêu gọi')+'</button>':'')+del+(kind==='hook'?hookNote():'')+'</div><div class="tl-styles" id="tlStyles"></div>';
      box.querySelectorAll('[data-title]').forEach(inp=>inp.addEventListener('input',()=>{rememberTyping();if(extra)extra[inp.dataset.title]=inp.value;else{$(inp.dataset.title).value=inp.value;userEditedHook=true;}changed();}));
      bindTimes((x,y)=>{const it=itemOf(kind,sel.index);if(it){const side=Math.abs(x-it.start)>.004?'l':'r',r=limits(it,x,y,side);commit(it,r3(r[0]),r3(r[1]),side);}});
      bind('tlAuto',()=>{remember();if(kind==='hook'){hookDurManual=hookStartManual=null;}else{outroStartManual=outroEndManual=null;}changed({now:true});},'click');
      const other=kind==='hook'?outroStyle:kind==='outro'?hookStyle:null,lines=ids.map(value);
      gallery($('tlStyles'),Object.keys(window.FptEngine.typography.HOOKS),cfg?.style,new Set(other?[other]:[]),name=>{const t={style:name,line1:lines[0]||'TIÊU ĐỀ',line2:lines[1]||'',line3:lines[2]||'',line4:lines[3]||'',y:320,scale:1.3};return kind!=='outro'?{totalDur:9,hookDur:4,hook:t,highlights:[]}:{totalDur:4,hookDur:0,outroStart:0,outro:t,highlights:[]};},name=>{remember();if(extra)extra.style=name;else if(kind==='hook')hookStyle=name;else outroStyle=name;changed({now:true});setTimeout(inspector,350);});
    }else if(sel.type==='sfx'){
      const s=sfxOf(sel.index);if(!s){selectedTimelineItem=null;return inspector();}
      box.innerHTML=head('SFX: '+s.label,s.muted?'đã tắt':s.user?'bạn chỉnh':'tự chọn theo ý nghĩa')+'<div class="tl-fields">'+(s.muted?'':field('Điểm nổ (giây)','<input class="w-time" id="tlPropStart" type="number" step="0.01" value="'+fmt(s.start)+'">'))+sfxFields(s,sel.index)+'</div>';
      bind('tlPropStart',v=>{remember();moveSfx(sel.index,Number(v)||0);});
      bindSfx(sel.index);
    }else if(sel.type==='broll'){
      const b=currentBrollCutaways[sel.index];if(!b){selectedTimelineItem=null;return inspector();}
      box.innerHTML=head('B-roll: '+(b.name||''),b.timingSource==='manual'?'đã chỉnh tay':'theo lời nói')+'<div class="tl-fields">'+field('Nguồn','<select class="w-sel" id="tlSource">'+brollCatalogData.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===b.brollId?'selected':'')+(c.available===false?' disabled':'')+'>'+esc(c.icon+' '+c.name)+(c.available===false?' (chưa có clip)':'')+'</option>').join('')+'</select>')+timeFields(b.start,b.end)+
        field('Bố cục','<select class="w-sel" id="tlLayout">'+[['pip','Khung chính giữa'],['top_half','Nửa trên'],['cutaway','Toàn màn hình']].map(([k,n])=>'<option value="'+k+'" '+(b.layout===k?'selected':'')+'>'+n+'</option>').join('')+'</select>')+del+'</div>';
      bind('tlSource',v=>{remember();const c=brollCatalogData.find(x=>x.id===v);Object.assign(b,{brollId:v,name:c.name,icon:c.icon,file:undefined});renderBrollQueue();changed({prepare:true});});
      bind('tlLayout',v=>{remember();b.layout=v;renderBrollQueue();changed({prepare:true});});
      bindTimes((a,e)=>{const it=itemOf('broll',sel.index);if(it){const [x,y]=limits(it,a,e,a!==it.start?'l':'r');commit(it,r3(x),r3(y));}});
    }else if(sel.type==='video'){
      const c=currentClipWindows[sel.index];if(!c){selectedTimelineItem=null;return inspector();}
      box.innerHTML=head('Cảnh '+(Number(sel.index)+1),String(c.fileRef).replace(/^[0-9a-f-]{36}_/,''))+'<div class="tl-fields">'+field('Lấy từ (giây gốc)','<input class="w-time" id="tlIn" type="number" step="0.01" value="'+fmt(c.trimStart)+'">')+field('Đến (giây gốc)','<input class="w-time" id="tlOut" type="number" step="0.01" value="'+fmt(c.trimEnd)+'">')+'<button type="button" class="tl-btn" id="tlSplit">Cắt tại kim</button>'+del+'<span class="note">Chữ, B-roll và SFX phía sau tự dời theo.</span></div>';
      bind('tlIn',v=>{remember();trimClip(sel.index,'l',(Number(v)-c.trimStart)/currentVoiceSpeed);inspector();});
      bind('tlOut',v=>{remember();trimClip(sel.index,'r',(Number(v)-c.trimEnd)/currentVoiceSpeed);inspector();});
      bind('tlSplit',split,'click');
    }else if(sel.type==='fx'){
      const own=customFx.find(x=>'fx:'+x.uid===sel.index);
      if(own){
        const kinds=window.FptEngine.fx.KINDS;
        box.innerHTML=head(kinds[own.kind].name,'hiệu ứng bạn thêm')+'<div class="tl-fields">'+field('Loại','<select class="w-sel" id="tlKind">'+Object.entries(kinds).map(([k,x])=>'<option value="'+k+'" '+(k===own.kind?'selected':'')+'>'+x.name+'</option>').join('')+'</select>')+timeFields(own.start,own.end)+'<button type="button" class="tl-btn" id="tlSee">Xem thử</button>'+del+'</div>';
        bind('tlKind',v=>{remember();own.kind=v;changed({now:true});inspector();});
        bindTimes((x,y)=>{const it=itemOf('fx',sel.index);if(it)commit(it,r3(x),r3(y));});
        bind('tlSee',()=>{seekTimeline(Math.max(0,own.start-.4));setTimeout(()=>{if(!Live.playing)Live.toggle();setTimeout(()=>{if(Live.playing)Live.toggle();},(own.end-own.start+1)*1000);},150);},'click');
        bind('tlDel',()=>removeSelected(),'click');return;
      }
      const e=studioPlan?.effects.find(x=>x.key===sel.index);if(!e){selectedTimelineItem=null;return inspector();}
      const name={cut:'Zoom chuyển cảnh','broll-in':'B-roll vào','broll-out':'B-roll ra',fade:'Tối dần cuối video'}[e.kind];
      box.innerHTML=head(name,fmt(e.start)+'s')+'<div class="tl-fields">'+(e.kind==='cut'?(e.eligible?'<button type="button" class="tl-btn '+(e.on?'on':'')+'" id="tlFx">'+(e.on?'Đang bật: bấm để tắt':'Đang tắt: bấm để bật')+'</button>':'<span class="note">Cảnh này quá sát cảnh trước nên cắt thẳng, không zoom.</span>'):'<span class="note">'+(e.kind==='fade'?'Mặc định bắt đầu sau lời nói cuối cùng.':'Đi theo B-roll: kéo B-roll để dời hiệu ứng.')+'</span>')+(e.kind!=='cut'||e.on?field('Độ dài (giây)','<input class="w-time" id="tlFxDur" type="number" step="0.05" min="0.03" value="'+fmt(e.duration)+'">'):'')+(fxState[e.key]?.dur!=null?'<button type="button" class="tl-btn" id="tlFxAuto">Mặc định</button>':'')+del+'</div>';
      bind('tlFxDur',v=>{const it=itemOf('fx',e.key);if(!it)return;remember();const d=Number(v)||.2,side=it.trimLeft?'l':'r',r=limits(it,side==='l'?it.end-d:it.start,side==='l'?it.end:it.start+d,side);commit(it,r3(r[0]),r3(r[1]),side);});
      bind('tlFxAuto',()=>{remember();delete fxState[e.key];changed({prepare:true,now:true});setTimeout(inspector,300);},'click');
      bind('tlFx',()=>{remember();fxState[e.key]=e.on?{off:true}:{};changed({prepare:true,now:true});setTimeout(inspector,300);},'click');
    }else if(sel.type==='music'){
      const m=musicPieces().find(x=>x.uid===sel.index)||musicPieces()[0];if(!m){selectedTimelineItem=null;return inspector();}
      box.innerHTML=head('Nhạc nền',Live.preview?.music?.name||'')+'<div class="tl-fields">'+timeFields(m.start,m.end)+field('Lấy từ giây (bài hát)','<input class="w-time" id="tlOffset" type="number" step="0.1" min="0" value="'+fmt(m.offset)+'">')+field('Âm lượng','<input type="range" id="tlMusicVol" min="0" max="0.6" step="0.01" value="'+(m.vol??.18)+'">')+del+(musicSegments?'<button type="button" class="tl-btn" id="tlMusicAuto">Về nhạc cả bài</button>':'')+'<span class="note">Đổi bài ở mục "Thêm nhạc nền".</span></div>';
      const own=fn=>{remember();const list=ownMusic(),x=list.find(q=>q.uid===m.uid)||list[0];fn(x);selectedTimelineItem={type:'music',index:x.uid};changed({now:true});};
      bindTimes((x,y)=>{const it=itemOf('music',m.uid);if(it){const side=Math.abs(x-it.start)>.004?'l':'r',r=limits(it,x,y,side);commit(it,r3(r[0]),r3(r[1]),side);}});
      bind('tlOffset',v=>own(x=>{x.offset=Math.max(0,Number(v)||0);}));
      bind('tlMusicVol',v=>own(x=>{x.vol=Number(v);}));
      bind('tlMusicAuto',()=>{remember();musicSegments=null;selectedTimelineItem=null;changed({now:true});inspector();},'click');
    }
    bind('tlDel',()=>removeSelected(),'click');
  }
  function hookNote(){
    const end=studioPlan?.hookDur??3.5,over=currentHighlights.filter(h=>Number(h.start)<end-.05),b=activeBrolls().filter(x=>Math.abs(Number(x.start)-end)<.02)[0];
    return over.length?'<span class="note">Highlight "'+esc(over[0].text.replace(/\s+/g,' '))+'" hiện thay Hook từ '+fmt(over[0].start)+'s. Muốn giữ Hook, hãy dời hoặc xóa Highlight đó.</span>':b?'<span class="note">Hook đã chạm B-roll "'+esc(b.name||'')+'". Dời B-roll để kéo dài thêm.</span>':'';
  }
  const itemOf=(type,index)=>items.find(i=>i.type===type&&String(i.index)===String(index));
  function bindTimes(fn){for(const id of ['tlPropStart','tlPropEnd']){const el=$(id);if(el)el.addEventListener('change',()=>{const a=Number($('tlPropStart').value),b=Number($('tlPropEnd').value);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return inspector();remember();fn(Math.max(0,a),Math.min(total(),b));});}}
  function sfxFields(s,anchor){
    if(!s)return '<span class="note">Không có SFX riêng tại đây (đã có âm khác sát bên).</span>';
    const custom=String(anchor).startsWith('custom:'),edited=sfxOverrides[anchor]?.user;
    return (s.muted?'':field('SFX','<select class="w-sel" id="tlSfx">'+sfxOptions(s.id)+'</select>')+field('Âm lượng','<input type="range" id="tlVol" min="0" max="0.8" step="0.02" value="'+s.vol+'">')+'<button type="button" class="tl-btn" id="tlHear">Nghe</button>')+
      (custom?'<button type="button" class="tl-btn" id="tlDel">Xóa</button>':'<button type="button" class="tl-btn" id="tlMute">'+(s.muted?'Bật lại SFX':'Tắt SFX')+'</button>'+(edited?'<button type="button" class="tl-btn" id="tlSfxAuto">Tự chọn lại</button>':''));
  }
  function bindSfx(anchor){
    const custom=customSfx.find(c=>'custom:'+c.uid===anchor),set=(patch)=>{if(custom)Object.assign(custom,patch);else sfxOverrides[anchor]={...(sfxOverrides[anchor]||{}),user:true,...patch};};
    const on=(id,event,fn)=>{const el=$(id);if(el)el.addEventListener(event,()=>fn(el));};
    on('tlSfx','change',el=>{remember();set({id:el.value,chosen:true});changed({now:true});const s=allSfx.find(x=>x.id===el.value);if(s)setTimeout(()=>{const p=sfxOf(anchor);if(p&&!p.muted)Live.audition(p);},260);});
    on('tlVol','change',el=>{remember();set({vol:Number(el.value)});changed({now:true});});
    on('tlHear','click',()=>{const s=sfxOf(anchor);if(s)Live.audition(s);});
    on('tlMute','click',()=>{remember();const o=sfxOverrides[anchor]||{};sfxOverrides[anchor]={...o,muted:!o.muted};changed({now:true});setTimeout(inspector,260);});
    on('tlSfxAuto','click',()=>{remember();delete sfxOverrides[anchor];changed({now:true});setTimeout(inspector,260);});
  }
  // Thumbnails are drawn by the render engine, one per frame so typing and playback stay smooth.
  let galleryToken=0;
  function gallery(box,names,current,blocked,plan,pick){
    const token=++galleryToken;
    box.innerHTML=names.map(n=>'<button type="button" class="tl-style" data-n="'+n+'" aria-pressed="'+(n===current)+'" '+(blocked.has(n)&&n!==current?'disabled title="Đang dùng ở cụm kề bên"':'')+'><canvas width="240" height="135"></canvas><b>'+esc(STYLE_NAMES[n]||n)+'</b></button>').join('');
    box.onclick=e=>{const b=e.target.closest('.tl-style');if(b&&!b.disabled)pick(b.dataset.n);};
    const queue=[...box.querySelectorAll('.tl-style')];
    const next=()=>{
      if(token!==galleryToken||!queue.length||!Live.isReady)return;
      const b=queue.shift(),c=b.querySelector('canvas').getContext('2d');
      try{const engine=window.FptEngine.typography,layer=engine.frameDrawer(engine.buildCues(plan(b.dataset.n)))(1.3);if(layer)c.drawImage(layer,0,60,1080,608,0,0,240,135);}catch(_){}
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }
  // ---- Sub looks
  function subGallery(box,s){
    const styles=window.FptEngine.subtitle.SUB_STYLES,current=s?.subStyle||subStyleId;
    box.innerHTML=Object.entries(styles).map(([id,x])=>'<button type="button" class="tl-style" data-n="'+id+'" aria-pressed="'+(id===current)+'"><canvas width="300" height="110" style="aspect-ratio:30/11"></canvas><b>'+esc(x.name)+'</b></button>').join('');
    box.querySelectorAll('.tl-style').forEach(b=>Live.subSample(b.querySelector('canvas'),b.dataset.n,'Tặng ngay Camera AI'));
    box.onclick=e=>{const b=e.target.closest('.tl-style');if(!b)return;remember();if(s&&$('tlSubScope')?.value==='one')s.subStyle=b.dataset.n;else{subStyleId=b.dataset.n;currentSubtitles.forEach(x=>{delete x.subStyle;});syncSubStyle();}changed({now:true});inspector();};
  }
  function syncSubStyle(){const el=$('subStyleSelect');if(el)el.value=subStyleId;}
  // ---- clipboard (works like any editor: copy, cut, paste at the playhead, duplicate)
  let clip=null;
  const note=text=>{Live.status(text);clearTimeout(note.t);note.t=setTimeout(()=>Live.status(''),3500);};
  const newId=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  // First free place at or after t in a track where items may not overlap.
  function slot(items,t,len,lo,hi,gap,min){
    const busy=items.map(i=>[Number(i.start)-gap,Number(i.end)+gap]).sort((a,b)=>a[0]-b[0]);let cursor=lo;
    const free=[];for(const [a,b] of busy){if(a>cursor)free.push([cursor,a]);cursor=Math.max(cursor,b);}if(hi>cursor)free.push([cursor,hi]);
    for(const [a,b] of free){const start=Math.max(a,t);if(b-start>=min)return [r3(start),r3(Math.min(b,start+len))];}
    return null;
  }
  function grab(){
    const sel=selectedTimelineItem,it=sel&&itemOf(sel.type,sel.index);if(!it)return null;
    const len=it.end-it.start;
    if(sel.type==='sub')return {type:'sub',len,data:structuredClone(currentSubtitles[sel.index])};
    if(sel.type==='highlight')return {type:'highlight',len,data:structuredClone(currentHighlights[sel.index])};
    if(sel.type==='broll')return {type:'broll',len,data:structuredClone(currentBrollCutaways[sel.index])};
    if(sel.type==='hook')return {type:'title',len,data:{line1:$('hook1').value,line2:$('hook2').value,line3:$('hook3').value,line4:$('hook4').value,style:studioPlan?.hook?.style}};
    if(sel.type==='outro')return {type:'title',len,data:{line1:$('outro1').value,line2:$('outro2').value,line3:$('outro3').value,line4:'',style:studioPlan?.outro?.style}};
    if(sel.type==='title')return {type:'title',len,data:structuredClone(extraTitles.find(x=>x.uid===sel.index))};
    if(sel.type==='sfx'){const s=sfxOf(sel.index);return s&&s.id?{type:'sfx',len,data:{id:s.id,vol:s.vol,trimIn:s.trimIn||0,trimOut:s.trimOut||0}}:null;}
    if(sel.type==='music'){const m=musicPieces().find(x=>x.uid===sel.index)||musicPieces()[0];return {type:'music',len,data:{...m}};}
    if(sel.type==='video'){const c=currentClipWindows[sel.index],a=c.timelineStart,b=a+c.timelineDur;return {type:'video',len,data:structuredClone(c),base:a,subs:structuredClone(currentSubtitles.filter(s=>s.start>=a-.01&&s.start<b-.01))};}
    if(sel.type==='fx'&&String(sel.index).startsWith('fx:'))return {type:'cfx',len,data:{...customFx.find(x=>'fx:'+x.uid===sel.index)}};
    if(sel.type==='fx'&&String(sel.index).startsWith('cut:'))return {type:'cfx',len:.35,data:{kind:'zoom_in'}};
    if(sel.type==='fx'&&String(sel.index).startsWith('off:'))return {type:'fx',len,data:{dur:r3(len)}};
    return null;
  }
  function copy(){const g=grab();if(!g){note('Chọn một đoạn để sao chép.');return false;}clip=g;note('Đã sao chép.');return true;}
  function paste(at=timelineCurrentTime){
    if(!clip){note('Chưa có gì để dán.');return;}
    const t=r3(Math.max(0,at)),{type,len,data}=clip,full=total();let pos=null;
    const none=()=>note('Không còn chỗ trống sau kim cho đoạn này.');
    if(type==='sub'){
      pos=slot(currentSubtitles,t,len,0,full,0,.15);if(!pos)return none();remember();
      const x={...structuredClone(data),id:newId('m'),start:pos[0],end:pos[1],edited:true};const d=pos[0]-Number(data.start);shiftWords(x,d);
      currentSubtitles.push(x);currentSubtitles.sort((a,b)=>a.start-b.start);lists();changed({now:true});select('sub',currentSubtitles.indexOf(x),{seek:false});
    }else if(type==='highlight'){
      pos=slot(currentHighlights,t,len,0,full,.08,.35);if(!pos)return none();remember();highlightsTouched=true;
      const uid=newId('m'),x={...structuredClone(data),id:uid,uid,start:pos[0],end:pos[1],edited:true,timingPolicy:'preserve_all',speechStart:undefined,speechEnd:undefined};
      currentHighlights.push(x);currentHighlights.sort((a,b)=>a.start-b.start);lists();changed({now:true});select('highlight',currentHighlights.indexOf(x),{seek:false});
    }else if(type==='broll'){
      const lo=studioPlan?.hookDur??0,hi=studioPlan?.outro?studioPlan.outroStart:full;
      pos=slot(activeBrolls(),Math.max(lo,t),len,lo,hi,0,.3);if(!pos)return none();remember();
      const uid=newId('m'),x={...structuredClone(data),id:uid,uid,start:pos[0],end:pos[1],duration:r3(pos[1]-pos[0]),timingSource:'manual',speechStart:undefined,speechEnd:undefined,autoDetected:false};
      currentBrollCutaways.push(x);currentBrollCutaways.sort((a,b)=>a.start-b.start);lists();changed({prepare:true,now:true});select('broll',currentBrollCutaways.indexOf(x),{seek:false});
    }else if(type==='title'){
      pos=slot(titleItems(),t,len,0,full,0,.4);if(!pos)return none();remember();
      const x={...structuredClone(data),uid:newId('t'),start:pos[0],end:pos[1]};extraTitles.push(x);changed({now:true});select('title',x.uid,{seek:false});
    }else if(type==='sfx'){
      remember();const x={...data,uid:newId('s'),start:t};customSfx.push(x);selectedTimelineItem={type:'sfx',index:'custom:'+x.uid};changed({now:true});setTimeout(inspector,300);
    }else if(type==='music'){
      pos=slot(musicPieces(),t,len,0,full,0,.2);if(!pos)return note('Nhạc đã phủ kín từ kim trở đi. Cắt hoặc thu ngắn đoạn nhạc trước khi dán.');
      remember();const list=ownMusic(),x={...data,uid:newId('m'),start:pos[0],end:pos[1]};list.push(x);list.sort((a,b)=>a.start-b.start);selectedTimelineItem={type:'music',index:x.uid};changed({now:true});inspector();
    }else if(type==='video'){
      let i=currentClipWindows.findIndex(c=>t<c.timelineStart+c.timelineDur/2);if(i<0)i=currentClipWindows.length;
      remember();const start=i<currentClipWindows.length?currentClipWindows[i].timelineStart:full,c={...structuredClone(data),id:newId('copy')};
      ripple(start,start,c.timelineDur);currentClipWindows.splice(i,0,c);
      for(const s of clip.subs||[]){const x=structuredClone(s),d=start-clip.base;x.id=newId('m');x.start=r3(x.start+d);x.end=r3(x.end+d);shiftWords(x,d);x.edited=true;currentSubtitles.push(x);}
      currentSubtitles.sort((a,b)=>a.start-b.start);syncClipWindows();lists();changed({prepare:true,now:true});select('video',i,{seek:false});
    }else if(type==='cfx'){
      remember();const x={uid:newId('f'),kind:data.kind,start:t,end:r3(Math.min(full,t+len))};customFx.push(x);changed({now:true});select('fx','fx:'+x.uid,{seek:false});
    }else if(type==='fx'){
      const cuts=(studioPlan?.effects||[]).filter(e=>e.kind==='cut').sort((a,b)=>Math.abs(a.start-t)-Math.abs(b.start-t))[0];if(!cuts)return none();
      remember();fxState[cuts.key]={dur:data.dur};changed({prepare:true,now:true});select('fx',cuts.key,{seek:false});
    }
  }
  function duplicate(){const sel=selectedTimelineItem,it=sel&&itemOf(sel.type,sel.index),keep=clip;if(!it||!copy())return;paste(it.type==='sfx'?it.end+(it.hit||0):it.end+.001);clip=keep||clip;}
  // Q / W: drop what is left / right of the playhead.
  function trimTo(side){
    const sel=selectedTimelineItem||{type:'video',index:currentClipWindows.findIndex(c=>timelineCurrentTime>=c.timelineStart&&timelineCurrentTime<c.timelineStart+c.timelineDur)},it=itemOf(sel.type,sel.index),t=timelineCurrentTime;
    if(!it||t<=it.start+.04||t>=it.end-.04||it.off)return;
    if(it.type==='fx'&&!(side==='l'?it.trimLeft:it.trimRight))return;
    remember();const [a,b]=limits(it,side==='l'?t:it.start,side==='r'?t:it.end,side);commit(it,r3(a),r3(b),side);
  }
  // ---- actions
  function split(){
    const t=r3(timelineCurrentTime);
    let sel=selectedTimelineItem,it=sel&&itemOf(sel.type,sel.index);
    // Nothing selected under the playhead: cut the picture, as editors do.
    if(!it||t<=it.start||t>=it.end){const i=currentClipWindows.findIndex(c=>t>c.timelineStart&&t<c.timelineStart+c.timelineDur);if(i<0)return;if(it&&sel.type!=='video'){note('Kim chưa nằm trong đoạn đang chọn.');return;}sel={type:'video',index:i};it=itemOf('video',i);}
    if(['hook','outro','title'].includes(sel.type)){
      if(t<=it.start+.4||t>=it.end-.4){note('Mỗi phần tiêu đề cần ít nhất 0,4 giây.');return;}
      const g=grab(),piece=(a,b)=>({...g.data,uid:newId('t'),start:r3(a),end:r3(b)});remember();
      if(sel.type==='hook'){extraTitles.push(piece(t,it.end));hookDurManual=t;}
      else if(sel.type==='outro'){extraTitles.push(piece(it.start,t));outroStartManual=t;}
      else{const x=extraTitles.find(q=>q.uid===sel.index);extraTitles.push(piece(t,x.end));x.end=t;}
      changed({now:true});return;
    }
    if(sel.type==='sfx'){
      const s=sfxOf(sel.index);if(!s||s.muted||t<=it.start+.05||t>=it.end-.05)return;
      const custom=customSfx.find(c=>'custom:'+c.uid===sel.index),left={trimOut:r3((s.trimOut||0)+it.end-t)};remember();
      customSfx.push({uid:newId('s'),id:s.id,start:s.start,vol:s.vol,trimIn:r3((s.trimIn||0)+t-it.start),trimOut:s.trimOut||0});
      if(custom)Object.assign(custom,left);else sfxOverrides[sel.index]={...(sfxOverrides[sel.index]||{}),user:true,...left};
      changed({now:true});return;
    }
    if(sel.type==='music'){
      if(t<=it.start+.1||t>=it.end-.1)return;remember();
      const list=ownMusic(),m=list.find(x=>x.uid===sel.index)||list[0],right={...m,uid:newId('m'),start:t,offset:r3(m.offset+t-m.start)};m.end=t;list.push(right);list.sort((a,b)=>a.start-b.start);
      selectedTimelineItem={type:'music',index:right.uid};changed({now:true});inspector();return;
    }
    if(sel.type==='fx'){
      const e=customFx.find(x=>'fx:'+x.uid===sel.index);if(!e){note('Hiệu ứng này đi theo cảnh; kéo mép để đổi độ dài hoặc xóa.');return;}
      if(t<=e.start+.08||t>=e.end-.08)return;remember();customFx.push({uid:newId('f'),kind:e.kind,start:t,end:e.end});e.end=t;changed({now:true});return;
    }
    const list=sel.type==='sub'?currentSubtitles:sel.type==='highlight'?currentHighlights:sel.type==='broll'?currentBrollCutaways:null;
    if(list){
      const o=list[sel.index];if(!o||t<=o.start+.12||t>=o.end-.12)return;
      remember();
      const right={...structuredClone(o),start:t,id:'x'+Date.now(),uid:undefined,edited:true};
      if(sel.type==='sub'&&Array.isArray(o.words)&&o.words.length>1){const at=o.words.findIndex(w=>Number(w.startMs)/1000>=t-.03),k=at>0?at:Math.ceil(o.words.length/2);right.words=o.words.slice(k);o.words=o.words.slice(0,k);const text=o.text.split(/\s+/),cut=Math.min(k,text.length-1);right.text=text.slice(cut).join(' ');o.text=text.slice(0,cut).join(' ');}
      o.end=sel.type==='highlight'?r3(t-.08):t;o.edited=true;
      if(sel.type==='broll'){o.duration=r3(o.end-o.start);right.duration=r3(right.end-right.start);o.timingSource=right.timingSource='manual';}
      list.splice(Number(sel.index)+1,0,right);lists();changed({prepare:sel.type==='broll',now:true});select(sel.type,Number(sel.index)+1,{seek:false});
    }else if(sel.type==='video'){
      const c=currentClipWindows[sel.index],at=c.trimStart+(t-c.timelineStart)*currentVoiceSpeed;
      if(!c||at<=c.trimStart+.25||at>=c.trimEnd-.25)return;
      remember();
      const right={...c,trimStart:r3(at),id:'split_'+Date.now()};c.trimEnd=r3(at);currentClipWindows.splice(Number(sel.index)+1,0,right);syncClipWindows();changed({prepare:true,now:true});
    }
  }
  function removeSelected(){
    const sel=selectedTimelineItem;if(!sel)return;
    if(sel.type==='sub'||sel.type==='highlight'||sel.type==='broll'){
      remember();(sel.type==='sub'?currentSubtitles:sel.type==='highlight'?currentHighlights:currentBrollCutaways).splice(sel.index,1);
      if(sel.type==='highlight')highlightsTouched=true;
      selectedTimelineItem=null;lists();inspector();changed({prepare:sel.type==='broll',now:true});
    }else if(sel.type==='sfx'){
      remember();if(String(sel.index).startsWith('custom:'))customSfx=customSfx.filter(c=>'custom:'+c.uid!==sel.index);else sfxOverrides[sel.index]={...(sfxOverrides[sel.index]||{}),muted:true};
      selectedTimelineItem=null;inspector();changed({now:true});
    }else if(sel.type==='hook'||sel.type==='outro'){
      remember();(sel.type==='hook'?['hook1','hook2','hook3','hook4']:['outro1','outro2','outro3']).forEach(id=>{$(id).value='';});userEditedHook=true;selectedTimelineItem=null;inspector();changed({now:true});
    }else if(sel.type==='title'){remember();extraTitles=extraTitles.filter(x=>x.uid!==sel.index);selectedTimelineItem=null;inspector();changed({now:true});
    }else if(sel.type==='music'){remember();const list=ownMusic();musicSegments=list.filter(x=>x.uid!==sel.index);selectedTimelineItem=null;inspector();changed({now:true});
    }else if(sel.type==='video'&&currentClipWindows.length>1){
      remember();const c=currentClipWindows[sel.index],a=c.timelineStart,b=a+c.timelineDur;currentClipWindows.splice(sel.index,1);ripple(a,b,-(b-a));syncClipWindows();selectedTimelineItem=null;lists();inspector();changed({prepare:true,now:true});
    }else if(sel.type==='video')note('Video cần ít nhất một cảnh.');
    else if(sel.type==='fx'&&String(sel.index).startsWith('fx:')){remember();customFx=customFx.filter(x=>'fx:'+x.uid!==sel.index);selectedTimelineItem=null;inspector();changed({now:true});}
    else if(sel.type==='fx'){const gone=sel.index;remember();selectedTimelineItem=null;setTimeout(inspector,0);fxState[gone]=String(gone).startsWith('cut:')||gone==='fade'?{off:true}:{dur:.03};changed({prepare:true,now:true});}
  }
  function addHighlight(){
    const t=r3(timelineCurrentTime),sub=currentSubtitles.find(s=>t>=s.start&&t<s.end);
    remember();highlightsTouched=true;
    const next=currentHighlights.map(h=>Number(h.start)).filter(s=>s>t).sort((a,b)=>a-b)[0]??Infinity,start=sub?Number(sub.start):t;
    currentHighlights.push({id:'m'+Date.now(),uid:'m'+Date.now(),text:sub?sub.text:'Nội dung',start:r3(start),end:r3(Math.min(start+1.8,next-.08,total())),y:350,scale:1.4,edited:true,timingPolicy:'preserve_all'});
    currentHighlights.sort((a,b)=>a.start-b.start);renderHighlightsList();changed({now:true});select('highlight',currentHighlights.findIndex(h=>h.uid?.startsWith('m')&&h.start===r3(start)),{seek:false});
  }
  function addSub(){const t=r3(timelineCurrentTime);remember();currentSubtitles.push({id:'m'+Date.now(),text:'Nội dung',start:t,end:r3(Math.min(total(),t+1.2)),words:[],edited:true});currentSubtitles.sort((a,b)=>a.start-b.start);renderSubList();changed({now:true});select('sub',currentSubtitles.findIndex(s=>s.start===t),{seek:false});}
  function addFx(kind){const K=window.FptEngine.fx.KINDS[kind];if(!K)return;remember();const start=r3(Math.min(timelineCurrentTime,total()-.1)),x={uid:newId('f'),kind,start,end:r3(Math.min(total(),start+K.dur))};customFx.push(x);changed({now:true});select('fx','fx:'+x.uid,{seek:false});}
  function addTitle(){const pos=slot(titleItems(),timelineCurrentTime,2.5,0,total(),0,.4);if(!pos){note('Không còn chỗ trống sau kim cho tiêu đề.');return;}remember();const styles=Object.keys(window.FptEngine.typography.HOOKS),used=new Set([hookStyle,outroStyle,...extraTitles.map(x=>x.style)]),x={uid:newId('t'),line1:'TIÊU ĐỀ MỚI',line2:'',line3:'',line4:'',style:styles.find(s=>!used.has(s))||styles[0],start:pos[0],end:pos[1]};extraTitles.push(x);changed({now:true});select('title',x.uid,{seek:false});}
  function addSfx(){if(!allSfx.length)return;remember();const uid='s'+Date.now();customSfx.push({uid,id:allSfx[0].id,start:r3(timelineCurrentTime),vol:.36});changed({now:true});setTimeout(()=>select('sfx','custom:'+uid,{seek:false}),320);}
  // A new look for the same content: Hook, Outro, every Highlight style and sound move to ones not used recently.
  function reshuffle(){
    if(!studioPlan)return;remember();
    previousLooks.unshift({project:'~'+previousLooks.length,hookStyle,outroStyle,typos:studioPlan.highlights.map(h=>h.typo),sfx:studioPlan.sfx.map(s=>s.id)});previousLooks=previousLooks.slice(0,6);
    studioSeed=studioSeed.replace(/_k\d+$/,'')+'_k'+Date.now().toString().slice(-6);hookStyle='';outroStyle='';
    currentHighlights.forEach(h=>{if(h.styleFrom!=='user'){delete h.styleFrom;delete h.typo;delete h.motion;}});
    for(const k of Object.keys(sfxOverrides))if(!sfxOverrides[k].user&&!sfxOverrides[k].muted)delete sfxOverrides[k];
    changed({now:true});
  }
  function reset(){studioPlan=null;undoStack=[];redoStack=[];prepareKey='';prepareVersion++;planVersion++;selectedTimelineItem=null;timelineCurrentTime=0;Live.clear();zoomedFor='';if(built){buttons();inspector();}render();}
  function start(){
    $('tlUndo').onclick=undo;$('tlRedo').onclick=redo;$('tlSplitBtn').onclick=split;$('tlDeleteBtn').onclick=removeSelected;
    $('tlSnapBtn').onclick=()=>{snapOn=!snapOn;$('tlSnapBtn').classList.toggle('on',snapOn);};
    $('tlZoom').oninput=e=>setZoom(Math.pow(MAX_ZOOM,e.target.value/100));$('tlFit').onclick=()=>setZoom(1);
    $('tlAddHl').onclick=addHighlight;$('tlAddSub').onclick=addSub;$('tlAddSfx').onclick=addSfx;$('tlAddTitle').onclick=addTitle;$('tlFixStyles').onclick=fixStyles;
    const fxMenu=$('tlAddFx');fxMenu.innerHTML='<option value="">+ Hiệu ứng</option>'+Object.entries(window.FptEngine.fx.KINDS).map(([k,x])=>'<option value="'+k+'">'+x.name+'</option>').join('')+'<option value="fade">Tối dần cuối video</option><option value="cuts">Bật lại zoom các cảnh</option>';
    fxMenu.onchange=()=>{const v=fxMenu.value;fxMenu.value='';fxMenu.blur();if(v==='fade'){remember();delete fxState.fade;changed({now:true});}else if(v==='cuts'){remember();for(const k of Object.keys(fxState))if(k.startsWith('cut:'))delete fxState[k];changed({prepare:true,now:true});}else if(v)addFx(v);};$('tlCopy').onclick=copy;$('tlPaste').onclick=()=>paste();$('tlDup').onclick=duplicate;
    const picker=$('subStyleSelect');picker.innerHTML=Object.entries(window.FptEngine.subtitle.SUB_STYLES).map(([id,s])=>'<option value="'+id+'">'+esc(s.name)+'</option>').join('');picker.value=subStyleId;
    picker.onchange=()=>{remember();subStyleId=picker.value;currentSubtitles.forEach(x=>{delete x.subStyle;});changed({now:true});if(selectedTimelineItem?.type==='sub')inspector();};$('tlAddBroll').onclick=promptAddManualBroll;$('tlShuffle').onclick=reshuffle;$('tlPlayBtn').onclick=()=>toggleTimelinePlay();
    buttons();inspector();
    window.addEventListener('keydown',e=>{
      if(!isOpen())return;const a=document.activeElement,typing=a.isContentEditable||['INPUT','TEXTAREA','SELECT','SUMMARY','VIDEO'].includes(a.tagName);
      if((e.ctrlKey||e.metaKey)&&!typing){if(e.code==='KeyZ'){e.preventDefault();e.shiftKey?redo():undo();return;}if(e.code==='KeyY'){e.preventDefault();redo();return;}
        const picked=String(window.getSelection()||'');
        if(e.code==='KeyC'&&!picked){e.preventDefault();copy();}
        else if(e.code==='KeyX'&&!picked){e.preventDefault();if(copy())removeSelected();}
        else if(e.code==='KeyV'){e.preventDefault();paste();}
        else if(e.code==='KeyD'){e.preventDefault();duplicate();}
        else if(e.code==='KeyB'){e.preventDefault();split();}
        return;}
      if(typing||e.altKey||a.tagName==='A'||(a.tagName==='BUTTON'&&['Space','Enter'].includes(e.code)&&!a.closest('#timelineBody')))return;
      if(e.code==='Space'){e.preventDefault();toggleTimelinePlay();}
      else if(e.code==='KeyS'){e.preventDefault();split();}
      else if(e.code==='KeyQ'){e.preventDefault();trimTo('l');}
      else if(e.code==='KeyW'){e.preventDefault();trimTo('r');}
      else if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();removeSelected();}
      else if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();const s=e.code==='ArrowLeft'?-1:1;seekTimeline(timelineCurrentTime+s*(e.shiftKey?1:1/30));}
      else if(e.code==='Home'){e.preventDefault();seekTimeline(0);}
      else if(e.code==='Escape')select(null);
    });
    new ResizeObserver(()=>render()).observe($('timelineScrollWrap'));
  }
  return {needle:()=>playhead(false),fixStyles,addFx,start,render,changed,select,reset,copy,paste,duplicate,split,trimTo,removeSelected,refreshPlan,refreshPreview,remember,adopt,undo,redo,get idle(){return !planTimer&&!planBusy&&!needsPlan&&!drag;},get model(){return items;}};
})();
// ---- names used by the rest of the Studio
function syncClipWindows(){
  if(!selectedVideos.length){currentClipWindows=[];return;}
  let cursor=0;const rebuilt=[],known=new Set(currentClipWindows.map(w=>w.fileRef));
  // Cut order comes from the windows; clips without analysis yet get an estimate at the end.
  const chosen=new Set(selectedVideos),ordered=currentClipWindows.filter(w=>chosen.has(w.fileRef));
  for(const file of selectedVideos)if(!known.has(file))ordered.push({id:'estimate_'+file,fileRef:file,estimated:true,trimStart:0,trimEnd:5*currentVoiceSpeed,timelineDur:5});
  for(const win of ordered){
    const duration=(Number(win.trimEnd)-Number(win.trimStart||0))/currentVoiceSpeed,timelineDur=Number.isFinite(duration)&&duration>0?Number(duration.toFixed(3)):5;
    rebuilt.push({...win,timelineStart:Number(cursor.toFixed(3)),timelineDur});cursor+=timelineDur;
  }
  currentClipWindows=rebuilt;
}
function getTimelineTotalDuration(){
  const clips=currentClipWindows.reduce((a,c)=>a+(Number(c.timelineDur)||0),0);
  if(clips>0)return Math.max(1,clips);
  return Math.max(1,selectedVideos.length*5,...currentSubtitles.map(s=>Number(s.end)||0),...currentHighlights.map(h=>Number(h.end)||0));
}
function renderTimeline(){TL.changed();}
function updateTimelinePlayheadUI(){TL.render();}
function seekTimeline(t){timelineCurrentTime=Math.max(0,Math.min(getTimelineTotalDuration(),Number(t)||0));Live.seek(timelineCurrentTime);TL.needle();}
function showQuickEditDock(type,index){TL.select(type,index);}
function closeTimelineEditor(){TL.select(null);}
function toggleTimelinePlay(){if(Live.hasMedia)Live.toggle();}
function playSfxByKey(key){const s=allSfx.find(x=>x.id===key);if(s){const m=/#t=([\d.]+)(?:,([\d.]+))?/.exec(s.url)||[];Live.audition({url:s.url,from:Number(m[1])||0,duration:s.dur,vol:.5});}}
function promptAddManualBroll(){
  const source=brollCatalogData.find(b=>b.available!==false);if(!source)return alert('Kho B-roll chưa có clip. Hãy tải clip lên trước.');
  TL.remember();
  const lo=studioPlan?.hookDur??3.5,hi=studioPlan?.outroStart??getTimelineTotalDuration(),start=Math.max(lo,Math.min(timelineCurrentTime,hi-.6)),end=Math.min(hi,start+2);
  currentBrollCutaways.push({id:'broll_'+Date.now(),uid:'m'+Date.now(),brollId:source.id,name:source.name,icon:source.icon,layout:source.defaultLayout||'pip',start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),duration:Number((end-start).toFixed(3)),enabled:true,autoDetected:false,timingSource:'manual'});
  renderBrollQueue();TL.changed({prepare:true,now:true});TL.select('broll',currentBrollCutaways.length-1,{seek:false});
}
function toggleTimelineCollapse(force){
  const body=document.getElementById('timelineBody'),button=document.getElementById('tlCollapseBtn'),open=typeof force==='boolean'?force:button.getAttribute('aria-expanded')!=='true';
  body.style.display=open?'block':'none';button.setAttribute('aria-expanded',String(open));
  document.getElementById('timelineToggleLabel').textContent=open?'Thu gọn':'Mở timeline';document.querySelector('.app-container').classList.toggle('editing',open);
  if(open)TL.render();
}
