// Never drive the person's own Studio: these tests run only against the server started by run_studio_smoke.js.
if(!process.env.FPT_STUDIO_PORT||process.env.FPT_STUDIO_PORT==='3457'){console.error('Chạy qua npm run test:ui (máy chủ thử riêng), không chạy thẳng vào Studio đang mở.');process.exit(2);}
const PATHS=require('../../config/paths.js');
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../../var/qa/qa_mandatory_browser');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(), events = []; let id = 0;
    ws.onopen = () => resolve({ ws, events, call(method, params = {}) {
      return new Promise((res, rej) => {
        const key = ++id, timeout = setTimeout(() => { pending.delete(key); rej(Error('CDP timeout: ' + method)); }, 60000);
        pending.set(key, { res, rej, timeout }); ws.send(JSON.stringify({ id: key, method, params }));
      });
    }});
    ws.onerror = reject;
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const p = pending.get(message.id); clearTimeout(p.timeout); pending.delete(message.id);
        if (message.error) p.rej(Error(message.error.message)); else p.res(message.result);
      } else events.push(message);
    };
  });
}
(async () => {
  const profile = path.join(require('os').tmpdir(),'fpt-qa-profile-'+Date.now());
  const child = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  let browser, page;
  try {
    const active = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(active); i++) await sleep(100);
    assert.ok(fs.existsSync(active), 'Headless Edge did not start');
    const [port, endpoint] = (await (async()=>{for(let i=0;;i++){try{const t=fs.readFileSync(active,'utf8');if(/\s/.test(t.trim()))return t;}catch(e){if(i>60)throw e;}await sleep(100);}})()).trim().split(/\r?\n/);
    browser = await connect('ws://127.0.0.1:' + port + endpoint);
    const target = await browser.call('Target.createTarget', { url: ('http://127.0.0.1:'+(process.env.FPT_STUDIO_PORT||3457)+'/') });
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    page = await connect(targets.find(t => t.id === target.targetId).webSocketDebuggerUrl);
    await page.call('Runtime.enable'); await page.call('Page.enable');
    const evaluate = async expression => {
      const result = await page.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (let i = 0; i < 100; i++) {
      if (await evaluate("typeof runAutoSub === 'function' && document.readyState === 'complete'")) break;
      await sleep(100);
    }
    await evaluate("window.qaAlerts=[]; window.alert=message=>window.qaAlerts.push(String(message));");

    const click = async selector => {
      const point=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
      await page.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
      await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    };
    for(let i=0;i<100;i++){if(await evaluate('poolVideos.length>0'))break;await sleep(100);}
    await click('#videoPoolWrap > summary');
    for(const name of ['presenter_take_01.mp4','presenter_take_02.mp4','presenter_take_03.mp4','presenter_take_04.mp4']){
      const index=await evaluate('poolVideos.indexOf('+JSON.stringify(name)+')');
      assert.ok(index>=0,'Missing test footage '+name);
      await click('#videoPool button:nth-child('+(index+1)+')');
    }
    await click('#videoPoolWrap > summary');
    assert.equal(await evaluate('selectedVideos.length'),4);
    await click('#autoSubBtn');
    for(let i=0;i<600;i++){if(!await evaluate("document.getElementById('autoSubBtn').disabled"))break;await sleep(300);}
    const subResult=await evaluate('({subtitles:currentSubtitles,windows:currentClipWindows,alerts:qaAlerts})');
    assert.deepEqual(subResult.alerts,[]);
    assert.ok(subResult.subtitles.length>0);
    assert.ok(subResult.windows.every(w=>w.srcPath && !w.estimated));
    const timelineBefore=JSON.stringify(subResult.windows);
    await click('#tlCollapseBtn'); await sleep(100); await click('#tlCollapseBtn');
    assert.equal(JSON.stringify(await evaluate('currentClipWindows')),timelineBefore,'Opening timeline must not alter ASR cuts');
    const spoken=subResult.subtitles.map(s=>s.text).join(' ');
    assert.ok(!/tạng ngay|tạm ngay camera|tuyện lợi|đam thoại/i.test(spoken),spoken);
    console.log('ASR:',spoken);
    await click('#suggestKeywordsBtn');
    for(let i=0;i<100;i++){if(!await evaluate("document.getElementById('suggestKeywordsBtn').disabled"))break;await sleep(100);}
    await click('#btnSyncBulkHighlights');
    for(let i=0;i<100;i++){if(!await evaluate("document.getElementById('btnSyncBulkHighlights').disabled"))break;await sleep(100);}
    const expected=await evaluate('currentHighlights.length');assert.ok(expected>=4);
    // Leave every production field intact; only choose an isolated output name.
    await evaluate(`window.qaFetch=window.fetch;window.fetch=(url,options)=>{
      if(url==='/api/render'){
        const payload=JSON.parse(options.body);payload.projectName='QA_FPT_Mandatory';
        window.qaPayload=payload;return qaFetch(url,{...options,body:JSON.stringify(payload)});
      }
      return qaFetch(url,options);
    };`);
    await click('#renderBtn');
    let last='';
    for(let i=0;i<900;i++){
      const state=await evaluate("({busy:document.getElementById('renderBtn').disabled,label:document.getElementById('progressText').textContent,pct:document.getElementById('progressPct').textContent})");
      if(state.label!==last){console.log(state.pct,state.label);last=state.label;}
      if(!state.busy)break;
      await sleep(400);
    }
    const ui=await evaluate('({alerts:qaAlerts,result:lastRenderResult,payload:qaPayload,subtitles:currentSubtitles})');
    assert.deepEqual(ui.alerts,[]);
    assert.ok(ui.result?.videoUrl,'No final video: '+last);
    const job=JSON.parse(fs.readFileSync(path.join(PATHS.output,'QA_FPT_Mandatory/job.json'),'utf8'));
    const highlights=job.renderedHighlights.filter(h=>h.file!=='hl_outro.png');
    assert.equal(highlights.length,expected);
    assert.ok(new Set(highlights.map(h=>h.typo)).size>=4);
    for(let i=1;i<highlights.length;i++)assert.ok(!highlights.slice(Math.max(0,i-2),i).some(h=>h.typo===highlights[i].typo));
    assert.ok(job.brollCutaways.length>0);
    assert.ok(job.renderedSfx.length>=4);
    assert.ok(job.renderedSfx.some(s=>s.start>3.5 && s.family==='whoosh'),'Expected transition whoosh');
    assert.ok(!/tạng ngay|tạm ngay camera|tuyện lợi|đam thoại/i.test(job.subtitles.map(s=>s.text).join(' ')));
    const errors=page.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.deepEqual(errors,[]);
    const report={passed:true,video:ui.result.outMp4,subtitles:job.subtitles.length,highlights:highlights.length,styles:[...new Set(highlights.map(h=>h.typo))],brolls:job.brollCutaways.length,sfx:job.renderedSfx.length,errors};
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(out,'browser_payload.json'),JSON.stringify(ui.payload,null,2));
    await evaluate("window.scrollTo(0,0)");
    const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(out,'studio-complete.png'),Buffer.from(shot.data,'base64'));
    console.log('PASS end-to-end',JSON.stringify(report));
  } finally {
    if (page) page.ws.close();
    if (browser) { await browser.call('Browser.close').catch(() => {}); browser.ws.close(); }
    else child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
