'use strict';
// Motion-graphic B-roll drawn in code: Wi-Fi 6 modem, 4G/5G signal, walls that block Wi-Fi, Mesh coverage, FPT Play,
// speed and lag. Vector drawing in FPT colours only. No prices, speeds, percentages or other claims are drawn; the only
// words are product names (Wi-Fi 6, 4G, 5G, FPT Play). Each clip is 10 s; after a short entrance everything moves in
// cycles, so a clip that is looped for a long spoken section has no visible seam beyond the entrance.
// Usage: node scripts/assets/generate_motion_graphics.js [name ...]   (no names: all clips)
const fs=require('fs'),path=require('path'),{spawn,execFileSync}=require('child_process');
const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const P=require('../../config/paths');
// W×H is the drawing space. The portrait versions (for full-screen B-roll, user 24/11/2026) draw the same scenes in a
// 810×1440 space, scaled 4/3 to a 1080×1920 frame: positions follow the frame, element sizes stay as designed.
let W=1280,H=720,OUT=1;const PORTRAIT={w:810,h:1440,scale:4/3};
const FPS=30,DUR=10,LIB=path.join(P.assets,'broll-library'),TAU=Math.PI*2;
GlobalFonts.registerFromPath(path.join(P.fonts,'Montserrat-Bold.ttf'),'MgHead');
GlobalFonts.registerFromPath(path.join(P.fonts,'BeVietnamPro-Black.ttf'),'MgBody');
GlobalFonts.registerFromPath(path.join(P.fonts,'Barlow-Black.ttf'),'MgWide');
const C={o:'#F37021',oL:'#FF9550',oD:'#C9520F',peach:'#FFE3CF',cream:'#FFF6EE',b:'#0066B3',bL:'#2F95E0',sky:'#8FD0FF',
  g:'#00A651',gL:'#2BD27F',mint:'#B6F2D2',n:'#0B1F3F',nL:'#1A3766',nM:'#12294F',w:'#FFFFFF',grey:'#8A98AE',greyL:'#C9D3E1',greyD:'#4B5A72'};
