'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'../..');
const {createEditPlan,prepareContent,gateInput}=require('../../src/pipeline/edit_plan');
const {inspectPlan}=require('../../src/pipeline/quality_gate');
const {polishText,suspiciousWords,isVietnamese}=require('../../src/speech/text_quality');
const {BRAND_STYLES,HOOK_STYLES}=require('../../src/typography/brand_rules');
const standard=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/references/standard-video/plan.json'),'utf8'));
const scenes=[0,3.067,4.667,6.167,9.033,10.567].map((start,i,a)=>({start,duration:(a[i+1]??standard.totalDur)-start}));
function plan(seed,history=[],extra={}){
  const job={projectName:seed,titleMode:'auto',brollMode:'manual',brollCutaways:standard.brolls,...extra};
  const content=prepareContent(job,{subtitles:standard.subtitles,highlights:extra.highlights||[],totalDur:standard.totalDur});
  return createEditPlan({job,seed,...content,totalDur:standard.totalDur,scenes,history,strictSpeech:true});
}
const look=(p,project)=>({project,hookStyle:p.hook.style,outroStyle:p.outro.style,typos:p.highlights.map(h=>h.typo),sfx:p.sfx.map(s=>s.id)});
test('The standard video itself passes every check of the engine',()=>{
  const report=inspectPlan({...standard,strictSpeech:false,userAudio:false});
  assert.equal(report.passed,true,JSON.stringify(report.errors));
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'config/approved_reference.json'),'utf8')).standard;
  assert.equal(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT,config.path))).digest('hex'),config.sha256);
});
test('Ten videos in a row: all pass, hooks rotate through the whole set, highlight styles do not settle',()=>{
  const history=[];
  for(let v=0;v<10;v++){
    const p=plan('video_'+v,history),report=inspectPlan(gateInput(p));
    assert.equal(report.passed,true,'video '+v+' '+JSON.stringify(report.errors));
    assert.notEqual(p.hook.style,p.outro.style);
    history.unshift(look(p,'video_'+v));
  }
  assert.equal(new Set(history.map(h=>h.hookStyle)).size,10);assert.ok(HOOK_STYLES.length>=18);
  for(let i=1;i<10;i++){
    assert.notEqual(history[i].hookStyle,history[i-1].hookStyle);
    assert.ok(history[i].typos.filter(t=>history[i-1].typos.includes(t)).length<=2,JSON.stringify([history[i].typos,history[i-1].typos]));
  }
  const seen=new Set(history.flatMap(h=>h.typos));
  assert.ok(seen.size>=22,seen.size+'/'+BRAND_STYLES.length);
});
test('Editing one item leaves every other choice alone and its sound follows it',()=>{
  const a=plan('edit'),highlights=a.highlights.map(h=>({...h,styleFrom:'plan'})),sfxOverrides=Object.fromEntries(a.sfx.map(s=>[s.anchor,{id:s.id}]));
  const keep={sfxOverrides,hookStyle:a.hook.style,outroStyle:a.outro.style};
  const same=plan('edit',[],{...keep,highlights});
  assert.deepEqual(same.sfx.map(s=>[s.anchor,s.id,s.start]),a.sfx.map(s=>[s.anchor,s.id,s.start]));
  assert.deepEqual(same.highlights.map(h=>[h.typo,h.motion]),a.highlights.map(h=>[h.typo,h.motion]));
  const moved=highlights.map((h,i)=>i===0?{...h,start:h.start+.05,edited:true}:h),b=plan('edit',[],{...keep,highlights:moved});
  const anchor='hl:'+highlights[0].uid,before=a.sfx.find(s=>s.anchor===anchor),after=b.sfx.find(s=>s.anchor===anchor);
  if(before&&after)assert.ok(Math.abs(after.start-before.start-.05)<.0015);
  assert.deepEqual(b.highlights.map(h=>h.typo),a.highlights.map(h=>h.typo));
});
test('Timeline choices reach the plan: muted, chosen, moved and added sounds, styles, Outro start',()=>{
  const a=plan('choose'),hl=a.sfx.find(s=>s.anchor.startsWith('hl:'));
  const b=plan('choose',[],{sfxOverrides:{[hl.anchor]:{id:'sfx_01',user:true,chosen:true,vol:.2,offset:.1},'hook:land':{muted:true}},customSfx:[{uid:'c',id:'cash_money',start:8.7,vol:.3}],hookStyle:'mega_outline',outroStart:11});
  const changed=b.sfx.find(s=>s.anchor===hl.anchor);
  assert.equal(changed.id,'sfx_01');assert.equal(changed.vol,.2);assert.ok(Math.abs(changed.start-hl.start-.1)<.002);
  assert.ok(b.mutedSfx.some(s=>s.anchor==='hook:land'));
  assert.ok(b.sfx.some(s=>s.anchor==='custom:c'&&s.start===8.7));
  assert.equal(b.hook.style,'mega_outline');assert.equal(b.outroStart,11);
  const report=inspectPlan(gateInput(b));assert.equal(report.passed,true,JSON.stringify(report.errors));
  const carried=plan('choose',[],{highlights:a.highlights.map(h=>({...h,typo:'fpt_price_burst',styleFrom:undefined}))});
  assert.ok(new Set(carried.highlights.map(h=>h.typo)).size>=4,'Kiểu gửi kèm không phải lựa chọn của người dùng');
});
test('Hook length follows the timeline and stops at the first B-roll',()=>{
  assert.equal(plan('hook').hookDur,3.5);
  assert.equal(plan('hook',[],{hookDur:2.4}).hookDur,2.4);assert.equal(plan('hook',[],{hookDur:.2}).hookDur,.4);
  const long=plan('hook',[],{hookDur:9});assert.equal(long.hookDur,standard.brolls[0].start);
  for(const p of [plan('hook',[],{hookDur:2.4}),long]){const r=inspectPlan(gateInput(p));assert.equal(r.passed,true,JSON.stringify(r.errors));}
  // A title covered by neighbouring Highlights must not blink between them.
  const K=require('../../src/typography/kinetic_overlay'),hook={style:'slab_stack',line1:'TIÊU ĐỀ',y:320,scale:1.3};
  const hl=(start,dur)=>({text:'nội dung',typo:'fpt_orange_block',motion:'pop_bounce',start,dur,y:350,scale:1.4,timingPolicy:'preserve_all'});
  const draw=K.frameDrawer(K.buildCues({totalDur:8,hookDur:6,hook,highlights:[hl(3,1),hl(4.08,1.7)]}));
  assert.ok(draw(2.5));assert.equal(draw(4.04),null);assert.equal(draw(5.9),null);
});
test('Spelling, tone marks and capitals',()=>{
  const cases={'thoả sức xem bóng đá ngoại hàng anh':'Thỏa sức xem bóng đá Ngoại hạng Anh','modem wi-fi 6 mới nhất':'Modem Wi-Fi 6 mới nhất',
    'giá chỉ từ hơn 7.000 đồng một ngày':'Giá chỉ từ hơn 7.000 đồng/ngày','nhận uu đãi':'Nhận ưu đãi','lắp mạng fpt tại hoà vang':'Lắp mạng FPT tại Hòa Vang','tăng ngay tốc độ':'Tăng ngay tốc độ'};
  for(const [from,to] of Object.entries(cases))assert.equal(polishText(from,{capitalise:true}),to);
  assert.equal(polishText('giữ  NGUYÊN chữ người dùng',{typed:true}),'giữ NGUYÊN chữ người dùng');
  assert.deepEqual(suspiciousWords('Tặng ngay Camera AI đàm thoại 2 chiều, giá 7.000 đồng/ngày, combo Wi-Fi 6'),[]);
  assert.deepEqual(suspiciousWords('lắp đăt internet tốc đôj'),['đăt','đôj']);
  for(const w of ['nghiêng','khuỷu','quyết','giếng','gì','quý','uyên','thuở'])assert.ok(isVietnamese(w),w);
  for(const w of ['zoo','đat','tôcs','ngoac'])assert.ok(!isVietnamese(w),w);
});
test('The browser engine is the render engine and has no Node dependency',()=>{
  const code=require('../../src/web/engine_bundle').engineBundle(),sandbox={};
  new Function('window',code)(sandbox);
  const engine=sandbox.FptEngine.typography;
  assert.equal(Object.keys(engine.STYLES).length,24+8);assert.equal(Object.keys(engine.HOOKS).length,HOOK_STYLES.length);
  assert.ok(!/require\('(fs|path|child_process|@napi)/.test(code));
});
test('Titles, sounds, music and Sub looks edited on the timeline reach the plan',()=>{
  const p=plan('edit5',[],{hookStart:.5,hookDur:3,outroStart:11,outroEnd:12.5,extraTitles:[{uid:'a',line1:'THÊM',style:'stamp_seal',start:6,end:8},{uid:'b',line1:'',start:1,end:2}]});
  assert.deepEqual([p.hookStart,p.hookDur,p.outroStart,p.outroEnd],[.5,3,11,12.5]);
  assert.equal(p.titles.length,1);assert.ok(p.sfx.some(s=>s.anchor==='title:a'));
  const r=inspectPlan(gateInput(p));assert.equal(r.passed,true,JSON.stringify(r.errors));
  const a=plan('trim'),long=a.sfx.find(s=>s.duration>.5),b=plan('trim',[],{sfxOverrides:{...Object.fromEntries(a.sfx.map(s=>[s.anchor,{id:s.id}])),[long.anchor]:{id:long.id,user:true,chosen:true,trimIn:.1,trimOut:.2}}}),cutOne=b.sfx.find(s=>s.anchor===long.anchor);
  assert.equal(cutOne.start,long.start);assert.ok(Math.abs(cutOne.duration-(long.duration-.3))<.01);assert.ok(Math.abs(cutOne.from-long.from-.1)<.002);
  const {musicSegments}=require('../../src/pipeline/video_pipeline');
  assert.deepEqual(musicSegments({},10,()=>45,.18),[{start:0,end:10,offset:45,vol:.18}]);
  const m=musicSegments({musicSegments:[{start:4,end:20,offset:2,vol:.3},{start:0,end:5,offset:45}]},10,()=>0,.18);
  assert.deepEqual(m.map(x=>[x.start,x.end,x.offset,x.vol]),[[0,5,45,.18],[5,10,3,.3]]);
  const {SUB_STYLES,assEvents,assertBrandSubtitles,styleLines}=require('../../src/typography/subtitle_style');
  for(const id of Object.keys(SUB_STYLES)){const ev=assEvents({text:'Tặng ngay Camera AI',start:1,end:2,words:[]},id,t=>String(t));assert.ok(ev.length);assert.doesNotThrow(()=>assertBrandSubtitles(styleLines()+ev.join('')));for(const w of ['Tặng','ngay','Camera','AI'])assert.ok(ev.join(' ').includes(w));}
});
test('The page and the package carry the same version',()=>{
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,'public/studio/version.json'),'utf8')).version,require('../../package.json').version);
});

