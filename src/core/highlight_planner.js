const PATHS=require('../../config/paths.js');
const { applyTypographyVariety } = require('./brand_rules');
const {correctSubtitles,cleanFptTranscript}=require('./transcript_formatter');
'use strict';
const { normalize, wordTimeline, findPhrase, boundaries, scheduleHighlights, scheduleRequestedHighlights } = require('./timeline_rules');
const PROFILES = {
  balanced: { label: 'Cân bằng', duration: 2.2, motions: ['pop_bounce', 'slide_left', 'slide_right'] },
  energetic: { label: 'Dồn nhịp', duration: 1.95, motions: ['slam_drop', 'pop_bounce', 'slide_right'] },
  clean: { label: 'Gọn, rõ sản phẩm', duration: 2.5, motions: ['slide_left', 'slide_right'] }
};
function hash(text) {
  let value = 2166136261;
  for (const c of String(text)) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return value >>> 0;
}
function classify(text) {
  const t = normalize(text);
  if (/\b(\d+\s*(k|nghin|ngan|trieu|dong)|gia|cuoc|mien phi|uu dai|tang)\b/.test(t)) return 'offer';
  if (/\b(ngoai hang|premier|bong da|tran dau|champions)\b/.test(t)) return 'football';
  if (/\b(camera|an ninh|giam sat|cctv)\b/.test(t)) return 'camera';
  if (/\b(wifi|modem|internet|gbps|mbps|toc do|cap quang|mesh)\b/.test(t)) return 'speed';
  if (/\b(fpt play|phim|truyen hinh|4k|gaming|choi game)\b/.test(t)) return 'entertainment';
  return 'general';
}
const STYLES = {
  offer: ['fpt_price_burst', 'fpt_voucher_3d'],
  football: ['fpt_football_match', 'fpt_orange_block'],
  camera: ['fpt_camera_smart', 'fpt_green_badge'],
  speed: ['fpt_speed_hud', 'fpt_tricolor_slab'],
  entertainment: ['fpt_neon_glass', 'fpt_blue_pill'],
  general: ['fpt_split_kicker', 'fpt_stack_outline']
};
function decorate(text, start, index, options = {}) {
  const profile = PROFILES[options.profile] || PROFILES.balanced;
  const topic = classify(text), seed = hash(String(options.seed || 0) + ':' + text + ':' + index);
  const bank = topic === 'offer' ? ['cash_money', 'bell_ring_ding'] :
    topic === 'camera' ? ['flick_camera_flash', 'sfx_26'] : ['ding_correct', 'sfx_12', 'sfx_04', 'sfx_26'];
  return { text, start, end: start + profile.duration, topic, y: 350, scale: 1.4,
    typo: STYLES[topic][seed % STYLES[topic].length],
    motion: profile.motions[seed % profile.motions.length], sfx: bank[(seed + index) % bank.length],
    priority: topic === 'offer' ? 3 : topic === 'general' ? 1 : 2,
    timingSource: 'word', autoDetected: true };
}
function createHighlights(subtitles = [], totalDuration = 30, options = {}) {
  const {createReferenceHighlights}=require('./reference_editor');
  const diagnostics=subtitles.filter(s=>String(s.text||'').trim()&&!wordTimeline([s]).length)
    .map(s=>({code:'missing_word_timestamps',text:s.text}));
  let highlights=createReferenceHighlights(subtitles,totalDuration);
  if(options.profile||options.seed)highlights=applyTypographyVariety(highlights.map((cue,index)=>{
    const style=decorate(cue.text,cue.start,index,options);
    return {...style,...cue,typo:style.typo,motion:style.motion,sfx:style.sfx};
  }));
  return {highlights,diagnostics,profile:options.profile in PROFILES?options.profile:'balanced',seed:options.seed||0};
}

function suggestKeywords(subtitles = []) {
  const keywords = [], seen = new Set();
  for (const [subtitleIndex, sub] of correctSubtitles(subtitles).entries()) {
    const words = wordTimeline([sub]);
    const rawWords = [...new Map(words.map(w => [w.start + ':' + w.raw, w])).values()];
    for (let offset = 0; offset < rawWords.length; offset += 6) {
      let selected = rawWords.slice(offset, offset + 6);
      if (selected.length < 3) continue;
      const text = selected.map(w => w.raw).join(' ').replace(/[.,!?;:]+$/g, '').trim();
      const key = normalize(text);
      const match = findPhrase(words, text)[0];
      if (!match || seen.has(key)) continue;
      seen.add(key);
      keywords.push({ id: keywords.length + 1, text, subtitleId: sub.id ?? subtitleIndex,
        start: match.start, end: match.end, timingSource: 'word' });
    }
  }
  return keywords;
}
function matchHighlightRequest(phrases, subtitles, totalDuration, options = {}) {
  const list = (typeof phrases === 'string' ? phrases.split(/\r?\n/) : Array.isArray(phrases) ? phrases : [])
    .map(p => cleanFptTranscript(String(p).trim())).filter(Boolean);
  const words = wordTimeline(correctSubtitles(subtitles)), candidates = [], used = new Set(), unmatched = [];
  for (const [index, text] of list.entries()) {
    const match = findPhrase(words, text).find(m => !used.has(m.start));
    if (!match) { unmatched.push({ line: index + 1, text, reason: 'Không tìm thấy cụm này tại một mốc lời nói còn trống trong Sub text.' }); continue; }
    used.add(match.start);
    candidates.push({ ...decorate(text, match.start, index, options), id: index + 1, requestLine: index + 1,
      end: match.end, speechStart: match.start, speechEnd: match.end, autoDetected: false, timingPolicy: 'preserve_all' });
  }
  return { highlights: applyTypographyVariety(scheduleRequestedHighlights(candidates, totalDuration)), requestedCount: list.length, unmatched };
}
function matchHighlights(phrases, subtitles, totalDuration, options = {}) {
  if (!phrases || (Array.isArray(phrases) && !phrases.length))
    return createHighlights(subtitles, totalDuration, options).highlights;
  return matchHighlightRequest(phrases, subtitles, totalDuration, options).highlights;
}


function avoidBrollOverlaps(highlights, brolls = []) {
  const output = [];
  for (const highlight of highlights) {
    let end = highlight.end, blocked = false;
    for (const broll of brolls.filter(b => b.enabled !== false)) {
      if (highlight.start < broll.end + 0.1 && end > broll.start - 0.1) {
        if (highlight.start >= broll.start - 0.1) { blocked = true; break; }
        end = Math.min(end, broll.start - 0.1);
      }
    }
    if (!blocked && end - highlight.start >= 1.85 - 1e-8)
      output.push({ ...highlight, end: Math.round(end * 1000) / 1000 });
  }
  return output;
}

module.exports = { suggestKeywords, matchHighlightRequest, avoidBrollOverlaps, PROFILES, createHighlights, matchHighlights, classify };
