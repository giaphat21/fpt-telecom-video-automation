'use strict';
// Drives the real Studio in a browser: analysis -> live preview -> edits with the mouse -> export, and checks that the
// MP4 is built from exactly what the timeline shows. Needs a running Studio (FPT_STUDIO_PORT) and FPT_OUTPUT_DIR.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),assert=require('node:assert/strict');
const PATHS=require('../../config/paths.js');
const out=path.join(PATHS.qa,'ui_long');fs.mkdirSync(out,{recursive:true});
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
    await run('for(const n of [1,2,3,4])addVideo("presenter_take_0"+n+".mp4");runAutoSub()');
    await until('studioPlan&&Live.preview','xem trước');
    // the same material five times over: about 66 s, 30 clips, 65 Sub lines
    await run(`(()=>{
      const T=getTimelineTotalDuration(),C=currentClipWindows.map(c=>({...c})),S=currentSubtitles.map(s=>structuredClone(s)),H=currentHighlights.map(h=>structuredClone(h)),B=currentBrollCutaways.map(b=>structuredClone(b));
      const shift=(x,d,k)=>{x=structuredClone(x);x.start=+(x.start+d).toFixed(3);x.end=+(x.end+d).toFixed(3);x.id=(x.id||0)+'_'+k;if(x.uid)x.uid+='_'+k;if(x.words)x.words=x.words.map(w=>({...w,startMs:w.startMs+Math.round(d*1000),endMs:w.endMs+Math.round(d*1000)}));if(x.speechStart!=null){x.speechStart=x.start;x.speechEnd=x.end;}return x;};
      for(let k=1;k<5;k++){currentClipWindows.push(...C.map(c=>({...c,id:'k'+k})));currentSubtitles.push(...S.map(s=>shift(s,T*k,k)));currentHighlights.push(...H.map(h=>({...shift(h,T*k,k),edited:true})));currentBrollCutaways.push(...B.map(b=>shift(b,T*k,k)));}
      highlightsTouched=true;studioSeed+='_long';syncClipWindows();toggleTimelineCollapse(true);TL.changed({prepare:true,now:true});
    })()`);
    await until('getTimelineTotalDuration()>60&&TL.idle&&Live.preview.totalDur>60','video dài',120000);await sleep(900);
    const state=await run('({blocks:TL.model.length,shown:document.querySelectorAll(".tl-b").length,px:document.getElementById("timelineCanvasInner").offsetWidth/getTimelineTotalDuration(),hl:currentHighlights.length,total:getTimelineTotalDuration()})');
    assert.ok(state.px>=58,'Chữ trên timeline phải đọc được: '+state.px);assert.ok(state.shown<state.blocks,'Chỉ vẽ phần đang nhìn');
    await shot('1-long');
    const meter=async(label,work)=>{await run('window.qaFrames=[];window.qaRun=true;(()=>{let last=performance.now();const f=n=>{qaFrames.push(n-last);last=n;if(window.qaRun)requestAnimationFrame(f)};requestAnimationFrame(f)})()');await work();await run('window.qaRun=false');const f=(await run('qaFrames')).slice(4).sort((a,b)=>a-b);return {p95:Math.round(f[Math.floor(f.length*.95)]),worst:Math.round(f.at(-1))};};
    const perf={};
    await run('TL.select("highlight",1)');await sleep(1200);
    const at=await box(await run('TL.model.find(i=>i.type==="highlight"&&i.index===1).key'));
    perf.drag=await meter('drag',async()=>{await drag(at.x+at.w/2,at.y+at.h/2,-160,50);});await settle();
    perf.scroll=await meter('scroll',()=>run('(async()=>{const w=document.getElementById("timelineScrollWrap");for(let i=0;i<60;i++){w.scrollLeft=i*70;await new Promise(r=>requestAnimationFrame(r));}w.scrollLeft=0})()'));
    perf.zoom=await meter('zoom',()=>run('(async()=>{const z=document.getElementById("tlZoom");for(let i=0;i<40;i++){z.value=30+i;z.oninput({target:z});await new Promise(r=>requestAnimationFrame(r));}})()'));
    await run('document.getElementById("tlFit").click();seekTimeline(20)');await sleep(400);
    perf.scrub=await meter('scrub',()=>run('(async()=>{for(let i=0;i<60;i++){seekTimeline(20+i*.3);await new Promise(r=>requestAnimationFrame(r));}})()'));
    await run('seekTimeline(16);toggleTimelinePlay()');await until('Live.playing&&Live.time()>17','phát');perf.play=await meter('play',()=>sleep(5000));await run('toggleTimelinePlay()');
    perf.typing=await run('(async()=>{TL.select("sub",30);await new Promise(r=>setTimeout(r,500));const i=document.getElementById("tlText"),a=performance.now();let worst=0;for(let k=0;k<20;k++){const s=performance.now();i.value="Nội dung "+k;i.dispatchEvent(new Event("input"));worst=Math.max(worst,performance.now()-s);await new Promise(r=>setTimeout(r,15));}return Math.round(worst)})()');
    perf.plan=await run('(async()=>{const a=performance.now();await fetch("/api/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(buildRenderPayload())}).then(r=>r.json());return Math.round(performance.now()-a)})()');
    for(const k of ['drag','scroll','zoom','scrub','play'])assert.ok(perf[k].p95<=40,k+' chưa mượt: '+JSON.stringify(perf));
    assert.ok(perf.typing<30&&perf.plan<600,JSON.stringify(perf));
    const errors=page.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description);assert.deepEqual(errors,[]);
    // uploads: several at once, order kept, the same clip is not sent twice
    const up=await run(`(async()=>{
      invalidateStudioAnalysis();selectedVideos=[];const get=async n=>new File([await (await fetch('/assets/source-videos/'+n)).blob()],'qa_'+n,{type:'video/mp4'});
      const files=await Promise.all(['presenter_take_03.mp4','presenter_take_01.mp4','presenter_take_02.mp4'].map(get)),a=performance.now();
      await handleUploadedVideos(files);return {ms:Math.round(performance.now()-a),names:selectedVideos,alerts:qaAlerts};
    })()`);
    assert.deepEqual(up.alerts,[]);assert.deepEqual(up.names,['presenter_take_03.mp4','presenter_take_01.mp4','presenter_take_02.mp4'],'Clip đã có phải dùng lại, giữ thứ tự');
    console.log('PASS long',JSON.stringify({state,perf,upload:up.ms}));
  }finally{
    if(page)page.ws.close();
    if(browser){await browser.call('Browser.close').catch(()=>{});browser.ws.close();}else child.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
