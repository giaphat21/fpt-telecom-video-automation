const PATHS=require('../config/paths.js');
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { runFptPipeline } = require('../src/core/video_pipeline');
const { resolveMediaPath } = require('../src/core/subtitle_generator');
const { suggestKeywords, matchHighlightRequest } = require('../src/core/highlight_planner');
const { autoDetectBrollFromSubtitles } = require('../src/core/broll_compositor');
const { boundaries } = require('../src/core/timeline_rules');
(async () => {
  const root = path.resolve(__dirname, '..');
  const original = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/jobs/fpt-video-1794847822637/job.json'), 'utf8'));
  const speed = 1.25; let cursor = 0;
  const windows = original.clipWindows.map(w => {
    const duration = (w.trimEnd - w.trimStart) / speed;
    const result = { ...w, srcPath: resolveMediaPath(w.fileRef), timelineStart: cursor, timelineDur: duration };
    cursor += duration; return result;
  });
  const bounds = boundaries(cursor), suggestions = suggestKeywords(original.subtitles);
  const plan = matchHighlightRequest(suggestions.map(k => k.text), original.subtitles, cursor);
  const brolls = autoDetectBrollFromSubtitles(original.subtitles, bounds.hookDur, bounds.outroStart);
  const result = await runFptPipeline({ ...original, projectName: 'QA_HighlightCount',
    voiceSpeed: speed, clipWindows: windows, highlights: plan.highlights, brollCutaways: brolls,
    hook: { line1: 'COMBO FPT', line2: '', line3: '', line4: '', y: 320, scale: 1.3 },
    outro: { line1: 'ĐĂNG KÝ NGAY', line2: '', line3: '', y: 320, scale: 1.3 },
    illustrations: [], customBgm: null, disableBgm: true, exportCapcut: false },
    console.log, (p, label) => console.log(p + '% ' + label));
  assert.ok(fs.statSync(result.outMp4).size > 100000);
  const saved = JSON.parse(fs.readFileSync(path.join(PATHS.output,'QA_HighlightCount/job.json'), 'utf8'));
  assert.equal(saved.renderedHighlights.filter(h => h.file !== 'hl_outro.png').length, suggestions.length);
  console.log('PASS rendered count: ' + suggestions.length + '/' + suggestions.length);
  assert.ok(saved.renderedHighlights.length); assert.ok(saved.brollCutaways.length);
  assert.equal(result.capcutSuccess, false);
  for (const h of saved.renderedHighlights.filter(h => h.file !== 'hl_outro.png'))
    assert.ok(plan.highlights.some(x => Math.abs(x.start - h.start) < 0.001));
  console.log('PASS full pipeline:', result.outMp4);
})().catch(e => { console.error(e); process.exitCode = 1; });
