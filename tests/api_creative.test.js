const PATHS=require('../config/paths.js');
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { spawn } = require('child_process'), path = require('path'), fs = require('fs');
test('Studio API: creative variants, duration-aware B-roll, empty selection and invalid payload', { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../src/server.js')],
    { env: { ...process.env, FPT_STUDIO_PORT: '3467' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '';
  child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('API startup timeout: ' + logs)), 20000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('API exited ' + code + ': ' + logs)); });
      child.stdout.on('data', () => { if (logs.includes('localhost:3467')) { clearTimeout(timeout); resolve(); } });
    });
    const post = async (route, payload) => {
      const response = await fetch('http://127.0.0.1:3467' + route, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
      return { status: response.status, data: await response.json() };
    };
    const job = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/jobs/fpt-video-1794847822637/job.json'), 'utf8'));
    const plan = await post('/api/creative-plan', { subtitles: job.subtitles, totalDuration: 30, profile: 'energetic', seed: 4 });
    assert.equal(plan.status, 200); assert.ok(plan.data.highlights.length); assert.ok(plan.data.brolls.length);
    assert.equal(plan.data.boundaries.hookDur, 3.5);
    const repeat = await post('/api/creative-plan', { subtitles: job.subtitles, totalDuration: 30, profile: 'energetic', seed: 4 });
    assert.deepEqual(repeat.data, plan.data);
    const empty = await post('/api/detect-brolls', { subtitles: job.subtitles, totalDuration: 30, allowedBrollIds: [] });
    assert.deepEqual(empty.data.brolls, []);
    const off = await post('/api/creative-plan', { subtitles: job.subtitles, totalDuration: 30, autoBroll: false });
    assert.deepEqual(off.data.brolls, []);
    assert.equal((await post('/api/creative-plan', { subtitles: 'bad' })).status, 400);
    const keywords = await post('/api/scan-keywords', { subtitles: job.subtitles });
    const phrases = keywords.data.keywords.map(k => k.text).join('\n');
    const generated = await post('/api/generate-highlights', { subtitles: job.subtitles, totalDuration: job.totalDur, customPhrases: phrases });
    assert.equal(generated.status, 200); assert.equal(generated.data.count, keywords.data.count);
    const rejected = await post('/api/generate-highlights', { subtitles: job.subtitles, totalDuration: job.totalDur, customPhrases: phrases + '\nTặng xe lên sao Hỏa' });
    assert.equal(rejected.status, 422); assert.ok(rejected.data.unmatched.length); assert.equal(rejected.data.highlights, undefined);
    const html = await (await fetch('http://127.0.0.1:3467/')).text();
    assert.ok(html.includes('creativePlanBtn'));
  } finally {
    if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }
});
