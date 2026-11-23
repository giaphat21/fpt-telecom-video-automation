'use strict';
// The jump-cut base (picture + voice) depends only on the source clips and their trims. It is built once, shared by the
// live preview and the final render, and reused until a trim changes.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{spawn,spawnSync}=require('child_process');
const PATHS=require('../../config/paths.js');
const {assembleClips,frameGrid,FPS}=require('./clip_assembler');
const {mapConcurrent}=require('./render_inputs');
const {portraitFilter}=require('../media/media_profile');
const ROOT=path.join(PATHS.cache,'base'),VERSION=6,KEEP=5,MIN_PUNCH_GAP=2.2;
const run=args=>new Promise((resolve,reject)=>{
  const child=spawn(PATHS.ffmpeg,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let err='';
  child.on('error',reject);child.stderr.on('data',d=>{err=(err+d).slice(-4000);});
  child.on('close',code=>code===0?resolve():reject(Error('FFmpeg ('+code+'): '+err.slice(-350))));
});
// Cuts that carry the 0.2 s settle and the whoosh. The user can switch one off on the timeline (fx['cut:n'].off).
function punchCuts(windows,fx={}){
  let last=0;const out=new Map();
  windows.forEach((w,i)=>{if(!i||w.timelineStart-last<MIN_PUNCH_GAP||fx['cut:'+i]?.off)return;last=w.timelineStart;const d=Number(fx['cut:'+i]?.dur);out.set(i,Number.isFinite(d)?Math.max(.06,Math.min(.8,d)):.2);});
  return out;
}
function baseKey(windows,voiceSpeed,punched){
  const parts=windows.map((w,i)=>{const s=fs.statSync(w.srcPath);return [path.resolve(w.srcPath),s.size,Math.round(s.mtimeMs),w.trimStart,w.trimEnd,punched.get(i)||0];});
  return crypto.createHash('sha256').update(JSON.stringify([VERSION,voiceSpeed,parts])).digest('hex').slice(0,24);
}
// Integrated loudness of the voice. Quiet and loud sources are brought to the level of the standard video.
function loudness(wav){
  const run=spawnSync(PATHS.ffmpeg,['-hide_banner','-nostats','-i',wav,'-af','ebur128','-f','null','-'],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
  const hit=[...String(run.stderr).matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);return hit?Number(hit[1]):null;
}
function voiceGain(measured,audio){
  const target=audio.voiceLUFS;
  if(!Number.isFinite(measured)||!Number.isFinite(target)||measured<-45)return audio.voiceGain;
  return Math.round(audio.voiceGain*Math.pow(10,Math.max(-6,Math.min(6,target-measured))/20)*1000)/1000;
}
// 100 peaks per second, 0–255, for the waveform track.
function peaksOf(wav){
  const b=fs.readFileSync(wav);let at=12,data=null,rate=48000,channels=2;
  while(at+8<=b.length){const id=b.toString('ascii',at,at+4),size=b.readUInt32LE(at+4);
    if(id==='fmt '){channels=b.readUInt16LE(at+10);rate=b.readUInt32LE(at+12);}
    if(id==='data'){data=b.subarray(at+8,Math.min(b.length,at+8+size));break;}
    at+=8+size+(size&1);}
  if(!data)return [];
  const step=Math.round(rate/100)*channels,out=[];let max=1;
  for(let i=0;i+step<=data.length/2;i+=step){let p=0;for(let k=0;k<step;k+=channels)p=Math.max(p,Math.abs(data.readInt16LE((i+k)*2)));out.push(p);max=Math.max(max,p);}
  return out.map(p=>Math.round(p/max*255));
}
function prune(keep){
  try{
    const dirs=fs.readdirSync(ROOT).filter(d=>/^[0-9a-f]{24}$/.test(d)&&d!==keep).map(d=>({d,t:fs.statSync(path.join(ROOT,d)).mtimeMs})).sort((a,b)=>b.t-a.t);
    for(const {d} of dirs.slice(KEEP-1))fs.rmSync(path.join(ROOT,d),{recursive:true,force:true});
    for(const d of fs.readdirSync(ROOT).filter(d=>/\.building-/.test(d)))if(Date.now()-fs.statSync(path.join(ROOT,d)).mtimeMs>3600e3)fs.rmSync(path.join(ROOT,d),{recursive:true,force:true});
  }catch(_){}
}
function open(dir){
  try{
    const meta=JSON.parse(fs.readFileSync(path.join(dir,'meta.json'),'utf8')),at=name=>path.join(dir,name);
    const base={key:path.basename(dir),dir,raw:at('raw.mp4'),voice:at('voice.wav'),proxy:at('proxy.mp4'),clips:meta.frames.map((_,i)=>at('synced_clip_'+(i+1)+'.mov')),...meta};
    if(![base.raw,base.voice,base.proxy,...base.clips].every(f=>fs.existsSync(f)))return null;
    const now=new Date();fs.utimesSync(dir,now,now);return base;
  }catch(_){return null;}
}
async function prepareBase({windows,voiceSpeed,profileFor,hasAudio,fx={}}){
  const punched=punchCuts(windows,fx),key=baseKey(windows,voiceSpeed,punched),dir=path.join(ROOT,key);
  const ready=open(dir);if(ready)return {...ready,reused:true};
  const work=dir+'.building-'+process.pid+'-'+Date.now();fs.mkdirSync(work,{recursive:true});
  try{
    const built=await assembleClips({windows,voiceSpeed,tempDir:work,outVideo:path.join(work,'raw.mp4'),outVoice:path.join(work,'voice.wav'),outProxy:path.join(work,'proxy.mp4'),run,
      mapConcurrent,concurrency:os.cpus().length>=12?4:2,hasAudio,punchAt:(_,i)=>punched.get(i)||0,
      // Framing changes with the scene, never inside a sentence.
      buildVideo:(win,i,prefix,output)=>portraitFilter(profileFor(win.srcPath),{prefix,output,punch:i%2===1})});
    fs.writeFileSync(path.join(work,'meta.json'),JSON.stringify({frames:built.frames,totalDur:built.totalDur,voiceLUFS:loudness(path.join(work,'voice.wav')),peaks:peaksOf(path.join(work,'voice.wav'))}));
    for(let attempt=0;;attempt++){
      try{fs.renameSync(work,dir);break;}
      catch(error){if(open(dir))break;if(attempt>20)throw error;await new Promise(r=>setTimeout(r,100));}
    }
  }finally{if(fs.existsSync(work))fs.rmSync(work,{recursive:true,force:true});}
  prune(key);
  const base=open(dir);if(!base)throw Error('Không dựng được bản nền của video.');
  return {...base,reused:false};
}
const totalFrames=windows=>frameGrid(windows.map(w=>w.timelineDur)).reduce((a,b)=>a+b,0);
const timelineLength=windows=>Math.round(totalFrames(windows)/FPS*1000)/1000;
module.exports={voiceGain,prepareBase,punchCuts,timelineLength,frameGrid,ROOT};
