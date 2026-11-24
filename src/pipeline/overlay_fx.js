'use strict';
// Full-frame graphic overlays (speed lines, burst, shock wave) drawn with the same code as the Studio preview
// (picture_fx.drawOverlay) and handed to FFmpeg as short alpha clips.
const {spawn}=require('child_process');
const {createCanvas}=require('@napi-rs/canvas');
const PATHS=require('../../config/paths.js');
const {drawOverlay}=require('./picture_fx');
const W=1080,H=1920,FPS=30;
async function renderOverlay(effect,file){
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d'),frames=Math.max(1,Math.round((effect.end-effect.start)*FPS));
  const child=spawn(PATHS.ffmpeg,['-y','-v','error','-f','rawvideo','-pix_fmt','rgba','-s',W+'x'+H,'-r',String(FPS),'-i','pipe:0','-c:v','qtrle','-pix_fmt','argb',file],{stdio:['pipe','ignore','pipe'],windowsHide:true});
  let err='';child.stderr.on('data',d=>{err=(err+d).slice(-1500);});
  const closed=new Promise((res,rej)=>{child.once('error',rej);child.once('close',c=>c===0?res():rej(Error('FFmpeg overlay ('+c+'): '+err)));});
  for(let f=0;f<frames;f++){
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);drawOverlay(ctx,effect,effect.start+(f+.0001)/FPS,W,H);
    if(!child.stdin.write(Buffer.from(ctx.getImageData(0,0,W,H).data.buffer)))await new Promise(r=>child.stdin.once('drain',r));
  }
  child.stdin.end();await closed;return file;
}
module.exports={renderOverlay};
