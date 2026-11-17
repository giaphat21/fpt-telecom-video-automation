const PATHS=require('../config/paths.js');
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const {generateAutoSubtitles}=require('../src/core/subtitle_generator');
for(const [name,options]of [
 ['video with jump cuts',{videoFiles:['presenter_take_01.mp4']}],
 ['video without silence trimming',{videoFiles:['presenter_take_01.mp4'],trimSilence:false}],
 ['separate voice path',{voiceFiles:['presenter_take_01.mp4']}]
])test('Sub text: '+name,async()=>{
 const result=await generateAutoSubtitles({...options,voiceSpeed:1.25});
 assert.ok(result.subtitles.length>0);
 assert.ok(result.subtitles.every(s=>s.words.length&&s.end>s.start));
 assert.ok(result.subtitles.at(-1).end<=result.totalDuration+0.1);
});
test('Sub text rejects a silent video instead of returning an empty success',async()=>{
 await assert.rejects(generateAutoSubtitles({videoFiles:[path.resolve(__dirname,'fixtures/silent_video.mp4')]}),/Không tạo được Sub text/);
});
