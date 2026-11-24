'use strict';
// Frame-accurate kinetic typography for Hook, Highlight and Outro.
// Every frame is a pure function of time: words land on their Whisper timestamp, motion is anchored on the
// text itself (never on the frame centre), and glyph boxes are measured so lines cannot collide or leave the safe area.
// Isomorphic: the Studio preview runs this same file in the browser (served by src/web/engine_bundle.js), so what is
// seen on the timeline is what gets rendered. Keep it free of Node APIs.
const {splitLines}=require('../editing/phrase_rules');

const C={orange:'#F37021',orangeL:'#FF9550',peach:'#FFD9BF',blue:'#0066B3',blueL:'#1B86D6',sky:'#7CC4F5',green:'#00A651',greenL:'#19C46F',
  greenD:'#007F3E',mint:'#A6EBC5',navy:'#0B1F3F',navyL:'#17356A',navyM:'#2C4370',navyG:'#5A6E92',white:'#FFFFFF'};
const W=1080,TOP=150,H=700,CX=540,FPS=30,MAX_W=900;
const HEAD='FptHead',BODY='FptBody';
const FONTS=[['Montserrat-Bold.ttf',HEAD],['BeVietnamPro-Black.ttf',BODY]];
let createCanvas=null,scratch=null;
function configure(factory){createCanvas=factory;scratch=createCanvas(8,8).getContext('2d');}
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const outCubic=p=>1-Math.pow(1-clamp(p),3);
const outBack=(p,s=1.9)=>{p=clamp(p)-1;return 1+(s+1)*p*p*p+s*p*p;};
const inCubic=p=>Math.pow(clamp(p),3);
const pulse=(t,at,d)=>t<at||t>at+d?0:Math.sin(Math.PI*(t-at)/d);
const font=(family,size)=>size.toFixed(2)+'px '+family;

