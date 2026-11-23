'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawn,execFileSync}=require('child_process');
const P=require('../../config/paths');
const {frameGrid,assembleClips}=require('../../src/pipeline/clip_assembler');
const {mapConcurrent,normalizeClipWindows}=require('../../src/pipeline/render_inputs');
const {subtitleIcon,styleSubtitleKeywords,escapeAss}=require('../../src/typography/subtitle_style');
const {refineWords,dropPhantomSpeech}=require('../../src/speech/speech_activity');
const {readEnvelope,alignWords,findPauses,speechRegions}=require('../../src/speech/word_timing');
const {splitLines,meaningfulWords}=require('../../src/editing/phrase_rules');
const {applyTypographyVariety}=require('../../src/typography/brand_rules');
const {buildCues,frameDrawer,STYLES,WIDTH}=require('../../src/typography/kinetic_overlay');
const run=args=>new Promise((resolve,reject)=>{const c=spawn(P.ffmpeg,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let e='';c.stderr.on('data',d=>{e+=d;});c.once('error',reject);c.once('close',code=>code?reject(Error(e.slice(-400))):resolve());});
const phrases=['Đi kèm 5 tài khoản FPT Play','thỏa sức xem bóng đá Ngoại hạng Anh','Camera AI','đàm thoại 2 chiều','giá chỉ từ hơn 7.000 đồng một ngày','miễn phí lắp đặt toàn bộ thiết bị cho gia đình'];

test('Frame grid never accumulates rounding error over many jump cuts',()=>{
  const durations=Array.from({length:120},(_,i)=>.317+(i%7)*.093);let sum=0,frames=0;
  frameGrid(durations).forEach((f,i)=>{sum+=durations[i];frames+=f;assert.ok(Math.abs(frames/30-sum)<=1/60+1e-9,'cut '+i);});
});
test('24 real cuts: picture and voice both match the subtitle timeline',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fpt-cuts-'));
  try{
    const src=path.join(dir,'src.mp4');
    await run(['-y','-f','lavfi','-i','testsrc2=s=108x192:r=30:d=20','-f','lavfi','-i','sine=f=440:r=44100:d=20','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',src]);
    const windows=normalizeClipWindows(Array.from({length:24},(_,i)=>({fileRef:src,trimStart:i*.7,trimEnd:i*.7+.611})),[],1.25);
    const out=path.join(dir,'out.mp4'),voice=path.join(dir,'voice.wav');
    const result=await assembleClips({windows,voiceSpeed:1.25,tempDir:dir,outVideo:out,outVoice:voice,run,mapConcurrent,hasAudio:()=>true,punchAt:(w,i)=>i===5,
      buildVideo:(w,i,prefix,output)=>'[0:v]'+prefix+'scale=1080:1920,setsar=1,format=yuv420p'+output});
    const expected=windows.reduce((s,w)=>s+w.timelineDur,0);
    const duration=(file,stream)=>Number(execFileSync(P.ffprobe,['-v','error','-select_streams',stream,'-show_entries','stream=duration','-of','csv=p=0',file],{encoding:'utf8'}));
    assert.ok(Math.abs(result.totalDur-expected)<=1/60+.002);
    assert.ok(Math.abs(duration(out,'v')-expected)<.035,'video '+duration(out,'v')+' vs '+expected);
    assert.ok(Math.abs(duration(voice,'a')-expected)<.035,'voice '+duration(voice,'a')+' vs '+expected);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Vietnamese keywords with accents are emphasised, and icons follow the real topic',()=>{
  const mark=s=>styleSubtitleKeywords(s,'<','>');
  for(const k of ['đàm thoại 2 chiều','độ trễ','ưu đãi','miễn phí','tốc độ','7.000 đồng'])assert.equal(mark('có '+k+' nhé'),'có <'+k+'> nhé');
  assert.match(subtitleIcon('camera giám sát'),/👁/);assert.match(subtitleIcon('giá chỉ từ'),/💰/);
  for(const s of ['ngày mai','hai chiều','khai trương'])assert.equal(subtitleIcon(s),'');
  assert.ok(!/[{}\\]/.test(escapeAss('a{\\b1}b')));
});
test('Impossible, silent and phantom words never become subtitles',()=>{
  const word=(w,startMs,endMs)=>({word:w,startMs,endMs});
  const out=refineWords([word('một',0,400),word('hai',400,1600),word('ma',5000,5200),word('cuối',9990,12000),word('xa',67655,68000)],10,[{startMs:900,endMs:1600},{startMs:4000,endMs:7000}]);
  assert.deepEqual(out.map(w=>w.word),['một','hai']);assert.equal(out[1].endMs,900);
  const phantom='Cảm ơn các bạn hãy subscribe cho kênh La La School để không bỏ lỡ những video hấp dẫn lắp mạng FPT'.split(' ').map((w,i)=>word(w,i*200,i*200+150));
  assert.equal(dropPhantomSpeech(phantom).map(w=>w.word).join(' '),'lắp mạng FPT');
});
test('A silent source is reported as silence end to end',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fpt-sil-')),file=path.join(dir,'s.wav');
  try{
    execFileSync(P.ffmpeg,['-y','-v','error','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','3',file]);
    const silences=findPauses(readEnvelope(file));assert.equal(silences.length,1);
    assert.deepEqual(refineWords([{word:'bịa',startMs:500,endMs:900}],3,silences),[]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Word times come from the sound: onset, pause and an uncut ending',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fpt-tone-')),file=path.join(dir,'s.wav');
  try{
    // Sound at 0.65-0.95, 1.00-1.30 and 2.00-2.60 s; Whisper-like offsets claim the first word starts at 0.
    const on="(between(t,0.65,0.95)+between(t,1.0,1.3)+between(t,2.0,2.6))";
    execFileSync(P.ffmpeg,['-y','-v','error','-f','lavfi','-i',"aevalsrc='0.4*sin(2*PI*220*t)*"+on+"+0.002*(random(0)-0.5)':s=16000:d=3.2",'-ac','1','-c:a','pcm_s16le',file]);
    const env=readEnvelope(file),words=alignWords([{word:'một',startMs:0,endMs:700,dtw:.78},{word:'hai',startMs:700,endMs:900,dtw:1.12},{word:'ba',startMs:900,endMs:1500,dtw:2.15}],env);
    [.65,1.0,2.0].forEach((t,i)=>assert.ok(Math.abs(words[i].startMs/1000-t)<.06,words[i].word+' '+words[i].startMs));
    const regions=speechRegions(words,findPauses(env),3200);
    assert.equal(regions.length,2);assert.ok(regions[0].startMs<=650&&regions[0].startMs>=550);assert.ok(regions[1].endMs>=2600&&regions[1].endMs<=2720,'ending '+regions[1].endMs);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Display lines keep compounds and numbers with their unit',()=>{
  const lines=t=>{const w=t.split(' ');return splitLines(w).map(l=>l.map(i=>w[i]).join(' '));};
  assert.deepEqual(lines('thỏa sức xem bóng đá Ngoại hạng Anh'),['thỏa sức xem bóng đá','Ngoại hạng Anh']);
  assert.deepEqual(lines('Đi kèm 5 tài khoản FPT Play'),['Đi kèm','5 tài khoản FPT Play']);
  assert.ok(!lines('giá chỉ từ hơn 7.000 đồng một ngày').some(l=>/7\.000$/.test(l)));
  assert.deepEqual(meaningfulWords('mà cái này thì'.split(' ').map(raw=>({raw}))),[]);
});
test('All 24 styles: only the requested words, no line collision, inside the frame',()=>{
  assert.equal(Object.keys(STYLES).length,24);
  for(const typo of Object.keys(STYLES))for(const text of phrases){
    const [cue]=buildCues({totalDur:4,highlights:[{text,typo,start:0,dur:2,y:350,scale:1.4}]});
    const shown=cue.lines.flatMap(l=>l.words.map(w=>w.word)).join(' ');
    assert.equal(shown.toLocaleLowerCase('vi'),text.toLocaleLowerCase('vi'),typo);
    assert.ok(cue.box.x>=20&&cue.box.x+cue.box.w<=WIDTH-20,typo+' overflows: '+text);
    for(let i=1;i<cue.lines.length;i++)assert.ok(cue.lines[i].box.y>=cue.lines[i-1].box.y+cue.lines[i-1].box.h-.5,typo+' collides');
    cue.lines.forEach(l=>l.words.forEach(w=>assert.ok(w.at<cue.dur*.75,typo+' word appears too late to read')));
  }
});
test('No pixel is drawn on the frame border during entry, hold or exit',()=>{
  for(const motion of ['pop_bounce','slam_drop'])for(const typo of ['fpt_price_burst','fpt_split_kicker','fpt_football_match']){
    const draw=frameDrawer(buildCues({totalDur:4,highlights:[{text:phrases[1],typo,motion,start:0,dur:2,y:350,scale:1.4}]}));
    for(let f=0;f<60;f+=1){
      const canvas=draw(f/30);if(!canvas)continue;
      for(const x of [0,WIDTH-1])assert.ok(!canvas.getContext('2d').getImageData(x,0,1,canvas.height).data.some((v,i)=>i%4===3&&v>40),typo+' '+motion+' frame '+f);
    }
  }
});
test('Blank titles draw nothing, a missing CTA draws no Outro, and the hook is visible in frame 0',()=>{
  assert.equal(buildCues({totalDur:10,hookDur:3.5,hook:{line1:'',line2:' '},outroStart:10,outro:{line1:'ĐĂNG KÝ'},highlights:[]}).length,0);
  const draw=frameDrawer(buildCues({totalDur:10,hookDur:3.5,hook:{line1:'LẮP ĐẶT',line2:'',line3:'',line4:''},highlights:[]}));
  assert.ok(draw(0).getContext('2d').getImageData(300,100,480,250).data.some((v,i)=>i%4===3&&v>200));
});
test('Themed styles are the last resort on an unrelated message',()=>{
  const items=Array.from({length:13},(_,i)=>({text:'Giá chỉ từ 195K',start:i*2,end:i*2+1.5,typo:'fpt_football_match'}));
  const out=applyTypographyVariety(items);
  assert.ok(!out.some(h=>['fpt_football_match','fpt_camera_smart','fpt_speed_hud'].includes(h.typo)));
  out.forEach((h,i)=>assert.ok(!out.slice(Math.max(0,i-2),i).some(p=>p.typo===h.typo)));
});
test('Production dependencies stay free of unused and company-licensed packages',()=>{
  const deps=Object.keys(JSON.parse(fs.readFileSync(path.join(P.root,'package.json'),'utf8')).dependencies);
  assert.ok(!deps.some(d=>/remotion|react|tts/.test(d)),deps.join());
  const used=['src','scripts','config','tests'].flatMap(dir=>fs.readdirSync(path.join(P.root,dir),{recursive:true}).filter(f=>/\.js$/.test(f)).map(f=>fs.readFileSync(path.join(P.root,dir,f),'utf8'))).join('\n');
  for(const dep of deps)assert.ok(used.includes(dep),'unused dependency '+dep);
});
test('Outro starts at the closing call to action and drops the lead-in words',()=>{
  const {speechBoundaries}=require('../../src/editing/reference_editor'),{deriveSmartHookFromSubtitles}=require('../../src/speech/subtitle_generator');
  const sub=(text,start)=>{const w=text.split(' ');return {text,start,end:start+w.length*.25,words:w.map((word,k)=>({word,startMs:Math.round((start+k*.25)*1000),endMs:Math.round((start+k*.25+.2)*1000)}))};};
  const subs=[sub('lắp mạng hôm nay',4),sub('khi mọi người đăng ký mạng',36),sub('trúng xe điện nhé',44),sub('nhanh tay đăng ký ngay hôm nay',47)];
  assert.ok(Math.abs(speechBoundaries(subs,49).outroStart-47.5)<.01);
  assert.equal(deriveSmartHookFromSubtitles(subs).outro.line1,'ĐĂNG KÝ NGAY HÔM NAY');
});

const {SfxDirector,familiesFor,measure,loadTakes,catalog,DIR}=require('../../src/audio/sfx_director');
const {chooseStyle,recentSounds}=require('../../src/editing/style_history');
const {HOOK_STYLES,BRAND_STYLES}=require('../../src/typography/brand_rules');
const {HOOKS,titleTimeline}=require('../../src/typography/kinetic_overlay');
const {cardTop,uniformInFrame}=require('../../src/broll/host_layout');
const {CARD}=require('../../src/broll/broll_compositor');
const {inspectPlan}=require('../../src/pipeline/quality_gate');
test('Only the user sound set is played, every file is used, and each hit is measured',()=>{
  const takes=loadTakes(),folder=fs.readdirSync(DIR).filter(f=>/\.mp3$/i.test(f));
  assert.equal(path.basename(DIR),'sfx-user');assert.equal(new Set(takes.map(t=>t.id)).size,takes.length);
  assert.deepEqual([...new Set(takes.map(t=>t.file))].sort(),folder.sort());
  for(const t of takes){const m=measure(t);assert.ok(m.lead<=.96&&m.duration>=.08&&m.duration<=1.75&&m.gain>0&&m.gain<=14,t.id+JSON.stringify(m));}
  const riser=measure(takes.find(t=>t.id==='sfx_14'));assert.ok(Math.abs(riser.from+riser.lead-1.1)<.08,'riser lands on its hit');
  assert.equal(catalog().count,takes.length);
  const source=['src/pipeline/video_pipeline.js','src/audio/sfx_director.js','src/server.js'].map(f=>fs.readFileSync(path.join(P.root,f),'utf8')).join('');
  assert.ok(!/sfx-tech|assets\/sfx\//.test(source));
});
test('One video never wears out a sound and never repeats a family back to back while others exist',()=>{
  for(const seed of ['a','b','c']){
    const d=new SfxDirector({seed}),picked=[];
    for(let i=0;i<40;i++)picked.push(d.pick(familiesFor(phrases[i%phrases.length]),{start:4+i*1.4}));
    assert.ok(picked.every(Boolean));
    const uses={};picked.forEach(p=>{uses[p.id]=(uses[p.id]||0)+1;});
    assert.ok(Object.values(uses).every(n=>n<=2));assert.ok(Object.keys(uses).length>=24,Object.keys(uses).length+' distinct');
    assert.ok(new Set(picked.map(p=>p.file)).size>=20);
    picked.forEach((p,i)=>picked.slice(Math.max(0,i-2),i).forEach(q=>assert.notEqual(p.file,q.file)));
    assert.ok(picked.filter((p,i)=>i&&p.family===picked[i-1].family).length<=8);
  }
});
test('A new file dropped into the folder is used without any configuration',()=>{
  const name='zz_test_new.mp3',file=path.join(DIR,name);
  try{
    execFileSync(P.ffmpeg,['-y','-v','error','-f','lavfi','-i','sine=f=1800:d=0.2','-c:a','libmp3lame',file]);
    const out=JSON.parse(execFileSync(process.execPath,['-e',"const s=require("+JSON.stringify(path.join(P.root,'src/audio/sfx_director.js'))+");console.log(JSON.stringify(s.loadTakes().find(t=>t.id==='zz_test_new')))"],{encoding:'utf8'}));
    assert.ok(out&&out.auto&&out.family);
  }finally{fs.rmSync(file,{force:true});}
});
test('Hook looks rotate between videos, stay fixed for a re-export, and honour a request',()=>{
  let history=[];const seen=[];
  for(let i=0;i<HOOK_STYLES.length;i++){const s=chooseStyle('hookStyle',HOOK_STYLES,'video_'+i,{history});seen.push(s);history=[{project:'video_'+i,hookStyle:s,sfx:['x'+i]},...history];}
  assert.equal(new Set(seen).size,HOOK_STYLES.length);
  assert.equal(chooseStyle('hookStyle',HOOK_STYLES,'video_3',{history}),seen[3]);
  assert.equal(chooseStyle('hookStyle',HOOK_STYLES,'new',{history,requested:'fiber_neon'}),'fiber_neon');
  assert.deepEqual(recentSounds(history),['x'+(HOOK_STYLES.length-1),'x'+(HOOK_STYLES.length-2)]);
});
test('All hook looks: exact text, no collision, inside the frame, every line timed for sound',()=>{
  assert.deepEqual(Object.keys(HOOKS).sort(),[...HOOK_STYLES].sort());
  for(const style of HOOK_STYLES)for(const lines of [['LẮP ĐẶT INTERNET'],['LẮP ĐẶT INTERNET','FPT TRANG BỊ NGAY'],['LẮP ĐẶT INTERNET FPT','TRANG BỊ NGAY','MODEM WI-FI 6 MỚI NHẤT'],['MỘT','HAI','BA','BỐN DÒNG CHỮ']]){
    const hook={style,y:320,scale:1.3};lines.forEach((l,i)=>{hook['line'+(i+1)]=l;});
    const [cue]=buildCues({totalDur:8,hookDur:3.5,hook,highlights:[]});
    assert.equal(cue.lines.length,lines.length);
    cue.lines.forEach((l,i)=>{assert.equal(l.words.map(w=>w.word).join(' '),lines[i]);if(i)assert.ok(l.box.y>=cue.lines[i-1].box.y+cue.lines[i-1].box.h-.5,style+' collides');});
    assert.ok(cue.box.x>=18&&cue.box.x+cue.box.w<=WIDTH-18,style+' overflows');
    const time=titleTimeline(cue);assert.equal(time.lines.length,lines.length);assert.equal(time.lines[0],0);
    time.lines.forEach((t,i)=>{if(i)assert.ok(t>time.lines[i-1]);});assert.ok(time.landed<1.6);
  }
});
test('Typography uses only FPT orange, blue, green, navy, white and their tints',()=>{
  const source=fs.readFileSync(path.join(P.root,'src/typography/kinetic_overlay.js'),'utf8');
  for(const bad of ['#FFE600','#38003C','#00E5FF','#EF4444','#7F1D1D','#FFF27A'])assert.ok(!source.includes(bad),bad);
  assert.equal(BRAND_STYLES.length,24);assert.equal(new Set(BRAND_STYLES).size,24);
});
test('The illustration card is centred and moves off the face',()=>{
  assert.equal(CARD.x*2+CARD.width,1080);assert.ok(CARD.width%2===0&&CARD.height%2===0);
  assert.equal(cardTop(null,CARD),CARD.y);
  assert.equal(cardTop({top:1180,bottom:1400},CARD),CARD.y);
  const moved=cardTop({top:560,bottom:800},CARD);assert.ok(moved>=800&&moved+CARD.height<=1490);
  assert.ok(cardTop({top:700,bottom:1300},CARD)+CARD.height<=1490);
  assert.equal(uniformInFrame(Buffer.alloc(108*192*3,200)),null);
});
test('Quality gate rejects a worn-out sound and a worn-out look',()=>{
  const words=[{word:'một',startMs:4000,endMs:4300}],subtitles=[{start:4,end:30,text:'một',words}];
  const sfx=[{file:'o1',start:0,group:'opener'},{file:'o2',start:0,group:'opener'},...Array.from({length:8},(_,i)=>({file:'same',start:4+i*3.6}))];
  const highlights=Array.from({length:9},(_,i)=>({text:'một',start:4+i*2,end:5.5+i*2,y:350,scale:1.4,typo:['fpt_a','fpt_b','fpt_c','fpt_a','fpt_d','fpt_e','fpt_a','fpt_f','fpt_a'][i]}));
  const codes=inspectPlan({totalDur:40,subtitles,highlights,brolls:[],sfx,hookDur:3.5,outroStart:40}).errors.map(e=>e.code);
  assert.ok(codes.includes('sfx_overuse'));assert.ok(codes.includes('typography_overuse'));
});

test('Quality gate blocks unsynced subtitles, invented highlights and stray sounds',()=>{
  const words=[{word:'lắp',startMs:4000,endMs:4200},{word:'mạng',startMs:4200,endMs:4500}];
  const base={totalDur:12,hookDur:3.5,outroStart:12,strictSpeech:true,brolls:[],events:[0,5],
    subtitles:[{start:4,end:4.6,text:'lắp mạng',words}],highlights:[{text:'lắp mạng',start:4,end:5,y:350,scale:1.4,typo:'fpt_a',autoDetected:true}],
    sfx:[{file:'a',start:0,group:'opener'},{file:'b',start:0,group:'opener'},{file:'c',start:5}]};
  assert.deepEqual(inspectPlan(base).errors,[]);
  const bad={...base,subtitles:[{...base.subtitles[0],start:4.4}],highlights:[{...base.highlights[0],text:'miễn phí trọn đời'}],sfx:[...base.sfx,{file:'d',start:8}]};
  const codes=inspectPlan(bad).errors.map(e=>e.code);
  for(const c of ['subtitle_drift','highlight_not_spoken','sfx_unanchored'])assert.ok(codes.includes(c),c);
  assert.ok(!inspectPlan({...bad,strictSpeech:false,sfx:base.sfx}).errors.length);
});

test('Long sound that was not recognised stays in the video',()=>{
  const words=[{word:'một',startMs:100,endMs:400}],pauses=[{startMs:500,endMs:900},{startMs:4000,endMs:4400},{startMs:4600,endMs:5000}];
  const regions=speechRegions(words,pauses,5000);
  assert.deepEqual(regions.map(r=>r.words.length),[1,0]);assert.ok(regions[1].startMs<=900&&regions[1].endMs>=4000);
});

test('The same script gets different Highlight looks in the next video, yet a re-export is identical',()=>{
  const items=phrases.map((text,i)=>({text,start:4+i*2,end:5.5+i*2,typo:'fpt_price_burst',autoDetected:true}));
  const a=applyTypographyVariety(items,{seed:'A'}).map(h=>h.typo),again=applyTypographyVariety(items,{seed:'A'}).map(h=>h.typo);
  const b=applyTypographyVariety(items,{seed:'B',recentStyles:a}).map(h=>h.typo);
  assert.deepEqual(a,again);assert.ok(b.filter((s,i)=>s!==a[i]).length>=4,JSON.stringify([a,b]));
  assert.equal(applyTypographyVariety([{text:'Camera AI',start:4,end:6,typo:'fpt_ribbon_cut',styleFrom:'user'}],{seed:'A'})[0].typo,'fpt_ribbon_cut');
  // A style the browser merely carried along is not a choice: the rotation decides.
  const carried=['A','B','C','D','E','F'].map(seed=>applyTypographyVariety([{text:'nội dung',start:4,end:6,typo:'fpt_ribbon_cut'}],{seed})[0].typo);assert.ok(new Set(carried).size>1);
  // Four videos of six cues use the whole set of 24 styles.
  const videos=[];for(let v=0;v<4;v++)videos.unshift(applyTypographyVariety(Array.from({length:6},(_,i)=>({text:'nội dung '+i,start:i*2,end:i*2+1})),{seed:'v'+v,videos}).map(h=>h.typo));
  assert.ok(new Set(videos.flat()).size>=18,String(new Set(videos.flat()).size));
});

test('Bell and cash takes never include the boom recorded at the end of three source files',()=>{
  const boom={'bellring.mp3':3.7,'bellring_2.mp3':4.2,'cash_money.mp3':3.15};
  const checked=loadTakes().filter(t=>boom[t.file]);assert.equal(checked.length,4);
  for(const t of checked){const m=measure(t);assert.ok(m.from+m.duration<boom[t.file],t.id+' '+JSON.stringify(m));}
  assert.equal(familiesFor('giá chỉ từ 195K')[0],'cash');assert.equal(familiesFor('tặng ngay quà')[0],'bell');
});

test('A picture cut always sounds like a movement; a price starts with money',()=>{
  for(const seed of ['a','b','c','d']){
    const d=new SfxDirector({seed});
    for(let i=0;i<10;i++){const s=d.pick(['whoosh'],{start:i*4,only:true});assert.ok(s===null||s.family==='whoosh');}
    assert.equal(new SfxDirector({seed}).pick(familiesFor('giá chỉ từ 7.000 đồng/ngày'),{start:5}).family,'cash');
    assert.equal(new SfxDirector({seed}).pick(familiesFor('miễn phí lắp đặt'),{start:5}).family,'bell');
  }
});

test('Sub text keeps the colours of the standard video and refuses anything else',()=>{
  const {assertBrandSubtitles,KEYWORD_OPEN,KEYWORD_CLOSE}=require('../../src/typography/subtitle_style');
  const line=styleSubtitleKeywords('tặng Camera AI',KEYWORD_OPEN,KEYWORD_CLOSE);
  assert.match(line,/&H0000FFFF&/);assert.match(line,/&H000166FC&/);
  assert.doesNotThrow(()=>assertBrandSubtitles(line));
  assert.throws(()=>assertBrandSubtitles('{\\1c&H00FF00FF&}Camera'),/ngoài các kiểu đã duyệt/);
});

test('Test renders keep a separate style history from real videos',()=>{
  const {execFileSync}=require('child_process'),path=require('path'),root=path.join(__dirname,'../..');
  const file=dir=>execFileSync(process.execPath,['-p','require(process.argv[1]).historyFile()',path.join(root,'src/editing/style_history.js')],{cwd:root,env:{...process.env,FPT_OUTPUT_DIR:dir},encoding:'utf8'}).trim();
  assert.equal(path.basename(file(path.join(root,'output'))),'style_history.json');
  assert.equal(path.basename(file(path.join(root,'var/qa/rendered'))),'style_history_qa.json');
});
