'use strict';
// Joins jump-cut windows on the 30 fps frame grid with PCM audio. Lossy audio per clip pads every join by up to
// one AAC frame, which made picture and voice drift away from the word timestamps as cuts accumulated.
const path=require('path');
const FPS=30;
function frameGrid(durations){
  let cursor=0,previous=0;
  return durations.map(d=>{cursor+=d;const end=Math.round(cursor*FPS),frames=Math.max(1,end-previous);previous+=frames;return frames;});
}
async function assembleClips({windows,buildVideo,hasAudio,voiceSpeed,tempDir,outVideo,outVoice,outProxy=null,run,mapConcurrent,concurrency=2,punchAt=()=>false}){
  const frames=frameGrid(windows.map(w=>w.timelineDur));
  const clips=windows.map((_,i)=>path.join(tempDir,'synced_clip_'+(i+1)+'.mov'));
  await mapConcurrent(windows,concurrency,(win,i)=>{
    const st=Number(win.trimStart).toFixed(3),en=Number(win.trimEnd).toFixed(3),dur=(frames[i]/FPS).toFixed(6);
    const tempo=Math.abs(voiceSpeed-1)>=.01?voiceSpeed.toFixed(3):null;
    const prefix='trim=start='+st+':end='+en+',setpts='+(tempo?'(PTS-STARTPTS)/'+tempo:'PTS-STARTPTS')+',fps='+FPS+',tpad=stop_mode=clone:stop_duration=0.5,';
    // A 0.2 s settle on the same cuts that carry the whoosh, so the transition is seen as well as heard.
    const settleFor=punchAt(win,i),zoom='(1+0.12*pow(1-min(t/'+(settleFor===true?.2:settleFor||.2)+',1),3))';
    const punch=settleFor
      ?";[vfit]scale=w='2*trunc(540*"+zoom+")':h='2*trunc(960*"+zoom+")':eval=frame:flags=bicubic,crop=1080:1920,setsar=1[vout]"
      :';[vfit]null[vout]';
    const audio=hasAudio(win)
      ?'[0:a]atrim=start='+st+':end='+en+',asetpts=PTS-STARTPTS'+(tempo?',atempo='+tempo:'')+
        ',acompressor=threshold=-18dB:ratio=4:attack=5:release=50:makeup=2,aresample=48000,apad,atrim=0:'+dur+
        ',afade=t=in:d=0.006,afade=t=out:st='+Math.max(0,frames[i]/FPS-.006).toFixed(6)+':d=0.006[aout]'
      :'anullsrc=r=48000:cl=stereo,atrim=0:'+dur+'[aout]';
    return run(['-y','-i',win.srcPath,'-filter_complex',buildVideo(win,i,prefix,'[vfit]')+punch+';'+audio,
      '-map','[vout]','-map','[aout]','-frames:v',String(frames[i]),
      '-c:v','libx264','-preset','ultrafast','-crf','14','-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','48000','-ac','2',clips[i]]);
  });
  const total=frames.reduce((a,b)=>a+b,0)/FPS,list=path.join(tempDir,'clips.txt');
  require('fs').writeFileSync(list,clips.map(c=>"file '"+c.replace(/\\/g,'/').replace(/'/g,"'\\''")+"'").join('\n'));
  // Every clip has the same codec settings and no B-frames, so the picture is joined without another encode.
  await run(['-y','-f','concat','-safe','0','-i',list,
    '-map','0:v','-c:v','copy','-an','-movflags','+faststart',outVideo,
    '-map','0:a','-vn','-c:a','pcm_s16le','-ar','48000','-ac','2','-t',total.toFixed(6),outVoice,
    ...(outProxy?['-map','0:v','-map','0:a','-vf','scale=540:960:flags=bilinear','-c:v','libx264','-preset','ultrafast','-tune','fastdecode','-crf','25','-g','15','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-t',total.toFixed(6),'-movflags','+faststart',outProxy]:[])]);
  return {clips,frames,totalDur:Math.round(total*1000)/1000};
}
module.exports={assembleClips,frameGrid,FPS};