function measureLine(words,family,size){
  scratch.font=font(family,size);
  const text=words.join(' '),m=scratch.measureText(text);
  // Positions from the shaped prefix keep kerning identical to the full line.
  const xs=words.map((_,i)=>i?scratch.measureText(words.slice(0,i).join(' ')+' ').width:0);
  return {cap:scratch.measureText('H').actualBoundingBoxAscent,width:m.width,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent,xs,widths:words.map(w=>scratch.measureText(w).width)};
}
function fitLine(words,family,size,maxWidth){
  let m=measureLine(words,family,size);
  if(m.width>maxWidth){size=Math.max(26,size*maxWidth/m.width);m=measureLine(words,family,size);}
  return {...m,size};
}
function shapePath(ctx,shape,x,y,w,h){
  ctx.beginPath();
  if(shape==='pill'||shape==='card')ctx.roundRect(x,y,w,h,shape==='pill'?Math.min(40,h/2):22);
  else if(shape==='ticket'){
    const r=Math.min(18,h*.16),m=y+h/2;
    ctx.moveTo(x+16,y);ctx.lineTo(x+w-16,y);ctx.quadraticCurveTo(x+w,y,x+w,y+16);ctx.lineTo(x+w,m-r);ctx.arc(x+w,m,r,-Math.PI/2,Math.PI/2,true);
    ctx.lineTo(x+w,y+h-16);ctx.quadraticCurveTo(x+w,y+h,x+w-16,y+h);ctx.lineTo(x+16,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-16);
    ctx.lineTo(x,m+r);ctx.arc(x,m,r,Math.PI/2,-Math.PI/2,true);ctx.lineTo(x,y+16);ctx.quadraticCurveTo(x,y,x+16,y);
  }else if(shape==='logo'){
    // The slanted, rounded block of the FPT mark.
    const k=h*.13,r=h*.2,p=[[x+k,y],[x+w+k,y],[x+w-k,y+h],[x-k,y+h]];
    ctx.moveTo((p[0][0]+p[1][0])/2,p[0][1]);for(let i=1;i<=4;i++){const a=p[i%4],b=p[(i+1)%4];ctx.arcTo(a[0],a[1],b[0],b[1],r);}
  }else if(shape==='ribbon'){
    const n=h*.32;ctx.moveTo(x-n,y);ctx.lineTo(x+w+n,y);ctx.lineTo(x+w,y+h/2);ctx.lineTo(x+w+n,y+h);ctx.lineTo(x-n,y+h);ctx.lineTo(x,y+h/2);
  }else{const s=15;ctx.moveTo(x+s,y);ctx.lineTo(x+w+s,y);ctx.lineTo(x+w-s,y+h);ctx.lineTo(x-s,y+h);}
  ctx.closePath();
}
function gradient(ctx,fill,y,h){
  if(!Array.isArray(fill))return fill;
  const g=ctx.createLinearGradient(0,y,0,y+h);fill.forEach((c,i)=>g.addColorStop(i/(fill.length-1),c));return g;
}
function sprite(w,h,draw){
  const c=createCanvas(Math.max(2,Math.ceil(w)),Math.max(2,Math.ceil(h)));draw(c.getContext('2d'));return c;
}
// ---- line ---------------------------------------------------------------------------------------------
const BLOCKS=[[BLOCK('blueL'),BLOCK('blue')],[BLOCK('orangeL'),BLOCK('orange')],[BLOCK('greenL'),BLOCK('green')]];
function BLOCK(k){return C[k];}
// At most three blocks, as in the mark: words are grouped evenly and stay readable.
function groupBlocks(words){
  if(words.length<=3)return words;
  const total=words.join(' ').length,groups=[];let current=[];
  words.forEach((w,i)=>{
    const left=words.length-i,need=3-groups.length;
    if(current.length&&groups.length<2&&(current.join(' ').length+w.length/2>total/3||left<need))  {groups.push(current);current=[];}
    current.push(w);
  });
  groups.push(current);return groups.map(g=>g.join(' '));
}
function buildBlocks(spec,y,scale){
  spec={...spec,words:groupBlocks(spec.words)};
  const family=spec.family||HEAD,padX=20*scale,padY=13*scale,gap=13*scale,n=spec.words.length;
  let size=spec.size*scale,m=measureLine(spec.words,family,size);
  const total=()=>m.widths.reduce((a,b)=>a+b,0)+n*2*padX+(n-1)*gap+20*scale;
  if(total()>MAX_W){size=Math.max(26,size*(MAX_W-(n*2*padX+(n-1)*gap+20*scale))/m.widths.reduce((a,b)=>a+b,0));m=measureLine(spec.words,family,size);}
  m.size=size;
  const top=Math.max(m.cap+padY,m.ascent+padY*.5),bottom=Math.max(padY,m.descent+padY*.5),h=m.ascent+m.descent,baseline=y+m.ascent;
  let x=CX-(total()-20*scale)/2;const S=14;
  const line={spec,x,y,h,m,scale,at:0,words:[]};
  spec.words.forEach((word,i)=>{
    const bw=m.widths[i]+2*padX,bh=top+bottom,P=34,colors=BLOCKS[(i+(spec.shift||0))%3];
    const img=sprite(bw+2*P,bh+2*P,ctx=>{
      ctx.shadowColor='rgba(4,12,28,.5)';ctx.shadowBlur=16;ctx.shadowOffsetX=4;ctx.shadowOffsetY=10;
      shapePath(ctx,'logo',P,P,bw,bh);ctx.fillStyle=gradient(ctx,colors,P,bh);ctx.fill();ctx.shadowColor='transparent';
      ctx.strokeStyle=C.white;ctx.lineWidth=5;ctx.stroke();
      ctx.font=font(family,size);ctx.fillStyle=C.white;ctx.fillText(word,P+padX,P+top);
    });
    line.words.push({word,fill:img,stroke:null,x:x-P,y:baseline-top-P,w:img.width,h:img.height,S,at:0});
    x+=bw+gap;
  });
  line.box={x:CX-total()/2,y:baseline-top,w:total(),h:top+bottom};
  return line;
}
function buildLine(spec,y,scale){
  if(spec.blocks)return buildBlocks(spec,y,scale);
  const padX=spec.box?(spec.padX??26)*scale:0,padY=spec.box?(spec.padY??13)*scale:0,stroke=(spec.strokeW||0)*scale,slant=spec.box==='slab'?30:0,halo=spec.glow?24*scale:0;
  const m=fitLine(spec.words,spec.family||HEAD,spec.size*scale,MAX_W-2*padX-stroke-slant-(spec.reserve||0)*scale);
  const x=CX-m.width/2,baseline=y+m.ascent,h=m.ascent+m.descent,S=Math.ceil(stroke/2+14+halo);
  // Optically centre capitals; accents and the dot below only need a small clearance.
  const top=Math.max(m.cap+padY,m.ascent+padY*.45),bottom=Math.max(padY,m.descent+padY*.45);
  const box=spec.box?{x:x-padX,y:baseline-top,w:m.width+2*padX,h:top+bottom}:{x:x-stroke/2,y:y-stroke/2,w:m.width+stroke,h:h+stroke};
  const line={spec,box,x,y,h,m,scale,at:0,words:[]};
  spec.words.forEach((word,i)=>{
    const ww=m.widths[i],cw=ww+2*S,ch=h+2*S;
    const paint=(mode)=>sprite(cw,ch,ctx=>{
      ctx.font=font(spec.family||HEAD,m.size);ctx.textBaseline='alphabetic';ctx.lineJoin='round';
      const tx=S,ty=S+m.ascent;
      if(mode==='stroke'){
        ctx.shadowColor='rgba(4,12,28,.55)';ctx.shadowBlur=10;ctx.shadowOffsetX=3;ctx.shadowOffsetY=7;
        ctx.strokeStyle=spec.stroke;ctx.lineWidth=stroke;ctx.strokeText(word,tx,ty);
      }else{
        ctx.fillStyle=gradient(ctx,spec.fill,S,h);
        if(spec.glow){ctx.shadowColor=spec.glow;ctx.shadowBlur=halo;ctx.fillText(word,tx,ty);ctx.shadowBlur=halo*.4;}
        else if(!spec.box&&!stroke){ctx.shadowColor='rgba(4,12,28,.6)';ctx.shadowBlur=12;ctx.shadowOffsetY=6;}
        ctx.fillText(word,tx,ty);
      }
    });
    line.words.push({word,fill:paint('fill'),stroke:stroke?paint('stroke'):null,x:x+m.xs[i]-S,y:y-S,w:cw,h:ch,S,at:0});
  });
  if(spec.box){
    const P=34;
    line.boxSprite=sprite(box.w+2*P,box.h+2*P,ctx=>{
      ctx.shadowColor='rgba(4,12,28,.5)';ctx.shadowBlur=16;ctx.shadowOffsetX=4;ctx.shadowOffsetY=10;
      shapePath(ctx,spec.box,P,P,box.w,box.h);ctx.fillStyle=gradient(ctx,spec.bg,P,box.h);ctx.fill();
      ctx.shadowColor='transparent';
      ctx.save();shapePath(ctx,spec.box,P,P,box.w,box.h);ctx.clip();
      const g=ctx.createLinearGradient(0,P,0,P+box.h*.55);g.addColorStop(0,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.fillRect(0,P,box.w+2*P,box.h*.55);ctx.restore();
      if(spec.border){shapePath(ctx,spec.box,P,P,box.w,box.h);ctx.strokeStyle=spec.border;ctx.lineWidth=spec.borderW||5;ctx.lineJoin='round';ctx.stroke();}
    });
    line.boxPad=P;
  }
  return line;
}
// ---- styles -------------------------------------------------------------------------------------------
const OG=[C.orangeL,C.orange],BG=[C.blueL,C.blue],GG=[C.greenL,C.green],NG=[C.navyL,C.navy],WG=[C.white,C.peach],MG=[C.navyG,C.navyM];
const pill=(bg,fill=C.white,border=C.white,extra={})=>({family:BODY,size:40,box:'pill',bg,fill,border,padX:26,padY:12,...extra});
const slab=(bg,fill=C.white,border=C.white,extra={})=>({size:70,box:'slab',bg,fill,border,padX:32,padY:17,...extra});
const outline=(fill,stroke,strokeW=15,extra={})=>({size:86,fill,stroke,strokeW,...extra});
const card=(bg,fill,border,extra={})=>({size:66,box:'card',bg,fill,border,padX:34,padY:20,...extra});
const STYLES={
  // Core set
  fpt_price_burst:{lead:pill(BG),main:outline(OG,C.white,17,{size:96}),deco:['burst','sparkle']},
  fpt_voucher_3d:{lead:pill(OG),main:slab(WG,C.navy,C.orange,{box:'ticket',padX:44,size:74,borderW:7}),deco:['sparkle','shine']},
  fpt_football_match:{lead:pill(NG,C.white,C.green),main:outline(C.white,C.green,15,{size:92}),deco:['burst','stripe','sparkle']},
  fpt_speed_hud:{lead:slab(NG,C.sky,C.sky,{family:BODY,size:38,padX:24,padY:11}),main:outline(C.white,C.blue,15,{size:92}),deco:['speed','hudline']},
  fpt_camera_smart:{lead:pill(NG,C.white,C.green),main:slab(GG,C.white,C.white,{size:72}),deco:['focus','check']},
  fpt_neon_glass:{lead:pill(BG),main:outline(C.white,C.orange,15,{size:88}),deco:['stripe','shine']},
  fpt_split_kicker:{lead:pill(NG),main:slab(OG,C.white,C.white,{size:76}),deco:['shine','burst']},
  fpt_tricolor_slab:{lead:slab(BG,C.white,C.white,{family:BODY,size:40,padX:26,padY:12}),main:slab(OG),deco:['stripe','shine']},
  fpt_orange_block:{lead:pill(BG),main:slab(OG,C.white,C.white,{size:74,box:'card'}),deco:['shine','sparkle']},
  fpt_blue_pill:{single:true,main:slab(BG,C.white,C.white,{box:'pill',size:64,padX:44,padY:20}),deco:['shine','ring']},
  fpt_green_badge:{single:true,main:slab(GG,C.white,C.white,{box:'pill',size:62,padX:42,padY:19,reserve:40}),deco:['check','shine']},
  fpt_stack_outline:{lead:outline(C.white,C.blue,11,{family:BODY,size:54}),main:outline(OG,C.white,16,{size:92}),deco:['underline']},
  fpt_editorial_stack:{lead:outline(OG,C.white,12,{size:76}),main:slab(NG,C.white,C.green,{family:BODY,size:52,padX:28,padY:13}),deco:['stripe']},
  fpt_offset_echo:{single:true,main:outline(C.white,C.orange,9,{size:82,reserve:30}),deco:['echo']},
  fpt_bracket_focus:{lead:slab(BG,C.white,null,{box:'pill',size:54,padX:28,padY:12,reserve:60}),main:outline(C.white,C.navy,12,{family:BODY,size:66,reserve:70}),deco:['bracket']},
  fpt_ribbon_cut:{lead:slab(OG,C.white,C.white,{size:56,box:'ribbon',padX:30,padY:14,reserve:70}),main:slab(BG,C.white,C.white,{size:56,box:'ribbon',padX:30,padY:14,reserve:70}),deco:['shine'],stagger:14},
  // FPT Telecom network set: motifs taken from the mark, fibre, Wi-Fi, router and connection
  fpt_logo_blocks:{lead:outline(C.white,C.navy,11,{family:BODY,size:50}),main:{size:64,blocks:true,fill:C.white},deco:[]},
  fpt_fiber_line:{lead:pill(NG,C.white,C.sky),main:outline(C.white,C.blue,15,{size:90}),deco:['fiber']},
  fpt_signal_bars:{lead:pill(OG),main:card(NG,C.white,C.sky,{reserve:78}),deco:['bars']},
  fpt_wifi_wave:{lead:outline(C.white,C.navy,10,{family:BODY,size:48}),main:slab(BG,C.white,C.white,{box:'pill',size:64,padX:40,padY:20,reserve:150}),deco:['wifi']},
  fpt_router_led:{lead:pill(GG),main:card(WG,C.navy,C.blue,{size:68,padY:34,borderW:6}),deco:['led']},
  fpt_data_stream:{lead:slab(BG,C.white,C.sky,{family:BODY,size:40,padX:26,padY:12}),main:outline([C.sky,C.blue],C.white,16,{size:90}),deco:['stream']},
  fpt_speed_gauge:{lead:pill(NG,C.white,C.orange),main:outline(OG,C.white,16,{size:90}),deco:['gauge']},
  fpt_connect_nodes:{lead:pill(BG),main:slab(GG,C.white,C.white,{size:68,reserve:60}),deco:['nodes']},
  // B-roll set (user, 24/11/2026): a look that belongs to the picture on screen, used first while that B-roll shows.
  fpt_game_crosshair:{lead:slab(NG,C.sky,C.sky,{family:BODY,size:40,padX:24,padY:11}),main:outline(C.white,C.navy,15,{size:88,reserve:110}),deco:['crosshair','hpbar']},
  fpt_game_victory:{lead:pill(BG),main:slab(OG,C.white,C.white,{size:72,reserve:150}),deco:['chevrons','burst']},
  fpt_score_bar:{lead:slab(GG,C.white,C.white,{family:BODY,size:40,padX:26,padY:12}),main:card(NG,C.white,C.green,{size:66,reserve:110,borderW:6}),deco:['pitch','ball']},
  fpt_cam_rec:{lead:pill(NG,C.white,C.orange),main:outline(C.white,C.navy,13,{size:84,reserve:60}),deco:['focus','rec']},
  fpt_play_cinema:{lead:pill(OG),main:slab(NG,C.white,C.orange,{size:70,reserve:40}),deco:['filmstrip','shine']},
  fpt_play_button:{lead:outline(C.white,C.navy,10,{family:BODY,size:48}),main:slab(OG,C.white,C.white,{box:'pill',size:62,padX:40,padY:19,reserve:130}),deco:['playbtn','ring']},
  // Problem set: only on phrases about a problem ("bị bức tường ngăn", "sóng yếu", "giật lag"). Dimmed navy, orange
  // warnings, and motion that hesitates: a bump against a wall, a flicker, a glitch, a sink.
  neg_wall_block:{neg:true,lead:pill(MG,C.white,C.navyG),main:slab([C.navyM,C.navy],C.white,C.orange,{size:70,reserve:96}),deco:['wall'],after:'bump'},
  neg_weak_signal:{neg:true,lead:pill(OG),main:outline(C.white,C.navyM,14,{size:86,reserve:92}),deco:['weakbars'],after:'flicker'},
  neg_lag_glitch:{neg:true,lead:slab(NG,C.white,C.navyG,{family:BODY,size:40,padX:24,padY:11}),main:outline(C.white,C.navy,15,{size:88,reserve:96}),deco:['buffer'],after:'jitter'},
  neg_strike_cross:{neg:true,lead:pill(MG,C.white,C.white),main:outline(C.white,C.navyM,14,{size:86,reserve:70}),deco:['strike','xmark']},
  neg_warning_tape:{neg:true,lead:slab(OG,C.white,C.white,{family:BODY,size:40,padX:26,padY:12}),main:card(NG,C.white,C.orange,{size:64,reserve:96,borderW:6}),deco:['tape','warn']},
  neg_crack_sink:{neg:true,lead:outline(C.white,C.navyM,10,{family:BODY,size:50}),main:slab(MG,C.white,C.white,{size:70}),deco:['crack'],after:'sink'},
  neg_wifi_off:{neg:true,lead:pill(NG,C.white,C.orange),main:slab(MG,C.white,C.white,{box:'pill',size:62,padX:40,padY:19,reserve:120}),deco:['wifioff'],after:'flicker'},
  neg_down_trend:{neg:true,lead:pill(MG),main:outline(C.white,C.orange,14,{size:86}),deco:['decline'],after:'sink'}
};
// Hook looks. Each has its own layout, entrance and sound recipe; the pipeline rotates them between videos.
const HOOKS={
  slab_stack:{enter:'slide',lines:n=>[slab(OG,C.white,C.white,{size:n>3?54:60,padX:30,padY:15,borderW:6}),slab(BG,C.white,C.white,{size:44,padX:28,padY:12}),pill(GG,C.white,C.white,{size:36}),pill(NG,C.white,C.orange,{size:36})],
    deco:['stripe','sparkle'],shine:true,sfx:{open:['impact','whoosh'],line:'pop',land:'bell'}},
  logo_blocks:{enter:'drop',lines:()=>[{size:52,blocks:true,fill:C.white},slab(NG,C.white,C.orange,{size:44,padX:28,padY:13}),{size:34,blocks:true,fill:C.white,shift:1,family:BODY},pill(OG,C.white,C.white,{size:34})],
    deco:['sparkle'],sfx:{open:['pop','impact'],line:'pop',land:'bell'}},
  mega_outline:{enter:'zoom',lines:()=>[outline(OG,C.white,17,{size:76}),outline(C.white,C.blue,14,{size:56}),outline(C.white,C.green,12,{family:BODY,size:44}),outline(C.white,C.navy,11,{size:38})],
    deco:['burst','underline'],sfx:{open:['impact','riser'],line:'run',land:'bell'}},
  glass_card:{enter:'mask',lines:()=>[card(NG,C.white,C.sky,{size:58,padY:17}),card(WG,C.navy,C.orange,{size:46,padY:13}),card(BG,C.white,C.white,{family:BODY,size:36,padY:11}),card(OG,C.white,C.white,{size:34,padY:11})],
    deco:['stripe'],shine:true,sfx:{open:['tone','whoosh'],line:'pop',land:'run'}},
  ribbon_wave:{enter:'slide',lines:()=>[slab(BG,C.white,C.white,{box:'ribbon',size:56,padX:30,padY:16,reserve:60}),slab(OG,C.white,C.white,{box:'ribbon',size:46,padX:28,padY:13,reserve:60}),slab(GG,C.white,C.white,{box:'ribbon',family:BODY,size:36,padX:26,padY:11,reserve:60}),slab(NG,C.white,C.white,{box:'ribbon',size:34,padX:26,padY:11,reserve:60})],
    deco:['sparkle'],shine:true,offset:16,sfx:{open:['bell','whoosh'],line:'whoosh',land:'pop'}},
  signal_pop:{enter:'flip',lines:()=>[slab(GG,C.white,C.white,{box:'pill',size:56,padX:38,padY:18,reserve:120}),outline(C.white,C.blue,13,{size:52}),pill(OG,C.white,C.white,{size:38}),pill(NG,C.white,C.sky,{size:36})],
    deco:['wifi','ring'],shine:true,sfx:{open:['tone','bell'],line:'run',land:'tone'}},
  ticket_banner:{enter:'zoom',lines:()=>[slab(WG,C.navy,C.orange,{box:'ticket',size:60,padX:44,padY:20,borderW:7}),slab(OG,C.white,C.white,{box:'pill',size:44,padX:32,padY:13}),pill(BG,C.white,C.white,{size:36}),pill(GG,C.white,C.white,{size:36})],
    deco:['burst','sparkle'],shine:true,sfx:{open:['impact','cash'],line:'pop',land:'bell'}},
  fiber_neon:{enter:'mask',lines:()=>[outline(C.white,C.blue,15,{size:70}),slab(NG,C.sky,C.sky,{size:44,padX:28,padY:12}),pill(BG,C.white,C.white,{size:36}),pill(OG,C.white,C.white,{size:36})],
    deco:['fiber','stream'],sfx:{open:['run','riser'],line:'tone',land:'impact'}},
  type_terminal:{enter:'type',lines:()=>[card(NG,C.white,C.sky,{size:56,padY:18}),card(WG,C.navy,C.blue,{family:BODY,size:42,padY:13}),pill(BG,C.white,C.white,{size:36}),pill(OG,C.white,C.white,{size:34})],
    deco:['hudline'],sfx:{open:['run','tone'],line:'run',land:'mech'}},
  stamp_seal:{enter:'stamp',lines:()=>[card(WG,C.orange,C.orange,{size:62,padY:18,borderW:9}),slab(BG,C.white,C.white,{size:44,padX:28,padY:12}),pill(NG,C.white,C.orange,{size:36}),pill(GG,C.white,C.white,{size:34})],
    deco:['burst'],tilt:-.03,sfx:{open:['impact','mech'],line:'impact',land:'bell'}},
  swing_tag:{enter:'swing',lines:()=>[slab(OG,C.white,C.white,{box:'ticket',size:58,padX:44,padY:18,borderW:6}),slab(WG,C.navy,C.blue,{box:'ticket',size:44,padX:38,padY:14,borderW:6}),slab(BG,C.white,C.white,{box:'ticket',family:BODY,size:36,padX:34,padY:12}),slab(GG,C.white,C.white,{box:'ticket',size:34,padX:32,padY:11})],
    deco:['sparkle'],shine:true,sfx:{open:['whoosh','pop'],line:'pop',land:'bell'}},
  curtain_bar:{enter:'curtain',lines:()=>[slab(BG,C.white,C.white,{size:60,padX:34,padY:16,borderW:6}),slab(OG,C.white,C.white,{size:46,padX:30,padY:13}),slab(WG,C.navy,C.green,{family:BODY,size:38,padX:28,padY:12}),pill(NG,C.white,C.white,{size:34})],
    deco:['stripe'],shine:true,sfx:{open:['riser','impact'],line:'whoosh',land:'tone'}},
  glitch_cut:{enter:'glitch',lines:()=>[outline(C.white,C.navy,15,{size:74}),slab(OG,C.white,C.white,{size:46,padX:28,padY:12}),outline(C.white,C.blue,12,{family:BODY,size:44}),outline(C.white,C.green,11,{size:38})],
    deco:['speed'],sfx:{open:['mech','impact'],line:'mech',land:'run'}},
  wave_bounce:{enter:'wave',lines:()=>[outline(C.white,C.orange,15,{size:74}),outline(BG,C.white,14,{size:56}),outline(C.white,C.green,12,{family:BODY,size:46}),outline(C.white,C.navy,11,{size:38})],
    deco:['underline','sparkle'],sfx:{open:['pop','tone'],line:'pop',land:'bell'}},
  corner_frame:{enter:'rise',lines:()=>[slab(GG,C.white,C.white,{size:58,padX:32,padY:15,reserve:70}),outline(C.white,C.navy,13,{size:52,reserve:70}),pill(OG,C.white,C.white,{size:38}),pill(BG,C.white,C.white,{size:34})],
    deco:['bracket'],shine:true,sfx:{open:['whoosh','mech'],line:'tone',land:'bell'}},
  spotlight_ring:{enter:'spin',lines:()=>[slab(OG,C.white,C.white,{box:'pill',size:56,padX:42,padY:19}),slab(NG,C.white,C.orange,{box:'pill',size:44,padX:34,padY:14}),pill(BG,C.white,C.white,{size:38}),pill(GG,C.white,C.white,{size:34})],
    deco:['ring','sparkle'],shine:true,sfx:{open:['riser','bell'],line:'tone',land:'cash'}},
  arrow_rush:{enter:'rush',lines:()=>[slab(BG,C.white,C.white,{box:'ribbon',size:58,padX:32,padY:16,reserve:60}),slab(WG,C.orange,C.orange,{size:46,padX:30,padY:13}),slab(OG,C.white,C.white,{box:'ribbon',family:BODY,size:38,padX:28,padY:12,reserve:60}),pill(GG,C.white,C.white,{size:34})],
    deco:['speed','stripe'],shine:true,sfx:{open:['whoosh','impact'],line:'whoosh',land:'pop'}},
  tri_blocks:{enter:'drop',lines:()=>[{size:54,blocks:true,fill:C.white},card(WG,C.navy,C.orange,{size:46,padY:14,borderW:6}),{size:36,blocks:true,fill:C.white,shift:2,family:BODY},pill(NG,C.white,C.white,{size:34})],
    deco:['nodes'],sfx:{open:['pop','bell'],line:'pop',land:'impact'}},
  neon_glow:{enter:'neon',lines:()=>[outline(C.white,C.orange,11,{size:76,glow:'rgba(255,149,80,.95)'}),outline(C.white,C.blue,10,{size:56,glow:'rgba(124,196,245,.95)'}),pill(NG,C.white,C.sky,{size:38}),pill(OG,C.white,C.white,{size:34})],
    deco:['ring'],sfx:{open:['tone','impact'],line:'tone',land:'bell'}},
  extrude_pop:{enter:'zoom',lines:()=>[outline(OG,C.white,16,{size:82,extrude:7}),outline(C.white,C.blue,13,{size:58,extrude:5}),outline(C.white,C.green,11,{family:BODY,size:44,extrude:4}),pill(NG,C.white,C.orange,{size:36})],
    deco:['burst','sparkle'],sfx:{open:['impact','whoosh'],line:'impact',land:'bell'}},
  split_open:{enter:'split',lines:()=>[slab(NG,C.white,C.orange,{size:60,padX:34,padY:16,borderW:6}),outline(C.white,C.orange,14,{size:58}),slab(BG,C.white,C.white,{family:BODY,size:38,padX:28,padY:12}),pill(GG,C.white,C.white,{size:34})],
    deco:['stripe','sparkle'],shine:true,sfx:{open:['riser','impact'],line:'whoosh',land:'bell'}},
  light_beam:{enter:'beam',lines:()=>[outline(C.white,C.blue,15,{size:74,extrude:4}),slab(OG,C.white,C.white,{size:46,padX:30,padY:13}),outline(C.white,C.navy,11,{family:BODY,size:42}),pill(BG,C.white,C.white,{size:34})],
    deco:['underline'],shine:true,sfx:{open:['whoosh','tone'],line:'whoosh',land:'pop'}}
};
function layout(lineSpecs,baseY,scale,gapPx){
  let y=baseY;const lines=[];
  for(const spec of lineSpecs){
    const probe=buildLine(spec,0,scale),top=-probe.box.y;
    const line=buildLine(spec,lines.length?y+top:baseY,scale);
    lines.push(line);y=line.box.y+line.box.h+gapPx;
  }
  const x0=Math.min(...lines.map(l=>l.box.x)),x1=Math.max(...lines.map(l=>l.box.x+l.box.w));
  const y0=Math.min(...lines.map(l=>l.box.y)),y1=Math.max(...lines.map(l=>l.box.y+l.box.h));
  return {lines,box:{x:x0,y:y0,w:x1-x0,h:y1-y0}};
}
const upper=s=>s.toLocaleUpperCase('vi');
function buildHighlight(h){
  const style=STYLES[h.typo]||STYLES.fpt_tricolor_slab,raw=String(h.text).replace(/\s+/g,' ').trim().split(' ');
  const groups=style.single&&raw.join(' ').length<=20?[raw.map((_,i)=>i)]:splitLines(raw);
  const specs=groups.length===1?[{...style.main}]:[{...(style.lead||{...style.main,size:style.main.size*.8})},{...style.main}];
  specs.forEach((s,i)=>{s.words=groups[i].map(k=>i===specs.length-1?upper(raw[k]):raw[k]);});
  if(groups.length>1)specs[0].words[0]=specs[0].words[0].charAt(0).toLocaleUpperCase('vi')+specs[0].words[0].slice(1);
  const scale=Number(h.scale)||1.4,built=layout(specs,Number(h.y)||350,scale,(specs.at(-1).box?6:9)*scale);
  if(style.stagger&&built.lines.length>1)built.lines.forEach((l,i)=>shiftLine(l,(i?1:-1)*style.stagger));
  const dur=h.dur,latest=Math.max(0,dur-Math.min(.42,dur*.45)),offsets=h.wordOffsets||[];
  built.lines.forEach((line,li)=>{
    const spokenAt=i=>Number.isFinite(offsets[i])?clamp(offsets[i],0,latest):null;
    const first=spokenAt(groups[li][0])??(li?Math.min(.35,dur*.3):0);
    // A line enters with its first spoken word, early enough to be read, and never as a half-empty box.
    line.at=li?Math.min(first,Math.max(.12,dur*.35)):0;
    line.words.forEach((word,wi)=>{
      const spoken=spokenAt(groups[li][wi]);
      word.at=line.at+.03+wi*Math.min(.06,.24/line.words.length);
      word.hit=spoken!=null&&spoken>word.at+.16?spoken:null;
    });
    line.landed=line.words.at(-1).at+.2;
  });
  return {kind:'highlight',start:h.start,end:h.start+dur,dur,motion:h.motion||'pop_bounce',style,seed:(h.index||0),...built,
    mask:h.timingPolicy==='preserve_all'};
}
function shiftLine(line,dx){line.x+=dx;line.box.x+=dx;line.words.forEach(w=>{w.x+=dx;});}
function buildTitle(kind,cfg,start,end){
  const scale=Number(cfg.scale)>0.4?Number(cfg.scale):1.3,y=Number(cfg.y)>50?Number(cfg.y):320;
  const texts=['line1','line2','line3','line4'].map(k=>String(cfg[k]||'').trim()).map((text,slot)=>({text,slot})).filter(l=>l.text);
  if(!texts.length||end-start<.1)return null;
  const hook=HOOKS[cfg.style]||HOOKS.slab_stack,looks=hook.lines(texts.length);
  // A two-line title uses its two strongest looks; an Outro never ends on the smallest one.
  const built=layout(texts.map((l,i)=>({...looks[Math.min(i,looks.length-1)],words:upper(l.text).split(/\s+/)})),y,scale,7*scale);
  if(hook.tilt)built.tilt=hook.tilt;
  if(hook.offset)built.lines.forEach((l,i)=>shiftLine(l,(i%2?1:-1)*hook.offset));
  const step=kind==='outro'?.14:.2;
  built.lines.forEach((line,i)=>{
    line.at=i*step;let typed=line.at+.05;
    line.words.forEach((w,k)=>{w.enter=hook.enter;w.at=hook.enter==='type'?typed:line.at+.05+k*(hook.enter==='wave'?.07:.04);typed+=Math.max(.08,w.word.length*.035);});
    line.landed=line.words.at(-1).at+.2;
    line.spokenAt=cfg.spokenAt?.[texts[i].slot];
  });
  return {kind,start,end,dur:end-start,motion:'pop_bounce',enter:hook.enter,style:{deco:hook.deco,shine:hook.shine,main:{},premium:true},sfx:hook.sfx,...built};
}
// ---- drawing ------------------------------------------------------------------------------------------
function at(ctx,cx,cy,{sx=1,sy=sx,rot=0,dx=0,dy=0,alpha=1},draw){
  if(alpha<=0.004)return;
  ctx.save();ctx.globalAlpha*=clamp(alpha);ctx.translate(cx+dx,cy+dy);ctx.rotate(rot);ctx.scale(sx,sy);ctx.translate(-cx,-cy);draw();ctx.restore();
}
function star(ctx,x,y,r,color,rot){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.beginPath();
  for(let i=0;i<8;i++){const a=i*Math.PI/4,q=i%2?r*.24:r;ctx[i?'lineTo':'moveTo'](Math.sin(a)*q,-Math.cos(a)*q);}
  ctx.closePath();ctx.shadowColor='rgba(255,170,110,.8)';ctx.shadowBlur=10;ctx.fillStyle=color;ctx.fill();ctx.restore();
}
function stripe(ctx,cx,y,w,h,p){
  const seg=(w-16)/3;[C.blue,C.orange,C.green].forEach((color,i)=>{
    const q=outCubic(p*1.6-i*.3),x=cx-w/2+i*(seg+8);if(q<=0)return;
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x+5,y);ctx.lineTo(x+5+seg*q,y);ctx.lineTo(x-5+seg*q,y+h);ctx.lineTo(x-5,y+h);ctx.closePath();ctx.fill();
  });
}
function drawLine(ctx,line,t,cue){
  if(t<line.at)return;
  const p=t-line.at,s=line.spec,bx=line.box.x+line.box.w/2,by=line.box.y+line.box.h/2;
  const spoken=line.spokenAt!=null?pulse(t,line.spokenAt,.34):0;
  const emphasis=1+.045*(line.landed!=null?pulse(t,line.landed,.3):0)+.06*spoken;
  const entrance={sx:emphasis},index=cue.lines.indexOf(line),q=clamp(p/.3);
  if(cue.enter==='slide')entrance.dx=(index%2?1:-1)*320*Math.pow(1-q,3);
  else if(cue.enter==='drop')entrance.dy=-190*(1-outBack(q,1.4));
  else if(cue.enter==='zoom'){entrance.sx=emphasis*(1+.7*Math.pow(1-q,3));entrance.alpha=clamp(p/.06);}
  else if(cue.enter==='flip'){entrance.sx=emphasis;entrance.sy=emphasis*Math.max(.02,outBack(q,1.7));}
  else if(cue.enter==='stamp'){entrance.sx=emphasis*(1+1.1*Math.pow(1-clamp(p/.17),2));entrance.alpha=clamp(p/.05);if(p>.17&&p<.36){const d=Math.pow(1-(p-.17)/.19,2);entrance.dx=Math.sin(p*95)*8*d;entrance.dy=Math.cos(p*80)*6*d;}}
  else if(cue.enter==='swing')entrance.rot=(index%2?-1:1)*.34*Math.cos(p*9.5)*Math.exp(-p*4.6)*(p<1.1?1:0);
  else if(cue.enter==='rise'){entrance.dy=150*Math.pow(1-q,3);entrance.alpha=clamp(p/.12);}
  else if(cue.enter==='spin'){entrance.rot=-1.1*Math.pow(1-q,3);entrance.sx=emphasis*(.35+.65*outBack(q,1.5));entrance.alpha=clamp(p/.08);}
  else if(cue.enter==='rush'){const k=Math.pow(1-clamp(p/.22),3);entrance.dx=-700*k+(p>.22&&p<.5?16*Math.sin((p-.22)*22)*Math.exp(-(p-.22)*11):0);entrance.sx=emphasis*(1+.25*k);}
  else if(cue.enter==='neon'&&p<.5){const step=Math.floor(p*30);entrance.alpha=[1,.15,1,.3,.9,1,.2,1][step%8];entrance.sx=emphasis*(1+.08*Math.pow(1-q,2));}
  else if(cue.enter==='split'){entrance.dy=-12*Math.pow(1-q,3);}
  else if(cue.enter==='glitch'&&p<.36){const step=Math.floor(p*38);entrance.dx=((step*53)%31-15)*(1-p/.36)*1.6;entrance.alpha=step%5===3?.6:1;}
  if(entrance.sx>1){const limit=Math.min(520/Math.max(1,540-line.box.x),520/Math.max(1,line.box.x+line.box.w-540));entrance.sx=Math.min(entrance.sx,Math.max(1,limit));}
  ctx.save();
  if(cue.enter==='curtain'&&q<1){const half=(line.box.w/2+50)*outCubic(q);ctx.beginPath();ctx.rect(bx-half,line.box.y-40,half*2,line.box.h+80);ctx.clip();}
  if(cue.enter==='mask'&&q<1){ctx.beginPath();ctx.rect(0,line.box.y-40,W,line.box.h+80);ctx.clip();entrance.dy=(line.box.h+40)*Math.pow(1-q,3);}
  if(cue.enter==='split'&&q<1){const half=(line.box.h/2+46)*outCubic(q);ctx.beginPath();ctx.rect(0,by-half,W,half*2);ctx.clip();}
  const beam=cue.enter==='beam'?clamp(p/.42):1;
  if(beam<1){const bx2=line.box.x-50+(line.box.w+100)*outCubic(beam);ctx.beginPath();ctx.rect(0,line.box.y-60,bx2,line.box.h+120);ctx.clip();}
  at(ctx,bx,by,entrance,()=>{
    if(line.boxSprite){
      const grow=cue.enter?1:outBack(p/.22,1.5);
      at(ctx,bx,by,{sx:.25+.75*grow,sy:cue.enter?1:.7+.3*outBack(p/.18,2.2),alpha:p/.07},()=>ctx.drawImage(line.boxSprite,line.box.x-line.boxPad,line.box.y-line.boxPad));
    }
    const visible=line.words.filter(w=>t>=w.at);
    // Colour fringes of the glitch look, brand colours only, gone once the line has settled.
    if(cue.enter==='glitch'&&p<.42)for(const [side,color] of [[-1,C.blue],[1,C.orange]])for(const w of visible)if(w.stroke){ctx.save();ctx.globalAlpha*=.85*(1-p/.42);ctx.translate(side*14*(1-p/.42),0);drawWord(ctx,w,t,'stroke',color);ctx.restore();}
    if(cue.style.deco?.includes('echo')){
      const spread=outCubic((t-line.at-.12)/.3);
      for(const [k,color] of [[2,C.blue],[1,C.green]])for(const w of visible){
        ctx.save();ctx.globalAlpha*=.95;ctx.translate(k*6*line.scale*spread,k*6*line.scale*spread);drawWord(ctx,w,t,'stroke',color);ctx.restore();
      }
    }
    // Premium titles: outline words get a navy extrusion for depth.
    const depth=cue.kind!=='highlight'?(s.extrude??3):0;
    if(depth)for(let k=depth;k>=1;k--)for(const w of visible)if(w.stroke){ctx.save();ctx.translate(k*1.6*line.scale,k*2.1*line.scale);drawWord(ctx,w,t,'stroke',k===depth?'#06122A':C.navy);ctx.restore();}
    // Problem set: brief blue/orange split now and then, like a picture that stutters.
    if(cue.style.after==='jitter'){const ph=(t*2.6)%1;if(ph<.14)for(const [side,color] of [[-1,C.blue],[1,C.orange]])for(const w of visible)if(w.stroke){ctx.save();ctx.globalAlpha*=.8;ctx.translate(side*9*(1-ph/.14),0);drawWord(ctx,w,t,'stroke',color);ctx.restore();}}
    for(const w of visible)if(w.stroke)drawWord(ctx,w,t,'stroke');
    for(const w of visible)drawWord(ctx,w,t,'fill');
    if(cue.enter==='type'&&visible.length){const last=visible.at(-1),done=t>(line.landed??0)+.9;if(!done&&Math.sin(t*16)>-.3){ctx.fillStyle=line.spec.box?line.spec.fill:C.white;const k=clamp((t-last.at)/Math.max(.08,last.word.length*.035));ctx.fillRect(last.x+last.S+(last.w-2*last.S)*k+8,line.box.y+line.box.h*.2,7,line.box.h*.6);}}
  });
  ctx.restore();
  if(beam<1&&beam>0){const bx2=line.box.x-50+(line.box.w+100)*outCubic(beam),g=ctx.createLinearGradient(bx2-60,0,bx2+30,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.75,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.save();ctx.globalAlpha*=Math.sin(Math.PI*beam);ctx.fillStyle=g;ctx.fillRect(bx2-60,line.box.y-50,90,line.box.h+100);ctx.restore();}
}
function drawWord(ctx,w,t,layer,tint){
  const p=t-w.at,img=layer==='stroke'?w.stroke:w.fill;if(!img)return;
  if(w.enter==='type'){
    // Typewriter: the word is uncovered from left to right.
    const k=clamp(p/Math.max(.08,w.word.length*.035));ctx.save();ctx.beginPath();ctx.rect(w.x,w.y,w.S+(w.w-2*w.S)*k+(k>=1?w.S:4),w.h);ctx.clip();ctx.drawImage(img,w.x,w.y);ctx.restore();return;
  }
  const wave=w.enter==='wave'?-34*Math.sin(Math.min(1,p/.5)*Math.PI*2)*Math.exp(-p*4):0;
  const z=p<.2?.45+.55*outBack(p/.2,1.9):1,cx=w.x+w.w/2,cy=w.y+w.h/2;
  let source=img;
  if(tint){
    w.tints||={};source=w.tints[tint]||=sprite(img.width,img.height,c=>{c.drawImage(img,0,0);c.globalCompositeOperation='source-in';c.fillStyle=tint;c.fillRect(0,0,img.width,img.height);});
  }
  const hit=w.hit!=null?pulse(t,w.hit,.24):0;
  at(ctx,cx,cy,{sx:z*(1+.065*hit),dy:wave-7*hit+26*(1-outCubic(p/.18)),rot:(1-outCubic(p/.2))*-.07,alpha:p/.06+.15},()=>ctx.drawImage(source,w.x,w.y));
}
function shine(ctx,cue,t){
  const main=cue.lines.at(-1),begin=(main.landed??.35)+.04,period=cue.kind==='highlight'?2.2:2.1,p=((t-begin)%period)/.42;
  if(t<begin||p<0||p>1+(cue.kind==='highlight'?0:cue.lines.length*.22))return;
  for(const [li,line] of (cue.kind==='highlight'?[main]:cue.lines).entries()){
    if(!line.boxSprite)continue;
    const lp=cue.kind==='highlight'?p:p-li*.22;if(lp<0||lp>1)continue;
    const b=line.box,x=b.x-80+(b.w+160)*lp;
    ctx.save();shapePath(ctx,line.spec.box,b.x,b.y,b.w,b.h);ctx.clip();
    const g=ctx.createLinearGradient(x-70,0,x+70,50);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(b.x-30,b.y,b.w+60,b.h);ctx.restore();
  }
}
const DECO={
  burst(ctx,cue,t){
    const main=cue.lines.at(-1),p=(t-main.at-.05)/.34;if(p<=0||p>=1)return;
    const b=main.box,cx=b.x+b.w/2,cy=b.y+b.h/2,colors=[C.orange,C.blue,C.green,C.white];
    ctx.save();ctx.lineCap='round';ctx.globalAlpha*=1-inCubic(p);
    for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2+.2,rx=b.w/2+14,ry=b.h/2+12,k=1+.16*outCubic(p),len=(26+(i%3)*10)*(1-p*.6);
      const x=cx+Math.cos(a)*rx*k,y=cy+Math.sin(a)*ry*k;
      ctx.strokeStyle=colors[i%4];ctx.lineWidth=7*(1-p*.5);const x2=x+Math.cos(a)*len;if(Math.min(x,x2)<34||Math.max(x,x2)>1046)continue;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y+Math.sin(a)*len);ctx.stroke();
    }
    ctx.restore();
  },
  ring(ctx,cue,t){
    const b=cue.box,p=(t-.1)/.4;if(p<=0||p>=1)return;
    const g=14+40*outCubic(p);ctx.save();ctx.globalAlpha*=(1-p)*.9;ctx.strokeStyle=C.white;ctx.lineWidth=6*(1-p)+1;
    ctx.beginPath();ctx.roundRect(b.x-g,b.y-g,b.w+2*g,b.h+2*g,b.h/2+g);ctx.stroke();ctx.restore();
  },
  sparkle(ctx,cue,t){
    const b=cue.box,m=cue.lines.at(-1).box;
    [[cue.lines[0].box.x-6,cue.lines[0].box.y+4,24,C.peach,0],[b.x+b.w+6,m.y+10,28,C.white,1.3],[m.x+m.w+2,m.y+m.h-6,18,C.peach,2.4],[b.x-4,m.y+m.h,17,C.white,3.6]].forEach(([x,y,r,color,ph],i)=>{
      const born=outBack((t-.22-i*.07)/.22);if(t<.22+i*.07)return;
      const tw=.72+.28*Math.sin(t*5.2+ph);star(ctx,clamp(x,60,1020),y,r*born*tw,color,t*.7+ph);
    });
  },
  stripe(ctx,cue,t){
    const b=cue.box,from=cue.kind==='highlight'?(cue.lines.at(-1).at+.14):.3;
    if(t>from)stripe(ctx,b.x+b.w/2,b.y+b.h+12,Math.min(520,b.w*.7),11,(t-from)/.4);
  },
  underline(ctx,cue,t){
    const m=cue.lines.at(-1).box,p=outCubic((t-cue.lines.at(-1).at-.15)/.3);if(p<=0)return;
    const w=m.w*.82*p;ctx.save();ctx.strokeStyle=C.green;ctx.lineWidth=14;ctx.lineCap='round';ctx.beginPath();
    ctx.moveTo(m.x+m.w*.09,m.y+m.h+14);ctx.quadraticCurveTo(m.x+m.w*.09+w/2,m.y+m.h+4,m.x+m.w*.09+w,m.y+m.h+12);ctx.stroke();ctx.restore();
  },
  speed(ctx,cue,t){
    const b=cue.box;ctx.save();ctx.lineCap='round';
    for(let i=0;i<7;i++){
      const ph=((t*2.1+i*.37)%1),side=i%2?1:-1,y=b.y+b.h*(i+.5)/7,x=side>0?b.x+b.w+12+ph*70:b.x-12-ph*70,len=46*(1-ph);
      ctx.globalAlpha=.85*(1-ph)*clamp(t/.15);ctx.strokeStyle=i%3?C.sky:C.white;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(clamp(x,30,1050),y);ctx.lineTo(clamp(x+side*len,30,1050),y);ctx.stroke();
    }
    ctx.restore();
  },
  hudline(ctx,cue,t){
    const b=cue.box,p=outCubic((t-.2)/.35),w=Math.min(560,b.w*.9)*p;if(p<=0)return;
    ctx.fillStyle=C.sky;ctx.fillRect(b.x+b.w/2-w/2,b.y+b.h+12,w,8);
    const k=((t*.9)%1);ctx.fillStyle=C.white;ctx.fillRect(b.x+b.w/2-w/2+Math.max(0,w-70)*k,b.y+b.h+12,Math.min(70,w),8);
  },
  check(ctx,cue,t){
    const m=cue.lines.at(-1).box,d=86,born=outBack((t-cue.lines.at(-1).at-.12)/.24,2.4);if(t<cue.lines.at(-1).at+.12)return;
    const x=Math.max(64,m.x-4),y=m.y+2,q=clamp((t-cue.lines.at(-1).at-.26)/.2);
    at(ctx,x,y,{sx:Math.max(0,born)},()=>{
      ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=10;ctx.shadowOffsetY=5;ctx.fillStyle=C.white;ctx.beginPath();ctx.arc(x,y,d/2,0,7);ctx.fill();ctx.shadowColor='transparent';
      ctx.strokeStyle=C.green;ctx.lineWidth=12;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(x-20,y+1);
      const a=clamp(q/.4),b=clamp((q-.4)/.6);ctx.lineTo(x-20+14*a,y+1+15*a);if(b>0)ctx.lineTo(x-6+27*b,y+16-32*b);ctx.stroke();
    });
  },
  bracket(ctx,cue,t){corners(ctx,cue.box,t,C.orange,24);},
  focus(ctx,cue,t){
    corners(ctx,cue.box,t,C.white,20);
    const b=cue.box,p=(t%1.5)/1.5,y=b.y-14+(b.h+28)*p;ctx.save();ctx.globalAlpha*=.75*Math.sin(Math.PI*p);ctx.fillStyle=C.greenD;ctx.fillRect(b.x-12,y,b.w+24,4);ctx.restore();
  },
  fiber(ctx,cue,t){
    const b=cue.box,y=b.y+b.h+18,p=outCubic((t-.1)/.45);if(p<=0)return;
    const x0=b.x+b.w*.02,w=b.w*.96,curve=k=>[x0+w*k,y+9*Math.sin(k*Math.PI*2)];
    ctx.save();ctx.lineCap='round';ctx.lineWidth=7;ctx.strokeStyle=C.blue;ctx.beginPath();
    for(let k=0;k<=p;k+=.02){const [x,yy]=curve(k);ctx[k?'lineTo':'moveTo'](x,yy);}ctx.stroke();
    ctx.shadowColor=C.sky;ctx.shadowBlur=18;
    for(let i=0;i<3;i++){
      const head=((t*.8+i/3)%1);if(head>p)continue;
      for(let j=0;j<8;j++){const k=head-j*.018;if(k<0)continue;const [x,yy]=curve(k);ctx.globalAlpha=(1-j/8);ctx.fillStyle=i%2?C.orangeL:C.white;ctx.beginPath();ctx.arc(x,yy,7-j*.6,0,7);ctx.fill();}
    }
    ctx.restore();
  },
  bars(ctx,cue,t){
    const m=cue.lines.at(-1).box,x=m.x+m.w+14,base=m.y+m.h-18,from=cue.lines.at(-1).at+.12;
    for(let i=0;i<4;i++){
      const p=outBack((t-from-i*.09)/.2,2);if(t<from+i*.09)continue;
      const full=(m.h-36)*(.34+.22*i),h=full*p*(.9+.1*Math.sin(t*7+i)),bx=x+i*21;
      ctx.fillStyle=[C.green,C.green,C.orange,C.orange][i];ctx.strokeStyle=C.white;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(bx,base-h,15,h,5);ctx.fill();ctx.stroke();
    }
  },
  wifi(ctx,cue,t){
    const m=(cue.kind==='highlight'?cue.lines.at(-1):cue.lines[0]).box,cy=m.y+m.h/2;
    ctx.save();ctx.lineCap='round';
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const ph=((t*1.1+i/3)%1),r=26+i*24,x=side<0?m.x+6:m.x+m.w-6;
      ctx.globalAlpha=clamp((t-.1-i*.08)/.15)*(.45+.55*Math.pow(Math.max(0,Math.sin(Math.PI*(1-Math.abs(ph*3-i-.5)))),2));
      ctx.strokeStyle=[C.orange,C.white,C.green][i];ctx.lineWidth=9;ctx.shadowColor='rgba(4,12,28,.5)';ctx.shadowBlur=6;
      ctx.beginPath();ctx.arc(x,cy,r,side>0?-.85:Math.PI-.85,side>0?.85:Math.PI+.85);ctx.stroke();
    }
    ctx.restore();
  },
  led(ctx,cue,t){
    const m=cue.lines.at(-1).box,n=5,y=m.y+m.h-19;
    for(let i=0;i<n;i++){
      const on=Math.sin(t*9+i*2.1)>-.2,x=m.x+m.w/2+(i-(n-1)/2)*26;
      if(t<cue.lines.at(-1).at+.1+i*.05)continue;
      ctx.save();ctx.fillStyle=on?[C.green,C.green,C.orange,C.blueL,C.green][i]:'rgba(11,31,63,.35)';if(on){ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;}
      ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.fill();ctx.restore();
    }
  },
  stream(ctx,cue,t){
    const b=cue.box;ctx.save();
    for(let i=0;i<26;i++){
      const row=i%7,speed=.35+(i*37%10)/22,k=((t*speed+(i*.618)%1)%1),x=b.x-40+(b.w+80)*k,y=b.y-8+(b.h+16)*(row+.5)/7,len=12+(i*13%5)*7;
      ctx.globalAlpha=Math.sin(Math.PI*k)*.85*clamp(t/.2);ctx.fillStyle=[C.sky,C.white,C.orangeL,C.mint][i%4];
      if(x>30&&x+len<1050){ctx.beginPath();ctx.roundRect(x,y,len,6,3);ctx.fill();}
    }
    ctx.restore();
  },
  gauge(ctx,cue,t){
    const l=cue.lines[0].box,cx=l.x+l.w/2,cy=l.y+l.h/2+26,r=Math.max(96,Math.min(170,l.w/2+30)),p=outBack((t-.05)/.55,1.1);
    ctx.save();ctx.lineCap='round';ctx.lineWidth=17;ctx.globalAlpha=clamp(t/.12);
    ctx.strokeStyle='rgba(11,31,63,.75)';ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,Math.PI*2);ctx.stroke();
    [[0,.34,C.blue],[.34,.67,C.green],[.67,1,C.orange]].forEach(([a,b,color])=>{const e=Math.min(b,Math.max(a,p));if(e<=a)return;ctx.strokeStyle=color;ctx.beginPath();ctx.arc(cx,cy,r,Math.PI*(1+a)+.02,Math.PI*(1+e)-.02);ctx.stroke();});
    const ang=Math.PI*(1+clamp(p,0,1.02))+.03*Math.sin(t*16)-.05;ctx.strokeStyle=C.white;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(cx+Math.cos(ang)*r*.55,cy+Math.sin(ang)*r*.55);ctx.lineTo(cx+Math.cos(ang)*(r-4),cy+Math.sin(ang)*(r-4));ctx.stroke();
    ctx.restore();
  },
  nodes(ctx,cue,t){
    const b=cue.box,pts=[];for(let i=0;i<10;i++){const a=i/10*Math.PI*2+.3;pts.push([clamp(b.x+b.w/2+Math.cos(a)*(b.w/2+34+6*Math.sin(t*2+i)),44,1036),b.y+b.h/2+Math.sin(a)*(b.h/2+30+5*Math.cos(t*2.3+i))]);}
    const p=clamp((t-.1)/.5);ctx.save();ctx.lineWidth=4;
    pts.forEach((v,i)=>{const n=pts[(i+1)%10],q=clamp(p*10-i);if(q<=0)return;ctx.strokeStyle=[C.sky,C.white,C.orangeL][i%3];ctx.globalAlpha=.8;ctx.beginPath();ctx.moveTo(v[0],v[1]);ctx.lineTo(v[0]+(n[0]-v[0])*q,v[1]+(n[1]-v[1])*q);ctx.stroke();});
    pts.forEach((v,i)=>{if(p*10<i)return;const z=1+.25*Math.sin(t*6+i);ctx.globalAlpha=1;ctx.fillStyle=[C.orange,C.white,C.green,C.blueL][i%4];ctx.beginPath();ctx.arc(v[0],v[1],8*z,0,7);ctx.fill();});
    ctx.restore();
  },
  shine(ctx,cue,t){shine(ctx,cue,t);},
  echo(){},
  // ---- B-roll set ----
  // game: a reticle locks onto the phrase from the left, then pulses
  crosshair(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.06;if(t<from)return;
    const p=outCubic((t-from)/.3),cx=Math.max(60,m.x-52),cy=m.y+m.h/2,r=36+44*(1-p),spin=t*1.6;
    ctx.save();ctx.globalAlpha*=clamp(p*2);ctx.lineCap='round';ctx.shadowColor='rgba(4,12,28,.55)';ctx.shadowBlur=8;
    ctx.strokeStyle=C.white;ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.stroke();
    ctx.strokeStyle=C.sky;ctx.lineWidth=4;ctx.setLineDash([10,9]);ctx.lineDashOffset=-spin*20;ctx.beginPath();ctx.arc(cx,cy,r+12,0,7);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle=C.white;ctx.lineWidth=5;for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(r-12),cy+Math.sin(a)*(r-12));ctx.lineTo(cx+Math.cos(a)*(r+8),cy+Math.sin(a)*(r+8));ctx.stroke();}
    const z=1+.3*Math.max(0,Math.sin(t*6));ctx.fillStyle=C.orange;ctx.beginPath();ctx.arc(cx,cy,6*z,0,7);ctx.fill();ctx.restore();
  },
  // game: a segmented health bar fills under the phrase, the last chunk blinks orange
  hpbar(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.12,p=outCubic((t-from)/.45);if(p<=0)return;
    const w=Math.min(560,m.w*.92),x=CX-w/2,y=m.y+m.h+16,h=16,n=10,fill=w*p;
    ctx.save();ctx.fillStyle='rgba(11,31,63,.85)';ctx.strokeStyle=C.white;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x-4,y-4,w+8,h+8,6);ctx.fill();ctx.stroke();
    const g=ctx.createLinearGradient(x,0,x+w,0);g.addColorStop(0,C.green);g.addColorStop(1,C.greenL);ctx.fillStyle=g;ctx.fillRect(x,y,fill*.86,h);
    if(fill>w*.86){ctx.fillStyle=Math.sin(t*10)>0?C.orange:C.orangeL;ctx.fillRect(x+w*.86,y,fill-w*.86,h);}
    ctx.fillStyle='rgba(11,31,63,.9)';for(let i=1;i<n;i++)ctx.fillRect(x+w*i/n-1.5,y,3,h);ctx.restore();
  },
  // game victory: chevrons rush out from both sides of the banner
  chevrons(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.05;if(t<from)return;
    const cy=m.y+m.h/2,s=m.h*.36;ctx.save();ctx.lineCap=ctx.lineJoin='round';ctx.shadowColor='rgba(4,12,28,.5)';ctx.shadowBlur=6;
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const k=outBack(clamp((t-from-i*.06)/.28),1.6),drift=6*Math.sin(t*5-i),x=side<0?m.x-22-i*30-drift:m.x+m.w+22+i*30+drift;
      if(k<=0||x<30||x>1050)continue;ctx.globalAlpha=k*(1-i*.22);ctx.strokeStyle=[C.white,C.orangeL,C.blueL][i];ctx.lineWidth=9;
      ctx.beginPath();ctx.moveTo(x,cy-s*k);ctx.lineTo(x+side*s*.62*k,cy);ctx.lineTo(x,cy+s*k);ctx.stroke();
    }
    ctx.restore();
  },
  // football: halfway line and centre circle drawn under the scoreboard
  pitch(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,p=outCubic((t-main.at-.1)/.4);if(p<=0)return;
    const y=m.y+m.h+26,w=Math.min(620,m.w*1.05)*p;ctx.save();ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=5;ctx.shadowColor='rgba(4,12,28,.5)';ctx.shadowBlur=5;
    ctx.beginPath();ctx.moveTo(CX-w/2,y);ctx.lineTo(CX+w/2,y);ctx.stroke();
    ctx.strokeStyle=C.greenL;ctx.beginPath();ctx.arc(CX,y,26,Math.PI,Math.PI+Math.PI*2*p);ctx.stroke();ctx.fillStyle=C.white;ctx.beginPath();ctx.arc(CX,y,5,0,7);ctx.fill();ctx.restore();
  },
  // football: a ball rolls in and rests beside the scoreboard
  ball(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.08;if(t<from)return;
    const p=outBack(clamp((t-from)/.5),1.3),r=26,x1=Math.min(W-40,m.x+m.w+44),x=x1+260*(1-p),y=m.y+m.h/2+4*Math.sin(t*4),rot=-(260*(1-p))/r+t*.6;
    ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.shadowColor='rgba(4,12,28,.55)';ctx.shadowBlur=10;ctx.shadowOffsetY=5;
    ctx.fillStyle=C.white;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.shadowColor='transparent';ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.clip();
    const pent=(cx,cy,s)=>{ctx.beginPath();for(let i=0;i<5;i++){const a=-Math.PI/2+i*Math.PI*2/5;ctx[i?'lineTo':'moveTo'](cx+Math.cos(a)*s,cy+Math.sin(a)*s);}ctx.closePath();ctx.fill();};
    ctx.fillStyle=C.navy;pent(0,0,9);for(let i=0;i<5;i++){const a=-Math.PI/2+i*Math.PI*2/5;pent(Math.cos(a)*22,Math.sin(a)*22,8);}
    ctx.restore();ctx.strokeStyle=C.navy;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.stroke();ctx.restore();
  },
  // camera: a recording dot blinks at the corner of the viewfinder
  rec(ctx,cue,t){
    const b=cue.box,from=.15;if(t<from)return;const k=outBack((t-from)/.2,2),on=Math.floor(t*2.2)%2===0;
    const x=Math.max(40,b.x-30),y=b.y-30;ctx.save();ctx.translate(x,y);ctx.scale(k,k);
    ctx.fillStyle='rgba(11,31,63,.8)';ctx.beginPath();ctx.arc(0,0,20,0,7);ctx.fill();
    ctx.fillStyle=on?C.orange:'rgba(243,112,33,.35)';if(on){ctx.shadowColor=C.orangeL;ctx.shadowBlur=14;}ctx.beginPath();ctx.arc(0,0,11,0,7);ctx.fill();ctx.restore();
  },
  // FPT Play: film strips slide above and below the title
  filmstrip(ctx,cue,t){
    const b=cue.box,p=outCubic((t-.05)/.35);if(p<=0)return;
    const w=Math.min(W-60,b.w+140)*p,x=CX-w/2,hgt=40;
    for(const [y,dir] of [[b.y-hgt-12,1],[b.y+b.h+12,-1]]){
      ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,hgt,6);ctx.clip();ctx.fillStyle=C.navy;ctx.fillRect(x,y,w,hgt);
      const off=((t*70*dir)%60+60)%60;
      for(let k=-1;k*60<w+60;k++){const fx=x+k*60+off;const fg=ctx.createLinearGradient(0,y,0,y+hgt);fg.addColorStop(0,[C.blueL,C.orangeL,C.greenL][(k+3)%3]);fg.addColorStop(1,[C.blue,C.orange,C.green][(k+3)%3]);ctx.fillStyle=fg;ctx.fillRect(fx+5,y+10,50,hgt-20);
        ctx.fillStyle=C.white;for(const hx of [fx+8,fx+24,fx+40])for(const hy of [y+3,y+hgt-7])ctx.fillRect(hx,hy,8,4);}
      ctx.restore();
    }
  },
  // FPT Play: a play button pops beside the title and breathes
  playbtn(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.08;if(t<from)return;
    const k=outBack((t-from)/.26,2.2),x=Math.min(W-52,m.x+m.w+56),y=m.y+m.h/2,r=36*k*(1+.05*Math.sin(t*5));
    ctx.save();const ring=((t-from)%1.2)/1.2;ctx.globalAlpha=(1-ring)*.8;ctx.strokeStyle=C.orangeL;ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,r+8+22*ring,0,7);ctx.stroke();ctx.globalAlpha=1;
    ctx.shadowColor='rgba(4,12,28,.5)';ctx.shadowBlur=12;ctx.shadowOffsetY=5;ctx.fillStyle=C.white;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.shadowColor='transparent';
    ctx.fillStyle=C.orange;ctx.beginPath();ctx.moveTo(x-r*.28,y-r*.42);ctx.lineTo(x+r*.48,y);ctx.lineTo(x-r*.28,y+r*.42);ctx.closePath();ctx.fill();ctx.restore();
  },
  // a brick column drops beside the phrase; the words bump into it
  wall(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.08,p=(t-from)/.24;if(p<=0)return;
    const w=58,h=m.h+56,x=Math.min(W-30-w,m.x+m.w+16),y0=m.y-28,drop=-150*(1-outBack(p,1.2));
    ctx.save();ctx.translate(0,drop);ctx.globalAlpha*=clamp(p*3);
    ctx.shadowColor='rgba(4,12,28,.55)';ctx.shadowBlur=14;ctx.shadowOffsetY=8;ctx.fillStyle='#4A3A33';ctx.beginPath();ctx.roundRect(x,y0,w,h,6);ctx.fill();ctx.shadowColor='transparent';
    const bh=17,bw=28;ctx.beginPath();ctx.roundRect(x,y0,w,h,6);ctx.clip();
    for(let r=0;r*bh<h;r++)for(let k=-1;k*bw<w;k++){ctx.fillStyle=(r+k)%3?'#C97B4F':'#B26A43';ctx.fillRect(x+k*bw+(r%2?bw/2:0)+2,y0+r*bh+2,bw-4,bh-4);}
    ctx.restore();
    const hit=(t-main.landed)/.35;if(hit>0&&hit<1){ctx.save();ctx.globalAlpha*=1-hit;ctx.strokeStyle=C.orangeL;ctx.lineWidth=5;ctx.lineCap='round';
      for(let i=0;i<5;i++){const a=Math.PI*(.7+i*.15),r0=10+30*hit;ctx.beginPath();ctx.moveTo(x-6+Math.cos(a)*r0,m.y+m.h/2+Math.sin(a)*r0);ctx.lineTo(x-6+Math.cos(a)*(r0+22),m.y+m.h/2+Math.sin(a)*(r0+22));ctx.stroke();}ctx.restore();}
  },
  // one bar of four, blinking
  weakbars(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.1;if(t<from)return;
    const x=Math.min(W-30-80,m.x+m.w+14),base=m.y+m.h-14,k=outBack((t-from)/.25);
    for(let i=0;i<4;i++){const h=(m.h-30)*(.3+.23*i)*k,lit=i===0;ctx.save();ctx.fillStyle=lit?(Math.sin(t*9)>-.3?C.orange:C.orangeL):'rgba(90,110,146,.45)';ctx.strokeStyle=C.white;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x+i*20,base-h,14,h,4);ctx.fill();if(!lit)ctx.setLineDash([4,4]);ctx.stroke();ctx.restore();}
  },
  // a buffering ring at the left of the phrase
  buffer(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.1;if(t<from)return;
    const cx=Math.max(54,m.x-44),cy=m.y+m.h/2,k=outBack((t-from)/.25),step=Math.floor(t*12);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2+step/8*Math.PI*2;ctx.save();ctx.globalAlpha*=(.2+.8*i/8)*k;ctx.fillStyle=C.white;ctx.translate(cx+Math.cos(a)*26*k,cy+Math.sin(a)*26*k);ctx.rotate(a);ctx.beginPath();ctx.roundRect(-8,-4,16,8,4);ctx.fill();ctx.restore();}
  },
  // an orange line struck through the phrase
  strike(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,p=outCubic((t-main.landed+.05)/.28);if(p<=0)return;
    const y=m.y+m.h*.52,x0=m.x-10,x1=x0+(m.w+20)*p;ctx.save();ctx.strokeStyle=C.orange;ctx.lineWidth=12;ctx.lineCap='round';ctx.shadowColor='rgba(4,12,28,.5)';ctx.shadowBlur=8;
    ctx.beginPath();ctx.moveTo(x0,y+6);ctx.lineTo(x1,y-6*p);ctx.stroke();ctx.restore();
  },
  xmark(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,k=outBack((t-main.landed-.12)/.24,2.4);if(t<main.landed+.12)return;
    const x=Math.min(W-50,m.x+m.w+18),y=m.y+6,r=30;ctx.save();ctx.translate(x,y);ctx.scale(k,k);ctx.fillStyle=C.orange;ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.shadowColor='transparent';
    ctx.strokeStyle=C.white;ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-11,-11);ctx.lineTo(11,11);ctx.moveTo(11,-11);ctx.lineTo(-11,11);ctx.stroke();ctx.restore();
  },
  // hazard tape above and below, sliding
  tape(ctx,cue,t){
    const b=cue.box,p=outCubic((t-.05)/.3);if(p<=0)return;
    for(const [y,dir] of [[b.y-24,1],[b.y+b.h+8,-1]]){const w=Math.min(W-60,b.w+120)*p,x=CX-w/2;ctx.save();ctx.beginPath();ctx.rect(x,y,w,16);ctx.clip();ctx.fillStyle=C.navy;ctx.fillRect(x,y,w,16);
      ctx.fillStyle=C.orange;const off=(t*60*dir)%32;for(let k=-2;k*32<w+64;k++){const sx=x+k*32+off;ctx.beginPath();ctx.moveTo(sx,y+16);ctx.lineTo(sx+16,y);ctx.lineTo(sx+30,y);ctx.lineTo(sx+14,y+16);ctx.closePath();ctx.fill();}ctx.restore();}
  },
  warn(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,k=outBack((t-main.at-.1)/.25,2);if(t<main.at+.1)return;
    const x=Math.min(W-52,m.x+m.w+50),y=m.y+m.h/2,s=34*k*(1+.06*Math.sin(t*8));ctx.save();ctx.translate(x,y);ctx.fillStyle=C.orange;ctx.strokeStyle=C.white;ctx.lineWidth=5;ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*1.05,s*.8);ctx.lineTo(-s*1.05,s*.8);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=C.white;ctx.fillRect(-3.5*k,-s*.45,7*k,s*.7);ctx.beginPath();ctx.arc(0,s*.48,4.5*k,0,7);ctx.fill();ctx.restore();
  },
  // cracks run across the box once it has landed
  crack(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,p=outCubic((t-main.landed)/.3);if(p<=0)return;
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=3.5;ctx.lineCap=ctx.lineJoin='round';ctx.shadowColor='rgba(4,12,28,.6)';ctx.shadowBlur=4;
    const paths=[[[.18,0],[.24,.3],[.2,.55],[.27,.8],[.24,1]],[[.62,0],[.58,.25],[.66,.5],[.6,.72],[.68,1]],[[.24,.3],[.36,.38]],[[.66,.5],[.8,.44]]];
    for(const pts of paths){ctx.beginPath();const n=Math.max(2,Math.ceil(pts.length*p));pts.slice(0,n).forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](m.x+m.w*u,m.y+m.h*v));ctx.stroke();}
    ctx.restore();
  },
  // a Wi-Fi mark loses its arcs one by one, then is slashed
  wifioff(ctx,cue,t){
    const main=cue.lines.at(-1),m=main.box,from=main.at+.1;if(t<from)return;
    const cx=Math.min(W-62,m.x+m.w+56),cy=m.y+m.h/2+18,cyc=(t-from)%1.8,lit=cyc<.3?3:cyc<.6?2:cyc<.9?1:0;
    ctx.save();ctx.lineCap='round';ctx.lineWidth=8;
    for(let i=0;i<3;i++){ctx.strokeStyle=i<lit?C.white:'rgba(90,110,146,.55)';ctx.beginPath();ctx.arc(cx,cy,14+i*14,-Math.PI*.78,-Math.PI*.22);ctx.stroke();}
    ctx.fillStyle=C.white;ctx.beginPath();ctx.arc(cx,cy,5,0,7);ctx.fill();
    const s=outCubic((t-from-.25)/.25);if(s>0){ctx.strokeStyle=C.orange;ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(cx-34,cy-52);ctx.lineTo(cx-34+68*s,cy-52+64*s);ctx.stroke();}
    ctx.restore();
  },
  // a line chart that falls under the phrase
  decline(ctx,cue,t){
    const b=cue.box,p=outCubic((t-cue.lines.at(-1).landed)/.5);if(p<=0)return;
    const x0=b.x+b.w*.06,x1=b.x+b.w*.94,y0=b.y+b.h+8,pts=[[0,0],[.22,10],[.38,-4],[.6,22],[.78,16],[1,44]];
    ctx.save();ctx.strokeStyle=C.orange;ctx.lineWidth=8;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();
    let last=null;for(const [u,v] of pts){if(u>p)break;const x=x0+(x1-x0)*u,y=y0+v;ctx[last?'lineTo':'moveTo'](x,y);last=[x,y];}
    if(last){ctx.stroke();ctx.fillStyle=C.orange;ctx.save();ctx.translate(last[0],last[1]);ctx.rotate(.9);ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-8,-11);ctx.lineTo(-8,11);ctx.closePath();ctx.fill();ctx.restore();}
    ctx.restore();
  }
};
// ---- premium title layers: a flare on entry, a soft halo for contrast, sparks as each line lands ----------------
function premiumBack(ctx,cue,t){
  // Only a short flare on entry. It stays inside the drawing area: a gradient cut by the area's edge reads as a box.
  const p=t/.5;if(p>=1)return;
  const b=cue.box,cx=b.x+b.w/2,cy=b.y+b.h/2,room=Math.min(cy-TOP,TOP+H-cy,cx,W-cx)-4,r=Math.min(room,Math.max(b.w,b.h)*.6*(.6+.6*p));
  if(r<=10)return;
  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(255,240,225,'+(.6*(1-p))+')');g.addColorStop(.5,'rgba(243,112,33,'+(.28*(1-p))+')');g.addColorStop(1,'rgba(243,112,33,0)');
  ctx.save();ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.restore();
}
const SPARK=[C.orange,C.white,C.blueL,C.greenL,C.peach];
function premiumFront(ctx,cue,t){
  ctx.save();
  cue.lines.forEach((line,li)=>{
    const at=(line.landed??line.at+.2)-.12,p=(t-at)/.62;if(p<=0||p>=1)return;
    const b=line.box,cx=b.x+b.w/2,cy=b.y+b.h/2;
    for(let i=0;i<14;i++){
      const a=i/14*Math.PI*2+li*.7,sp=(.7+((i*37+li*11)%10)/14),d=outCubic(p)*sp,x=clamp(cx+Math.cos(a)*(b.w/2+18+70*d),24,W-24),y=cy+Math.sin(a)*(b.h/2+14+48*d);
      ctx.globalAlpha=(1-p)*.95;ctx.fillStyle=SPARK[(i+li)%SPARK.length];
      if(i%3)ctx.fillRect(x-3,y-3,6*(1-p*.5),6*(1-p*.5));else{ctx.beginPath();ctx.arc(x,y,4.5*(1-p*.4),0,Math.PI*2);ctx.fill();}
    }
  });
  // a slow twinkle at two corners of the block once everything has landed
  const done=Math.max(...cue.lines.map(l=>l.landed??0))+.1;
  if(t>done&&!(cue.style.deco||[]).includes('sparkle')){const b=cue.box;[[b.x+b.w+4,b.y+6,22,0],[b.x-6,b.y+b.h-4,16,2.1]].forEach(([x,y,r,ph])=>star(ctx,clamp(x,40,W-40),y,r*outBack((t-done)/.3)*(.7+.3*Math.sin(t*4+ph)),C.white,t*.6+ph));}
  ctx.restore();
}
function corners(ctx,b,t,color,m){
  const p=outCubic(t/.3),g=m+46*(1-p),arm=34,x0=Math.max(26,b.x-g),x1=Math.min(1054,b.x+b.w+g),y0=b.y-g,y1=b.y+b.h+g;
  ctx.save();ctx.globalAlpha*=p;ctx.strokeStyle=color;ctx.lineWidth=7;ctx.lineCap='round';ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=6;ctx.beginPath();
  for(const [x,dx] of [[x0,1],[x1,-1]])for(const [y,dy] of [[y0,1],[y1,-1]]){ctx.moveTo(x+dx*arm,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*arm);}
  ctx.stroke();ctx.restore();
}
// The scan line of 'focus' stays behind: across white letters it looked like a stray diacritic.
const BEHIND=new Set(['focus','burst','ring','speed','stripe','underline','hudline','fiber','wifi','stream','gauge','nodes','tape','decline','pitch','filmstrip']);
// A Hook that opens the video is already on screen in the very first frame.
const lead=cue=>cue.kind==='hook'&&cue.start<.01?.08:0;
function cueTransform(cue,t){
  const left=cue.dur+lead(cue)-t,exit=Math.min(.16,cue.dur*.22),e=left<exit?1-left/exit:0;
  const m={sx:1-.1*inCubic(e),rot:0,dx:0,dy:-18*inCubic(e),alpha:1-inCubic(e)};
  if(cue.kind==='highlight'){
    const tilt=(cue.seed%2?1:-1)*.022;m.rot=tilt*Math.cos(Math.min(t,1.2)*1.6);
    if(cue.motion==='slide_left')m.dx=-520*(1-outCubic(t/.24));
    else if(cue.motion==='slide_right')m.dx=520*(1-outCubic(t/.24));
    else if(cue.motion==='slam_drop'){
      m.sx*=1+.75*Math.pow(1-clamp(t/.15),2);m.alpha*=clamp(t/.05);
      if(t>.15&&t<.36){const d=Math.pow(1-(t-.15)/.21,2);m.dx+=Math.sin(t*95)*9*d;m.dy+=Math.cos(t*80)*7*d;}
    }else m.sx*=.55+.45*outBack(t/.24,1.8);
    m.dy+=2.4*Math.sin(t*3.4);
    const after=cue.style.after,main=cue.lines.at(-1),hitAt=(main.landed??.3)+.02;
    if(after==='bump'&&t>hitAt){const k=t-hitAt;m.dx+=-26*Math.sin(k*26)*Math.exp(-k*7);}
    else if(after==='flicker'&&t>hitAt&&Math.floor(t*15)%13===5)m.alpha*=.45;
    else if(after==='jitter'&&t>hitAt&&(t*2.6)%1<.14)m.dx+=((Math.floor(t*30)*37)%13-6)*1.4;
    else if(after==='sink'&&t>hitAt){const k=outCubic((t-hitAt)/1.1);m.dy+=16*k;m.rot+=(cue.seed%2?1:-1)*.025*k;}
  }else{
    m.dy+=3*Math.sin(t*3.1);
    if(cue.tilt)m.rot+=cue.tilt;
    if(cue.kind==='outro')m.sx*=1+.028*Math.pow(Math.max(0,Math.sin(t*Math.PI*1.7)),3);
  }
  // Scaling up must never push glyphs outside the frame.
  const limit=Math.min((540-18)/Math.max(1,540-cue.box.x),(540-18)/Math.max(1,cue.box.x+cue.box.w-540));
  m.sx=Math.max(.05,Math.min(m.sx,Math.max(1,limit)));
  return m;
}
function drawCue(ctx,cue,time,hidden){
  // The hook is already on screen in the very first frame, so a paused or cover frame is never empty.
  const t=time-cue.start+lead(cue);if(time<cue.start||time>=cue.end)return false;
  if(hidden)return false;
  const b=cue.box,m=cueTransform(cue,t),cx=b.x+b.w/2,cy=b.y+b.h/2;
  const ghosts=cue.kind==='highlight'&&/slide/.test(cue.motion)&&t<.2?[.34,.18]:[];
  ghosts.forEach((a,i)=>at(ctx,cx,cy,{...m,dx:m.dx*(1.25+.3*i),alpha:m.alpha*a},()=>cue.lines.forEach(l=>drawLine(ctx,l,t,cue))));
  at(ctx,cx,cy,m,()=>{
    const deco=cue.style.deco||[];
    if(cue.style.premium)premiumBack(ctx,cue,t);
    for(const d of deco)if(BEHIND.has(d))DECO[d](ctx,cue,t);
    cue.lines.forEach(l=>drawLine(ctx,l,t,cue));
    if(cue.style.shine)shine(ctx,cue,t);
    for(const d of deco)if(!BEHIND.has(d))DECO[d](ctx,cue,t);
    if(cue.style.premium)premiumFront(ctx,cue,t);
  });
  return true;
}
function buildCues({hook,hookStart=0,hookDur,highlights=[],outro,outroStart,outroEnd=null,titles=[],totalDur}){
  const cues=[];
  const h=hook&&buildTitle('hook',hook,hookStart,hookDur);if(h)cues.push(h);
  const o=outro&&buildTitle('outro',outro,outroStart,outroEnd??totalDur);if(o)cues.push(o);
  for(const title of titles){const c=buildTitle('title',title,title.start,title.end);if(c)cues.push({...c,uid:title.uid});}
  highlights.forEach((item,index)=>cues.push(buildHighlight({...item,index})));
  return cues;
}
// When each title line is really on screen, for sounds that land with the picture.
function titleTimeline(cue){
  if(!cue)return null;
  const offset=-lead(cue),when=t=>Math.max(cue.start,Math.round((cue.start+t+offset)*1000)/1000);
  return {sfx:cue.sfx,lines:cue.lines.map(l=>when(l.at+.06)),landed:when(Math.max(...cue.lines.map(l=>l.landed))),spoken:cue.lines.map(l=>l.spokenAt==null?null:when(l.spokenAt-offset))};
}
// spans: the time ranges of the Highlights, when the caller keeps only some cues in memory.
function frameDrawer(cues,given=null){
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  // Highlights that follow each other closely hide a title once, not cue by cue: it must not blink in the 0.08 s between them,
  // nor come back for less than half a second.
  const spans=[];
  for(const c of (given||cues.filter(c=>c.mask)).slice().sort((a,b)=>a.start-b.start)){const last=spans.at(-1);if(last&&c.start-last.end<.5)last.end=Math.max(last.end,c.end);else spans.push({start:c.start,end:c.end});}
  const hidden=(cue,time)=>cue.kind!=='highlight'&&spans.some(s=>time>=s.start&&(time<s.end||(s.start<cue.end&&cue.end-s.end<.5)));
  return time=>{
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);
    let drawn=false;
    ctx.translate(0,-TOP);
    // A highlight that the user pinned inside Hook/Outro replaces the title while it is on screen.
    for(const cue of cues)drawn=drawCue(ctx,cue,time,hidden(cue,time))||drawn;
    return drawn?canvas:null;
  };
}
module.exports={configure,FONTS,buildHighlight,buildTitle,buildCues,frameDrawer,titleTimeline,STYLES,HOOKS,TOP,WIDTH:W,HEIGHT:H,MAX_W,FPS};
