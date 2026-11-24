'use strict';
// Builds (or reuses) the base of a video and everything the browser needs to play the timeline live.
const path=require('path');
const PATHS=require('../../config/paths.js');
const {prepareBase,voiceGain}=require('./base_cache');
const {chooseMusic,musicStart}=require('./video_pipeline');
const {probeMedia}=require('../media/media_profile');
const {hasAudioStream}=require('../speech/subtitle_generator');
const {resolveBrollSpec,CARD,ABOVE_SUB_Y,portraitOf}=require('../broll/broll_compositor');
const {layoutBrolls}=require('../broll/host_layout');
const matting=require('../media/matting');
const referenceProfile=require('../../config/approved_reference.json');
const asset=file=>{const rel=path.relative(PATHS.assets,file);return rel.startsWith('..')?null:'/assets/'+rel.split(path.sep).map(encodeURIComponent).join('/');};
async function preparePreview({windows,voiceSpeed,fx={},brolls=[],bgm={},projectName=''}){
  const profiles=new Map(),profileFor=file=>{if(!profiles.has(file))profiles.set(file,probeMedia(file));return profiles.get(file);};
  const base=await prepareBase({windows,voiceSpeed,fx,profileFor,hasAudio:win=>hasAudioStream(win.srcPath)});
  const specs=[];
  for(const spec of brolls){try{const r=resolveBrollSpec(spec);if(r)specs.push(r);}catch(_){}}
  let cursor=0;const cuts=base.frames.map(f=>{const at=cursor/30;cursor+=f;return Math.round(at*1000)/1000;});
  // mattes already made are used at once; the others are made by the long-lived server and the Studio adds them in place
  const matteJobs=[],wantedMattes=[];
  const placed=(await layoutBrolls(base.raw,specs,CARD,cuts)).map(s=>{
    if(s.layout!=='behind'||!matting.available())return s;
    const m=matting.cachedSpan(base.raw,s.start,s.end);if(m)return {...s,matte:m};
    matteJobs.push({video:base.raw,start:s.start,end:s.end});wantedMattes.push({uid:s.uid,start:s.start,end:s.end});return s;
  });
  const music=chooseMusic(bgm,projectName);
  return {key:base.key,url:'/preview/'+base.key+'/proxy.mp4',totalDur:base.totalDur,peaks:base.peaks,reused:base.reused,
    brolls:placed.map(s=>({uid:s.uid,url:asset(s.file),portrait:portraitOf(s.file)?asset(portraitOf(s.file)):null,cardY:s.cardY,cardParts:s.cardParts,hostFocusY:s.hostFocusY,fit:!!s.fit,matte:s.matte?{url:'/matte/'+s.matte.name,start:s.matte.start,end:s.matte.end}:null})),
    wantedMattes,_matteJobs:matteJobs,
    card:{...CARD,aboveSubY:ABOVE_SUB_Y},voiceGain:voiceGain(base.voiceLUFS,referenceProfile.audio),
    music:music?{url:asset(music),name:path.basename(music),start:bgm.bgmFromStart?0:musicStart(music,base.totalDur),volume:referenceProfile.audio.bgmWithVoice}:null};
}
module.exports={preparePreview};
