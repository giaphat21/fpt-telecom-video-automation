'use strict';
// Drives the real Studio in a browser: analysis -> live preview -> edits with the mouse -> export, and checks that the
// MP4 is built from exactly what the timeline shows. Needs a running Studio (FPT_STUDIO_PORT) and FPT_OUTPUT_DIR.
// Never drive the person's own Studio: these tests run only against the server started by run_studio_smoke.js.
if(!process.env.FPT_STUDIO_PORT||process.env.FPT_STUDIO_PORT==='3457'){console.error('Chạy qua npm run test:ui (máy chủ thử riêng), không chạy thẳng vào Studio đang mở.');process.exit(2);}
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),assert=require('node:assert/strict');
const PATHS=require('../../config/paths.js');
const out=path.join(PATHS.qa,'ui_timeline');fs.mkdirSync(out,{recursive:true});
const PORT=process.env.FPT_STUDIO_PORT||3457,sleep=ms=>new Promise(r=>setTimeout(r,ms));
function connect(url){return new Promise((resolve,reject)=>{
  const ws=new WebSocket(url),pending=new Map(),events=[];let id=0;
  ws.onopen=()=>resolve({ws,events,call:(method,params={})=>new Promise((res,rej)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);rej(Error('CDP timeout: '+method));},180000);pending.set(key,{res,rej,timer});ws.send(JSON.stringify({id:key,method,params}));})});
  ws.onerror=reject;
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id)return events.push(m);const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.rej(Error(m.error.message)):p.res(m.result);};
});}
(async()=>{
  const profile=path.join(require('os').tmpdir(),'fpt-qa-profile-'+Date.now());
  const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(f=>fs.existsSync(f));
  const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,900','about:blank'],{windowsHide:true,stdio:'ignore'});
  let browser,page;
  try{
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<150&&!fs.existsSync(active);i++)await sleep(100);
    const [port,endpoint]=(await (async()=>{for(let i=0;;i++){try{const t=fs.readFileSync(active,'utf8');if(/\s/.test(t.trim()))return t;}catch(e){if(i>60)throw e;}await sleep(100);}})()).trim().split(/\r?\n/);
    browser=await connect('ws://127.0.0.1:'+port+endpoint);
    const target=await browser.call('Target.createTarget',{url:'http://127.0.0.1:'+PORT+'/'});
    const list=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    page=await connect(list.find(t=>t.id===target.targetId).webSocketDebuggerUrl);
    await page.call('Runtime.enable');await page.call('Page.enable');await page.call('Page.bringToFront');
    await page.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const run=async expression=>{const r=await page.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const until=async(expression,label,ms=90000)=>{const end=Date.now()+ms;for(;;){const v=await run(expression);if(v)return v;if(Date.now()>end)throw Error('Quá thời gian: '+label);await sleep(80);}};
    const shot=async name=>{const s=await page.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));};
    const mouse=(type,x,y,extra={})=>page.call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...extra});
    const box=key=>run('(()=>{const e=[...document.querySelectorAll(".tl-b")].find(e=>e._item.key==='+JSON.stringify(key)+');if(!e)return null;e.scrollIntoView({block:"nearest",inline:"nearest"});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
    const drag=async(x,y,dx,steps=12)=>{await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await mouse('mousePressed',x,y);for(let i=1;i<=steps;i++){await mouse('mouseMoved',x+dx*i/steps,y);await sleep(12);}await mouse('mouseReleased',x+dx,y);};
    const settle=async()=>{await sleep(350);await until('document.querySelectorAll(".tl-b.drag").length===0&&TL.idle','kéo xong');await sleep(120);await until("TL.idle","kế hoạch xong");};
    await until('typeof TL==="object"&&Live.isReady&&allSfx.length>0&&brollCatalogData.length>0','tải Studio');
    await run('window.qaAlerts=[];window.alert=m=>qaAlerts.push(String(m))');
    // 1. analysis -> everything on the timeline without pressing anything else
    const timing={};let t0=Date.now();
    await run('for(const n of [1,2,3,4])addVideo("presenter_take_0"+n+".mp4");runAutoSub()');
    timing.autosub=Date.now()-t0;
    await until('studioPlan&&currentHighlights.length>0','kế hoạch dựng');timing.plan=Date.now()-t0;
    await until('Live.preview&&Live.mode==="live"','xem trước');timing.preview=Date.now()-t0;
    assert.ok(await run('currentSubtitles.every(s=>/^[\\p{Lu}\\p{N}]/u.test(s.text))'),'Mỗi câu Sub phải viết hoa đầu câu');
    await run('toggleTimelineCollapse(true)');await until('TL.model.length>30','vẽ timeline');await sleep(700);
    const tracks=await run('TL.model.reduce((a,i)=>{a[i.track]=(a[i.track]||0)+1;return a},{})');
    for(const t of ['video','broll','title','highlight','sub','fx','sfx','music'])assert.ok(tracks[t]>0,'Thiếu lớp '+t);
    const same=await run('({sfx:TL.model.filter(i=>i.track==="sfx").length===studioPlan.sfx.length+studioPlan.mutedSfx.length,hl:TL.model.filter(i=>i.track==="highlight").length===studioPlan.highlights.length,fx:TL.model.filter(i=>i.track==="fx").length===studioPlan.effects.filter(e=>e.kind!=="cut"||e.on).length})');
    assert.deepEqual(same,{sfx:true,hl:true,fx:true});
    await shot('1-timeline');
    // 2. every track can be inspected
    await run('TL.select("highlight",2)');await until('document.querySelectorAll(".tl-style").length===38','bảng 38 kiểu chữ');await sleep(1200);await shot('2-highlight');
    for(const [type,index] of [['sub',1],['hook',0],['outro',0],['broll',1],['video',2],['sfx','hook:open'],['fx','cut:1'],['music',0]]){await run('TL.select('+JSON.stringify(type)+','+JSON.stringify(index)+')');await sleep(120);assert.ok(await run('document.querySelector("#tlInspector h4")!==null'),'Không mở được '+type);}
    // 3. drag a Highlight with the mouse; frames must stay smooth
    let key=await run('TL.model.find(i=>i.track==="highlight"&&i.index===3).key'),b=await box(key),before=await run('({a:currentHighlights[3].start,b:currentHighlights[3].end,others:currentHighlights.map(h=>h.typo),sounds:studioPlan.sfx.map(s=>s.id)})');
    await run('window.qaFrames=[];(()=>{let last=performance.now();const f=n=>{qaFrames.push(n-last);last=n;if(window.qaRun)requestAnimationFrame(f)};window.qaRun=true;requestAnimationFrame(f)})()');
    await run('document.getElementById("tlSnapBtn").click()');
    await drag(b.x+b.w/2,b.y+b.h/2,-600,40);await settle();
    let after=await run('({a:currentHighlights[3].start,b:currentHighlights[3].end,prev:currentHighlights[2].end,edited:currentHighlights[3].edited})');
    assert.ok(after.edited&&after.a>=after.prev+.079,'Highlight phải giữ khoảng cách 0,08s: '+JSON.stringify(after));
    await run('window.qaRun=false');const frames=(await run('qaFrames')).slice(3).sort((x,y)=>x-y);timing.dragP95=Math.round(frames[Math.floor(frames.length*.95)]);timing.dragWorst=Math.round(frames.at(-1));
    const hlSfx=await run('(()=>{const h=currentHighlights[3],s=studioPlan.sfx.find(s=>s.anchor==="hl:"+h.uid);return s?Math.abs(s.start-h.start):0})()');
    assert.ok(hlSfx<.002,'SFX phải đi theo Highlight');
    assert.deepEqual(await run('currentHighlights.map(h=>h.typo)'),before.others,'Sửa một cụm không được đổi kiểu cụm khác');
    // 3b. the Hook is resized with the mouse and its B-roll limit holds
    key='hook';b=await box(key);const hook0=await run('studioPlan.hookDur');
    await drag(b.x+b.w-3,b.y+b.h/2,-60,12);await settle();
    const hook1=await run("studioPlan.hookDur");if(hook1===hook0){console.log(JSON.stringify({b,at:await run("(()=>{const e=document.elementFromPoint("+(b.x+b.w-3)+","+(b.y+b.h/2)+");return e?e.className+"+JSON.stringify("|")+"+(e._item?.key||e.parentElement?._item?.key):null})()"),manual:await run("hookDurManual"),scroll:await run("scrollY"),now:await box(key)}));await shot("hook-fail");}assert.ok(hook1<hook0-.3,'Hook phải ngắn lại: '+hook0+' → '+hook1);
    b=await box(key);await drag(b.x+b.w-3,b.y+b.h/2,500,20);await settle();
    assert.ok(Math.abs(await run('studioPlan.hookDur-currentBrollCutaways[0].start'))<.01,'Hook dừng ở B-roll đầu');
    await run('TL.undo();TL.undo()');await settle();assert.equal(await run('studioPlan.hookDur'),hook0);
    // the preview stays put while the page scrolls
    const pos=await run('(async()=>{const m=document.querySelector(".monitor-wrap"),y=()=>m.getBoundingClientRect().top+scrollY,a=y();scrollTo(0,600);await new Promise(r=>setTimeout(r,120));const b=y(),w=document.querySelector(".workspace").getBoundingClientRect().top+scrollY,bottom=m.getBoundingClientRect().bottom+scrollY;scrollTo(0,0);return {a,b,gap:w-bottom}})()');
    assert.ok(Math.abs(pos.a-pos.b)<1&&pos.gap>=0,'Khung xem trước phải đứng yên, không đè nội dung: '+JSON.stringify(pos));
    // 4. undo / redo
    await run('TL.undo()');await settle();assert.ok(Math.abs(await run('currentHighlights[3].start')-before.a)<.002);
    await run('TL.redo()');await settle();assert.ok(Math.abs(await run('currentHighlights[3].start')-after.a)<.002);
    await run('TL.undo()');await settle();
    // 5. choose a style, a motion and a sound
    await run('TL.select("highlight",4)');await until('document.querySelectorAll(".tl-style:not(:disabled)").length>3','kiểu chữ');
    const chosen=await run('(()=>{const b=[...document.querySelectorAll(".tl-style:not(:disabled)")].find(b=>b.getAttribute("aria-pressed")==="false");b.click();return b.dataset.n})()');await settle();
    assert.equal(await run('studioPlan.highlights.find(h=>h.uid===currentHighlights[4].uid).typo'),chosen);
    const sfxAnchor=await run('studioPlan.sfx.find(s=>s.anchor.startsWith("hl:")).anchor');
    await run('TL.select("sfx",'+JSON.stringify(sfxAnchor)+');(()=>{const v=document.getElementById("tlVol");v.value=.2;v.dispatchEvent(new Event("change"))})()');await settle();
    assert.equal(await run('studioPlan.sfx.find(s=>s.anchor==='+JSON.stringify(sfxAnchor)+').vol'),.2);
    await run('TL.select("sfx","cut:2")');const muted=await run('(()=>{const b=document.getElementById("tlMute");if(b)b.click();return !!b})()');await settle();
    if(muted)assert.ok(await run('studioPlan.mutedSfx.some(s=>s.anchor==="cut:2")'));
    // 6. trim a clip: everything after it ripples with the picture
    const clip=await run('({dur:currentClipWindows[1].timelineDur,total:getTimelineTotalDuration(),last:currentSubtitles.at(-1).start,word:currentSubtitles.at(-1).words[0].startMs})');
    key=await run('TL.model.find(i=>i.track==="video"&&i.index===5).key');b=await box(key);
    await drag(b.x+b.w-3,b.y+b.h/2,-40,10);await settle();
    const trimmed=await run('({total:getTimelineTotalDuration(),subs:currentSubtitles.every(s=>s.end<=getTimelineTotalDuration()+.05)})');
    assert.ok(trimmed.total<clip.total-.1&&trimmed.subs,JSON.stringify([clip,trimmed]));
    await run('TL.undo()');await settle();assert.ok(Math.abs(await run('getTimelineTotalDuration()')-clip.total)<.01);
    // 7. live playback: video, titles and sound advance together
    await until('Live.preview','xem trước sau khi sửa');await run('seekTimeline(0)');await sleep(500);
    await run('window.qaFrames=[];window.qaRun=true;(()=>{let last=performance.now();const f=n=>{qaFrames.push(n-last);last=n;if(window.qaRun)requestAnimationFrame(f)};requestAnimationFrame(f)})();toggleTimelinePlay()');
    await until('Live.time()>2','phát xem trước',20000);const played=await run('({t:Live.time(),playing:Live.playing})');await run('window.qaRun=false;toggleTimelinePlay()');
    assert.ok(played.playing&&played.t>2,'Xem trước không chạy: '+JSON.stringify(played));
    const pf=(await run('qaFrames')).slice(5).sort((x,y)=>x-y);timing.playP95=Math.round(pf[Math.floor(pf.length*.95)]);
    const grab=async t=>{await run('seekTimeline('+t+')');await sleep(900);const clipBox=await run('(()=>{const r=document.querySelector(".phone-screen").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');const s=await page.call('Page.captureScreenshot',{format:'png',clip:{...clipBox,scale:2}});fs.writeFileSync(path.join(out,'live-'+t+'.png'),Buffer.from(s.data,'base64'));};
    for(const t of [1.5,4.2,5.4,7,11.9])await grab(t);
    // 8. add and delete on the timeline
    const n=await run('({h:currentHighlights.length,s:currentSubtitles.length})');
    await run('document.getElementById("tlAddSfx").click()');await settle();assert.ok(await run('studioPlan.sfx.some(s=>s.anchor.startsWith("custom:"))'),'Thêm SFX');
    await run('TL.undo()');await settle();assert.ok(!await run('studioPlan.sfx.some(s=>s.anchor.startsWith("custom:"))'));
    await run('TL.select("highlight",0);document.getElementById("tlDeleteBtn").click()');await settle();assert.equal(await run('currentHighlights.length'),n.h-1);
    await run('TL.undo()');await settle();assert.equal(await run('currentHighlights.length'),n.h);
    // 8b. every kind of block has a handle on both ends
    const ends=await run('Object.fromEntries(["video","broll","title","highlight","sub","sfx","music"].map(t=>[t,[...document.querySelectorAll(".tl-row[data-track="+t+"] .tl-b:not(.off)")].every(e=>e.querySelector(".tl-h.l")&&e.querySelector(".tl-h.r"))]))');
    assert.ok(Object.values(ends).every(Boolean),'Thiếu tay kéo hai đầu: '+JSON.stringify(ends));
    const item=(type,index)=>run('(()=>{const i=TL.model.find(i=>i.type==='+JSON.stringify(type)+(index==null?'':'&&String(i.index)==='+JSON.stringify(String(index)))+');return i?{key:i.key,start:i.start,end:i.end,index:i.index}:null})()');
    const pull=async(type,index,side,dx)=>{const i=await item(type,index);const q=await box(i.key);await drag(side==='l'?q.x+3:side==='r'?q.x+q.w-3:q.x+q.w/2,q.y+q.h/2,dx,10);await settle();return i;};
    // Hook and Outro from both ends, and moved
    let h0=await pull('hook',0,'l',60),h1=await item('hook',0);assert.ok(h1.start>h0.start+.3,'Kéo đầu Hook');
    await run('TL.undo()');await settle();
    let o0=await pull('outro',0,'r',-50),o1=await item('outro',0);assert.ok(o1.end<o0.end-.3,'Kéo đuôi Outro');
    await run('TL.undo()');await settle();
    // music, SFX and effects
    let m0=await pull('music',null,'r',-200),m1=await item('music');assert.ok(m1.end<m0.end-1,'Thu ngắn nhạc');
    await run('TL.undo()');await settle();
    const longSfx=await run('studioPlan.sfx.filter(s=>s.duration>.6&&!s.user).sort((a,b)=>b.duration-a.duration)[0].anchor');
    let s0=await pull('sfx',longSfx,'r',-18),s1=await item('sfx',longSfx);assert.ok(s1.end<s0.end-.1,'Thu ngắn SFX: '+JSON.stringify([s0,s1]));
    assert.ok(Math.abs(s1.start-s0.start)<.01);await run('TL.undo()');await settle();
    const fade0=await pull('fx','fade','l',-40),fade1=await item('fx','fade');assert.ok(fade1.start<fade0.start-.2,'Kéo dài hiệu ứng tối dần');
    await run('TL.undo()');await settle();
    // split, copy, paste, duplicate and delete on every kind of block, with the keyboard
    const key2=async(code,ctrl)=>{const k={KeyC:'c',KeyV:'v',KeyX:'x',KeyD:'d',KeyS:'s',KeyZ:'z',Delete:'Delete'}[code];for(const type of ['keyDown','keyUp'])await page.call('Input.dispatchKeyEvent',{type,code,key:k,modifiers:ctrl?2:0,windowsVirtualKeyCode:{KeyC:67,KeyV:86,KeyX:88,KeyD:68,KeyS:83,KeyZ:90,Delete:46}[code]});await settle();};
    const count=()=>run('({title:extraTitles.length,highlight:currentHighlights.length,sub:currentSubtitles.length,broll:currentBrollCutaways.length,sfx:customSfx.length,music:musicSegments?musicSegments.length:1,video:currentClipWindows.length})');
    const tries=[['hook',0,'title'],['highlight',2,'highlight'],['sub',6,'sub'],['broll',1,'broll'],['video',3,'video'],['music',null,'music'],['sfx',longSfx,'sfx']];
    for(const [type,index,group] of tries){
      const i=await item(type,index),before=await count();
      await run('TL.select('+JSON.stringify(type)+','+JSON.stringify(i.index)+',{seek:false});seekTimeline('+((i.start+i.end)/2)+');document.activeElement.blur()');await sleep(80);
      await key2('KeyS');
      const cutN=await count();assert.equal(cutN[group],before[group]+1,'Cắt '+type+': '+JSON.stringify([before,cutN]));
      await key2('KeyZ',true);assert.deepEqual(await count(),before,'Hoàn tác cắt '+type);
    }
    for(const [type,index,group] of tries){
      const i=await item(type,index),before=await count();
      await run('TL.select('+JSON.stringify(type)+','+JSON.stringify(i.index)+',{seek:false});document.activeElement.blur()');
      await key2('KeyC',true);
      // music covers the whole video: free some room before pasting it
      if(type==='music'){await run('TL.select("music","all",{seek:false})');await pull('music',null,'r',-420);}
      await run('seekTimeline('+(type==='highlight'||type==='sub'?10.2:type==='music'?8:type==='broll'?9.1:5)+');document.activeElement.blur()');await sleep(60);
      await key2('KeyV',true);
      const now=await count();assert.equal(now[group],before[group]+1,'Dán '+type+': '+JSON.stringify([before,now,await run('document.getElementById("liveStatus").textContent')]));
      await run('TL.undo()');await settle();if(type==='music'){await run('TL.undo()');await settle();}
      assert.deepEqual(await count(),before,'Hoàn tác dán '+type);
    }
    // effects: add, see, resize, copy, cut, delete; the built-in ones can be removed and brought back
    const fxCount=()=>run('TL.model.filter(i=>i.track==="fx").length');let fxBase=await fxCount();
    await run('seekTimeline(2);(()=>{const m=document.getElementById("tlAddFx");m.value="shake";m.dispatchEvent(new Event("change"))})()');await settle();assert.equal(await fxCount(),fxBase+1,'Thêm hiệu ứng');
    const own=await run('"fx:"+customFx[0].uid');let e0=await pull('fx',own,'r',40),e1=await item('fx',own);assert.ok(e1.end>e0.end+.3,'Kéo dài hiệu ứng');
    await run('TL.select("fx",'+JSON.stringify(own)+',{seek:false});document.activeElement.blur()');await key2('KeyC',true);await run('seekTimeline(5);document.activeElement.blur()');await key2('KeyV',true);assert.equal(await run('customFx.length'),2,'Dán hiệu ứng');
    await run('seekTimeline(customFx[1].start+.3)');await key2('KeyS');assert.equal(await run('customFx.length'),3,'Cắt hiệu ứng');
    await key2('Delete');
    await run('TL.select("fx","fade",{seek:false});document.activeElement.blur()');await key2('Delete');assert.ok(!await run('studioPlan.effects.some(e=>e.kind==="fade")'),'Xóa tối dần');
    await run('(()=>{const m=document.getElementById("tlAddFx");m.value="fade";m.dispatchEvent(new Event("change"))})()');await settle();assert.ok(await run('studioPlan.effects.some(e=>e.kind==="fade")'),'Thêm lại tối dần');
    // a repeated look never stops anything: one button replaces it
    await run('currentHighlights.forEach(h=>{h.typo="fpt_price_burst";h.styleFrom="user"});TL.changed({now:true})');await settle();
    const repeated=await run('({n:studioPlan.repeats.length,shown:!document.getElementById("tlFixStyles").hidden})');
    if(repeated.n){assert.ok(repeated.shown);await run('document.getElementById("tlFixStyles").click()');await settle();}
    assert.equal(await run('studioPlan.repeats.length'),0,'Nút tự đổi kiểu');await run('TL.undo();'+(repeated.n?'TL.undo();':''));await settle();
    await run('currentHighlights.forEach(h=>{if(h.typo==="fpt_price_burst"){delete h.styleFrom;delete h.typo}});TL.changed({now:true})');await settle();
    // a pasted title and a cut title are drawn and exported
    await run('TL.select("hook",0,{seek:false});TL.copy();seekTimeline(8.6);TL.paste()');await settle();
    assert.equal(await run('studioPlan.titles.length'),1);await sleep(500);await shot('4-title');
    // Sub looks
    await run('TL.select("sub",3)');await until('document.querySelectorAll("#tlStyles .tl-style").length>=14','kiểu Sub');await shot('5-sub');
    await run('document.querySelector("#tlStyles .tl-style[data-n=trang_vien_cam]").click()');await settle();assert.equal(await run('studioPlan.subStyle'),'trang_vien_cam');
    // moving a clip keeps its words with it
    const first=await run('({words:currentSubtitles.map(s=>s.text).sort().join(),total:getTimelineTotalDuration()})');
    await pull('video',0,null,330);const moved=await run('({words:currentSubtitles.map(s=>s.text).sort().join(),total:getTimelineTotalDuration(),first:currentSubtitles[0].text})');
    assert.equal(moved.words,first.words);assert.ok(Math.abs(moved.total-first.total)<.01);assert.ok(!/^Lắp đặt/.test(moved.first),'Cảnh 1 phải dời: '+moved.first);
    await run('TL.undo()');await settle();
    // 9. typing stays responsive and is kept
    await run('TL.select("sub",2)');t0=Date.now();
    await run('(async()=>{const i=document.getElementById("tlText");for(const c of [" a"," ab"," abc"]){i.value="Modem Wi-Fi 6"+c;i.dispatchEvent(new Event("input"));await new Promise(r=>setTimeout(r,20))}i.value="Modem Wi-Fi 6 mới nhất";i.dispatchEvent(new Event("input"))})()');timing.typing=Date.now()-t0;
    await settle();assert.equal(await run('studioPlan.subtitles[2].text'),'Modem Wi-Fi 6 mới nhất');
    // 10. another look for the same content
    const look=await run('({hook:hookStyle,outro:outroStyle,typos:currentHighlights.map(h=>h.typo)})');
    await run('document.getElementById("tlShuffle").click()');await settle();await settle();
    const look2=await run('({hook:hookStyle,outro:outroStyle,typos:currentHighlights.map(h=>h.typo)})');
    assert.notEqual(look.hook,look2.hook,'Hook phải đổi');assert.ok(look2.typos.filter((t,i)=>t!==look.typos[i]).length>=4,'Kiểu chữ phải đổi: '+JSON.stringify([look,look2]));
    // 11. export uses exactly this plan
    const expected=await run('({hook:studioPlan.hook.style,outro:studioPlan.outro.style,hl:studioPlan.highlights.map(h=>[h.text,h.typo,h.motion,h.start]),sfx:studioPlan.sfx.map(s=>[s.anchor,s.id,s.start,s.vol])})');
    t0=Date.now();await run('(()=>{const f=window.fetch;window.fetch=(u,o)=>{if(u==="/api/render"){const p=JSON.parse(o.body);p.projectName="QA_Timeline";o={...o,body:JSON.stringify(p)}}return f(u,o)}})();startRender()');
    timing.render=Date.now()-t0;
    assert.deepEqual(await run('qaAlerts'),[]);
    const job=JSON.parse(fs.readFileSync(path.join(PATHS.output,'QA_Timeline/job.json'),'utf8'));
    assert.equal(job.hookStyle,expected.hook);assert.equal(job.subStyle,'trang_vien_cam');assert.equal(job.extraTitles.length,1);assert.ok(job.customFx.length>=1);
    assert.ok(/F37021|2170F3/i.test(fs.readFileSync(path.join(PATHS.output,'QA_Timeline/subtitles.ass'),'utf8')));assert.equal(job.outroStyle,expected.outro);
    assert.deepEqual(job.renderedHighlights.filter(h=>h.file!=='hl_outro.png').map(h=>[h.text.replace(/\s+/g,' '),h.typo,h.motion,h.start]),expected.hl);
    assert.deepEqual(job.renderedSfx.map(s=>[s.anchor,s.id,s.start,s.vol]),expected.sfx);
    assert.equal(job.qualityReport.passed,true);
    assert.equal(await run('Live.mode'),'final');await shot('3-final');
    // 12. the next video looks different
    await run('runAutoSub()');await until('studioPlan&&hookStyle','video kế tiếp');await sleep(600);
    assert.notEqual(await run('hookStyle'),expected.hook,'Hook video kế tiếp phải khác');
    const errors=page.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description);assert.deepEqual(errors,[]);
    const report={passed:true,tracks,timing};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
    console.log('PASS timeline',JSON.stringify(report));
  }finally{
    if(page)page.ws.close();
    if(browser){await browser.call('Browser.close').catch(()=>{});browser.ws.close();}else child.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
