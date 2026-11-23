'use strict';
// Builds (or reuses) the base of a video and everything the browser needs to play the timeline live.
const path=require('path');
const PATHS=require('../../config/paths.js');
const {prepareBase,voiceGain}=require('./base_cache');
const {chooseMusic,musicStart}=require('./video_pipeline');
const {probeMedia}=require('../media/media_profile');
const {hasAudioStream}=require('../speech/subtitle_generator');
const {resolveBrollSpec,CARD}=require('../broll/broll_compositor');
const {layoutBrolls}=require('../broll/host_layout');
const referenceProfile=require('../../config/approved_reference.json');
const asset=file=>{const rel=path.relative(PATHS.assets,file);return rel.startsWith('..')?null:'/assets/'+rel.split(path.sep).map(encodeURIComponent).join('/');};
async function preparePreview({windows,voiceSpeed,fx={},brolls=[],bgm={},projectName=''}){
  const profiles=new Map(),profileFor=file=>{if(!profiles.has(file))profiles.set(file,probeMedia(file));return profiles.get(file);};
  const base=await prepareBase({windows,voiceSpeed,fx,profileFor,hasAudio:win=>hasAudioStream(win.srcPath)});
  const specs=[];
  for(const spec of brolls){try{const r=resolveBrollSpec(spec);if(r)specs.push(r);}catch(_){}}
  let cursor=0;const cuts=base.frames.map(f=>{const at=cursor/30;cursor+=f;return Math.round(at*1000)/1000;});
  const placed=await layoutBrolls(base.raw,specs,CARD,cuts);
  const music=chooseMusic(bgm,projectName);
  return {key:base.key,url:'/preview/'+base.key+'/proxy.mp4',totalDur:base.totalDur,peaks:base.peaks,reused:base.reused,
    brolls:placed.map(s=>({uid:s.uid,url:asset(s.file),cardY:s.cardY,cardParts:s.cardParts,hostFocusY:s.hostFocusY})),
    card:CARD,voiceGain:voiceGain(base.voiceLUFS,referenceProfile.audio),
    music:music?{url:asset(music),name:path.basename(music),start:bgm.bgmFromStart?0:musicStart(music,base.totalDur),volume:referenceProfile.audio.bgmWithVoice}:null};
}
module.exports={preparePreview};
