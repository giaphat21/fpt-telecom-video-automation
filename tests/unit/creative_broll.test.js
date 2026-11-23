const PATHS=require('../../config/paths.js');
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { normalize, wordTimeline, findPhrase, boundaries, scheduleHighlights, scheduleSfx } = require('../../src/editing/timeline_rules');
const { createHighlights, matchHighlights } = require('../../src/editing/highlight_planner');
const { autoDetectBrollFromSubtitles: detect, selectBrollSpecs, normalizeBrollSpec, resolveBrollSpec, getBrollCatalog } = require('../../src/broll/broll_compositor');
const sub = (text, start, step = 0.2) => ({ text, start, end: start + text.split(' ').length * step,
  words: text.split(' ').map((word, i) => ({ word, startMs: Math.round((start + i * step) * 1000), endMs: Math.round((start + (i + 1) * step) * 1000) })) });
const catalog = [
  { id: 'stock_football', available: true, keywords: ['ngoại hạng', 'NHA'], defaultLayout: 'top_half', duration: 3.8 },
  { id: 'stock_wifi6', available: true, keywords: ['wifi', 'modem'], defaultLayout: 'pip', duration: 3.5 },
  { id: 'stock_camera', available: true, keywords: ['camera', 'AI'], defaultLayout: 'pip', duration: 3.5 }
];
const options = { catalog };
test('B-roll covers the complete spoken context including its leading verb', () => {
  const matches = detect([sub('xem ngay ngoại hạng anh', 4.123)], 3.5, 30, null, options);
  assert.equal(matches[0].start, 4.123);
  assert.equal(matches[0].end, 5.123);assert.equal(matches[0].duration,1);
});
test('phrases match across adjacent subtitle rows', () => {
  const result = detect([sub('ngoại', 4), sub('hạng anh', 4.2)], 3.5, 30, null, options);
  assert.equal(result[0].start, 4);
  assert.equal(detect([sub('ngoại', 4), sub('hạng anh', 6)], 3.5, 30, null, options).length, 0);
});
test('do not confuse seconds above 100 with milliseconds', () => {
  assert.equal(wordTimeline([{ words: [{ word: 'camera', start: 105.123, end: 106 }] }])[0].start, 105.123);
  assert.equal(detect([sub('camera', 105.123)], 3.5, 120, null, options)[0].start, 105.123);
});
test('word boundaries and ambiguous acronyms prevent false topics', () => {
  assert.equal(detect([sub('ai cũng thấy nha nhà mình', 4)], 3.5, 30, null, options).length, 0);
  assert.equal(detect([sub('NHA', 4)], 3.5, 30, null, options)[0].brollId, 'stock_football');
  assert.equal(findPhrase(wordTimeline([sub('wifispeed', 4)]), 'wifi').length, 0);
  assert.equal(normalize('Wi-Fi 6'), 'wifi 6');
});
test('hook exclusion uses keyword time, not sentence time', () => {
  assert.equal(detect([sub('xem ngay ngoại hạng', 3.2)], 3.5, 30, null, options)[0].start, 3.6);
  assert.equal(detect([sub('camera', 3.3)], 3.5, 30, null, options).length, 0);
});
test('auto clips keep speech spans without fixed duration or forced gaps; topics can recur', () => {
  const result=detect([sub('camera',4),sub('wifi',8),sub('camera',9),sub('wifi',18)],3.5,21,null,options);
  assert.deepEqual(result.map(x=>[x.start,x.end]),[[4,4.2],[8,8.2],[9,9.2],[18,18.2]]);
  result.forEach(x=>{assert.equal(x.start,x.speechStart);assert.equal(x.end,x.speechEnd);});
});

