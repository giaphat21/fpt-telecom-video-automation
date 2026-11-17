const PATHS=require('../config/paths.js');
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../var/qa/qa_highlight_count_browser');
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
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/jobs/fpt-video-1794847822637/job.json'), 'utf8'));
    await evaluate('currentSubtitles=' + JSON.stringify(fixture.subtitles) + '; currentClipWindows=[]; renderSubList();');
    const result = await evaluate("(async()=>{ await autoFillKeywordsToInput(); const suggested=document.getElementById('bulkHighlightInput').value.split(/\\n/).filter(s=>s.trim()).length; await generateBulkHighlights(); return {suggested,generated:currentHighlights.length,alerts:qaAlerts,banner:document.getElementById('hlStatusBanner').textContent,policies:currentHighlights.map(h=>h.timingPolicy)}; })()");
    console.log(JSON.stringify(result, null, 2));
    const errors = page.events.filter(e => e.method === 'Runtime.exceptionThrown');
    console.log('Uncaught browser errors:', JSON.stringify(errors));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ result, errors }, null, 2));
    await evaluate("document.getElementById('bulkHighlightInput').scrollIntoView({block:'start'})");
    const shot = await page.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, 'highlight_count.png'), Buffer.from(shot.data, 'base64'));
    assert.equal(result.alerts.length, 0);
    assert.ok(result.suggested > 5);
    assert.equal(result.generated, result.suggested);
    assert.ok(result.policies.every(p => p === 'preserve_all'));
    console.log('PASS suggestion/create count parity in browser');
  } finally {
    if (page) page.ws.close();
    if (browser) { await browser.call('Browser.close').catch(() => {}); browser.ws.close(); }
    else child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