test('Phrases follow the sentence: no broken compounds, no dangling words, cues end with the voice',()=>{
  const {segment}=require('../../src/speech/phrase_segmenter'),{createReferenceHighlights}=require('../../src/editing/reference_editor');
  const say=(text,at=0)=>{let t=at;return text.split(' ').map(raw=>{const w={raw,start:t,end:t+.22};t+=/[.,?!]$/.test(raw)?.36:.24;return w;});};
  const lines=segment(say('Nhà thì lại quá to, lại có quá nhiều bức tường ngăn cản và khiến cho tín hiệu cũng như là tốc độ Wi-Fi bị chậm xuống.')).map(g=>g.map(w=>w.raw).join(' '));
  for(const pair of ['bức tường','ngăn cản','tín hiệu','tốc độ','chậm xuống'])assert.ok(lines.some(l=>l.toLowerCase().includes(pair)),pair+' bị tách: '+lines.join(' / '));
  assert.ok(lines.every(l=>l.split(' ').length<=7),lines.join(' / '));
  const words=say('Mọi người ơi hôm nay mình kể chuyện này nha. Thật ra không phải mạng yếu là do gói cước chậm, đôi khi Modem lại đặt quá xa, nhà thì lại quá to, nhiều bức tường ngăn cản. Anh chị thử tham khảo bộ phát của FPT nha, nhắn tin cho em để được tư vấn gói cước phù hợp.');
  const sub={text:words.map(w=>w.raw).join(' '),start:0,end:words.at(-1).end,words:words.map(w=>({word:w.raw,startMs:Math.round(w.start*1000),endMs:Math.round(w.end*1000)}))};
  const cues=createReferenceHighlights([sub],sub.end+1);
  assert.ok(cues.length>=4);
  cues.forEach((c,i)=>{assert.ok(Math.abs(c.start-c.speechStart)<.002);assert.ok(c.end<=Math.max(c.speechEnd+.31,c.start+.71),c.text);if(i)assert.ok(c.start>=cues[i-1].end+.079);assert.ok(!/ (của|cho|những|và|là|thì|mà)$/.test(c.text),c.text);});
});
test('Export is never blocked by a style finding; repeats are named so they can be replaced in one step',()=>{
  const base=plan('repeat'),highlights=base.highlights.map(h=>({...h,typo:'fpt_price_burst',styleFrom:'user',motion:h.motion}));
  const p=plan('repeat',[],{highlights});
  const g=gateInput(p);g.highlights=g.highlights.map(h=>h.typo?{...h,typo:'fpt_price_burst'}:h);
  const report=inspectPlan(g);assert.equal(report.passed,false);assert.ok(report.repeats.length>0);
  const file=path.join(require('os').tmpdir(),'fpt_gate_'+process.pid+'.json');
  assert.doesNotThrow(()=>require('../../src/pipeline/quality_gate').requirePlan(g,file));fs.unlinkSync(file);
  const fixed=plan('repeat',[],{highlights:highlights.map(h=>report.repeats.includes(h.uid)?{...h,typo:undefined,styleFrom:undefined}:h)});
  assert.equal(inspectPlan(gateInput(fixed)).repeats.length,0);
});
test('Picture effects: the preview curve and the export expression agree',()=>{
  const {KINDS,frameFx,fxFilters,normalizeFx}=require('../../src/pipeline/picture_fx');
  assert.equal(normalizeFx([{kind:'zoom_in',start:1,end:99},{kind:'nope',start:0,end:1},{kind:'flash',start:2,end:2}],10).length,1);
  for(const kind of Object.keys(KINDS)){const list=normalizeFx([{kind,start:1,end:2}],10),a=frameFx(list,1.02),b=frameFx(list,3);assert.deepEqual(b,{zoom:1,dx:0,dy:0,light:0,blur:0});assert.notDeepEqual(kind==='blur'||kind==='dip'?frameFx(list,1.5):a,b,kind);assert.ok(fxFilters(list).includes('1.000'),kind);}
  assert.equal(fxFilters([]),'');
});

