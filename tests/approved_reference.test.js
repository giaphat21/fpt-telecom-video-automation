const PATHS=require('../config/paths.js');

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {createReferenceHighlights,createReferenceBrolls}=require('../src/core/reference_editor');
const {inspectPlan}=require('../src/core/quality_gate');
const {deriveSmartHookFromSubtitles}=require('../src/core/subtitle_generator');
const ref=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/references/approved-video/job.json'),'utf8'));
const makeSub=(text,start,step=.2)=>({text,start,end:start+text.split(' ').length*step,words:text.split(' ').map((word,i)=>({word,startMs:Math.round((start+i*step)*1000),endMs:Math.round((start+(i+1)*step)*1000)}))});
const catalog=[{id:'football',name:'Bóng đá',available:true,autoEligible:true,defaultLayout:'top_half',keywords:['bóng đá','cầu thủ']},{id:'camera',name:'Camera',available:true,autoEligible:true,defaultLayout:'pip',keywords:['camera','giám sát','đàm thoại']}];
test('Human-approved sample passes measurable quality checks unchanged',()=>{
 const report=inspectPlan({totalDur:ref.totalDur,subtitles:ref.subtitles,highlights:ref.renderedHighlights,brolls:ref.brollCutaways,sfx:ref.renderedSfx,hookDur:3.5,outroStart:12.4});
 assert.equal(report.passed,true,JSON.stringify(report.errors));
});
test('Reference guides phrase pacing without hard-coded contents or timeline',()=>{
 const cues=createReferenceHighlights(ref.subtitles,ref.totalDur);
 assert.equal(cues.length,6);assert.ok(cues.every(h=>h.start>=3.5&&h.end<=12.4));
 assert.match(cues[0].text,/tài khoản FPT Play/);
 assert.match(cues[1].text,/thỏa sức xem bóng đá/);
 assert.ok(!cues.some(h=>/195|tặng thêm 1 tháng/i.test(h.text)));
});
test('Long topics produce 10+ highlights and B-roll follows full speech instead of a duration cap',()=>{
 const text='xem bóng đá '+Array(16).fill('cầu thủ chuyền bóng trên sân ghi bàn').join(' ');
 const sub=makeSub(text,4,.15),total=sub.end+5;
 const cues=createReferenceHighlights([sub],total),brolls=createReferenceBrolls([sub],total,catalog);
 assert.ok(cues.length>10);assert.equal(brolls.length,1);assert.equal(brolls[0].start,sub.start);
 assert.equal(brolls[0].end,Number(sub.end.toFixed(3)));assert.ok(brolls[0].duration>10);
});
test('Adjacent topics share their spoken cut, with no imposed B-roll gap',()=>{
 const football=makeSub('xem bóng đá các cầu thủ ghi bàn trên sân',4);
 const camera=makeSub('Camera AI giám sát nhận diện người trong nhà',football.end);
 const output=createReferenceBrolls([football,camera],camera.end+5,catalog);
 assert.equal(output.length,2);assert.equal(output[0].end,Number(football.end.toFixed(3)));
 assert.equal(output[1].start,Number(camera.start.toFixed(3)));
 assert.equal(output[1].end,Number(camera.end.toFixed(3)));
});
test('An unavailable next topic still ends the previous B-roll at the speech boundary',()=>{
 const football=makeSub('xem bóng đá cầu thủ ghi bàn',4),camera=makeSub('Camera AI giám sát trong nhà',football.end);
 const output=createReferenceBrolls([football,camera],camera.end+5,catalog.map(c=>({...c,available:c.id!=='camera'})));
 assert.equal(output.length,1);assert.equal(output[0].end,Number(football.end.toFixed(3)));
});
test('Quality gate rejects B-roll drifting from its spoken end and overlapping text',()=>{
 const plan={totalDur:ref.totalDur,subtitles:ref.subtitles,highlights:ref.renderedHighlights.map(h=>({...h})),brolls:[{...ref.brollCutaways[0],speechStart:5.1,speechEnd:7,timingSource:'spoken_context',end:7.5}],sfx:ref.renderedSfx,hookDur:3.5,outroStart:12.4};
 plan.highlights[1].start=plan.highlights[0].start;
 const report=inspectPlan(plan);assert.equal(report.passed,false);
 assert.ok(report.errors.some(e=>e.code==='broll_speech_drift'));assert.ok(report.errors.some(e=>e.code==='highlight_overlap'));
});
test('Automatic titles keep blank lines and never invent price or free gifts',()=>{
 const meta=deriveSmartHookFromSubtitles(ref.subtitles);
 assert.equal(meta.hook.line4,'');assert.equal(meta.outro.line3,'');
 assert.ok(!/195|220|1 THÁNG/.test(JSON.stringify(meta)));
 assert.match(meta.outro.line1,/ĐĂNG KÝ/);
});

test('Topic changes inside one subtitle split B-roll exactly at the new spoken clause',()=>{
 const sub=makeSub('xem bóng đá trên sân và Camera AI giám sát trong nhà',4);
 const output=createReferenceBrolls([sub],sub.end+5,catalog);
 assert.equal(output.length,2);assert.equal(output[0].start,4);
 assert.equal(output[0].end,5);assert.equal(output[1].start,5);
 assert.equal(output[1].end,Number(sub.end.toFixed(3)));
});
test('Cross-row spelling correction preserves timestamps and suggestion count',()=>{
 const {correctSubtitles}=require('../src/core/transcript_formatter');
 const {matchHighlightRequest}=require('../src/core/highlight_planner');
 const first=makeSub('Camera AI đam',4),second=makeSub('thoại hai chiều cực kỳ tiện lợi',first.end);
 const corrected=correctSubtitles([first,second]);
 assert.match(corrected.map(s=>s.text).join(' '),/đàm thoại 2 chiều/);
 const cues=createReferenceHighlights([first,second],second.end+5);
 const result=matchHighlightRequest(cues.map(c=>c.text),[first,second],second.end+5);
 assert.deepEqual(result.unmatched,[]);assert.equal(result.highlights.length,cues.length);
 assert.equal(corrected[1].words[1].startMs,second.words[1].startMs);
});
test('Missing speech bounds cannot silently pass the automatic B-roll quality gate',()=>{
 const report=inspectPlan({totalDur:ref.totalDur,subtitles:ref.subtitles,highlights:ref.renderedHighlights,
   brolls:[{...ref.brollCutaways[0],timingSource:'spoken_context'}],sfx:ref.renderedSfx,hookDur:3.5,outroStart:12.4});
 assert.ok(report.errors.some(e=>e.code==='broll_speech_drift'));
});

test('A topic running to the end is not shortened by an invented fixed outro',()=>{
 const sub=makeSub('xem bóng đá '+Array(10).fill('cầu thủ chuyền bóng ghi bàn').join(' '),4,.2);
 const {speechBoundaries}=require('../src/core/reference_editor');
 const bounds=speechBoundaries([sub],sub.end);
 assert.equal(bounds.outroDur,0);
 const result=createReferenceBrolls([sub],sub.end,catalog);
 assert.equal(result.at(-1).end,Number(sub.end.toFixed(3)));
});
test('Automatic outro follows spoken CTA instead of a duration percentage',()=>{
 const body=makeSub('xem bóng đá cầu thủ ghi bàn',4,.5);
 const cta=makeSub('đăng ký ngay hôm nay để nhận ưu đãi',12,.2);
 const bounds=require('../src/core/reference_editor').speechBoundaries([body,cta],cta.end);
 assert.equal(bounds.outroStart,12);assert.equal(bounds.outroDur,Number((cta.end-12).toFixed(3)));
});
