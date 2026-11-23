const PATHS=require('../../config/paths.js');
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { suggestKeywords, matchHighlightRequest } = require('../../src/editing/highlight_planner');
const { prepareHighlightsForRender, boundaries } = require('../../src/editing/timeline_rules');
const sub = (text,start) => ({ text,start,end:start+0.75,words:text.split(' ').map((word,i)=>({word,startMs:(start+i*.15)*1000,endMs:(start+(i+1)*.15)*1000})) });
test('one suggested line becomes one highlight, including close cues, hook and outro',()=>{
 const subtitles=[sub('lắp mạng FPT ngay',.1),sub('modem wifi mới nhất',1),sub('camera an ninh thông minh',2),sub('đăng ký ngay hôm nay',8.8)];
 const suggestions=suggestKeywords(subtitles), request=matchHighlightRequest(suggestions.map(k=>k.text),subtitles,10);
 assert.equal(suggestions.length,4);assert.equal(request.highlights.length,4);assert.deepEqual(request.unmatched,[]);
 assert.equal(request.highlights[0].start,.1);assert.equal(request.highlights.at(-1).start,8.8);
 for(let i=1;i<request.highlights.length;i++) assert.ok(request.highlights[i].start-request.highlights[i-1].end>=.08-1e-8);
 const b=boundaries(10),render=prepareHighlightsForRender(request.highlights,b.hookDur,b.outroStart,10);
 assert.deepEqual(render,request.highlights);assert.ok(render.some(h=>h.shortDuration));
});
test('punctuation in a single line does not inflate the requested count',()=>{
 const subtitles=[sub('internet FPT tốc độ cao',4)];
 const result=matchHighlightRequest('Internet, FPT tốc độ cao;\n\n',subtitles,15);
 assert.equal(result.requestedCount,1);assert.equal(result.highlights.length,1);
});
test('unmatched phrases have explicit line diagnostics; no invented timestamps',()=>{
 const result=matchHighlightRequest(['modem wifi mới nhất','tặng một tỷ đồng'],[sub('modem wifi mới nhất',4)],15);
 assert.equal(result.requestedCount,2);assert.equal(result.highlights.length,1);
 assert.deepEqual(result.unmatched.map(u=>({line:u.line,text:u.text})),[{line:2,text:'tặng một tỷ đồng'}]);
});
test('suggestions never add filler when transcript is short or untimed',()=>{
 assert.equal(suggestKeywords([sub('modem wifi mới nhất',4)]).length,1);
 assert.deepEqual(suggestKeywords([{text:'không có timestamp',start:0,end:3}]),[]);
});
test('all suggestions from saved real jobs survive matching and render preparation',()=>{
 const output=path.join(__dirname, '../fixtures/jobs');
 const jobs=fs.readdirSync(output).map(d=>path.join(output,d,'job.json')).filter(f=>fs.existsSync(f)).slice(-15);
 let cases=0,phrases=0;
 for(const file of jobs){
  const job=JSON.parse(fs.readFileSync(file,'utf8'));if(!job.subtitles?.length)continue;
  const total=Math.max(Number(job.totalDur)||0,...job.subtitles.map(s=>Number(s.end)||0));
  const suggestions=suggestKeywords(job.subtitles),result=matchHighlightRequest(suggestions.map(k=>k.text),job.subtitles,total);
  assert.equal(result.unmatched.length,0,file);assert.equal(result.highlights.length,suggestions.length,file);
  const b=boundaries(total);
  assert.equal(prepareHighlightsForRender(result.highlights,b.hookDur,b.outroStart,total).length,suggestions.length,file);
  cases++;phrases+=suggestions.length;
 }
 assert.ok(cases>0&&phrases>0);console.log('Count parity:',cases,'real jobs,',phrases,'suggestions = highlights');
});