// ---- maths -------------------------------------------------------------------------------------------------
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const outCubic=p=>1-Math.pow(1-clamp(p),3),inOut=p=>{p=clamp(p);return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;};
const outBack=(p,s=1.7)=>{p=clamp(p)-1;return 1+(s+1)*p*p*p+s*p*p;};
const spring=p=>p<=0?0:p>=1.6?1:1-Math.exp(-5.5*p)*Math.cos(9*p);
const born=(t,at,d=.45)=>clamp((t-at)/d);
const wave=(t,period,ph=0)=>.5+.5*Math.sin(TAU*(t/period+ph));
const lerp=(a,b,k)=>a+(b-a)*k;
// ---- drawing helpers ---------------------------------------------------------------------------------------
function rr(x,X,Y,w,h,r){x.beginPath();x.roundRect(X,Y,w,h,r);}
function glow(x,color,blur){x.shadowColor=color;x.shadowBlur=blur;x.shadowOffsetX=0;x.shadowOffsetY=0;}
function noGlow(x){x.shadowColor='transparent';x.shadowBlur=0;}
function soft(x,cx,cy,r,color,alpha=1){
  const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');
  x.save();x.globalAlpha*=alpha;x.fillStyle=g;x.fillRect(cx-r,cy-r,2*r,2*r);x.restore();
}
function vignette(x,strength=.55){
  const g=x.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*.95);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(3,10,24,'+strength+')');
  x.fillStyle=g;x.fillRect(0,0,W,H);
}
function shadowEllipse(x,cx,cy,rx,ry,a=.35){
  x.save();x.translate(cx,cy);x.scale(1,ry/rx);const g=x.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,'rgba(5,15,35,'+a+')');g.addColorStop(1,'rgba(5,15,35,0)');
  x.fillStyle=g;x.beginPath();x.arc(0,0,rx,0,TAU);x.fill();x.restore();
}
// Deep FPT-blue studio backdrop with drifting light and a fine grid.
function deep(x,t,{tint=C.b,grid=true,accent=C.o}={}){
  const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0A2A5C');g.addColorStop(.55,C.n);g.addColorStop(1,'#06142C');x.fillStyle=g;x.fillRect(0,0,W,H);
  soft(x,W*.22+60*Math.sin(TAU*t/DUR),H*.3,520,tint,.55);
  soft(x,W*.82+50*Math.cos(TAU*t/DUR),H*.78,460,accent,.22);
  if(grid){
    x.save();x.strokeStyle='rgba(143,208,255,.07)';x.lineWidth=1;const off=(t*14)%48;
    for(let X=-48+off;X<W;X+=48){x.beginPath();x.moveTo(X,0);x.lineTo(X,H);x.stroke();}
    for(let Y=-48+off;Y<H;Y+=48){x.beginPath();x.moveTo(0,Y);x.lineTo(W,Y);x.stroke();}
    x.restore();
  }
}
// Bright, warm look of the FPT Wi-Fi 6 key visual: cream to peach with soft rings.
function warm(x,t,cx=W/2,cy=H*.52){
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,C.cream);g.addColorStop(1,'#FFE6D3');x.fillStyle=g;x.fillRect(0,0,W,H);
  soft(x,cx,cy,520,'rgba(255,170,110,.85)',.7);soft(x,cx,cy,260,'rgba(255,215,160,.9)',.6);
  x.save();x.strokeStyle='rgba(243,112,33,.16)';
  for(let i=0;i<6;i++){const p=(t/2.5+i/6)%1;x.globalAlpha=Math.sin(Math.PI*p);x.lineWidth=2+10*(1-p);x.beginPath();x.arc(cx,cy,120+p*560,0,TAU);x.stroke();}
  x.restore();
}
// Dim, slightly desaturated look for problems (weak signal, walls, lag): navy and grey with orange warnings.
function gloom(x,t){
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#1B2A44');g.addColorStop(1,'#0B1426');x.fillStyle=g;x.fillRect(0,0,W,H);
  soft(x,W*.3,H*.25,500,'rgba(120,140,170,.35)',1);soft(x,W*.85,H*.85,420,'rgba(243,112,33,.18)',1);
}
// Small floating particles that give depth.
function dust(x,t,color='rgba(255,255,255,.7)',n=26,seed=1){
  x.save();x.fillStyle=color;
  for(let i=0;i<n;i++){
    const r=((i*977+seed*131)%1000)/1000,s=((i*613+seed*71)%1000)/1000,sp=.04+.06*s;
    const X=(r*W+Math.sin(TAU*(t*sp+s))*40+W)%W,Y=(H-((s*H+t*20*(1+r))%H));
    x.globalAlpha=.25+.55*wave(t,2+3*r,s);x.beginPath();x.arc(X,Y,1.2+2.6*r,0,TAU);x.fill();
  }
  x.restore();
}
function wifiIcon(x,cx,cy,s,color,lit=3,width=null){
  x.save();x.lineCap='round';x.lineWidth=width||s*.16;
  for(let i=0;i<3;i++){x.strokeStyle=i<lit?color:'rgba(160,175,200,.35)';x.beginPath();x.arc(cx,cy,s*(.38+.31*i),-Math.PI*.75,-Math.PI*.25);x.stroke();}
  x.fillStyle=lit>0?color:'rgba(160,175,200,.35)';x.beginPath();x.arc(cx,cy,s*.12,0,TAU);x.fill();x.restore();
}
function bolt(x,cx,cy,s,color){
  x.save();x.translate(cx,cy);x.scale(s/100,s/100);x.fillStyle=color;x.beginPath();
  x.moveTo(12,-50);x.lineTo(-30,8);x.lineTo(-2,8);x.lineTo(-14,50);x.lineTo(32,-12);x.lineTo(4,-12);x.lineTo(16,-50);x.closePath();x.fill();
  x.strokeStyle=color;x.lineWidth=7;x.lineCap='round';for(const [a,b,c,d] of [[-48,-30,-36,-22],[-52,-6,-40,-4],[44,18,56,14]]){x.beginPath();x.moveTo(a,b);x.lineTo(c,d);x.stroke();}
  x.restore();
}
function shield(x,cx,cy,s,color,check=1){
  x.save();x.translate(cx,cy);x.scale(s/100,s/100);x.fillStyle=color;x.beginPath();
  x.moveTo(0,-48);x.bezierCurveTo(20,-36,38,-34,46,-34);x.bezierCurveTo(46,10,30,36,0,52);x.bezierCurveTo(-30,36,-46,10,-46,-34);x.bezierCurveTo(-38,-34,-20,-36,0,-48);x.fill();
  if(check>0){x.strokeStyle=C.w;x.lineWidth=11;x.lineCap=x.lineJoin='round';x.beginPath();x.moveTo(-18,0);const a=clamp(check*2),b=clamp(check*2-1);x.lineTo(-18+14*a,14*a);if(b>0)x.lineTo(-4+26*b,14-30*b);x.stroke();}
  x.restore();
}
function gaugeIcon(x,cx,cy,s,color,k){
  x.save();x.translate(cx,cy);x.scale(s/100,s/100);x.lineCap='round';x.strokeStyle=color;x.lineWidth=11;
  x.beginPath();x.arc(0,6,40,Math.PI*.8,Math.PI*2.2);x.stroke();
  const a=Math.PI*(.85+1.3*k);x.lineWidth=9;x.beginPath();x.moveTo(0,6);x.lineTo(Math.cos(a)*30,6+Math.sin(a)*30);x.stroke();
  x.fillStyle=color;x.beginPath();x.arc(0,6,8,0,TAU);x.fill();x.fillRect(-26,40,52,9);x.restore();
}
function check(x,cx,cy,r,k,bg=C.g){
  if(k<=0)return;x.save();x.translate(cx,cy);x.scale(outBack(k,2.2),outBack(k,2.2));x.fillStyle=bg;glow(x,'rgba(0,0,0,.3)',8);x.beginPath();x.arc(0,0,r,0,TAU);x.fill();noGlow(x);
  x.strokeStyle=C.w;x.lineWidth=r*.28;x.lineCap=x.lineJoin='round';x.beginPath();x.moveTo(-r*.42,0);const a=clamp(k*3-1),b=clamp(k*3-2);x.lineTo(-r*.42+r*.3*a,r*.3*a);if(b>0)x.lineTo(-r*.12+r*.55*b,r*.3-r*.62*b);x.stroke();x.restore();
}
function cross(x,cx,cy,r,k,bg=C.o){
  if(k<=0)return;const s=outBack(k,2.4);x.save();x.translate(cx,cy);x.scale(s,s);x.fillStyle=bg;glow(x,'rgba(0,0,0,.35)',10);x.beginPath();x.arc(0,0,r,0,TAU);x.fill();noGlow(x);
  x.strokeStyle=C.w;x.lineWidth=r*.26;x.lineCap='round';const q=r*.38;x.beginPath();x.moveTo(-q,-q);x.lineTo(q,q);x.moveTo(q,-q);x.lineTo(-q,q);x.stroke();x.restore();
}
function bars(x,X,Y,s,level,colorOn,colorOff='rgba(170,185,210,.32)'){
  for(let i=0;i<4;i++){const h=s*(.3+.23*i);x.fillStyle=i<level?colorOn:colorOff;rr(x,X+i*s*.3,Y-h,s*.21,h,s*.06);x.fill();}
}
function badge(x,cx,cy,r,draw,k,bg=C.w){
  if(k<=0)return;const s=spring(k*1.6);x.save();x.translate(cx,cy);x.scale(s,s);
  glow(x,'rgba(150,60,10,.25)',24);x.fillStyle=bg;x.beginPath();x.arc(0,0,r,0,TAU);x.fill();noGlow(x);
  x.strokeStyle='rgba(243,112,33,.25)';x.lineWidth=3;x.beginPath();x.arc(0,0,r+7,0,TAU);x.stroke();draw(0,0);x.restore();
}
function text(x,str,X,Y,size,color,{family='MgHead',align='center',italic=false,stroke=null,strokeW=0,shadow=true}={}){
  x.save();x.font=(italic?'italic ':'')+size+'px '+family;x.textAlign=align;x.textBaseline='middle';
  if(shadow)glow(x,'rgba(0,0,0,.35)',12);
  if(stroke){x.lineJoin='round';x.strokeStyle=stroke;x.lineWidth=strokeW;x.strokeText(str,X,Y);}
  noGlow(x);x.fillStyle=color;x.fillText(str,X,Y);x.restore();
}
// A light sweep that crosses a shape every few seconds.
function sweep(x,t,period,clip,angle=.35){
  const p=(t%period)/.7;if(p>1)return;x.save();clip();x.clip();
  const X=-300+(W+600)*inOut(p),g=x.createLinearGradient(X-120,0,X+120,120*angle);
  g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,W,H);x.restore();
}
// ---- devices -----------------------------------------------------------------------------------------------
// The white FPT Wi-Fi 6 tower modem: front face with vents, a thin side, FPT mark, green LED and stand.
function modem(x,cx,by,s,t,{led=true}={}){
  const w=200*s,h=372*s,d=34*s,X=cx-w/2,Y=by-h-26*s,r=26*s;
  shadowEllipse(x,cx+8*s,by,170*s,26*s,.4);
  // stand
  x.fillStyle='#E6EAF0';x.beginPath();x.moveTo(cx-40*s,by-34*s);x.lineTo(cx+70*s,by-34*s);x.lineTo(cx+96*s,by);x.lineTo(cx-60*s,by);x.closePath();x.fill();
  x.fillStyle='#CDD4DE';x.fillRect(cx-60*s,by-4*s,156*s,4*s);
  // side
  const side=x.createLinearGradient(X-d,0,X,0);side.addColorStop(0,'#C7CFDA');side.addColorStop(1,'#E9EDF3');
  x.fillStyle=side;x.beginPath();x.moveTo(X+r*.3,Y+6*s);x.lineTo(X-d+r*.6,Y+16*s);x.lineTo(X-d,Y+h-14*s);x.lineTo(X+r*.3,Y+h);x.closePath();x.fill();
  // front
  const front=x.createLinearGradient(X,Y,X+w,Y+h);front.addColorStop(0,'#FFFFFF');front.addColorStop(.6,'#F3F5F8');front.addColorStop(1,'#E2E7EE');
  glow(x,'rgba(10,30,60,.25)',30*s);x.fillStyle=front;rr(x,X,Y,w,h,r);x.fill();noGlow(x);
  x.strokeStyle='rgba(150,165,185,.6)';x.lineWidth=2*s;rr(x,X,Y,w,h,r);x.stroke();
  // vents: a dense grid of slots, top and bottom
  x.fillStyle='#39424F';
  for(const [y0,rows] of [[Y+30*s,10],[Y+h-30*s-11*15*s,11]])for(let row=0;row<rows;row++)for(let col=0;col<9;col++){
    const vx=X+30*s+col*16.5*s+(row%2)*7*s,vy=y0+row*15*s;if(vx>X+w-28*s)continue;
    x.save();x.translate(vx,vy);x.rotate(-.5);x.beginPath();x.ellipse(0,0,5.2*s,3*s,0,0,TAU);x.fill();x.restore();
  }
  // QR label and FPT mark on the side
  x.fillStyle='#FFFFFF';rr(x,cx+18*s,Y+h*.5-26*s,46*s,58*s,4*s);x.fill();x.strokeStyle='#C4CBD6';x.lineWidth=1.5*s;x.stroke();
  x.fillStyle='#30394A';for(let i=0;i<5;i++)for(let j=0;j<5;j++)if((i*7+j*3)%4)x.fillRect(cx+24*s+i*7*s,Y+h*.5-20*s+j*7*s,5.5*s,5.5*s);
  x.save();x.translate(X-d*.45,Y+h*.24);x.rotate(-Math.PI/2+.04);x.font='italic '+20*s+'px MgWide';x.fillStyle='#8792A3';x.textAlign='center';x.textBaseline='middle';x.fillText('FPT',0,0);x.restore();
  if(led){const on=.55+.45*wave(t,1.6);x.save();glow(x,'rgba(0,220,110,.9)',16*s*on);x.fillStyle='rgba(0,200,100,'+(.5+.5*on)+')';rr(x,X+18*s,Y+h*.66,22*s,5*s,3*s);x.fill();x.restore();}
  sweep(x,t,4,()=>rr(x,X,Y,w,h,r));
  return {x:X,y:Y,w,h,top:Y};
}
function phone(x,cx,cy,s,draw){
  const w=150*s,h=300*s,X=cx-w/2,Y=cy-h/2;
  glow(x,'rgba(0,0,0,.45)',28*s);x.fillStyle='#10192B';rr(x,X,Y,w,h,24*s);x.fill();noGlow(x);
  x.strokeStyle='#55647D';x.lineWidth=3*s;rr(x,X,Y,w,h,24*s);x.stroke();
  const sx=X+9*s,sy=Y+9*s,sw=w-18*s,sh=h-18*s;x.save();rr(x,sx,sy,sw,sh,17*s);x.clip();
  const g=x.createLinearGradient(0,sy,0,sy+sh);g.addColorStop(0,'#173C74');g.addColorStop(1,'#0B1F3F');x.fillStyle=g;x.fillRect(sx,sy,sw,sh);
  draw({x:sx,y:sy,w:sw,h:sh});x.restore();
  x.fillStyle='#10192B';rr(x,cx-26*s,Y+14*s,52*s,12*s,6*s);x.fill();
}
function tower(x,cx,by,s,t,color=C.greyL){
  x.save();x.strokeStyle=color;x.lineWidth=7*s;x.lineCap=x.lineJoin='round';
  const top=by-300*s;x.beginPath();x.moveTo(cx-70*s,by);x.lineTo(cx,top);x.lineTo(cx+70*s,by);x.stroke();
  x.lineWidth=4*s;for(let i=1;i<6;i++){const y=lerp(by,top,i/6),hw=70*s*(1-i/6);x.beginPath();x.moveTo(cx-hw,y);x.lineTo(cx+hw*.85,lerp(by,top,(i+.7)/6));x.stroke();}
  x.fillStyle=C.w;rr(x,cx-12*s,top-30*s,24*s,58*s,6*s);x.fill();
  const blink=wave(t,1.2)>.5;x.fillStyle=blink?C.o:'#7A4A2A';glow(x,C.o,blink?18:0);x.beginPath();x.arc(cx,top-38*s,8*s,0,TAU);x.fill();x.restore();
  return {x:cx,y:top-10*s};
}
function bricks(x,X,Y,w,h,s,tone=0){
  x.save();rr(x,X,Y,w,h,6*s);x.clip();x.fillStyle='#5B6475';x.fillRect(X,Y,w,h);
  const bh=26*s,bw=58*s;
  for(let row=0;row*bh<h;row++)for(let k=-1;k*bw<w;k++){
    const bx=X+k*bw+(row%2?bw/2:0),by=Y+row*bh,shade=((row*7+k*13)%5)/5;
    const g=x.createLinearGradient(0,by,0,by+bh);g.addColorStop(0,tone?'#B8714A':'#C97B4F');g.addColorStop(1,tone?'#93593A':'#A2603C');
    x.fillStyle=g;x.globalAlpha=.82+.18*shade;rr(x,bx+3*s,by+3*s,bw-6*s,bh-6*s,3*s);x.fill();
  }
  x.globalAlpha=1;const sh=x.createLinearGradient(X,0,X+w,0);sh.addColorStop(0,'rgba(0,0,0,.35)');sh.addColorStop(.4,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.25)');x.fillStyle=sh;x.fillRect(X,Y,w,h);
  x.restore();
}
function laptop(x,cx,by,s,glowOn){
  x.fillStyle='#22324F';rr(x,cx-60*s,by-80*s,120*s,76*s,6*s);x.fill();x.fillStyle=glowOn?'#2F95E0':'#2A3A55';rr(x,cx-52*s,by-73*s,104*s,62*s,3*s);x.fill();
  x.fillStyle='#9AA8BD';x.beginPath();x.moveTo(cx-76*s,by);x.lineTo(cx+76*s,by);x.lineTo(cx+64*s,by-6*s);x.lineTo(cx-64*s,by-6*s);x.closePath();x.fill();
}
function tv(x,cx,by,s,glowOn){
  x.fillStyle='#1A2338';rr(x,cx-70*s,by-96*s,140*s,84*s,5*s);x.fill();x.fillStyle=glowOn?'#F37021':'#2A3A55';rr(x,cx-63*s,by-90*s,126*s,72*s,3*s);x.fill();
  x.fillStyle='#9AA8BD';x.fillRect(cx-4*s,by-12*s,8*s,10*s);x.fillRect(cx-30*s,by-3*s,60*s,4*s);
}
// The orange FPT Play mark (play triangle in a soft square) and its wordmark, drawn from the supplied logo.
let playLogo=null;
// ---- clips -------------------------------------------------------------------------------------------------
const CLIPS={};
// 1. Wi-Fi 6 modem: the tower modem rises, rings pulse, the four benefit icons pop in, the Wi-Fi 6 mark slams in.
CLIPS.mg_wifi6_modem={title:'Modem Wi-Fi 6 FPT — đồ họa động',draw(x,t){
  const cx=W/2,cy=H*.54;warm(x,t,cx,cy);
  // waves from the top of the modem
  const intro=spring(born(t,0,.5)),by=H*.93+(1-intro)*260;
  x.save();x.lineCap='round';
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const p=(t/1.8+i/4)%1;x.globalAlpha=Math.sin(Math.PI*p)*clamp(t*2)*(.9);x.strokeStyle=i%2?C.oL:C.o;x.lineWidth=14-9*p;
    x.beginPath();x.arc(cx,by-430,60+p*300,side>0?-.95:Math.PI-.95+.0,side>0?-.25:Math.PI+.25-.0+.0);x.stroke();
  }
  x.restore();
  modem(x,cx,by,1.12,t);
  // four benefits, as icons only, floating
  const icons=[[W*.24,H*.42,(X,Y)=>bolt(x,X,Y,64,C.o)],[W*.36,H*.22,(X,Y)=>wifiIcon(x,X,Y+18,62,C.o,3)],[W*.64,H*.22,(X,Y)=>shield(x,X,Y,62,C.o,clamp((t-.7)/.35))],[W*.76,H*.42,(X,Y)=>gaugeIcon(x,X,Y,64,C.o,.5+.45*Math.sin(t*2.2))]];
  icons.forEach(([X,Y,draw],i)=>{const k=born(t,.2+i*.08,.4),fy=8*Math.sin(TAU*(t/3+i/4));badge(x,X,Y+fy,58,draw,k);});
  // the Wi-Fi 6 mark
  const k=born(t,.5,.3),slam=spring(k*1.6);if(k>0){
    const mx=cx-10,my=H*.71;x.save();x.translate(mx,my);x.rotate(-.06);x.scale(.6+.4*slam,.6+.4*slam);x.globalAlpha=clamp(k*3);
    x.strokeStyle='rgba(243,112,33,.75)';x.lineWidth=6;x.lineCap='round';
    for(let i=0;i<4;i++){const len=120+60*i,y=-34+i*22,run=(t*1.3+i*.21)%1;x.globalAlpha=clamp(k*3)*(.35+.4*Math.sin(Math.PI*run));x.beginPath();x.moveTo(-330-len*run,y);x.lineTo(-250-len*run,y);x.stroke();x.beginPath();x.moveTo(250+len*run,y+10);x.lineTo(330+len*run,y+10);x.stroke();}
    x.globalAlpha=clamp(k*3);text(x,'WiFi',-62,0,118,C.o,{family:'MgWide',italic:true,stroke:C.w,strokeW:14});
    glow(x,'rgba(150,60,10,.35)',16);x.fillStyle=C.o;rr(x,82,-62,112,118,24);x.fill();noGlow(x);x.strokeStyle=C.w;x.lineWidth=8;rr(x,82,-62,112,118,24);x.stroke();
    text(x,'6',138,4,104,C.w,{family:'MgWide',shadow:false});
    x.lineCap='round';x.strokeStyle=C.o;for(let i=0;i<2;i++){x.globalAlpha=clamp(k*3)*(.5+.5*wave(t,1.4,i*.3));x.lineWidth=12;x.beginPath();x.arc(170,-64,30+i*26,-Math.PI*.42,-Math.PI*.08);x.stroke();}
    x.restore();
  }
  dust(x,t,'rgba(243,112,33,.55)',18,2);
}};
// 2. 4G/5G: the tower sends data to a phone, bars fill, the network badge turns from 4G to 5G.
CLIPS.mg_signal_5g={title:'Sóng di động 4G/5G — đồ họa động',draw(x,t){
  deep(x,t,{tint:'#1170C8'});
  const tw=tower(x,W*.24,H*.9,1.15,t),ph={x:W*.72,y:H*.5};
  // radio rings from the antenna
  x.save();for(let i=0;i<5;i++){const p=(t/2+i/5)%1;x.globalAlpha=(1-p)*.8;x.strokeStyle=i%2?C.sky:C.w;x.lineWidth=5*(1-p)+1;x.beginPath();x.arc(tw.x,tw.y,30+p*360,-Math.PI*.45,Math.PI*.45);x.stroke();x.beginPath();x.arc(tw.x,tw.y,30+p*360,Math.PI*.55,Math.PI*1.45);x.stroke();}x.restore();
  // data packets along an arc
  const cyc=5,ct=t%cyc,upgraded=ct>1.4,from={x:tw.x+30,y:tw.y},to={x:ph.x-80,y:ph.y-40};
  x.save();for(let i=0;i<14;i++){
    const k=((t*.55+i/14)%1),cxp=lerp(from.x,to.x,.5),cyp=Math.min(from.y,to.y)-160,X=(1-k)*(1-k)*from.x+2*(1-k)*k*cxp+k*k*to.x,Y=(1-k)*(1-k)*from.y+2*(1-k)*k*cyp+k*k*to.y;
    x.globalAlpha=Math.sin(Math.PI*k);glow(x,upgraded?C.o:C.sky,14);x.fillStyle=upgraded?(i%2?C.oL:C.w):(i%2?C.sky:C.w);rr(x,X-9,Y-4,18+(upgraded?16:0),8,4);x.fill();
  }x.restore();noGlow(x);
  // phone with signal and badge
  const enter=spring(born(t,0,.45));x.save();x.translate(0,(1-enter)*300);x.globalAlpha=clamp(enter*2);
  phone(x,ph.x,ph.y,1.45,s=>{
    const level=upgraded?4:1+Math.min(3,Math.floor(ct/.4));bars(x,s.x+20,s.y+70,48,level,upgraded?C.o:C.gL);
    const flash=upgraded?pulse(ct,1.4,.3):0;
    text(x,upgraded?'5G':'4G',s.x+s.w-56,s.y+48,upgraded?54:46,upgraded?C.o:C.w,{family:'MgWide'});
    if(flash>0){x.save();x.globalAlpha=flash*.8;x.fillStyle=C.w;x.fillRect(s.x,s.y,s.w,s.h);x.restore();}
    // a "streaming" bar chart inside the screen
    for(let i=0;i<6;i++){const hh=(30+90*wave(t*(upgraded?2.4:1),1.4,i/6))*(upgraded?1.25:.7);x.fillStyle=i%2?C.b:C.bL;rr(x,s.x+22+i*30,s.y+s.h-30-hh,20,hh,5);x.fill();}
    wifiIcon(x,s.x+s.w/2,s.y+s.h*.5,60,upgraded?C.o:C.sky,3);
  });x.restore();
  // big glowing 5G when upgraded
  if(upgraded){const k=born(ct,1.4,.35),fade=1-born(ct,4.5,.4);x.save();x.globalAlpha=k*fade;x.translate(W*.5,H*.2);x.scale(.7+.3*spring(k*1.6),.7+.3*spring(k*1.6));
    glow(x,'rgba(243,112,33,.9)',30);text(x,'5G',0,0,120,C.w,{family:'MgWide',italic:true,stroke:C.o,strokeW:16,shadow:false});x.restore();}
  dust(x,t,'rgba(143,208,255,.6)',24,3);vignette(x,.5);
}};
function pulse(t,at,d){return t<at||t>at+d?0:Math.sin(Math.PI*(t-at)/d);}
// 3. Walls block Wi-Fi: waves leave the modem, lose strength at each brick wall; the phone at the far side has one bar.
CLIPS.mg_wall_block={title:'Bức tường chặn sóng Wi-Fi — đồ họa động',draw(x,t){
  gloom(x,t);
  // floor
  x.fillStyle='#16233B';x.fillRect(0,H*.84,W,H*.16);x.fillStyle='rgba(255,255,255,.06)';x.fillRect(0,H*.84,W,3);
  const walls=[W*.42,W*.64],wy=H*.16,wh=H*.68,ww=56;
  const m=modem(x,W*.16,H*.9,.62,t);const src={x:W*.16,y:m.top+40};
  // waves: strength drops after each wall
  x.save();x.lineCap='round';
  for(let i=0;i<7;i++){
    const p=(t/2.4+i/7)%1,r=40+p*W*.95,X=src.x+r;let strength=1;
    for(const wx of walls)if(X>wx)strength*=.32;
    const blocked=walls.some(wx=>Math.abs(X-wx)<26);
    x.globalAlpha=Math.min(1,1.3-p)*strength*clamp(t*2);x.strokeStyle=strength>.9?C.sky:strength>.3?C.grey:C.greyD;x.lineWidth=(10-6*p)*(strength>.5?1:.7);
    x.beginPath();x.arc(src.x,src.y,r,-.55,.55);x.stroke();
    if(blocked){x.globalAlpha=strength*.9;for(let k=0;k<6;k++){const a=-.5+k*.2,sx=src.x+Math.cos(a)*r,sy=src.y+Math.sin(a)*r;x.strokeStyle=C.oL;x.lineWidth=3;x.beginPath();x.moveTo(sx,sy);x.lineTo(sx-14-8*(k%3),sy+(k-2.5)*7);x.stroke();}}
  }
  x.restore();
  walls.forEach((wx,i)=>{const k=spring(born(t,.03+i*.08,.45));x.save();x.translate(0,(1-k)*-H);bricks(x,wx-ww/2,wy,ww,wh,1,i);
    // impact glow where the waves hit
    soft(x,wx-ww/2,src.y,90,'rgba(243,112,33,.55)',.4+.6*wave(t,2.4/7*1));x.restore();});
  // phone on the far side: weak signal
  const ph={x:W*.85,y:H*.48},flick=wave(t,.9)>.35?1:0;
  phone(x,ph.x,ph.y,1.05,s=>{
    bars(x,s.x+16,s.y+56,36,1,C.o);wifiIcon(x,s.x+s.w/2,s.y+s.h*.55,52,flick?C.o:'rgba(243,112,33,.35)',1);
    const a=(t*5)%TAU;x.strokeStyle='rgba(255,255,255,.18)';x.lineWidth=7;x.beginPath();x.arc(s.x+s.w/2,s.y+s.h*.8,18,0,TAU);x.stroke();x.strokeStyle=C.w;x.beginPath();x.arc(s.x+s.w/2,s.y+s.h*.8,18,a,a+1.6);x.stroke();
  });
  cross(x,ph.x+62,ph.y-140,26,born(t,.5,.3)*(.85+.15*wave(t,1.2)));
  // strength meter at the top: full → weak, matching the walls
  const mx=W*.16,my=H*.11;[[mx,4,C.gL],[(walls[0]+walls[1])/2,2,C.oL],[W*.85,1,C.o]].forEach(([X,level,color],i)=>{const k=born(t,.15+i*.12,.3);if(k<=0)return;x.save();x.globalAlpha=k;x.fillStyle='rgba(11,31,63,.8)';rr(x,X-70,my-38,140,80,20);x.fill();x.strokeStyle='rgba(255,255,255,.18)';x.lineWidth=2;x.stroke();bars(x,X-48,my+28,58,level,color);x.restore();});
  vignette(x,.55);
}};
// 4. Mesh: a two-storey house lights up room by room as Mesh nodes join; devices get a tick.
CLIPS.mg_mesh_cover={title:'Wi-Fi Mesh phủ sóng cả nhà — đồ họa động',draw(x,t){
  deep(x,t,{tint:'#0F7A5A',accent:C.b});
  const hx=W*.2,hy=H*.13,hw=W*.6,hh=H*.72,floor=hh/2,enter=spring(born(t,0,.45));
  x.save();x.translate(0,(1-enter)*80);x.globalAlpha=clamp(enter*2);
  // roof and house body
  x.fillStyle='rgba(255,255,255,.06)';x.beginPath();x.moveTo(hx-30,hy+10);x.lineTo(hx+hw/2,hy-70);x.lineTo(hx+hw+30,hy+10);x.closePath();x.fill();
  x.strokeStyle='rgba(255,255,255,.75)';x.lineWidth=6;x.lineJoin='round';x.stroke();
  const rooms=[[0,1,0],[1,1,1],[0,0,2],[1,0,3]];// col,row(1=ground),order
  const nodes=[{x:hx+hw*.25,y:hy+floor*1.62,at:.2},{x:hx+hw*.75,y:hy+floor*1.62,at:.6},{x:hx+hw*.25,y:hy+floor*.62,at:1},{x:hx+hw*.75,y:hy+floor*.62,at:1.4}];
  const cyc=5,ct=t%cyc,ready=i=>ct>nodes[i].at;
  rooms.forEach(([col,row,i])=>{const X=hx+col*hw/2,Y=hy+row*floor,on=ready(i),k=on?clamp((ct-nodes[i].at)/.5):0;
    x.fillStyle='rgba(20,40,75,.85)';x.fillRect(X+6,Y+6,hw/2-12,floor-12);
    if(k>0){const g=x.createRadialGradient(nodes[i].x,nodes[i].y,0,nodes[i].x,nodes[i].y,hw*.32);g.addColorStop(0,'rgba(43,210,127,'+(.55*k)+')');g.addColorStop(1,'rgba(0,166,81,'+(.12*k)+')');x.fillStyle=g;x.fillRect(X+6,Y+6,hw/2-12,floor-12);}
  });
  x.strokeStyle='rgba(255,255,255,.75)';x.lineWidth=6;x.strokeRect(hx,hy,hw,hh);x.beginPath();x.moveTo(hx,hy+floor);x.lineTo(hx+hw,hy+floor);x.moveTo(hx+hw/2,hy);x.lineTo(hx+hw/2,hy+hh);x.stroke();
  // coverage rings and links between nodes
  nodes.forEach((n,i)=>{if(!ready(i))return;const k=clamp((ct-n.at)/.6);
    for(let j=0;j<3;j++){const p=(t/1.6+j/3)%1;x.save();x.globalAlpha=(1-p)*.7*k;x.strokeStyle=C.gL;x.lineWidth=4;x.beginPath();x.arc(n.x,n.y-40,40+p*170,0,TAU);x.stroke();x.restore();}
    if(i){const a=nodes[0];x.save();x.setLineDash([10,12]);x.lineDashOffset=-t*40;x.strokeStyle='rgba(182,242,210,.85)';x.lineWidth=4;x.beginPath();x.moveTo(a.x,a.y-60);x.lineTo(lerp(a.x,n.x,k),lerp(a.y-60,n.y-60,k));x.stroke();x.restore();}
  });
  // devices: the main modem and the Mesh points; laptop, phone and TV get a tick when their room is covered
  modem(x,nodes[0].x,nodes[0].y+60,.32,t);
  nodes.slice(1).forEach((n,i)=>{if(!ready(i+1))return;const k=spring(clamp((ct-n.at)/.6)*1.6);x.save();x.translate(n.x,n.y+40);x.scale(k,k);x.fillStyle=C.w;rr(x,-26,-70,52,70,14);x.fill();x.fillStyle=C.g;x.beginPath();x.arc(0,-24,6,0,TAU);x.fill();x.restore();});
  const devices=[[hx+hw*.4,hy+floor*2-14,'laptop',1],[hx+hw*.88,hy+floor-14,'tv',3],[hx+hw*.4,hy+floor-14,'phone',2]];
  devices.forEach(([X,Y,kind,room])=>{const on=ready(room);if(kind==='laptop')laptop(x,X,Y,.6,on);else if(kind==='tv')tv(x,X,Y,.6,on);else{x.fillStyle='#10192B';rr(x,X-16,Y-60,32,58,7);x.fill();x.fillStyle=on?C.gL:'#2A3A55';rr(x,X-12,Y-55,24,46,4);x.fill();}
    check(x,X+40,Y-80,17,on?clamp((ct-nodes[room].at-.3)/.4):0);});
  x.restore();
  dust(x,t,'rgba(182,242,210,.55)',22,4);vignette(x,.5);
}};
// 5. FPT Play, SaaS product-video style. 10 s loop:
//   0.0–0.6  the interface panel springs in, cards and tiles stagger in with motion trails
//   0.9–4.2  a pointer glides over the cards (each lifts on hover), lands on "thể thao" and clicks
//   4.2–5.0  the camera dives into the clicked tile
//   5.0–9.4  the same match plays on TV, laptop and phone, synced from the FPT Play mark
//   9.4–10   the devices settle out so the loop starts again on the empty studio
const SHOWS=['ball','toon','drama','music','kids'];
const CATS=[['truyền hình',['#1B86D6','#0B4F9C']],['thể thao',['#2A6FE0','#1B3FA8']],['phim bộ',['#19C46F','#0E8F7A']],['phim lẻ',['#FF9550','#F37021']],['thiếu nhi',['#FFB27A','#E8601C']]];
function playLayout(){
  if(H>W){// portrait: the four shows in a 2×2 grid, the categories on two rows (3 + 2)
    const pw=W*.9,ph=H*.7,px=(W-pw)/2,py=(H-ph)/2,gap=22,cw=(pw-60-gap)/2,th=70,tw=(pw-60-2*18)/3,ch=(ph-86-2*th-18-54-gap)/2;
    const cards=[0,1,2,3].map(i=>({x:px+30+(i%2)*(cw+gap),y:py+86+Math.floor(i/2)*(ch+gap),w:cw,h:ch}));
    const tiles=CATS.map((_,i)=>{const row=i<3?0:1,col=i<3?i:i-3,n=row?2:3,rowW=n*tw+(n-1)*18;return {x:px+(pw-rowW)/2+col*(tw+18),y:py+ph-34-th-(1-row)*(th+18),w:tw,h:th};});
    return {px,py,pw,ph,cards,tiles};
  }
  const pw=W*.86,ph=H*.82,px=(W-pw)/2,py=(H-ph)/2,cw=pw*.36,ch=ph*.42,gap=22;
  const cards=[0,1,2,3].map(i=>({x:px+30+i*(cw+gap),y:py+86,w:cw,h:ch}));
  const tw=(pw-60-4*18)/5,th=ph*.2,ty=py+ph-th-34,tiles=CATS.map((_,i)=>({x:px+30+i*(tw+18),y:ty,w:tw,h:th}));
  return {px,py,pw,ph,cards,tiles};
}
const centre=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
// Keyframed path with eased segments: [[time,x,y],...]
function keyed(keys,t){
  if(t<=keys[0][0])return {x:keys[0][1],y:keys[0][2]};
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [t0,x0,y0]=keys[i-1],[t1,x1,y1]=keys[i],k=inOut((t-t0)/(t1-t0));return {x:lerp(x0,x1,k),y:lerp(y0,y1,k)};}
  const l=keys.at(-1);return {x:l[1],y:l[2]};
}
function pointer(x,X,Y,press=0){
  const s=1-.18*press;x.save();x.translate(X,Y);x.scale(s,s);glow(x,'rgba(0,0,0,.45)',10);x.shadowOffsetY=4;
  x.fillStyle=C.w;x.beginPath();x.moveTo(0,0);x.lineTo(0,34);x.lineTo(9,26);x.lineTo(16,41);x.lineTo(22,38);x.lineTo(15,24);x.lineTo(27,24);x.closePath();x.fill();noGlow(x);
  x.strokeStyle='#0B1F3F';x.lineWidth=2.4;x.lineJoin='round';x.stroke();x.restore();
}
function ripple(x,X,Y,p,color=C.w){if(p<=0||p>=1)return;x.save();x.globalAlpha=(1-p)*.9;x.strokeStyle=color;x.lineWidth=4*(1-p)+1;x.beginPath();x.arc(X,Y,10+56*outCubic(p),0,TAU);x.stroke();x.restore();}
CLIPS.mg_fptplay={title:'FPT Play — giao diện và đa thiết bị, đồ họa động',draw(x,t){
  const T=t%10;
  const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0E2A55');g.addColorStop(.5,'#0B1D3D');g.addColorStop(1,'#1A1240');x.fillStyle=g;x.fillRect(0,0,W,H);
  soft(x,W*.2+40*Math.sin(t*.6),H*.25,460,'rgba(47,149,224,.45)',1);soft(x,W*.85,H*.7+30*Math.cos(t*.5),420,'rgba(243,112,33,.32)',1);soft(x,W*.55,H*.05,300,'rgba(0,166,81,.18)',1);
  dust(x,t,'rgba(255,255,255,.35)',14,7);
  const L=playLayout();
  if(T<5){
    // camera dive into the clicked tile
    const target=centre(L.tiles[1]),dive=inOut(clamp((T-4.2)/.8)),z=1+1.9*dive*dive;
    x.save();x.translate(W/2,H/2);x.scale(z,z);x.translate(-lerp(W/2,target.x,dive),-lerp(H/2,target.y,dive));
    playInterface(x,t,T,L);
    x.restore();
    const flash=clamp((T-4.65)/.35);if(flash>0){x.fillStyle='rgba(255,255,255,'+(.85*flash)+')';x.fillRect(0,0,W,H);}
  }else{
    const at=T-5,arrive=outCubic(clamp(at/.7)),leave=clamp((T-9.4)/.6),z=1.3-.3*arrive;
    x.save();x.globalAlpha=1-inOut(leave);x.translate(W/2,H/2);x.scale(z,z);x.translate(-W/2,-H/2);playDevices(x,t,at);x.restore();
    const flash=1-clamp(at/.45);if(flash>0){x.fillStyle='rgba(255,255,255,'+(.85*flash)+')';x.fillRect(0,0,W,H);}
  }
  vignette(x,.42);
}};
function playInterface(x,t,T,L){
  const enter=spring(born(T,0,.5)),{px,pw,ph}=L,lift=(1-enter)*70,py=L.py+lift+3*Math.sin(t*1.3);
  // pointer path and what it is over
  const cur=keyed([[0,W*.92,H*1.05],[.9,W*.92,H*1.05],[1.6,centre(L.cards[0]).x,centre(L.cards[0]).y],[2.35,centre(L.cards[1]).x,centre(L.cards[1]).y],[3.2,centre(L.tiles[1]).x,centre(L.tiles[1]).y]],T);
  const press=T>3.3&&T<3.5?Math.sin(Math.PI*(T-3.3)/.2):0,clicked=T>3.4;
  const inside=r=>cur.x>r.x&&cur.x<r.x+r.w&&cur.y>r.y&&cur.y<r.y+r.h;
  // parallax: content shifts slightly against the pointer
  const par=(cur.x-W/2)*-.012;
  x.save();x.globalAlpha=clamp(enter*2);x.translate(W/2,H/2);x.scale(.92+.08*enter,.92+.08*enter);x.translate(-W/2,-H/2);
  glow(x,'rgba(0,0,0,.55)',60);const pg=x.createLinearGradient(0,py,0,py+ph);pg.addColorStop(0,'rgba(26,56,104,.97)');pg.addColorStop(1,'rgba(13,25,54,.97)');x.fillStyle=pg;rr(x,px,py,pw,ph,26);x.fill();noGlow(x);
  x.strokeStyle='rgba(255,255,255,.16)';x.lineWidth=2;rr(x,px,py,pw,ph,26);x.stroke();
  x.save();rr(x,px,py,pw,ph,26);x.clip();x.translate(0,lift+3*Math.sin(t*1.3));
  // top bar
  if(playLogo){const lh=44,lw=lh*playLogo.width/playLogo.height,k=spring(born(T,.05,.4));x.save();x.translate(px+36+lw/2,L.py+40);x.scale(k,k);x.drawImage(playLogo,-lw/2,-lh/2,lw,lh);x.restore();}
  [0,1].forEach(i=>{const k=born(T,.12+i*.05,.25),cx=px+pw-250+i*56,cy=L.py+40;x.save();x.globalAlpha*=k;x.fillStyle='rgba(255,255,255,.12)';x.beginPath();x.arc(cx,cy,22,0,TAU);x.fill();
    x.strokeStyle=C.w;x.lineWidth=3;if(i){x.beginPath();x.arc(cx-3,cy-3,8,0,TAU);x.stroke();x.beginPath();x.moveTo(cx+3,cy+3);x.lineTo(cx+9,cy+9);x.stroke();}else{x.beginPath();x.arc(cx,cy,8,Math.PI,TAU);x.lineTo(cx+9,cy+6);x.lineTo(cx-9,cy+6);x.closePath();x.stroke();}x.restore();});
  x.save();x.globalAlpha*=born(T,.2,.25);x.fillStyle='rgba(255,255,255,.12)';rr(x,px+pw-178,L.py+20,148,40,20);x.fill();x.fillStyle=C.w;x.beginPath();x.arc(px+pw-156,L.py+40,8,0,TAU);x.fill();x.fillStyle='rgba(255,255,255,.55)';rr(x,px+pw-138,L.py+35,88,10,5);x.fill();x.restore();
  // hero cards: stagger in with a short trail, lift and glow under the pointer
  L.cards.forEach((r,i)=>{
    const k=outBack(born(T,.1+i*.07,.4),1.25);if(k<=0)return;const hov=inside(r)&&T<3.2,h=hov?clamp((T-1.4)/.2):0;
    const drawCard=(off,alpha)=>{const X=r.x+par+off,Y=r.y-8*h,s=1+.045*h;x.save();x.globalAlpha*=alpha;x.translate(X+r.w/2,Y+r.h/2);x.scale(s,s);x.translate(-r.w/2,-r.h/2);
      glow(x,hov?'rgba(243,112,33,.55)':'rgba(0,0,0,.45)',hov?34:22);x.shadowOffsetY=hov?14:8;x.fillStyle='#0B1426';rr(x,0,0,r.w,r.h,16);x.fill();noGlow(x);
      showArt(x,0,0,r.w,r.h,SHOWS[i%SHOWS.length],t+i);
      const sh=x.createLinearGradient(0,r.h*.45,0,r.h);sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.75)');x.fillStyle=sh;rr(x,0,0,r.w,r.h,16);x.fill();
      x.fillStyle='rgba(0,0,0,.6)';rr(x,14,r.h-70,92,24,6);x.fill();x.fillStyle=C.o;rr(x,76,r.h-66,26,16,4);x.fill();
      x.fillStyle='rgba(255,255,255,.9)';rr(x,14,r.h-38,r.w*.62,12,6);x.fill();x.fillStyle='rgba(255,255,255,.5)';rr(x,14,r.h-20,r.w*.34,9,5);x.fill();
      if(h>0){x.strokeStyle='rgba(255,255,255,'+(.9*h)+')';x.lineWidth=4;rr(x,-2,-2,r.w+4,r.h+4,18);x.stroke();
        // play badge grows in the middle of the hovered card
        const b=outBack(h,2);x.fillStyle='rgba(243,112,33,.95)';x.beginPath();x.arc(r.w/2,r.h*.42,30*b,0,TAU);x.fill();x.fillStyle=C.w;x.beginPath();x.moveTo(r.w/2-9*b,r.h*.42-13*b);x.lineTo(r.w/2+14*b,r.h*.42);x.lineTo(r.w/2-9*b,r.h*.42+13*b);x.closePath();x.fill();}
      x.restore();};
    const trail=1-clamp(k);if(trail>.02)for(const [j,a] of [[3,.12],[2,.2],[1,.3]])drawCard(90*trail*j*.5,a);
    drawCard(90*trail*0,clamp(k));
  });
  // category tiles
  L.tiles.forEach((r,i)=>{
    const k=outBack(born(T,.25+i*.05,.32),1.5);if(k<=0)return;const [label,[a,b]]=CATS[i],hov=inside(r),on=hov||(clicked&&i===1);
    const h=on?clamp((T-(i===1?3.0:0))/.18):0,sc=(1+.1*h)*(1-.06*(i===1?press:0));
    x.save();x.translate(r.x+r.w/2+par*.6,r.y+r.h/2+(1-k)*30);x.scale(sc*k,sc*k);x.globalAlpha*=clamp(k);
    if(h>0){glow(x,'rgba(255,255,255,'+(.6*h)+')',26);}
    const tg=x.createLinearGradient(-r.w/2,-r.h/2,r.w/2,r.h/2);tg.addColorStop(0,a);tg.addColorStop(1,b);x.fillStyle=tg;rr(x,-r.w/2,-r.h/2,r.w,r.h,14);x.fill();noGlow(x);
    const hl=x.createLinearGradient(0,-r.h/2,0,0);hl.addColorStop(0,'rgba(255,255,255,.25)');hl.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=hl;rr(x,-r.w/2,-r.h/2,r.w,r.h/2,14);x.fill();
    x.font=(26+4*h)+'px MgBody';x.fillStyle=C.w;x.textAlign='center';x.textBaseline='middle';x.fillText(label,0,2);
    if(h>0){x.strokeStyle='rgba(255,255,255,'+h+')';x.lineWidth=4;rr(x,-r.w/2-5,-r.h/2-5,r.w+10,r.h+10,18);x.stroke();}
    x.restore();
  });
  x.restore();
  sweep(x,t,3.4,()=>rr(x,px,py,pw,ph,26),.25);
  x.restore();
  // the pointer and its click
  const ct=centre(L.tiles[1]);ripple(x,ct.x,ct.y,(T-3.38)/.5);ripple(x,ct.x,ct.y,(T-3.5)/.5,C.oL);
  if(T>.9&&T<4.4)pointer(x,cur.x,cur.y+lift,press);
}
function playDevices(x,t,at){
  x.fillStyle='rgba(255,255,255,.08)';rr(x,W*.06,H*(H>W?.82:.8),W*.88,14,7);x.fill();x.fillStyle='rgba(0,0,0,.25)';x.fillRect(W*.07,H*(H>W?.82:.8)+14,W*.86,10);
  const show=(X,Y,w,h,r)=>{x.save();rr(x,X,Y,w,h,r);x.clip();showArt(x,X,Y,w,h,'ball',t);
    if(playLogo){const lh=h*.14,lw=lh*playLogo.width/playLogo.height;x.globalAlpha*=.9;x.drawImage(playLogo,X+w-lw-h*.05,Y+h*.05,lw,lh);}
    sweep(x,t+.3,2.6,()=>rr(x,X,Y,w,h,r),.4);x.restore();};
  // each device rises on its own, with a little overshoot and a soft trail; the TV is the nearest layer
  const rise=(d,fn)=>{const k=spring(born(at,d,.55)),float=Math.sin(t*1.4+d*7)*3;x.save();x.translate(0,(1-k)*110+float);x.globalAlpha*=clamp(k*2);fn();x.restore();};
  // portrait: the TV on top, laptop and phone on the shelf below it
  const tall=H>W,shelf=tall?H*.82:H*.8;
  rise(0,()=>{const w=tall?W*.84:W*.46,h=w*.58,X=W*.08,Y=tall?H*.24:H*.8-h-60;glow(x,'rgba(0,0,0,.5)',40);x.fillStyle='#05080F';rr(x,X-10,Y-10,w+20,h+20,14);x.fill();noGlow(x);show(X,Y,w,h,6);
    x.fillStyle='#0A0E17';x.fillRect(X+w/2-10,Y+h+10,20,42);x.fillRect(X+w/2-90,Y+h+48,180,10);});
  rise(.15,()=>{const w=tall?W*.52:W*.27,h=w*.62,X=tall?W*.1:W*.58,Y=shelf-h-26;glow(x,'rgba(0,0,0,.45)',30);x.fillStyle='#1A2338';rr(x,X-10,Y-10,w+20,h+20,10);x.fill();noGlow(x);show(X,Y,w,h,4);
    x.fillStyle='#AEB8C7';x.beginPath();x.moveTo(X-40,Y+h+26);x.lineTo(X+w+40,Y+h+26);x.lineTo(X+w+18,Y+h+12);x.lineTo(X-18,Y+h+12);x.closePath();x.fill();});
  rise(.3,()=>{const w=86,h=170,X=tall?W*.82:W*.885,Y=shelf-h;glow(x,'rgba(0,0,0,.45)',24);x.fillStyle='#10192B';rr(x,X-w/2,Y,w,h,16);x.fill();noGlow(x);show(X-w/2+6,Y+8,w-12,h-16,10);});
  const hub={x:W*.5,y:H*.12};
  if(playLogo){const k=spring(born(at,.4,.5)),lh=64*k,lw=lh*playLogo.width/playLogo.height,breathe=1+.03*Math.sin(t*3);x.save();x.translate(hub.x,hub.y);x.scale(breathe,breathe);
    glow(x,'rgba(243,112,33,.6)',30);x.fillStyle='rgba(255,255,255,.96)';rr(x,-lw/2-22,-lh/2-14,lw+44,lh+28,22);x.fill();noGlow(x);x.drawImage(playLogo,-lw/2,-lh/2,lw,lh);x.restore();}
  (tall?[[W*.5,H*.26],[W*.36,H*.64],[W*.82,H*.7]]:[[W*.31,H*.3],[W*.715,H*.5],[W*.885,H*.6]]).forEach(([X,Y],i)=>{const k=outCubic(born(at,.55+i*.1,.45));if(k<=0)return;
    const mx=(hub.x+X)/2,my=hub.y+60,pt=s=>({x:(1-s)*(1-s)*hub.x+2*(1-s)*s*mx+s*s*X,y:(1-s)*(1-s)*(hub.y+44)+2*(1-s)*s*my+s*s*Y});
    x.save();x.strokeStyle='rgba(255,149,80,.85)';x.lineWidth=3;x.setLineDash([8,10]);x.lineDashOffset=-t*50;x.beginPath();for(let s=0;s<=k;s+=.02){const p=pt(s);x[s?'lineTo':'moveTo'](p.x,p.y);}x.stroke();x.setLineDash([]);
    if(k>=1){for(let j=0;j<2;j++){const p=pt((t*.8+i/3+j/2)%1);glow(x,C.o,14);x.fillStyle=C.w;x.beginPath();x.arc(p.x,p.y,6,0,TAU);x.fill();}
      const land=(at-.55-i*.1-.45)/.4;ripple(x,X,Y,land,C.oL);}
    x.restore();});
}
// Camera AI, 5 s loop: a person walks in, the FPT camera turns to follow, the AI frames them, the alert slides in,
// the person leaves and the scene returns to its start.
function personPath(ct){
  if(ct<.3)return null;
  if(ct<2)return {u:.72-.4*inOut((ct-.3)/1.7),walk:1};
  if(ct<3.7)return {u:.32,walk:0};
  if(ct<4.8)return {u:.32+.4*inOut((ct-3.7)/1.1),walk:1,fade:clamp((ct-4.5)/.3)};
  return null;
}
CLIPS.mg_camera_ai={title:'Camera AI FPT — nhận diện và cảnh báo, đồ họa động',draw(x,t){
  const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'#FF9A4D');g.addColorStop(.55,'#F37021');g.addColorStop(1,'#D9520E');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.save();x.strokeStyle='rgba(255,255,255,.12)';for(let i=0;i<5;i++){const p=(t/3+i/5)%1;x.globalAlpha=Math.sin(Math.PI*p);x.lineWidth=2+6*(1-p);x.beginPath();x.arc(W*.3,H*.55,90+p*480,0,TAU);x.stroke();}x.restore();
  soft(x,W*.3,H*.5,360,'rgba(255,230,200,.55)',1);
  const cyc=5,ct=t%cyc,enter=spring(born(t,0,.5)),who=personPath(ct);
  // the camera turns towards the person (smoothly, with a little lag)
  const aim=who?(.5-who.u)*-.9:0,pan=aim*(1-Math.exp(-6*clamp(ct)))+.03*Math.sin(t*1.3);
  const cam={x:W*.3,y:H*.47},tracking=who&&ct>.8&&ct<4.4;
  // glass chips at different depths around the camera
  [[W*.08,H*.18,'person',.2],[W*.47,H*.2,'cloud',.3],[W*.07,H*.78,'moon',.4]].forEach(([X,Y,kind,d],i)=>{const k=spring(born(t,d,.5));if(k<=0)return;const bob=6*Math.sin(t*1.6+i*2);
    x.save();x.translate(X,Y+bob);x.scale(k,k);glow(x,'rgba(120,40,0,.25)',20);x.fillStyle='rgba(255,255,255,.22)';rr(x,-38,-38,76,76,22);x.fill();noGlow(x);x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=2;rr(x,-38,-38,76,76,22);x.stroke();
    x.fillStyle=C.w;x.strokeStyle=C.w;x.lineWidth=5;x.lineCap='round';
    if(kind==='person'){x.beginPath();x.arc(0,-10,10,0,TAU);x.fill();x.beginPath();x.arc(0,22,20,Math.PI,TAU);x.fill();}
    else if(kind==='cloud'){x.beginPath();x.arc(-10,4,12,0,TAU);x.arc(6,-4,15,0,TAU);x.arc(18,6,10,0,TAU);x.fill();x.fillRect(-22,6,40,10);}
    else{x.beginPath();x.arc(0,0,17,0,TAU);x.fill();x.fillStyle='rgba(243,112,33,.95)';x.beginPath();x.arc(9,-7,15,0,TAU);x.fill();}
    x.restore();});
  // scan cone, brighter while it has a target
  x.save();x.translate(cam.x,cam.y);x.rotate(pan);const cone=x.createLinearGradient(0,0,560,0);cone.addColorStop(0,'rgba(255,255,255,'+(tracking?.55:.38)+')');cone.addColorStop(1,'rgba(255,255,255,0)');
  x.globalAlpha=clamp(t*2);x.fillStyle=cone;x.beginPath();x.moveTo(30,0);x.lineTo(560,-170);x.lineTo(560,170);x.closePath();x.fill();
  const sweepA=((t*.7)%1);x.strokeStyle='rgba(255,255,255,.5)';x.lineWidth=2;x.beginPath();x.moveTo(30,0);x.lineTo(560,lerp(-170,170,sweepA));x.stroke();x.restore();
  // bullet camera behind (far layer: drifts less)
  x.save();x.translate(W*.17+4*Math.sin(t*.7),H*.3+(1-enter)*-200);x.rotate(.18+pan*.25);x.globalAlpha=clamp(enter*2);
  glow(x,'rgba(120,40,0,.35)',24);x.fillStyle='#F4F6F9';rr(x,-20,-48,170,96,40);x.fill();noGlow(x);x.fillStyle='#0E1116';rr(x,118,-44,44,88,30);x.fill();
  x.fillStyle='#26303D';x.beginPath();x.arc(142,0,22,0,TAU);x.fill();x.fillStyle='rgba(120,180,255,.6)';x.beginPath();x.arc(136,-6,7,0,TAU);x.fill();
  x.fillStyle='#E3E7ED';rr(x,10,-90,40,50,8);x.fill();rr(x,-10,-110,80,24,8);x.fill();x.font='italic 26px MgWide';x.fillStyle=C.o;x.fillText('FPT',30,10);x.restore();
  // dome camera: base, head that follows the target
  x.save();x.translate(cam.x,H*.62+(1-enter)*240);x.globalAlpha=clamp(enter*2);
  shadowEllipse(x,0,170,150,22,.35);
  const base=x.createLinearGradient(-110,0,110,0);base.addColorStop(0,'#DDE2E9');base.addColorStop(.5,'#FFFFFF');base.addColorStop(1,'#C9D0DA');x.fillStyle=base;
  x.beginPath();x.moveTo(-110,40);x.bezierCurveTo(-118,120,-104,160,-90,166);x.lineTo(90,166);x.bezierCurveTo(104,160,118,120,110,40);x.closePath();x.fill();
  x.fillStyle='#B8C1CD';rr(x,-92,156,184,12,6);x.fill();x.font='italic 26px MgWide';x.fillStyle=C.o;x.textAlign='center';x.fillText('FPT',0,118);
  x.translate(0,-30);x.rotate(pan*.35);
  const head=x.createRadialGradient(-40,-60,10,0,0,140);head.addColorStop(0,'#FFFFFF');head.addColorStop(1,'#D3DAE3');glow(x,'rgba(120,40,0,.3)',30);x.fillStyle=head;x.beginPath();x.arc(0,0,128,0,TAU);x.fill();noGlow(x);
  const fx=18+pan*70,face=x.createLinearGradient(-60,-90,60,80);face.addColorStop(0,'#2B3442');face.addColorStop(1,'#07090D');x.fillStyle=face;x.beginPath();x.ellipse(fx,-4,82,92,0,0,TAU);x.fill();
  x.fillStyle='#141A22';x.beginPath();x.arc(fx+6,-6,40,0,TAU);x.fill();x.fillStyle='#0A0D12';x.beginPath();x.arc(fx+6,-6,26,0,TAU);x.fill();
  if(tracking){x.save();glow(x,'rgba(0,220,110,.9)',18);x.strokeStyle='rgba(43,210,127,.9)';x.lineWidth=3;x.beginPath();x.arc(fx+6,-6,30+3*Math.sin(t*10),0,TAU);x.stroke();x.restore();}
  x.fillStyle='rgba(110,170,255,.65)';x.beginPath();x.arc(fx-2,-14,9,0,TAU);x.fill();x.fillStyle='rgba(255,255,255,.8)';x.beginPath();x.arc(fx+18,4,4,0,TAU);x.fill();
  const led=wave(t,1.2)>.4;x.fillStyle=led?'#2BD27F':'#0E5F36';glow(x,'#2BD27F',led?12:0);x.beginPath();x.arc(-46+pan*50,60,6,0,TAU);x.fill();noGlow(x);
  x.fillStyle='rgba(255,255,255,.18)';x.beginPath();x.ellipse(-20+pan*60,-50,40,18,-.5,0,TAU);x.fill();
  x.restore();
  // data from the camera to the phone while tracking
  const ph={x:W*.74,y:H*.52},from={x:cam.x+90,y:cam.y-30},to={x:ph.x-150,y:ph.y-60};
  if(tracking){const k=clamp((ct-.8)/.3)*(1-clamp((ct-4.1)/.3));x.save();x.globalAlpha=k;x.setLineDash([6,9]);x.lineDashOffset=-t*60;x.strokeStyle='rgba(255,255,255,.75)';x.lineWidth=3;
    const mx=(from.x+to.x)/2,my=Math.min(from.y,to.y)-90;x.beginPath();x.moveTo(from.x,from.y);x.quadraticCurveTo(mx,my,to.x,to.y);x.stroke();x.setLineDash([]);
    for(let j=0;j<3;j++){const s=(t*1.1+j/3)%1,X=(1-s)*(1-s)*from.x+2*(1-s)*s*mx+s*s*to.x,Y=(1-s)*(1-s)*from.y+2*(1-s)*s*my+s*s*to.y;glow(x,'#2BD27F',12);x.fillStyle=C.w;rr(x,X-8,Y-4,16,8,4);x.fill();}x.restore();}
  // phone with the live view; it floats on the nearest layer
  const pk=spring(born(t,.12,.5));x.save();x.translate(-5*Math.sin(t*.7),(1-pk)*280+4*Math.sin(t*1.2));x.globalAlpha=clamp(pk*2);
  phone(x,ph.x,ph.y,1.95,s=>{
    x.fillStyle='#EEF2F7';x.fillRect(s.x,s.y,s.w,s.h);
    x.fillStyle=C.o;rr(x,s.x+14,s.y+40,34,34,10);x.fill();x.fillStyle='#C9D3E1';rr(x,s.x+58,s.y+46,110,10,5);x.fill();rr(x,s.x+58,s.y+62,70,8,4);x.fill();
    const vx=s.x+12,vy=s.y+92,vw=s.w-24,vh=s.h*.5;x.save();rr(x,vx,vy,vw,vh,14);x.clip();
    const room=x.createLinearGradient(0,vy,0,vy+vh);room.addColorStop(0,'#4A5568');room.addColorStop(1,'#2D3748');x.fillStyle=room;x.fillRect(vx,vy,vw,vh);
    x.fillStyle='#1E2633';x.fillRect(vx,vy+vh*.72,vw,vh*.28);x.fillStyle='#5E6B80';rr(x,vx+vw*.58,vy+vh*.14,vw*.3,vh*.58,4);x.fill();x.fillStyle='#3B4558';rr(x,vx+vw*.61,vy+vh*.18,vw*.24,vh*.54,3);x.fill();
    // a fine grid while the AI analyses
    x.strokeStyle='rgba(43,210,127,'+(tracking?.16:.06)+')';x.lineWidth=1;for(let gx=vx;gx<vx+vw;gx+=18){x.beginPath();x.moveTo(gx,vy);x.lineTo(gx,vy+vh);x.stroke();}for(let gy=vy;gy<vy+vh;gy+=18){x.beginPath();x.moveTo(vx,gy);x.lineTo(vx+vw,gy);x.stroke();}
    if(who){const pxp=vx+vw*who.u,pyp=vy+vh*.42,step=who.walk?Math.sin(ct*9)*3:Math.sin(t*2)*.6;x.save();x.globalAlpha*=1-(who.fade||0);
      x.fillStyle='#0F141C';x.beginPath();x.arc(pxp,pyp-vh*.17+step*.3,vh*.075,0,TAU);x.fill();rr(x,pxp-vh*.08,pyp-vh*.08,vh*.16,vh*.32,vh*.06);x.fill();rr(x,pxp-vh*.06,pyp+vh*.2,vh*.05,vh*.12+step,3);x.fill();rr(x,pxp+vh*.01,pyp+vh*.2,vh*.05,vh*.12-step,3);x.fill();
      if(tracking){const fk=clamp((ct-.8)/.25)*(1-clamp((ct-4.1)/.3)),bw=vh*.32,bh=vh*.62,bx=pxp-bw/2,by=pyp-vh*.28,m=12*(1-fk),arm=16;x.globalAlpha*=fk;
        x.strokeStyle=C.gL;x.lineWidth=4;x.lineCap='round';x.beginPath();for(const [X,dx] of [[bx-m,1],[bx+bw+m,-1]])for(const [Y,dy] of [[by-m,1],[by+bh+m,-1]]){x.moveTo(X+dx*arm,Y);x.lineTo(X,Y);x.lineTo(X,Y+dy*arm);}x.stroke();
        x.fillStyle=C.g;rr(x,bx-m,by-m-26,52,22,6);x.fill();x.font='15px MgHead';x.fillStyle=C.w;x.textAlign='left';x.textBaseline='middle';x.fillText('AI',bx-m+14,by-m-15);
        // a confidence bar that fills (no number)
        const conf=clamp((ct-.9)/.8);x.fillStyle='rgba(0,0,0,.45)';rr(x,bx-m,by+bh+m+8,bw+2*m,7,4);x.fill();x.fillStyle=C.gL;rr(x,bx-m,by+bh+m+8,(bw+2*m)*conf,7,4);x.fill();}
      x.restore();}
    x.fillStyle='rgba(0,0,0,.45)';rr(x,vx+10,vy+10,70,24,8);x.fill();x.fillStyle=wave(t,1)>.4?C.o:'#7a3a12';x.beginPath();x.arc(vx+24,vy+22,5,0,TAU);x.fill();x.fillStyle=C.w;x.font='14px MgHead';x.textAlign='left';x.textBaseline='middle';x.fillText('LIVE',vx+34,vy+23);
    const sy=vy+vh*((t%2)/2);x.fillStyle='rgba(43,210,127,.35)';x.fillRect(vx,sy,vw,3);
    x.restore();
    for(let i=0;i<4;i++){const cx=s.x+s.w*(.17+.22*i),cy=vy+vh+44,hot=i===0&&tracking;x.fillStyle=hot?C.o:'#FFFFFF';x.beginPath();x.arc(cx,cy,22+(hot?2*Math.sin(t*8):0),0,TAU);x.fill();x.fillStyle=hot?C.w:[C.o,C.b,C.g,'#8A98AE'][i];x.beginPath();x.arc(cx,cy,8,0,TAU);x.fill();}
    x.fillStyle='#D5DDE8';rr(x,s.x+14,vy+vh+86,s.w-28,12,6);x.fill();rr(x,s.x+14,vy+vh+106,s.w*.6,12,6);x.fill();
  });x.restore();
  // alert card: springs down, the bell rings, then it slides back up before the loop ends
  const ak=clamp((ct-1.3)/.4),out=clamp((ct-3.9)/.35);if(ak>0&&out<1){const k=outBack(ak,1.5),X=W*.44,Y=H*.08+(1-k)*-130-out*130;x.save();x.globalAlpha=(1-inOut(out))*clamp(ak*2);
    glow(x,'rgba(110,40,0,.35)',30);x.shadowOffsetY=10;x.fillStyle='rgba(255,255,255,.97)';rr(x,X,Y,300,92,22);x.fill();noGlow(x);
    const ring=Math.sin((ct-1.3)*28)*Math.exp(-(ct-1.3)*2.5)*.35;x.save();x.translate(X+46,Y+46);x.fillStyle=C.o;x.beginPath();x.arc(0,0,26,0,TAU);x.fill();x.rotate(ring);x.fillStyle=C.w;
    x.beginPath();x.moveTo(0,-18);x.bezierCurveTo(14,-16,14,-2,14,8);x.lineTo(-14,8);x.bezierCurveTo(-14,-2,-14,-16,0,-18);x.fill();x.beginPath();x.arc(0,14,5,0,TAU);x.fill();x.restore();
    x.fillStyle='#0B1F3F';rr(x,X+86,Y+30,170*outCubic(clamp((ct-1.45)/.3)),13,6);x.fill();x.fillStyle='#B8C3D3';rr(x,X+86,Y+54,120*outCubic(clamp((ct-1.55)/.3)),10,5);x.fill();x.restore();}
  const sk=clamp((ct-1.9)/.35),so=clamp((ct-3.9)/.3);if(sk>0&&so<1){x.save();x.globalAlpha=1-so;badge(x,W*.53,H*.82,46,(X,Y)=>shield(x,X,Y,52,C.g,clamp((ct-2.1)/.3)),sk);x.restore();}
  dust(x,t,'rgba(255,255,255,.5)',18,8);vignette(x,.3);
}};