test('all unchecked, unavailable media and missing timestamps produce no fabricated placements', () => {
  assert.deepEqual(detect([sub('camera', 4)], 3.5, 30, [], options), []);
  assert.deepEqual(detect([{ text: 'camera', start: 4, end: 6 }], 3.5, 30, null, options), []);
  assert.deepEqual(detect([sub('camera', 4)], 3.5, 30, null, { catalog: catalog.map(b => ({ ...b, available: false })) }), []);
});
test('empty edited timeline stays empty; explicit selection survives when allowed', () => {
  assert.deepEqual(selectBrollSpecs({ brollCutaways: [] }, [sub('camera', 4)], 3.5, 30), []);
  assert.deepEqual(selectBrollSpecs({ autoBroll: false, brollCutaways: [{ start: 4, end: 8 }] }, [], 3.5, 30), []);
  assert.equal(selectBrollSpecs({ allowedBrollIds: [], brollCutaways: [{ brollId: 'user_custom', start: 4, end: 8 }] }, [], 3.5, 30).length, 1);
});
test('end edited in timeline wins over stale duration; malformed timing rejected', () => {
  assert.equal(normalizeBrollSpec({ start: 4, end: 6, duration: 99 }).duration, 2);
  for (const s of [{ start: -1, end: 4 }, { start: 5, end: 4 }, { start: NaN, end: 4 }, { start: 4, end: 6, layout: 'invalid' }])
    assert.throws(() => normalizeBrollSpec(s));
});
test('file resolution follows the same catalog used for detection', () => {
  for (const entry of getBrollCatalog().filter(b => b.available)) {
    assert.equal(resolveBrollSpec({ brollId: entry.id, start: 4, end: 8 }).file, entry.filePath);
  }
});
test('highlight conflicts are resolved without shifting word starts', () => {
  const input = [{ start: 4.123, end: 6.323, priority: 1 }, { start: 4.3, end: 6.5, priority: 3 }, { start: 6.25, end: 8.5 }];
  const result = scheduleHighlights(input, 3.5, 20);
  assert.equal(result[0].start, 4.3);
  result.forEach((h, i) => {
    assert.ok(input.some(x => x.start === h.start));
    assert.ok(h.end - h.start >= 1.85 - 1e-8);
    if (i) assert.ok(h.start - result[i - 1].end >= 0.1 - 1e-8);
  });
});
test('custom highlight phrase spanning words is exact; unspoken claims are skipped', () => {
  const result = matchHighlights(['ngoại hạng anh', 'tặng 100 triệu'], [sub('xem ngay ngoại hạng anh', 4.123)], 30);
  assert.equal(result.length, 1);
  assert.equal(result[0].start, 4.523);
});
test('creative planning is reproducible and uses only spoken phrases', () => {
  const subtitles = [sub('modem wifi 6 cực nhanh', 4), sub('camera an ninh cho nhà', 9), sub('chỉ từ 195 nghìn một tháng', 14)];
  const first = createHighlights(subtitles, 30, { profile: 'balanced', seed: 2 });
  assert.deepEqual(first, createHighlights(subtitles, 30, { profile: 'balanced', seed: 2 }));
  assert.notDeepEqual(first.highlights.map(h => h.motion + h.typo),
    createHighlights(subtitles, 30, { profile: 'energetic', seed: 3 }).highlights.map(h => h.motion + h.typo));
  first.highlights.forEach(h => {
    assert.equal(findPhrase(wordTimeline(subtitles), h.text)[0].start, h.start);
    assert.equal(h.y, 350); assert.equal(h.scale, 1.4);
  });
  const missing = createHighlights([{ text: 'tặng quà', start: 4, end: 6 }], 30);
  assert.equal(missing.highlights.length, 0); assert.equal(missing.diagnostics[0].code, 'missing_word_timestamps');
});
test('SFX prioritizes highlights, rejects out-of-order repeats, and only layers opener', () => {
  const result = scheduleSfx([
    { file: 'whoosh', start: 5, priority: 20 }, { file: 'ding', start: 5.1, priority: 60 },
    { file: 'ding', start: 7, priority: 60 }, { file: 'cash', start: 8.9, priority: 60 },
    { file: 'bell', start: 0, priority: 100, group: 'opener' },
    { file: 'whoosh', start: 0, priority: 100, group: 'opener' }
  ], 30);
  assert.deepEqual(result.map(x => [x.file, x.start]), [['bell', 0], ['whoosh', 0], ['ding', 5.1], ['cash', 8.9]]);
});
test('short clips never have invalid hook/outro boundaries', () => {
  for (const duration of [0, 1, 3, 4, 10, 30]) {
    const b = boundaries(duration);
    assert.ok(b.hookDur <= b.outroStart && b.outroStart <= duration);
  }
});
test('browser scripts compile', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(Boolean);
  assert.ok(scripts.length);
  scripts.forEach(script => new vm.Script(script));
});
test('saved real jobs satisfy word locks and timing constraints', () => {
  const output=path.join(__dirname, '../fixtures/jobs');
  const jobs = fs.readdirSync(output).map(d => path.join(output, d, 'job.json')).filter(f => fs.existsSync(f)).slice(-12);
  let checked = 0, highlightCount = 0, brollCount = 0;
  for (const file of jobs) {
    const job = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!job.subtitles?.length) continue;
    const total = Number(job.totalDur) || 30, bounds = require('../../src/editing/reference_editor').speechBoundaries(job.subtitles,total), words = wordTimeline(job.subtitles);
    const plan = createHighlights(job.subtitles, total);
    const brolls = detect(job.subtitles, bounds.hookDur, bounds.outroStart);
    for (const cue of [...plan.highlights, ...brolls]) {
      assert.ok(words.some(w => Math.abs(w.start - cue.start) < 0.001));
      assert.ok(cue.start >= bounds.hookDur && cue.end <= bounds.outroStart);
    }
    checked++; highlightCount += plan.highlights.length; brollCount += brolls.length;
  }
  assert.ok(checked > 0); assert.ok(highlightCount > 0);
  console.log('Real jobs checked:', checked, 'highlights:', highlightCount, 'B-rolls:', brollCount);
});


