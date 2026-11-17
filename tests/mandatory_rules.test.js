const PATHS=require('../config/paths.js');

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {applyTypographyVariety,BRAND_STYLES}=require('../src/core/brand_rules');
const {cleanFptTranscript,alignCleanWords,correctSubtitles}=require('../src/core/transcript_formatter');
const {normalizeClipWindows}=require('../src/core/render_inputs');
test('Mandatory typography: repeated caller style cannot bypass diversity',()=>{
 const items=Array.from({length:24},(_,i)=>({text:'Giá 195K',start:i*2,end:i*2+1.9,typo:'fpt_price_burst',y:111,scale:.8}));
 const output=applyTypographyVariety(items);
 assert.equal(new Set(output.slice(0,4).map(h=>h.typo)).size,4);
 assert.equal(new Set(output.slice(0,BRAND_STYLES.length).map(h=>h.typo)).size,BRAND_STYLES.length);
 output.forEach((h,i)=>{assert.ok(!output.slice(Math.max(0,i-2),i).some(p=>p.typo===h.typo));assert.equal(h.y,350);assert.equal(h.scale,1.4);assert.equal(h.start,items[i].start)});
 assert.deepEqual(applyTypographyVariety(output),output);
});
test('Spelling fixes use bounded local alignment, preserve unchanged word timestamps and numbers',()=>{
 const raw='Tạng ngay Camera AI đam thoại hai chiều cực kỳ tuyện lợi giá chỉ 7k đồng';
 const words=raw.split(' ').map((word,i)=>({word,startMs:i*220,endMs:i*220+130}));
 assert.equal(cleanFptTranscript('Tạm ngay Camera AI'),'tặng ngay Camera AI');
 const clean=cleanFptTranscript(raw);
 assert.match(clean,/tặng ngay Camera AI đàm thoại 2 chiều cực kỳ tiện lợi giá chỉ 7k đồng/i);
 const aligned=alignCleanWords(words,clean);
 for(const anchor of ['Camera','AI','cực','kỳ','giá','7k']){
   const a=aligned.find(w=>w.word===anchor),b=words.find(w=>w.word===anchor);
   assert.equal(a.startMs,b.startMs);assert.equal(a.endMs,b.endMs);
 }
 assert.equal(cleanFptTranscript('Giá 239K, hotline 0901234567'), 'Giá 239K, hotline 0901234567');
 assert.ok(!aligned.some(w=>w.confidence===.99));
 const corrected=correctSubtitles([{text:raw,words,start:0,end:4}])[0];
 assert.equal(corrected.text,clean);
});
test('Merging brand syllables never shifts following acoustic anchors',()=>{
 const words='ép pê tê trang bị modem'.split(' ').map((word,i)=>({word,startMs:i*300,endMs:i*300+200}));
 const aligned=alignCleanWords(words,cleanFptTranscript(words.map(w=>w.word).join(' ')));
 assert.equal(aligned[0].word,'FPT');assert.equal(aligned[0].startMs,0);assert.equal(aligned[0].endMs,800);
 assert.equal(aligned.find(w=>w.word==='trang').startMs,900);
});
test('Server resolves browser fileRef, recalculates speed, preserves repeated source cuts',()=>{
 const input=[{fileRef:'presenter_take_01.mp4',trimStart:.1,trimEnd:1,timelineDur:99},{fileRef:'presenter_take_01.mp4',trimStart:1.2,trimEnd:2,timelineStart:99}];
 const output=normalizeClipWindows(input,['presenter_take_01.mp4'],1.25);
 assert.equal(output.length,2);assert.ok(fs.existsSync(output[0].srcPath));
 assert.equal(output[0].timelineDur,.72);assert.equal(output[1].timelineStart,.72);assert.equal(output[1].timelineDur,.64);
 assert.throws(()=>normalizeClipWindows([{fileRef:'__missing_video__.mp4'}],[],1.25),/Không tìm thấy video/);
});