// A content thumbnail drawn as a small illustration (no real posters).
function showArt(x,X,Y,w,h,kind,t){
  x.save();rr(x,X,Y,w,h,Math.min(14,h*.12));x.clip();
  if(kind==='ball'){const g=x.createLinearGradient(0,Y,0,Y+h);g.addColorStop(0,'#1DA35A');g.addColorStop(1,'#0B7A3E');x.fillStyle=g;x.fillRect(X,Y,w,h);
    x.fillStyle='rgba(255,255,255,.08)';for(let i=0;i<6;i++)if(i%2)x.fillRect(X+i*w/6,Y,w/6,h);
    x.strokeStyle='rgba(255,255,255,.75)';x.lineWidth=Math.max(2,w/160);x.strokeRect(X+w*.06,Y+h*.1,w*.88,h*.8);x.beginPath();x.moveTo(X+w/2,Y+h*.1);x.lineTo(X+w/2,Y+h*.9);x.stroke();x.beginPath();x.arc(X+w/2,Y+h/2,h*.16,0,TAU);x.stroke();
    const bx=X+w*(.5+.32*Math.sin(t*1.7)),by=Y+h*(.5+.25*Math.sin(t*2.3));x.fillStyle=C.w;x.beginPath();x.arc(bx,by,h*.045,0,TAU);x.fill();
    for(let i=0;i<6;i++){const px=X+w*(.2+.12*i)+8*Math.sin(t*2+i),py=Y+h*(.3+.4*((i*37)%10)/10);x.fillStyle=i%2?C.o:'#1F5FD1';x.beginPath();x.arc(px,py,h*.035,0,TAU);x.fill();}}
  else if(kind==='toon'){const g=x.createLinearGradient(X,Y,X+w,Y+h);g.addColorStop(0,'#FFC23D');g.addColorStop(1,'#F37021');x.fillStyle=g;x.fillRect(X,Y,w,h);
    [[.3,.62,.2,C.g],[.55,.55,.24,C.b],[.78,.66,.17,'#FFFFFF']].forEach(([u,v,r,c],i)=>{const bob=Math.sin(t*3+i)*h*.03;x.fillStyle=c;x.beginPath();x.arc(X+w*u,Y+h*v+bob,h*r,0,TAU);x.fill();x.fillStyle='#0B1F3F';x.beginPath();x.arc(X+w*u-h*r*.3,Y+h*v+bob-h*r*.15,h*r*.12,0,TAU);x.arc(X+w*u+h*r*.3,Y+h*v+bob-h*r*.15,h*r*.12,0,TAU);x.fill();});
    x.fillStyle='rgba(255,255,255,.85)';x.beginPath();x.arc(X+w*.82,Y+h*.22,h*.1,0,TAU);x.fill();}
  else if(kind==='drama'){const g=x.createLinearGradient(0,Y,0,Y+h);g.addColorStop(0,'#3B2A4F');g.addColorStop(1,'#7A4A3A');x.fillStyle=g;x.fillRect(X,Y,w,h);
    soft(x,X+w*.7,Y+h*.35,h*.6,'rgba(255,190,120,.7)',1);x.fillStyle='#160E1E';
    for(const [u,s] of [[.35,1],[.6,.85]]){x.beginPath();x.arc(X+w*u,Y+h*(.45),h*.13*s,0,TAU);x.fill();rr(x,X+w*u-h*.17*s,Y+h*.58,h*.34*s,h*.5,h*.12);x.fill();}}
  else if(kind==='music'){const g=x.createLinearGradient(X,Y,X+w,Y);g.addColorStop(0,'#1B6FC0');g.addColorStop(1,'#00A651');x.fillStyle=g;x.fillRect(X,Y,w,h);
    for(let i=0;i<14;i++){const bh=h*(.15+.55*wave(t*1.6,1,i/14));x.fillStyle='rgba(255,255,255,.8)';rr(x,X+w*.08+i*w*.062,Y+h*.85-bh,w*.035,bh,3);x.fill();}}
  else{const g=x.createLinearGradient(0,Y,0,Y+h);g.addColorStop(0,'#7CC4F5');g.addColorStop(1,'#B6F2D2');x.fillStyle=g;x.fillRect(X,Y,w,h);
    x.fillStyle='#FFFFFF';for(let i=0;i<3;i++){const cx=X+w*(.25+.25*i)+((t*20+i*50)%40)-20;x.beginPath();x.arc(cx,Y+h*.3,h*.08,0,TAU);x.arc(cx+h*.09,Y+h*.27,h*.1,0,TAU);x.arc(cx+h*.2,Y+h*.3,h*.08,0,TAU);x.fill();}
    x.fillStyle=C.o;x.beginPath();x.moveTo(X+w*.5,Y+h*.45);x.lineTo(X+w*.62,Y+h*.85);x.lineTo(X+w*.38,Y+h*.85);x.closePath();x.fill();x.fillStyle=C.g;x.fillRect(X,Y+h*.85,w,h*.15);}
  x.restore();
}

