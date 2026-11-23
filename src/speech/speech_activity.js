'use strict';
// Acoustic ground truth: Whisper word times are contiguous and can run past the file or over silence.
const {spawnSync}=require('child_process');
const PATHS=require('../../config/paths.js');
const {normalize}=require('../editing/timeline_rules');
const MIN_WORD_MS=60;
function ffmpegLog(args){
  const run=spawnSync(PATHS.ffmpeg,['-hide_banner','-nostats',...args,'-f','null','-'],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
  if(run.error)throw run.error;
  if(run.status!==0)throw Error('Không phân tích được âm thanh: '+String(run.stderr).slice(-200));
  return run.stderr;
}
function meanVolume(file,{start=0,duration=null}={}){
  const args=[...(start?['-ss',String(start)]:[]),...(duration?['-t',String(duration)]:[]),'-i',file,'-vn','-af','volumedetect'];
  const match=ffmpegLog(args).match(/mean_volume:\s*(-?[\d.]+) dB/);
  return match?Number(match[1]):-91;
}
// Drops impossible words, pulls word edges out of silence. Never invents or moves a word across speech.
function refineWords(words,durationSec,silences=[]){
  const limit=durationSec*1000,output=[];
  for(const word of words){
    let startMs=Math.max(0,word.startMs),endMs=Math.min(limit,word.endMs);
    if(startMs>=limit-MIN_WORD_MS/2||endMs<=startMs)continue;
    const inside=silences.find(s=>startMs>=s.startMs&&endMs<=s.endMs);
    if(inside){
      const deep=startMs-inside.startMs>=300&&inside.endMs-endMs>=300;
      if(deep||(inside.startMs<=1&&inside.endMs>=limit-50))continue;
      // Near an edge: ASR is slightly off, keep the word beside the speech it belongs to.
      if(startMs-inside.startMs<inside.endMs-endMs){startMs=Math.max(0,inside.startMs-MIN_WORD_MS);endMs=inside.startMs;}
      else{startMs=inside.endMs;endMs=Math.min(limit,inside.endMs+MIN_WORD_MS);}
    }else for(const s of silences){
      if(s.startMs>startMs&&s.endMs<endMs){
        if(s.startMs-startMs>=endMs-s.endMs)endMs=s.startMs;else startMs=s.endMs;
      }else if(startMs>=s.startMs&&startMs<s.endMs)startMs=s.endMs;
      else if(endMs>s.startMs&&endMs<=s.endMs)endMs=s.startMs;
    }
    const previous=output.at(-1);
    if(previous){startMs=Math.max(startMs,previous.startMs);if(previous.endMs>startMs)previous.endMs=Math.max(previous.startMs+1,startMs);}
    if(endMs<startMs+MIN_WORD_MS)endMs=Math.min(limit,startMs+MIN_WORD_MS);
    output.push({...word,startMs:Math.round(startMs),endMs:Math.round(endMs)});
  }
  return output;
}
// Whisper's stock Vietnamese outputs for music/no speech. They are never said in FPT footage.
// The recognition prompt itself can be echoed back on music.
const PHANTOM=[/(?:\w+ )?telecom modem wifi 6 (?:\w+ )?play camera ai internet combo(?: etc)?/g,/(?:ghien mi go|la la school)(?: de khong bo lo nhung video hap dan)?/g,/(?:cam on cac ban )?(?:hay )?subscribe cho kenh .{0,40}?de khong bo lo nhung video hap dan/g,/hay subscribe cho kenh (?:la la school|ghien mi go)/g,/cam on cac ban da (?:theo doi|xem) (?:video )?(?:va )?hen gap lai/g];
function dropPhantomSpeech(words){
  const starts=[];let text='';
  for(const w of words){const token=normalize(w.word);starts.push(text.length);text+=token+' ';}
  const drop=new Set();
  for(const pattern of PHANTOM)for(const m of text.matchAll(pattern))
    starts.forEach((at,i)=>{if(at>=m.index&&at<m.index+m[0].length)drop.add(i);});
  return words.filter((_,i)=>!drop.has(i));
}
module.exports={dropPhantomSpeech,meanVolume,refineWords};
