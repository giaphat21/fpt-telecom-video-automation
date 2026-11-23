'use strict';
// All public start/end values are seconds. Only explicitly named *Ms values are milliseconds.
const round = n => Math.round(n * 1000) / 1000;
function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/\bwi[\s-]+fi\b/g, 'wifi').replace(/[^a-z0-9]+/g, ' ').trim();
}
function seconds(item, key) {
  const ms = item[key + 'Ms'];
  const value = ms != null ? Number(ms) / 1000 : Number(item[key]);
  return (ms != null || item[key] != null) && Number.isFinite(value) ? value : NaN;
}
function wordTimeline(subtitles = []) {
  const words = [];
  for (const sub of subtitles) {
    for (const word of sub.words || []) {
      const start = seconds(word, 'start'), end = seconds(word, 'end');
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) continue;
      const raw = String(word.word || word.text || '').trim();
      for (const token of normalize(raw).split(' ').filter(Boolean)) words.push({ token, raw, start, end });
    }
  }
  return words.sort((a, b) => a.start - b.start);
}
function findPhrase(words, phrase) {
  const tokens = normalize(phrase).split(' ').filter(Boolean), matches = [];
  if (!tokens.length) return matches;
  for (let i = 0; i <= words.length - tokens.length; i++) {
    let match = true;
    for (let j = 0; j < tokens.length; j++) {
      if (words[i + j].token !== tokens[j] ||
          (j && words[i + j].start - words[i + j - 1].end > 0.8)) { match = false; break; }
    }
    if (match) matches.push({ start: words[i].start, end: words[i + tokens.length - 1].end,
      index: i, length: tokens.length });
  }
  return matches;
}
function boundaries(totalDuration) {
  const total = Math.max(0, Number(totalDuration) || 0);
  const hookDur = Math.min(3.5, total);
  const outroDur = Math.min(Math.max(0, total - hookDur), Math.min(4, Math.max(2.4, total * 0.15)));
  return { hookDur, outroStart: round(total - outroDur), outroDur: round(outroDur) };
}
function scheduleHighlights(items, hookDur, outroStart) {
  const output = [];
  for (const h of [...items].sort((a, b) => a.start - b.start)) {
    const start = Number(h.start);
    if (!Number.isFinite(start) || start < hookDur || start + 1.85 > outroStart + 1e-8) continue;
    const previous = output[output.length - 1];
    if (previous && start < previous.end + 0.1 - 1e-8) {
      // Drop the less useful competing cue, never move a word-locked start.
      if ((h.priority || 0) > (previous.priority || 0) && start - previous.start < 1.95) output.pop();
      else if (start - previous.start >= 1.95) previous.end = round(start - 0.1);
      else continue;
    }
    const duration = Math.max(1.85, Math.min(2.5, Number(h.end) - start || 2.2));
    output.push({ ...h, start: round(start), end: round(Math.min(outroStart, start + duration)) });
  }
  return output;
}
function scheduleSfx(candidates, totalDuration) {
  const selected = [];
  for (const cue of [...candidates].sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.start - b.start)) {
    if (!Number.isFinite(cue.start) || cue.start < 0 || cue.start >= totalDuration) continue;
    const collides = selected.some(other => {
      if (cue.user || other.user) return false;
      if (cue.group === 'opener' && other.group === 'opener') return false;
      return Math.abs(cue.start - other.start) < Math.max(cue.minGap || 0.85, other.minGap || 0.85) - 1e-8 ||
        (cue.file === other.file && Math.abs(cue.start - other.start) < 3.5);
    });
    if (!collides) selected.push({ ...cue, start: round(cue.start) });
  }
  return selected.sort((a, b) => a.start - b.start);
}

function scheduleRequestedHighlights(items, totalDuration) {
  const total = Number(totalDuration);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Thiếu thời lượng video để khớp highlight.');
  const sorted = items.map(h => ({ ...h, start: Number(h.start) })).sort((a, b) => a.start - b.start);
  return sorted.map((h, i) => {
    const next = sorted[i + 1];
    if (!Number.isFinite(h.start) || h.start < 0 || h.start >= total)
      throw new Error('Mốc thời gian không hợp lệ cho cụm: ' + h.text);
    const preferredEnd = Number(h.end) > h.start ? Number(h.end) : h.start + 2.2;
    const end = round(Math.min(preferredEnd, total, next ? next.start - 0.08 : total));
    if (end - h.start < 1 / 30 - 1e-8)
      throw new Error('Hai cụm trùng hoặc quá sát cùng mốc lời nói: "' + h.text + '" và "' + (next?.text || '') + '". Hãy gộp hoặc sửa một cụm.');
    return { ...h, start: round(h.start), end, timingPolicy: 'preserve_all', shortDuration: end - h.start < 1.85 };
  });
}
function prepareHighlightsForRender(items, hookDur, outroStart, totalDuration) {
  return items.some(h => h.timingPolicy === 'preserve_all')
    ? scheduleRequestedHighlights(items, totalDuration)
    : scheduleHighlights(items, hookDur, outroStart);
}

module.exports = { scheduleRequestedHighlights, prepareHighlightsForRender, normalize, seconds, round, wordTimeline, findPhrase, boundaries, scheduleHighlights, scheduleSfx };
