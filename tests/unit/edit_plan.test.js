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
  assert.equal(Object.keys(engine.STYLES).length,24+8+6);assert.equal(Object.keys(engine.HOOKS).length,HOOK_STYLES.length);
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
  for(const kind of Object.keys(KINDS)){const list=normalizeFx([{kind,start:1,end:2}],10),a=frameFx(list,1.02),b=frameFx(list,3);assert.deepEqual(b,{zoom:1,dx:0,dy:0,light:0,blur:0,spin:0,overlays:[]});assert.notDeepEqual(kind==='blur'||kind==='dip'||kind==='bounce'?frameFx(list,1.5):a,b,kind);if(KINDS[kind].overlay)assert.equal(a.overlays.length,1,kind);else assert.ok(fxFilters(list).includes('1.000'),kind);}
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
  for(const id of ['stock_wifi6','stock_fptplay','stock_camera','mg_signal','mg_wall','mg_mesh','mg_speed','mg_lag']){const c=cat.find(x=>x.id===id);assert.ok(c&&c.autoEligible&&c.available,id);assert.equal(c.defaultLayout,'top_half',id);}
  const sub=(text,start)=>{const w=text.split(' ');return {text,start,end:start+w.length*.3,words:w.map((x,i)=>({word:x,startMs:Math.round((start+i*.3)*1000),endMs:Math.round((start+i*.3+.25)*1000)}))};};
  const got=b.autoDetectBrollFromSubtitles([sub('vì có quá nhiều bức tường ngăn cản',4),sub('xem video thì quay vòng mãi',8),sub('lắp thêm Mesh phủ sóng mọi góc',12),sub('sóng 5G cũng không bằng',16)],3.5,30).map(s=>s.brollId);
  assert.deepEqual(got,['mg_wall','mg_lag','mg_mesh','mg_signal']);
});

