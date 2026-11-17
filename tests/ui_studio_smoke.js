const PATHS=require('../config/paths.js');
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../var/qa/qa_studio_ui');
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
  const profile = path.join(out, 'profile-' + Date.now());
  const child = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  let browser, page;
  try {
    const active = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(active); i++) await sleep(100);
    assert.ok(fs.existsSync(active), 'Headless Edge did not start');
    const [port, endpoint] = fs.readFileSync(active, 'utf8').trim().split(/\r?\n/);
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

    const snapshot = async name => {
      const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
    };
    const click = async selector => {
      const point=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
      await page.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
      await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    };
    const check=await evaluate(`(()=>{
      const visible=e=>!!(e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');
      const controls=['hookPosY','hookScale','hlGlobalY','hlGlobalScale','creativeProfile','autoBrollToggle','bgmMode','useOriginalVideoAudio'];
      return {collapsed:getComputedStyle(document.getElementById('timelineBody')).display==='none',
        hiddenControls:controls.every(id=>!visible(document.getElementById(id))),
        hiddenBroll:!visible(document.getElementById('brollQueueList')),
        fixed:[...['hookPosY','hookScale','hlGlobalY','hlGlobalScale'].map(id=>document.getElementById(id).value)],
        overflow:document.documentElement.scrollWidth>innerWidth,
        body:document.body.innerText};
    })()`);
    assert.ok(check.collapsed && check.hiddenControls && check.hiddenBroll);
    assert.deepEqual(check.fixed,['320','1.3','350','1.4']);
    assert.equal(check.overflow,false);
    for(const text of ['Biến tấu','Tốc Độ Giọng','Kích thước (Scale)','Minh họa thiết bị','B-roll tự động']) assert.ok(!check.body.includes(text));
    await snapshot('desktop-empty');
    await click('#tlCollapseBtn');
    await sleep(120);
    assert.equal(await evaluate("document.getElementById('tlCollapseBtn').getAttribute('aria-expanded')"),'true');
    assert.ok(await evaluate("document.getElementById('timelineScrollWrap').clientWidth>200 && document.getElementById('timelineRuler').children.length>0"));
    await click('#tlCollapseBtn');
    assert.equal(await evaluate("getComputedStyle(document.getElementById('timelineBody')).display"),'none');

    const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/jobs/fpt-video-1794847822637/job.json'),'utf8'));
    await evaluate('currentSubtitles='+JSON.stringify(fixture.subtitles)+';currentClipWindows=[];selectedVideos=["presenter_take_01.mp4"];renderSelectedVideos();renderSubList();');
    await click('#suggestKeywordsBtn');
    for(let i=0;i<150;i++){if(!await evaluate("document.getElementById('suggestKeywordsBtn').disabled"))break;await sleep(100);}
    const suggested=await evaluate("document.getElementById('bulkHighlightInput').value.split(/\\n/).filter(s=>s.trim()).length");
    assert.ok(suggested>5);
    await click('#btnSyncBulkHighlights');
    for(let i=0;i<150;i++){if(!await evaluate("document.getElementById('btnSyncBulkHighlights').disabled"))break;await sleep(100);}
    assert.equal(await evaluate('currentHighlights.length'),suggested);
    assert.equal(await evaluate("document.getElementById('highlightDetails').open"),false);
    assert.equal(await evaluate("document.getElementById('subDetails').open"),false);
    await evaluate("selectedTimelineItem={type:'highlight',index:0};document.activeElement.blur()");
    await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
    await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
    assert.equal(await evaluate('currentHighlights.length'),suggested,'Collapsed timeline must ignore deletion hotkeys');
    await evaluate("window.scrollTo(0,0)");
    await snapshot('desktop-content');

    await click('#highlightDetails > summary');
    assert.ok(await evaluate("document.querySelector('#highlightList input').getClientRects().length>0"));
    await click('#titleDetails > summary');
    await evaluate("document.getElementById('hook1').value='NỘI DUNG THỬ';document.getElementById('hook1').dispatchEvent(new Event('input',{bubbles:true}))");
    await click('#tlCollapseBtn');
    await sleep(120);
    assert.equal(await evaluate("document.querySelectorAll('#trackHighlights .tl-block').length"),suggested);
    await snapshot('desktop-editor');
    await click('#tlCollapseBtn');
    await click('#titleDetails > summary');
    await click('#highlightDetails > summary');

    await page.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await evaluate("window.scrollTo(0,0)");
    await sleep(100);
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,'Mobile must not overflow');
    await snapshot('mobile');
    await click('#highlightDetails > summary');
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,'Expanded editor must fit mobile');
    await click('#highlightDetails > summary');

    // Intercept only media upload/render submission: inspect UI payload without launching a render.
    await evaluate(`window.qaFetch=window.fetch;window.fetch=async(url,options)=>{
      if(String(url).startsWith('/api/upload?kind=bgm')){
        window.qaMusic={url:String(url),size:options.body.size};
        return new Response(JSON.stringify({ok:true,fileName:'qa_music.wav',url:'/qa_music.wav'}),{headers:{'Content-Type':'application/json'}});
      }
      if(url==='/api/render'){window.qaPayload=JSON.parse(options.body);return new Response(JSON.stringify({ok:false,error:'QA submission captured'}),{headers:{'Content-Type':'application/json'}});}
      return qaFetch(url,options);
    };`);
    const wav=path.join(out,'qa_music.wav');
    const bytes=Buffer.alloc(844);
    bytes.write('RIFF');bytes.writeUInt32LE(836,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(800,40);fs.writeFileSync(wav,bytes);
    const dom=await page.call('DOM.getDocument');
    const input=await page.call('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#customBgmInput'});
    await page.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[wav]});
    for(let i=0;i<100;i++){if(await evaluate("typeof qaMusic!=='undefined' && !document.getElementById('customBgmInput').disabled"))break;await sleep(50);}
    assert.equal(await evaluate('customBgmFile.name'),'qa_music.wav');
    assert.equal(await evaluate("document.getElementById('customBgmInfo').textContent"),'qa_music.wav');
    await click('#renderBtn');
    for(let i=0;i<100;i++){if(await evaluate("typeof qaPayload!=='undefined'"))break;await sleep(50);}
    const payload=await evaluate('qaPayload');
    assert.equal(payload.voiceSpeed,1.25);
    assert.equal(payload.useOriginalVideoAudio,true);
    assert.equal(payload.autoBroll,true);
    assert.equal(payload.highlightY,350);
    assert.equal(payload.highlightScale,1.4);
    assert.equal(payload.hook.y,320);
    assert.equal(payload.hook.scale,1.3);
    assert.equal(payload.hook.line1,'NỘI DUNG THỬ');
    assert.equal(payload.customBgm,'qa_music.wav');
    assert.equal(payload.highlights.length,suggested);
    const errors=page.events.filter(e=>e.method==='Runtime.exceptionThrown');
    assert.deepEqual(errors,[]);
    for(let i=0;i<100;i++){if(await evaluate('qaAlerts.length>0'))break;await sleep(50);}
    const alerts=await evaluate('qaAlerts');
    assert.deepEqual(alerts,['Lỗi: QA submission captured']);
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks:check,suggested,generated:payload.highlights.length,music:payload.customBgm,errors,passed:true},null,2));
    console.log('PASS: clean desktop/mobile UI; collapsed timeline; fixed defaults; highlight parity; music upload; render payload.');
  } finally {
    if (page) page.ws.close();
    if (browser) { await browser.call('Browser.close').catch(() => {}); browser.ws.close(); }
    else child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
