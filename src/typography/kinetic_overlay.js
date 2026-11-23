'use strict';
// Node side of the kinetic typography: fonts, frame streaming and stills. Drawing lives in kinetic_core.js.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const PATHS=require('../../config/paths.js');
const core=require('./kinetic_core');
const {FONTS,WIDTH:W,HEIGHT:H,TOP,FPS}=core;
let ready=false;
function prepare(){
  if(ready)return;
  for(const [file,alias] of FONTS)if(!GlobalFonts.registerFromPath(path.join(PATHS.fonts,file),alias))throw Error('Không nạp được font '+file);
  core.configure(createCanvas);ready=true;
}
const buildCues=plan=>{prepare();return core.buildCues(plan);};
const frameDrawer=cues=>{prepare();return core.frameDrawer(cues);};
// Raw RGBA frames for an FFmpeg input pipe: drawing overlaps with encoding and no intermediate file is written.
const RAW_INPUT=['-f','rawvideo','-pix_fmt','rgba','-s',W+'x'+H,'-r',String(FPS)];
async function streamFrames(plan,stream,{onError=()=>null}={}){
  const draw=frameDrawer(buildCues(plan)),frames=Math.max(1,Math.round(plan.totalDur*FPS)),blank=Buffer.alloc(W*H*4);
  for(let f=0;f<frames&&!onError();f++){
    const canvas=draw((f+.0001)/FPS);
    const data=canvas?Buffer.from(canvas.getContext('2d').getImageData(0,0,W,H).data.buffer):blank;
    if(!stream.write(data))await new Promise(r=>{const done=()=>{for(const e of ['drain','close','error'])stream.off(e,done);r();};for(const e of ['drain','close','error'])stream.once(e,done);});
    if(f%30===0)await new Promise(r=>setImmediate(r));
  }
  if(!stream.destroyed)stream.end();
  return frames;
}
// Lossless alpha track; the compositor needs one input no matter how many cues the video has.
async function renderKineticTrack(plan,outputPath){
  const child=spawn(PATHS.ffmpeg,['-y','-v','error',...RAW_INPUT,'-i','pipe:0','-c:v','qtrle','-pix_fmt','argb',outputPath],{stdio:['pipe','ignore','pipe'],windowsHide:true});
  let err='',failed=null;
  child.stderr.on('data',d=>{err=(err+d).slice(-2000);});
  child.stdin.on('error',e=>{failed=e;});
  const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('FFmpeg typography ('+code+'): '+err)));});
  closed.catch(e=>{failed=e;});
  const frames=await streamFrames(plan,child.stdin,{onError:()=>failed});
  await closed;
  return {cues:buildCues(plan).length,frames,top:TOP,width:W,height:H};
}
function renderStill(plan,time,outputPath){
  const canvas=frameDrawer(buildCues(plan))(time),full=createCanvas(W,1920);
  if(canvas)full.getContext('2d').drawImage(canvas,0,TOP);
  fs.writeFileSync(outputPath,full.toBuffer('image/png'));
}
module.exports={...core,buildCues,frameDrawer,renderKineticTrack,renderStill,streamFrames,RAW_INPUT};