// 6. Speed: a large speedometer sweeps into the top zone while light streaks of fibre rush past.
CLIPS.mg_speed_gauge={title:'Tốc độ cao — đồ họa động',draw(x,t){
  deep(x,t,{tint:'#0A5DB0',accent:C.o,grid:false});
  // fibre streaks
  x.save();x.lineCap='round';for(let i=0;i<34;i++){const r=((i*577)%1000)/1000,sp=.6+r*1.2,k=((t*sp*.5+r)%1),Y=H*(.08+.84*((i*0.618)%1)),len=80+r*220,X=-len+(W+2*len)*k;
    x.globalAlpha=.25+.6*Math.sin(Math.PI*k);glow(x,i%3?C.sky:C.o,12);x.strokeStyle=i%3?(i%2?C.w:C.sky):C.oL;x.lineWidth=2+3*r;x.beginPath();x.moveTo(X,Y);x.lineTo(X+len,Y);x.stroke();}x.restore();noGlow(x);
  const cx=W/2,cy=H*.66,R=270,enter=spring(born(t,0,.4));
  x.save();x.translate(cx,cy);x.scale(enter,enter);x.translate(-cx,-cy);
  // dial
  x.fillStyle='rgba(6,16,36,.75)';x.beginPath();x.arc(cx,cy,R+34,Math.PI,TAU);x.lineTo(cx+R+34,cy+40);x.lineTo(cx-R-34,cy+40);x.closePath();x.fill();
  x.lineCap='round';x.lineWidth=30;x.strokeStyle='rgba(255,255,255,.08)';x.beginPath();x.arc(cx,cy,R,Math.PI,TAU);x.stroke();
  // needle value: sweeps up with overshoot, then breathes in the top zone, repeating
  const cyc=5,ct=t%cyc,val=t<cyc?.03+.92*outBack(born(t,.1,.8),1.3):.86+.08*Math.sin(TAU*ct/cyc)+.04*Math.sin(t*9);
  [[0,.4,C.b],[.4,.72,C.g],[.72,1,C.o]].forEach(([a,b,color])=>{const e=Math.min(b,val);if(e<=a)return;glow(x,color,18);x.strokeStyle=color;x.beginPath();x.arc(cx,cy,R,Math.PI*(1+a)+.01,Math.PI*(1+e)-.01);x.stroke();});noGlow(x);
  for(let i=0;i<=40;i++){const a=Math.PI*(1+i/40),big=i%5===0,r1=R-38,r2=R-(big?70:54);x.strokeStyle=i/40<=val?C.w:'rgba(255,255,255,.3)';x.lineWidth=big?5:2.5;x.beginPath();x.moveTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);x.lineTo(cx+Math.cos(a)*r2,cy+Math.sin(a)*r2);x.stroke();}
  const a=Math.PI*(1+clamp(val,0,1.03));glow(x,'rgba(243,112,33,.9)',20);x.strokeStyle=C.o;x.lineWidth=12;x.beginPath();x.moveTo(cx-Math.cos(a)*30,cy-Math.sin(a)*30);x.lineTo(cx+Math.cos(a)*(R-60),cy+Math.sin(a)*(R-60));x.stroke();noGlow(x);
  x.fillStyle=C.w;x.beginPath();x.arc(cx,cy,26,0,TAU);x.fill();x.fillStyle=C.o;x.beginPath();x.arc(cx,cy,12,0,TAU);x.fill();
  x.restore();
  // download arrows racing upward on both sides
  for(const side of [-1,1])for(let i=0;i<3;i++){const p=(t*1.2+i/3)%1,X=cx+side*(R+150),Y=H*.78-p*260;x.save();x.globalAlpha=Math.sin(Math.PI*p)*clamp(t*2);x.fillStyle=i%2?C.oL:C.w;x.beginPath();x.moveTo(X,Y-28);x.lineTo(X+26,Y);x.lineTo(X+10,Y);x.lineTo(X+10,Y+24);x.lineTo(X-10,Y+24);x.lineTo(X-10,Y);x.lineTo(X-26,Y);x.closePath();x.fill();x.restore();}
  dust(x,t,'rgba(255,255,255,.5)',20,5);vignette(x,.45);
}};
// 7. Lag: a video freezes, the spinner turns, the progress bar is stuck, latency bars jump; glitch slices.
CLIPS.mg_lag_buffer={title:'Mạng giật lag, quay vòng — đồ họa động',draw(x,t){
  gloom(x,t);
  const tall=H>W,px=tall?W*.06:W*.14,py=tall?H*.2:H*.12,pw=tall?W*.88:W*.72,ph=pw*9/16*.86,enter=spring(born(t,0,.4));
  x.save();x.translate(0,(1-enter)*60);x.globalAlpha=clamp(enter*2);
  glow(x,'rgba(0,0,0,.6)',40);x.fillStyle='#0A111F';rr(x,px-10,py-10,pw+20,ph+60,18);x.fill();noGlow(x);
  // frozen frame: a simple dim landscape (sky, hills, sun)
  x.save();rr(x,px,py,pw,ph,10);x.clip();
  const sky=x.createLinearGradient(0,py,0,py+ph);sky.addColorStop(0,'#5F7896');sky.addColorStop(1,'#A9B5C4');x.fillStyle=sky;x.fillRect(px,py,pw,ph);
  x.fillStyle='rgba(255,220,180,.65)';x.beginPath();x.arc(px+pw*.72,py+ph*.32,46,0,TAU);x.fill();
  x.fillStyle='#4E6177';x.beginPath();x.moveTo(px,py+ph*.75);x.quadraticCurveTo(px+pw*.25,py+ph*.5,px+pw*.5,py+ph*.72);x.quadraticCurveTo(px+pw*.75,py+ph*.55,px+pw,py+ph*.7);x.lineTo(px+pw,py+ph);x.lineTo(px,py+ph);x.closePath();x.fill();
  x.fillStyle='#3A4A5E';x.beginPath();x.moveTo(px,py+ph*.88);x.quadraticCurveTo(px+pw*.4,py+ph*.7,px+pw,py+ph*.9);x.lineTo(px+pw,py+ph);x.lineTo(px,py+ph);x.closePath();x.fill();
  // glitch slices now and then
  const gl=Math.floor(t*12)%17<2;if(gl){for(let i=0;i<5;i++){const sy=py+((i*97+Math.floor(t*12)*31)%Math.floor(ph)),sh=8+(i*13)%22,dx=((i*53)%40)-20;x.drawImage(x.canvas,px,sy,pw,sh,px+dx,sy,pw,sh);}x.fillStyle='rgba(243,112,33,.18)';x.fillRect(px,py+ph*.4,pw,6);}
  x.fillStyle='rgba(11,20,38,.45)';x.fillRect(px,py,pw,ph);
  // spinner
  const sc=px+pw/2,sy=py+ph/2;for(let i=0;i<12;i++){const a=i/12*TAU+Math.floor(t*12)/12*TAU;x.globalAlpha=.15+.85*((i)/12);x.fillStyle=C.w;x.save();x.translate(sc+Math.cos(a)*46,sy+Math.sin(a)*46);x.rotate(a);rr(x,-12,-5,24,10,5);x.fill();x.restore();}x.globalAlpha=1;
  x.restore();
  // controls: stuck progress bar with a buffering stripe
  const by=py+ph+26;x.fillStyle='rgba(255,255,255,.15)';rr(x,px+60,by-4,pw-120,8,4);x.fill();x.fillStyle=C.o;rr(x,px+60,by-4,(pw-120)*.31,8,4);x.fill();
  x.save();rr(x,px+60+(pw-120)*.31,by-4,(pw-120)*.12,8,4);x.clip();for(let i=-2;i<10;i++){x.fillStyle='rgba(255,255,255,.35)';x.fillRect(px+60+(pw-120)*.31+i*14+(t*40)%14,by-4,6,8);}x.restore();
  x.fillStyle=C.w;x.beginPath();x.arc(px+60+(pw-120)*.31,by,10,0,TAU);x.fill();
  x.fillStyle='rgba(255,255,255,.85)';x.fillRect(px+22,by-10,6,20);x.fillRect(px+34,by-10,6,20);
  x.restore();
  // latency bars jumping on the right
  const lx=tall?W*.5:W*.9,ly=tall?H*.66:H*.62;x.fillStyle='rgba(11,31,63,.8)';rr(x,lx-48,ly-150,96,170,16);x.fill();
  for(let i=0;i<4;i++){const hgt=20+110*Math.abs(Math.sin(t*(3+i)+i*1.7));x.fillStyle=hgt>90?C.o:C.grey;rr(x,lx-36+i*20,ly+6-hgt,14,hgt,4);x.fill();}
  // a controller that shakes when the picture freezes
  const shake=gl?6:1.5;x.save();x.translate((tall?W*.5:W*.075)+Math.sin(t*40)*shake,(tall?H*.82:H*.86)+Math.cos(t*33)*shake);x.scale(tall?1.6:.9,tall?1.6:.9);x.fillStyle='#E9EEF5';x.beginPath();x.ellipse(-30,0,40,30,0,0,TAU);x.ellipse(30,0,40,30,0,0,TAU);x.fill();x.fillRect(-30,-30,60,50);
  x.fillStyle=C.n;x.fillRect(-48,-6,24,8);x.fillRect(-40,-14,8,24);x.fillStyle=C.o;x.beginPath();x.arc(36,-8,6,0,TAU);x.fill();x.fillStyle=C.b;x.beginPath();x.arc(50,4,6,0,TAU);x.fill();x.restore();
  vignette(x,.6);
}};
// A living camera on every clip: a slow push and drift, small enough that the edges never show.
function drawFrame(clip,x,t){
  const z=1.035+.018*Math.sin(TAU*t/DUR),dx=7*Math.sin(TAU*t/DUR+.6),dy=2.5*Math.cos(TAU*t/DUR),r=.0025*Math.sin(TAU*t/DUR+1.2);
  x.save();x.translate(W/2+dx,H/2+dy);x.rotate(r);x.scale(z,z);x.translate(-W/2,-H/2);clip.draw(x,t);x.restore();
}
// ---- render ------------------------------------------------------------------------------------------------
function setPortrait(on){W=on?PORTRAIT.w:1280;H=on?PORTRAIT.h:720;OUT=on?PORTRAIT.scale:1;}
const portraitName=name=>name+'_portrait';
async function render(name,portrait=false){
  setPortrait(portrait);
  const PW=Math.round(W*OUT),PH=Math.round(H*OUT),clip=CLIPS[name],out=path.join(LIB,(portrait?portraitName(name):name)+'.mp4'),canvas=createCanvas(PW,PH),x=canvas.getContext('2d');
  const child=spawn(P.ffmpeg,['-y','-v','error','-f','rawvideo','-pix_fmt','rgba','-s',PW+'x'+PH,'-r',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',out],{stdio:['pipe','inherit','inherit'],windowsHide:true});
  const closed=new Promise((res,rej)=>{child.once('error',rej);child.once('close',c=>c===0?res():rej(Error('FFmpeg '+c)));});
  for(let f=0;f<DUR*FPS;f++){
    x.setTransform(OUT,0,0,OUT,0,0);x.globalAlpha=1;noGlow(x);x.setLineDash([]);drawFrame(clip,x,f/FPS);
    if(!child.stdin.write(Buffer.from(x.getImageData(0,0,PW,PH).data.buffer)))await new Promise(r=>child.stdin.once('drain',r));
  }
  child.stdin.end();await closed;
  if(portrait){console.log(portraitName(name),(fs.statSync(out).size/1024).toFixed(0)+' KB');setPortrait(false);return;}
  execFileSync(P.ffmpeg,['-y','-v','error','-ss','3','-i',out,'-frames:v','1','-update','1','-vf','scale=480:-2',path.join(LIB,name+'.jpg')]);
  const file=path.join(LIB,'sources.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
  manifest[name+'.mp4']={status:'brand_motion_graphic',title:clip.title,generator:'scripts/assets/generate_motion_graphics.js',fileSize:fs.statSync(out).size};
  fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
  console.log(name,(fs.statSync(out).size/1024).toFixed(0)+' KB');
}
async function loadAssets(){playLogo=await loadImage(path.join(P.assets,'brand','fptplay-logo.png'));}
if(require.main===module)(async()=>{
  playLogo=await loadImage(path.join(P.assets,'brand','fptplay-logo.png'));
  const args=process.argv.slice(2),portrait=args.includes('--portrait'),names=args.filter(a=>a!=='--portrait').length?args.filter(a=>a!=='--portrait'):Object.keys(CLIPS);
  // --portrait renders only the 1080×1920 versions; without it, the 16:9 clips and then their portrait versions.
  for(const name of names){if(!CLIPS[name])throw Error('Không có clip '+name);if(!portrait)await render(name);await render(name,true);}
})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={CLIPS,loadAssets,drawFrame,setPortrait,PORTRAIT,get W(){return W;},get H(){return H;}};
