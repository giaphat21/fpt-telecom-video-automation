'use strict';
// Motion-graphic B-roll drawn in code: Wi-Fi 6 modem, 4G/5G signal, walls that block Wi-Fi, Mesh coverage, FPT Play,
// speed and lag. Vector drawing in FPT colours only. No prices, speeds, percentages or other claims are drawn; the only
// words are product names (Wi-Fi 6, 4G, 5G, FPT Play). Each clip is 10 s; after a short entrance everything moves in
// cycles, so a clip that is looped for a long spoken section has no visible seam beyond the entrance.
// Usage: node scripts/assets/generate_motion_graphics.js [name ...]   (no names: all clips)
const fs=require('fs'),path=require('path'),{spawn,execFileSync}=require('child_process');
const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const P=require('../../config/paths');
const W=1280,H=720,FPS=30,DUR=10,LIB=path.join(P.assets,'broll-library'),TAU=Math.PI*2;
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
// 5. FPT Play: a TV in a living room, the interface tiles cascade in, the focus moves, the FPT Play mark pops.
CLIPS.mg_fptplay={title:'FPT Play trên TV — đồ họa động',draw(x,t){
  // room: warm wall, blue cabinet
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#24456F');g.addColorStop(1,'#132946');x.fillStyle=g;x.fillRect(0,0,W,H);
  soft(x,W*.5,H*.42,620,'rgba(243,112,33,.25)',.6+.2*wave(t,4));
  x.fillStyle='#E8EDF3';x.fillRect(0,H*.86,W,H*.14);x.fillStyle='#C7D0DB';for(let i=0;i<12;i++)x.fillRect(i*W/12,H*.88,2,H*.12);
  x.fillStyle='#1B2233';x.fillRect(0,H*.83,W,H*.04);
  const enter=spring(born(t,0,.4)),tw=W*.74,th=tw*9/16*.88,tx=(W-tw)/2,ty=H*.06+(1-enter)*40;
  glow(x,'rgba(243,112,33,.35)',60);x.fillStyle='#05080F';rr(x,tx-12,ty-12,tw+24,th+24,18);x.fill();noGlow(x);
  x.save();rr(x,tx,ty,tw,th,8);x.clip();x.fillStyle='#0C111C';x.fillRect(tx,ty,tw,th);
  // nav bar: logo at the left, pills to the right
  const logoK=spring(born(t,.08,.4));if(playLogo&&logoK>0){const lh=58,lw=lh*playLogo.width/playLogo.height;x.save();x.translate(tx+28+lw/2,ty+38);x.scale(logoK,logoK);x.drawImage(playLogo,-lw/2,-lh/2,lw,lh);x.restore();}
  {let nx=tx+250;x.font='22px MgBody';['Trang chủ','Truyền hình','Phim','Thể thao'].forEach((label,i)=>{const k=born(t,.12+i*.05,.25),lw=x.measureText(label).width;x.save();x.globalAlpha=k;x.fillStyle=i===0?C.w:'rgba(255,255,255,.7)';x.textBaseline='middle';x.fillText(label,nx,ty+36+(1-k)*10);if(i===0){x.fillStyle=C.o;rr(x,nx,ty+54,lw,4,2);x.fill();}x.restore();nx+=lw+44;});}
  // tiles
  const cols=5,rows=3,gap=14,pw=(tw-60-gap*(cols-1))/cols,ph=(th-120-gap*(rows-1))/rows*.94;
  const palette=[['#FF8A4C','#F37021'],['#3AA0F0','#0066B3'],['#2BD27F','#00A651'],['#FFB27A','#F37021'],['#5AB4FF','#1B6FC0'],['#7DE2A8','#0E9A57']];
  const glyphs=['play','ball','note','film','star','tv'];
  let focus=Math.floor(((t-.7)/.7)%(cols*rows));if(t<.7)focus=-1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const i=r*cols+c,k=outBack(born(t,.1+i*.025,.3),1.4);if(k<=0)continue;
    const X=tx+30+c*(pw+gap),Y=ty+92+r*(ph+gap)+(1-k)*30,[a,b]=palette[(i*5)%palette.length];
    x.save();x.globalAlpha=clamp(k);const sc=i===focus?1.08:1;x.translate(X+pw/2,Y+ph/2);x.scale(sc,sc);x.translate(-pw/2,-ph/2);
    const tg=x.createLinearGradient(0,0,pw,ph);tg.addColorStop(0,a);tg.addColorStop(1,b);x.fillStyle=tg;rr(x,0,0,pw,ph,14);x.fill();
    const hl=x.createLinearGradient(0,0,0,ph*.5);hl.addColorStop(0,'rgba(255,255,255,.28)');hl.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=hl;rr(x,0,0,pw,ph*.5,14);x.fill();
    tileGlyph(x,glyphs[i%glyphs.length],pw/2,ph/2,Math.min(pw,ph)*.34);
    if(i===focus){x.strokeStyle=C.w;x.lineWidth=5;glow(x,'rgba(255,255,255,.8)',16);rr(x,-4,-4,pw+8,ph+8,17);x.stroke();noGlow(x);}
    x.restore();
  }
  x.restore();
  sweep(x,t,3.5,()=>rr(x,tx,ty,tw,th,8),.2);
  // stand and box
  x.fillStyle='#0A0E17';x.fillRect(W/2-14,ty+th+12,28,H*.83-(ty+th+12));x.fillRect(W/2-120,H*.83-8,240,8);
  x.fillStyle='#B8C2CF';rr(x,W*.68,H*.83-22,110,20,6);x.fill();x.fillStyle=C.sky;x.globalAlpha=wave(t,1.5);x.fillRect(W*.68+14,H*.83-14,30,3);x.globalAlpha=1;
  // big play button pulse
  const pk=born(t,1.3,.4);if(pk>0&&playLogo){const s=.9+.1*wave(t,1.2),lw=230*s,lh=lw*playLogo.height/playLogo.width;x.save();x.globalAlpha=.95*pk*(1-born(t,3.2,.4));x.translate(W/2,ty+th/2+10);x.scale(spring(pk*1.6),spring(pk*1.6));
    glow(x,'rgba(0,0,0,.5)',30);x.fillStyle='rgba(255,255,255,.95)';rr(x,-lw/2-34,-lh/2-30,lw+68,lh+60,36);x.fill();noGlow(x);x.drawImage(playLogo,-lw/2,-lh/2,lw,lh);x.restore();}
  vignette(x,.4);
}};
function tileGlyph(x,kind,cx,cy,s){
  x.save();x.fillStyle='rgba(255,255,255,.95)';x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=s*.14;x.lineCap=x.lineJoin='round';
  if(kind==='play'){x.beginPath();x.moveTo(cx-s*.35,cy-s*.5);x.lineTo(cx+s*.55,cy);x.lineTo(cx-s*.35,cy+s*.5);x.closePath();x.fill();}
  else if(kind==='ball'){x.beginPath();x.arc(cx,cy,s*.55,0,TAU);x.stroke();x.beginPath();for(let i=0;i<5;i++){const a=-Math.PI/2+i*TAU/5;x[i?'lineTo':'moveTo'](cx+Math.cos(a)*s*.22,cy+Math.sin(a)*s*.22);}x.closePath();x.fill();}
  else if(kind==='note'){x.beginPath();x.arc(cx-s*.25,cy+s*.35,s*.18,0,TAU);x.fill();x.fillRect(cx-s*.12,cy-s*.5,s*.1,s*.85);x.beginPath();x.moveTo(cx-s*.08,cy-s*.5);x.quadraticCurveTo(cx+s*.4,cy-s*.4,cx+s*.3,cy-s*.05);x.stroke();}
  else if(kind==='film'){rr(x,cx-s*.55,cy-s*.4,s*1.1,s*.8,s*.1);x.stroke();for(let i=0;i<4;i++){x.fillRect(cx-s*.45+i*s*.27,cy-s*.3,s*.12,s*.1);x.fillRect(cx-s*.45+i*s*.27,cy+s*.2,s*.12,s*.1);}}
  else if(kind==='star'){x.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?s*.24:s*.55;x[i?'lineTo':'moveTo'](cx+Math.cos(a)*r,cy+Math.sin(a)*r);}x.closePath();x.fill();}
  else{rr(x,cx-s*.55,cy-s*.4,s*1.1,s*.72,s*.08);x.stroke();x.fillRect(cx-s*.25,cy+s*.45,s*.5,s*.08);}
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
  const px=W*.14,py=H*.12,pw=W*.72,ph=pw*9/16*.86,enter=spring(born(t,0,.4));
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
  const lx=W*.9,ly=H*.62;x.fillStyle='rgba(11,31,63,.8)';rr(x,lx-48,ly-150,96,170,16);x.fill();
  for(let i=0;i<4;i++){const hgt=20+110*Math.abs(Math.sin(t*(3+i)+i*1.7));x.fillStyle=hgt>90?C.o:C.grey;rr(x,lx-36+i*20,ly+6-hgt,14,hgt,4);x.fill();}
  // a controller that shakes when the picture freezes
  const shake=gl?6:1.5;x.save();x.translate(W*.075+Math.sin(t*40)*shake,H*.86+Math.cos(t*33)*shake);x.scale(.9,.9);x.fillStyle='#E9EEF5';x.beginPath();x.ellipse(-30,0,40,30,0,0,TAU);x.ellipse(30,0,40,30,0,0,TAU);x.fill();x.fillRect(-30,-30,60,50);
  x.fillStyle=C.n;x.fillRect(-48,-6,24,8);x.fillRect(-40,-14,8,24);x.fillStyle=C.o;x.beginPath();x.arc(36,-8,6,0,TAU);x.fill();x.fillStyle=C.b;x.beginPath();x.arc(50,4,6,0,TAU);x.fill();x.restore();
  vignette(x,.6);
}};
// ---- render ------------------------------------------------------------------------------------------------
async function render(name){
  const clip=CLIPS[name],out=path.join(LIB,name+'.mp4'),canvas=createCanvas(W,H),x=canvas.getContext('2d');
  const child=spawn(P.ffmpeg,['-y','-v','error','-f','rawvideo','-pix_fmt','rgba','-s',W+'x'+H,'-r',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',out],{stdio:['pipe','inherit','inherit'],windowsHide:true});
  const closed=new Promise((res,rej)=>{child.once('error',rej);child.once('close',c=>c===0?res():rej(Error('FFmpeg '+c)));});
  for(let f=0;f<DUR*FPS;f++){
    x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;noGlow(x);x.setLineDash([]);clip.draw(x,f/FPS);
    if(!child.stdin.write(Buffer.from(x.getImageData(0,0,W,H).data.buffer)))await new Promise(r=>child.stdin.once('drain',r));
  }
  child.stdin.end();await closed;
  execFileSync(P.ffmpeg,['-y','-v','error','-ss','3','-i',out,'-frames:v','1','-update','1','-vf','scale=480:-2',path.join(LIB,name+'.jpg')]);
  const file=path.join(LIB,'sources.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
  manifest[name+'.mp4']={status:'brand_motion_graphic',title:clip.title,generator:'scripts/assets/generate_motion_graphics.js',fileSize:fs.statSync(out).size};
  fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
  console.log(name,(fs.statSync(out).size/1024).toFixed(0)+' KB');
}
async function loadAssets(){playLogo=await loadImage(path.join(P.assets,'brand','fptplay-logo.png'));}
if(require.main===module)(async()=>{
  playLogo=await loadImage(path.join(P.assets,'brand','fptplay-logo.png'));
  const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(CLIPS);
  for(const name of names){if(!CLIPS[name])throw Error('Không có clip '+name);await render(name);}
})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={CLIPS,loadAssets,W,H};