test('crawler requires item-specific commercial Free License; misleading license URL is insufficient', () => {
  const { isCommercialFree, parseVideoObjects, topicMatches } = require('../../src/broll/broll_crawler');
  assert.equal(isCommercialFree({ copyrightNotice: 'Mixkit Restricted License', license: 'https://mixkit.co/license/#videoFree' }), false);
  assert.equal(isCommercialFree({ copyrightNotice: 'Mixkit Stock Video Free License' }), true);
  assert.equal(isCommercialFree({ copyrightNotice: 'Free', license: 'https://mixkit.co/license/#videoFree' }), true);
  assert.equal(isCommercialFree({ license: 'https://mixkit.co/license/#videoFree' }), false);
  const html = '<script type="application/ld+json">' + JSON.stringify({ '@graph': [
    { '@type': 'VideoObject', '@id': 'one', name: 'Security camera', copyrightNotice: 'Mixkit Restricted License' }
  ] }) + '</script>';
  assert.equal(parseVideoObjects(html)[0].name, 'Security camera');
  assert.equal(topicMatches('technology', 'Man reading computer code'), false);
  assert.equal(topicMatches('technology', 'Connecting an ethernet network cable'), true);
  assert.equal(topicMatches('security', 'Security guard making a phone call'), false);
  assert.equal(topicMatches('security', 'Security camera rotating'), true);
  assert.equal(topicMatches('television', 'A wall of television screens'), false);
});
test('media marked unsuitable is excluded from automatic placement', () => {
  assert.equal(detect([sub('camera', 4)], 3.5, 30, null, { catalog: catalog.map(b => ({ ...b, autoEligible: false })) }).length, 0);
});

test('creative composition prevents fixed-height highlights covering B-roll evidence', () => {
  const { avoidBrollOverlaps } = require('../../src/editing/highlight_planner');
  const result = avoidBrollOverlaps([{ start: 3.5, end: 6 }, { start: 6.1, end: 8.3 }, { start: 10, end: 12 }],
    [{ start: 5.756, end: 9.556 }]);
  assert.deepEqual(result, [{ start: 3.5, end: 5.656 }, { start: 10, end: 12 }]);
});