test('B-roll behind the presenter: about 70% of the frame, the cut-out presenter on top, no outline',()=>{
  const {brollGraph,BEHIND,getBrollCatalog}=require('../../src/broll/broll_compositor'),os=require('os');
  const clip=path.join(__dirname,'..','fixtures','silent_video.mp4'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fpt_behind_'));
  const g=brollGraph([{start:4,end:6,layout:'behind',file:clip,matte:{file:clip,start:4,end:7}}],{artDir:dir}),text=g.filters.join(';');
  assert.ok(text.includes('alphaextract')&&text.includes('alphamerge[person0]')&&g.output==='vp0',text);
  assert.ok(!/color=white/.test(text),'no outline');assert.ok(BEHIND.height/1920<.71&&BEHIND.solid/1920>.6);
  const fit=brollGraph([{start:4,end:6,layout:'behind',file:clip,fit:true,matte:{file:clip,start:4,end:7}}],{artDir:dir}).filters.join(';');
  assert.ok(!fit.includes('gblur')&&!fit.includes('overlay=0:560')&&fit.includes('crop=1080:1340'),'a drawn graphic fills the area sharp, no blurred fill');
  const none=brollGraph([{start:4,end:6,layout:'behind',file:clip}],{artDir:dir}).filters.join(';');
  assert.ok(!none.includes('alphaextract')&&none.includes('overlay=0:780'),'without a matte the split screen is used');
  assert.ok(getBrollCatalog().every(c=>c.defaultLayout==='top_half'),'every B-roll starts on the upper half');
  const above=brollGraph([{start:4,end:6,layout:'above_sub',file:clip}],{artDir:dir}).filters.join(';');
  assert.ok(above.includes("y='"+(require('../../src/broll/broll_compositor').ABOVE_SUB_Y-24))&&!above.includes('alphaextract'),'card just above the Sub');
  fs.rmSync(dir,{recursive:true,force:true});
});

test('upper half melts into the presenter panel; full screen uses portrait graphics',()=>{
  const {brollGraph,TOP}=require('../../src/broll/broll_compositor'),os=require('os');
  const clip=path.join(__dirname,'..','fixtures','silent_video.mp4'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fpt_top_'));
  const top=brollGraph([{start:4,end:6,layout:'top_half',file:clip}],{artDir:dir}).filters.join(';');
  assert.ok(top.includes('crop=1080:'+TOP.height)&&top.includes('alphamerge')&&!top.includes('drawbox'),'soft bottom edge, no hard bars');
  const {portraitOf}=require('../../src/broll/broll_compositor'),lib=path.join(__dirname,'..','..','assets','broll-library');
  for(const n of ['mg_wifi6_modem','mg_signal_5g','mg_wall_block','mg_mesh_cover','mg_fptplay','mg_camera_ai','mg_speed_gauge','mg_lag_buffer'])assert.ok(portraitOf(path.join(lib,n+'.mp4')),n+' has a portrait version');
  const g=brollGraph([{start:4,end:6,layout:'cutaway',file:path.join(lib,'mg_camera_ai.mp4')}],{artDir:dir});
  assert.ok(g.inputs.some(i=>/mg_camera_ai_portrait\.mp4$/.test(i)),'full screen uses the portrait graphic');
  fs.rmSync(dir,{recursive:true,force:true});
});

test('game footage from the user: League of Legends and Arena of Valor clips are matched by name',()=>{
  const {getBrollCatalog}=require('../../src/broll/broll_compositor'),cat=getBrollCatalog();
  for(const [id,file] of [['stock_lienminh','lien_minh.mp4'],['stock_lienquan','lien_quan.mp4']]){const c=cat.find(x=>x.id===id);assert.ok(c&&c.available&&c.autoEligible&&c.filePath.endsWith(file),id);}
  assert.ok(!cat.some(c=>c.isUserUpload&&/lien_(minh|quan)/.test(c.file)),'not listed twice');
  assert.ok(!cat.find(c=>c.id==='stock_gaming').keywords.includes('liên quân'));
  const {autoDetectBrollFromSubtitles}=require('../../src/broll/broll_compositor'),mk=(text,s)=>({start:s,end:s+2.4,text,words:text.split(' ').map((w,i)=>({word:w,start:s+i*.3,end:s+i*.3+.25}))});
  const got=autoDetectBrollFromSubtitles([mk('Tối nay chơi game thả ga',5),mk('Bữa sau lại chơi game tiếp',12)],3.5,25).map(s=>s.brollId);
  assert.deepEqual(got,['stock_lienminh','stock_lienquan'],'"chơi game" brings the game clips, taking turns');
});

test('B-roll looks: a Highlight on a B-roll takes the look of its picture, without repeats',()=>{
  const {applyTypographyVariety,BROLL_STYLES,BROLL_THEMES}=require('../../src/typography/brand_rules');
  const engine=require('../../src/typography/kinetic_core');for(const s of BROLL_STYLES)assert.ok(engine.STYLES[s],s);
  const brolls=[{brollId:'stock_lienquan',start:4,end:12},{brollId:'stock_football',start:14,end:18},{brollId:'stock_fptplay',start:20,end:24},{brollId:'stock_camera',start:26,end:30}];
  const items=[['Tối nay mình',4.2],['leo rank thật mượt',6.5],['không lo mất mạng',9],['Xem trọn mùa giải',14.5],['Kho nội dung khổng lồ',20.5],['Theo dõi cả ngày',26.5],['Giá chỉ 195K',32]].map(([text,start],i)=>({uid:'h'+i,text,start,end:start+1.9}));
  for(const seed of [null,'p1']){
    const out=applyTypographyVariety(items,{seed,brolls});
    const themeOf=i=>BROLL_THEMES.find(th=>th.styles.includes(out[i].typo))?.topic;
    assert.deepEqual([0,1,3,4,5].map(themeOf),['game','game','football','fptplay','camera'],JSON.stringify(out.map(h=>h.typo)));
    if(seed==null)assert.ok(out[0].typo==='fpt_game_crosshair'&&out[3].typo==='fpt_score_bar'&&out[4].typo==='fpt_play_cinema'&&out[5].typo==='fpt_cam_rec');
    out.forEach((h,i)=>assert.ok(!out.slice(Math.max(0,i-2),i).some(p=>p.typo===h.typo),'no repeat'));
    assert.ok(!BROLL_STYLES.includes(out[6].typo),'a price is not dressed as a picture look');
  }
  // the next video turns the picture's looks over
  const first=applyTypographyVariety(items,{seed:'p1',brolls}),next=applyTypographyVariety(items,{seed:'p2',brolls,videos:[first.map(h=>h.typo)]});
  assert.notEqual(next[3].typo+next[5].typo,first[3].typo+first[5].typo);
});

test('Transitions at picture cuts: motion only (no glare), peak on the cut, rotating, each one removable or changeable',()=>{
  const {TRANSITIONS,KINDS}=require('../../src/pipeline/picture_fx');
  assert.ok(Object.keys(TRANSITIONS).length>=8&&!['flash','dip','glare'].some(k=>TRANSITIONS[k]),'no light effects among transitions');
  const dense=[0,3.067,4.3,6,9.5,10.2].map((start,i,a)=>({start,duration:(a[i+1]??standard.totalDur)-start}));
  const planAt=(seed,extra={})=>{const job={projectName:seed,titleMode:'auto',brollMode:'manual',brollCutaways:standard.brolls,...extra};const content=prepareContent(job,{subtitles:standard.subtitles,highlights:[],totalDur:standard.totalDur});return createEditPlan({job,seed,...content,totalDur:standard.totalDur,scenes:dense,history:[],strictSpeech:true});};
  const cuts=q=>q.autoFx.filter(e=>e.group!=='open');
  const p0=planAt('tr_a'),p={...p0,autoFx:cuts(p0)};assert.ok(p.autoFx.length>=2,JSON.stringify(p.autoFx));
  p.autoFx.forEach((e,i)=>{if(i)assert.ok(dense[e.cut].start-dense[p.autoFx[i-1].cut].start>=4.5,'not crowded');assert.ok(!['glitch','bounce'].includes(e.kind),'smooth kinds only');for(const b of p.brolls)assert.ok(Math.abs(b.start-dense[e.cut].start)>=.35&&Math.abs(b.end-dense[e.cut].start)>=.35,'not on a B-roll edge');});
  assert.ok(p.sfx.filter(s=>s.anchor.startsWith('cut:')).every(s=>p.autoFx.some(e=>'cut:'+e.cut===s.anchor)),'a cut sound only with its transition');
  for(const e of p.autoFx){const cut=dense[e.cut].start;assert.ok(e.start<=cut&&e.end>cut&&Math.abs(e.start+TRANSITIONS[e.kind].pre-cut)<.002,e.kind);assert.ok(e.start>=p.hookDur-TRANSITIONS[e.kind].pre&&e.end<=p.outroStart);
}
  p.autoFx.forEach((e,i)=>assert.ok(!p.autoFx.slice(Math.max(0,i-2),i).some(x=>x.kind===e.kind),'no repeat'));
  const first=p.autoFx[0],gone=planAt('tr_a',{fx:{['auto:'+first.uid]:{off:true}}});assert.ok(!cuts(gone).some(e=>e.uid===first.uid));
  const changed=planAt('tr_a',{fx:{['auto:'+first.uid]:{kind:'spin'}}});assert.equal(cuts(changed).find(e=>e.uid===first.uid).kind,'spin');
  const kinds=new Set(['a','b','c','d','e','f'].flatMap(s=>cuts(planAt('tr_'+s)).map(e=>e.kind)));assert.ok(kinds.size>=4,'different videos, different transitions');
});

test('Hook opening: strong, varied, graphics without glare, louder first sounds, one removable block',()=>{
  const {OPENERS,frameFx,drawOverlay,KINDS}=require('../../src/pipeline/picture_fx');
  assert.ok(Object.keys(OPENERS).length>=8);
  for(const [name,o] of Object.entries(OPENERS)){assert.ok(o.fx.every(([k])=>KINDS[k]&&!['flash','dip','glare'].includes(k)),name);assert.equal(o.sfx[0],'impact',name);}
  const p=plan('open_a');assert.ok(p.opener&&OPENERS[p.opener]);
  const open=p.autoFx.filter(e=>e.group==='open');assert.ok(open.length>=3&&Math.min(...open.map(e=>e.start))===p.hookStart,'starts on the first frame');
  const first=p.sfx.find(s=>s.anchor==='hook:open');assert.ok(first&&first.start===p.hookStart&&first.vol>=.6,'loud hit on frame 0');
  // different videos open differently
  const history=[];const seen=new Set();for(let v=0;v<6;v++){const q=plan('open_v'+v,history);seen.add(q.opener);history.unshift({project:'open_v'+v,openerStyle:q.opener});}
  assert.ok(seen.size>=6,'six videos, six openings');
  assert.equal(plan('open_a',[],{fx:{'auto:open':{off:true}}}).opener,null);
  assert.equal(plan('open_a',[],{fx:{'auto:open':{recipe:'zoom_slam'}}}).opener,'zoom_slam');
  // the overlays draw something on a canvas
  const {createCanvas}=require('@napi-rs/canvas');for(const kind of ['speedlines','burst','shockwave']){const c=createCanvas(1080,1920),x=c.getContext('2d');drawOverlay(x,{uid:'o',kind,start:0,end:1},.3);const d=x.getImageData(0,0,1080,1920).data;let n=0;for(let i=3;i<d.length;i+=4*97)if(d[i])n++;assert.ok(n>50,kind);}
});

test('Sub under music: near-miss FPT phrases are restored without touching other speech; music bed detection',()=>{
  const {cleanFptTranscript}=require('../../src/speech/transcript_formatter');
  const fixed=s=>cleanFptTranscript(s).toLocaleLowerCase('vi');
  for(const [heard,said] of [['Trang hình ngay','trang bị ngay'],['Họ sắp xem bóng đá','thỏa sức xem bóng đá'],['Trang thoại 2 chiều','đàm thoại 2 chiều'],['Nhận tu đã liền tay','nhận ưu đãi liền tay'],['Chi kèm 5 tài khoản','đi kèm 5 tài khoản']])assert.equal(fixed(heard),said,heard);
  for(const s of ['tốc độ Wi-Fi','giá chỉ có 195K','đi kèm 3 tài khoản','Thỏa sức xem bóng đá Ngoại hạng Anh','Trang trí nhà cửa','Nhà mình lắp Wi-Fi'])assert.equal(fixed(s),cleanFptTranscript(s).toLocaleLowerCase('vi'),s),assert.ok(!/xem trọn|tốc độ cao|giá chỉ từ/.test(fixed(s))||/giá chỉ từ/.test(s),s);
  const {musicBed,wordPauses}=require('../../src/speech/word_timing');
  const env=(floor,peak)=>({values:Float32Array.from({length:400},(_,i)=>i%4===0?floor:peak-3*Math.random()),peak,floor});
  assert.ok(!musicBed(env(-45,-15)),'clean speech');assert.ok(musicBed(env(-30,-13)),'voice over music');
  const gaps=wordPauses([{startMs:0,endMs:900},{startMs:1500,endMs:2000},{startMs:2150,endMs:2600}],4000);
  assert.ok(gaps.some(p=>p.startMs>=1000&&p.endMs<=1400),'a clear gap between words is a pause');assert.ok(!gaps.some(p=>p.startMs<2150&&p.endMs>2000),'a short gap is not');
});
