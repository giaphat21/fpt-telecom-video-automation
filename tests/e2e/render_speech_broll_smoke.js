const PATHS=require('../../config/paths.js');
'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
const {composeBrollCutaway}=require('../../src/broll/broll_compositor');
const root=path.resolve(__dirname, '../..'),workspace = PATHS.root,out=path.join(root,'var/qa/qa_speech_broll');
const ffmpeg=path.join(workspace,'node_modules/ffmpeg-static/ffmpeg.exe');
fs.mkdirSync(out,{recursive:true});
const run=args=>execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,maxBuffer:10*1024*1024});
const pixel=(file,time)=>[...run(['-ss',String(time),'-i',file,'-vf','crop=2:2:100:100,scale=1:1,format=rgb24','-frames:v','1','-f','rawvideo','pipe:1'])];
const red=p=>p[0]>180&&p[1]<50&&p[2]<50,blue=p=>p[2]>180&&p[0]<50,yellow=p=>p[0]>180&&p[1]>180&&p[2]<50;
(async()=>{
 const base=path.join(out,'base.mp4'),a=path.join(out,'short_red.mp4'),b=path.join(out,'short_yellow.mp4'),result=path.join(out,'long_adjacent.mp4');
 run(['-f','lavfi','-i','color=c=blue:s=1080x1920:r=30:d=18','-f','lavfi','-i','sine=frequency=440:duration=18',
   '-c:v','libx264','-preset','ultrafast','-threads','2','-c:a','aac','-ac','2','-ar','48000',base]);
 for(const [color,file]of [['red',a],['yellow',b]])run(['-f','lavfi','-i','color=c='+color+':s=640x360:r=30:d=0.6','-c:v','libx264','-preset','ultrafast','-an',file]);
 const cues=[{file:a,layout:'cutaway',start:4,end:14.2,duration:99},{file:b,layout:'cutaway',start:14.2,end:16.5}];
 await composeBrollCutaway(base,cues,result,console.log);
 assert.ok(blue(pixel(result,3.966667)),'B-roll must not start early');
 assert.ok(red(pixel(result,4.3)),'B-roll must start with its speech');
 assert.ok(red(pixel(result,10)),'Short source must loop throughout a long spoken topic');
 assert.ok(red(pixel(result,14.166667)),'No fade to host before an adjacent topic');
 assert.ok(yellow(pixel(result,14.2)),'Next topic begins on its exact frame, no host flash');
 assert.ok(blue(pixel(result,16.5)),'B-roll must end on the spoken end, without a trailing frame');
 const hash=file=>run(['-i',file,'-map','0:a','-c','copy','-f','hash','-hash','sha256','pipe:1']).toString().trim();
 assert.equal(hash(base),hash(result));
 run(['-v','error','-xerror','-i',result,'-f','null','-']);
 const report={passed:true,firstScene:{start:4,end:14.2,duration:10.2},sourceDuration:.6,
   adjacentCutAt:14.2,endsAt:16.5,pixelBoundaryChecks:true,originalAudioUnchanged:true};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
 console.log('PASS long and adjacent B-roll',JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});

