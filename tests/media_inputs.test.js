'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const P=require('../config/paths'),{probeMedia,portraitFilter}=require('../src/core/media_profile');
const directory=path.join(P.qa,'media-inputs');fs.mkdirSync(directory,{recursive:true});
const ff=args=>execFileSync(P.ffmpeg,['-v','error','-y',...args],{stdio:'pipe',windowsHide:true,timeout:60000});
const variants=[
 {name:'landscape',extension:'mp4',size:'1280x720',rate:'24',codec:['-c:v','libx264']},
 {name:'square',extension:'mov',size:'720x720',rate:'25',codec:['-c:v','libx264']},
 {name:'portrait',extension:'mkv',size:'360x640',rate:'60',codec:['-c:v','libx264']},
 {name:'webm',extension:'webm',size:'640x360',rate:'15',codec:['-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8']},
 {name:'hdr',extension:'mp4',size:'640x360',rate:'30',codec:['-pix_fmt','yuv420p10le','-c:v','libx265','-x265-params','log-level=error',
   '-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc']}
];
for(const variant of variants)test('Actual FFmpeg normalization: '+variant.name,{timeout:60000},()=>{
  const input=path.join(directory,variant.name+'.'+variant.extension),output=path.join(directory,variant.name+'-1080.mp4');
  ff(['-f','lavfi','-i','testsrc2=s='+variant.size+':r='+variant.rate,'-t','0.4',...variant.codec,input]);
  const info=probeMedia(input);
  if(variant.name==='hdr')assert.equal(info.hdr,true);
  ff(['-i',input,'-filter_complex',portraitFilter(info,{prefix:'fps=30,'}),'-map','[vout]',
    '-c:v','libx264','-preset','ultrafast','-crf','17','-an',output]);
  const rendered=probeMedia(output);assert.equal(rendered.width,1080);assert.equal(rendered.height,1920);
  ff(['-xerror','-i',output,'-f','null','-']);
  if(variant.name==='landscape'){
    // The left/right ends of a wide frame remain visible; no stretching or hard center crop.
    const frame=execFileSync(P.ffmpeg,['-v','error','-i',output,'-frames:v','1','-vf','scale=108:192','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
    assert.equal(frame.length,108*192*3);
    assert.notDeepEqual([...frame.subarray((96*108+2)*3,(96*108+2)*3+3)],[...frame.subarray((96*108+105)*3,(96*108+105)*3+3)]);
  }
});
test('Actual FFmpeg rotation metadata normalizes to upright portrait',{timeout:60000},()=>{
  const input=path.join(directory,'rotation.mp4'),rotated=path.join(directory,'rotation-tagged.mp4'),output=path.join(directory,'rotation-1080.mp4');
  ff(['-f','lavfi','-i','testsrc2=s=640x360:r=30','-t','0.4','-c:v','libx264',input]);
  ff(['-display_rotation:v:0','90','-i',input,'-c','copy',rotated]);
  const info=probeMedia(rotated);assert.equal(info.width,360);assert.equal(info.height,640);
  ff(['-i',rotated,'-filter_complex',portraitFilter(info,{prefix:'fps=30,'}),'-map','[vout]','-c:v','libx264','-preset','ultrafast',output]);
  assert.equal(probeMedia(output).width,1080);
});
test('Corrupt or audio-only media cannot masquerade as valid video',()=>{
  const invalid=path.join(directory,'invalid.mp4');fs.writeFileSync(invalid,'not media');
  assert.throws(()=>probeMedia(invalid),/Không đọc được/);
  assert.throws(()=>probeMedia(path.join(P.assets,'sfx/sfx_12.mp3')),/luồng hình/);
});
