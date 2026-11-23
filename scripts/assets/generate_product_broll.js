'use strict';
// Motion B-roll made from the FPT product photos already supplied with the project. Adds movement only:
// no prices, speeds, percentages or other claims are drawn. Replace by assigning a real clip to the topic in Studio.
const fs=require('fs'),path=require('path'),{spawn,execFileSync}=require('child_process');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const P=require('../../config/paths');
const W=1280,H=720,FPS=30,SECONDS=6,LIB=path.join(P.assets,'broll-library');
const O='#F37021',B='#0066B3',G='#00A651',N='#0B1F3F',TAU=Math.PI*2;
function backdrop(x,t,a,b){
  const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,a);g.addColorStop(1,b);x.fillStyle=g;x.fillRect(0,0,W,H);
  for(let i=0;i<5;i++){
    const p=(t/SECONDS+i/5)%1,r=160+i*50,cx=W*(.1+.2*i)+Math.sin(TAU*(t/SECONDS)+i)*70,cy=H*(.3+.12*(i%4))+Math.cos(TAU*(t/SECONDS)+i*2)*50;
    const c=x.createRadialGradient(cx,cy,0,cx,cy,r);c.addColorStop(0,i%2?'rgba(243,112,33,.20)':'rgba(90,190,255,.20)');c.addColorStop(1,'rgba(0,0,0,0)');
    x.globalAlpha=.6+.4*Math.sin(Math.PI*p);x.fillStyle=c;x.fillRect(0,0,W,H);
  }
  x.globalAlpha=1;
}
function sweep(x,t,box){
  const p=(t%2)/2;if(p>.45)return;const k=p/.45,px=box.x-160+(box.w+320)*k;
  x.save();x.beginPath();x.rect(box.x,box.y,box.w,box.h);x.clip();
  const g=x.createLinearGradient(px-90,0,px+90,60);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(box.x,box.y,box.w,box.h);x.restore();
}
function wifi6(photo){
  // Product-only crop of the supplied photo: no caption text inside the selection.
  const crop={x:128,y:34,w:330,h:560};
  return (x,t)=>{
    backdrop(x,t,'#0B5FA5',N);
    const z=1+.03*Math.sin(TAU*t/SECONDS),h=620*z,w=h*crop.w/crop.h,cx=W*.5,cy=H*.53+6*Math.sin(TAU*t/3);
    x.save();x.lineCap='round';
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const p=((t*.75+i/5)%1);x.globalAlpha=Math.sin(Math.PI*p)*.9;x.strokeStyle=i%3===0?O:'#FFFFFF';x.lineWidth=12-6*p;
      x.beginPath();x.arc(cx,cy-40,w*.55+p*340,side>0?-.55:Math.PI-.55,side>0?.55:Math.PI+.55);x.stroke();
    }
    x.restore();
    const box={x:cx-w/2,y:cy-h/2,w,h};
    x.save();x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=40;x.shadowOffsetY=22;x.fillStyle='#1669AB';x.beginPath();x.roundRect(box.x,box.y,w,h,34);x.fill();x.restore();
    x.save();x.beginPath();x.roundRect(box.x,box.y,w,h,34);x.clip();x.drawImage(photo,crop.x,crop.y,crop.w,crop.h,box.x,box.y,w,h);x.restore();
    sweep(x,t,box);
    x.strokeStyle='rgba(255,255,255,.9)';x.lineWidth=6;x.beginPath();x.roundRect(box.x,box.y,w,h,34);x.stroke();
  };
}
function camera(photo){
  return (x,t)=>{
    x.fillStyle='#EAF3FB';x.fillRect(0,0,W,H);
    const crop={x:215,y:40,w:560,h:380},z=1.04+.04*Math.sin(TAU*t/SECONDS),s=Math.max(W/crop.w,H/crop.h)*z,w=crop.w*s,h=crop.h*s;
    const ox=(W-w)/2+14*Math.sin(TAU*t/SECONDS),oy=(H-h)/2+8*Math.cos(TAU*t/SECONDS);
    x.drawImage(photo,crop.x,crop.y,crop.w,crop.h,ox,oy,w,h);
    const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(0,102,179,.20)');g.addColorStop(.5,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(11,31,63,.28)');x.fillStyle=g;x.fillRect(0,0,W,H);
    const focus=[{x:ox+60*s,y:oy+50*s,w:260*s,h:265*s,c:G},{x:ox+285*s,y:oy+195*s,w:250*s,h:170*s,c:O}];
    focus.forEach((f,i)=>{
      const p=.5+.5*Math.sin(TAU*t/3+i*Math.PI),m=10+16*(1-p),arm=54;
      x.save();x.globalAlpha=.35+.65*p;x.strokeStyle=f.c;x.lineWidth=9;x.lineCap='round';x.beginPath();
      for(const [px,dx] of [[f.x-m,1],[f.x+f.w+m,-1]])for(const [py,dy] of [[f.y-m,1],[f.y+f.h+m,-1]]){x.moveTo(px+dx*arm,py);x.lineTo(px,py);x.lineTo(px,py+dy*arm);}
      x.stroke();x.restore();
    });
    const sy=H*((t%3)/3),b=x.createLinearGradient(0,sy-70,0,sy);b.addColorStop(0,'rgba(0,166,81,0)');b.addColorStop(1,'rgba(0,166,81,.35)');x.fillStyle=b;x.fillRect(0,sy-70,W,70);x.fillStyle='rgba(0,166,81,.9)';x.fillRect(0,sy,W,4);
  };
}
async function render(name,draw,title,source){
  const out=path.join(LIB,name+'.mp4'),canvas=createCanvas(W,H),x=canvas.getContext('2d');
  const child=spawn(P.ffmpeg,['-y','-v','error','-f','rawvideo','-pix_fmt','rgba','-s',W+'x'+H,'-r',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',out],{stdio:['pipe','inherit','inherit'],windowsHide:true});
  const closed=new Promise((res,rej)=>{child.once('error',rej);child.once('close',c=>c===0?res():rej(Error('FFmpeg '+c)));});
  for(let f=0;f<SECONDS*FPS;f++){
    x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;draw(x,f/FPS);
    if(!child.stdin.write(Buffer.from(x.getImageData(0,0,W,H).data.buffer)))await new Promise(r=>child.stdin.once('drain',r));
  }
  child.stdin.end();await closed;
  execFileSync(P.ffmpeg,['-y','-v','error','-ss','1','-i',out,'-frames:v','1','-update','1','-vf','scale=480:-2',path.join(LIB,name+'.jpg')]);
  const file=path.join(LIB,'sources.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
  manifest[name+'.mp4']={status:'brand_product_render',title,sourceImage:source,generator:'scripts/assets/generate_product_broll.js',fileSize:fs.statSync(out).size};
  fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
  console.log(name,fs.statSync(out).size);
}
(async()=>{
  const modem='broll-images/fpt_wifi6_chip_features.jpg',cam='brand/products/camera_ai.jpg';
  await render('broll_product_wifi6',wifi6(await loadImage(path.join(P.assets,modem))),'Modem Wi-Fi 6 FPT — chuyển động dựng từ ảnh sản phẩm FPT',modem);
  await render('broll_product_camera',camera(await loadImage(path.join(P.assets,cam))),'Camera FPT — chuyển động dựng từ ảnh sản phẩm FPT',cam);
})().catch(e=>{console.error(e);process.exitCode=1;});