test('Problem phrases get the problem typography and a heavier sound; solutions never do',()=>{
  const {isNegative}=require('../../src/editing/tone'),{NEGATIVE_STYLES,applyTypographyVariety}=require('../../src/typography/brand_rules');
  for(const s of ['Bị bức tường ngăn','Sóng yếu','Wi-Fi bị chập chờn','Giật lag liên tục','Mất kết nối','Load chậm'])assert.ok(isNegative(s),s);
  for(const s of ['Không còn giật lag','Phủ sóng xuyên tường','Chăm sóc khách hàng','Yêu thích FPT','Hết lo mạng yếu','Tốc độ siêu nhanh'])assert.ok(!isNegative(s),s);
  const items=['Bị bức tường ngăn','Modem Wi-Fi 6','Sóng yếu chập chờn','Giá chỉ 195K','Mạng chậm quá','Tặng Camera AI'].map((text,i)=>({text,start:i*2,end:i*2+1.8}));
  const out=applyTypographyVariety(items,{seed:'neg'});
  out.forEach((h,i)=>assert.equal(NEGATIVE_STYLES.includes(h.typo),isNegative(items[i].text),h.text+' '+h.typo));
  assert.equal(new Set(out.filter((h,i)=>isNegative(items[i].text)).map(h=>h.typo)).size,3);
  assert.ok(require('../../src/audio/sfx_director').familiesFor('Sóng yếu').includes('mech'));
});
test('Problem looks and premium titles stay inside the frame and keep compounds on one line',()=>{
  const {NEGATIVE_STYLES,HOOK_STYLES}=require('../../src/typography/brand_rules'),K=require('../../src/typography/kinetic_overlay');
  for(const typo of NEGATIVE_STYLES){
    const draw=K.frameDrawer(K.buildCues({totalDur:4,highlights:[{text:'Wi-Fi bị mất sóng liên tục',typo,motion:'pop_bounce',start:0,dur:2.2,y:350,scale:1.4}]}));
    for(let f=0;f<66;f+=3){const c=draw(f/30);if(!c)continue;for(const x of [0,c.width-1])assert.ok(!c.getContext('2d').getImageData(x,0,1,c.height).data.some((v,i)=>i%4===3&&v>40),typo+' frame '+f);}
  }
  const [cue]=K.buildCues({totalDur:4,highlights:[{text:'Bị bức tường ngăn',typo:'neg_wall_block',start:0,dur:2,y:350,scale:1.4}]});
  assert.ok(cue.lines.some(l=>l.words.map(w=>w.word.toLowerCase()).join(' ').includes('bức tường')),'bức tường bị tách dòng');
  for(const style of ['neon_glow','extrude_pop','split_open','light_beam'])assert.ok(HOOK_STYLES.includes(style));
  const draw=K.frameDrawer(K.buildCues({totalDur:4,hook:{style:'light_beam',line1:'WI-FI NHÀ BẠN',line2:'CÓ ĐANG BỊ YẾU'},hookDur:3.5}));
  for(let f=0;f<40;f+=2)assert.ok(draw(f/30),'Hook phải có hình từ khung đầu');
});
test('Motion-graphic B-roll: every topic has a verified clip and the spoken topic picks it',()=>{
  const b=require('../../src/broll/broll_compositor'),cat=b.getBrollCatalog();
  for(const id of ['stock_wifi6','stock_fptplay','mg_signal','mg_wall','mg_mesh','mg_speed','mg_lag']){const c=cat.find(x=>x.id===id);assert.ok(c&&c.autoEligible&&c.available,id);assert.equal(c.defaultLayout,'pip',id);}
  const sub=(text,start)=>{const w=text.split(' ');return {text,start,end:start+w.length*.3,words:w.map((x,i)=>({word:x,startMs:Math.round((start+i*.3)*1000),endMs:Math.round((start+i*.3+.25)*1000)}))};};
  const got=b.autoDetectBrollFromSubtitles([sub('vì có quá nhiều bức tường ngăn cản',4),sub('xem video thì quay vòng mãi',8),sub('lắp thêm Mesh phủ sóng mọi góc',12),sub('sóng 5G cũng không bằng',16)],3.5,30).map(s=>s.brollId);
  assert.deepEqual(got,['mg_wall','mg_lag','mg_mesh','mg_signal']);
});
