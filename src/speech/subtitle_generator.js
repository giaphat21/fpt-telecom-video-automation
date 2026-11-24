const PATHS=require('../../config/paths.js');
const {cleanFptTranscript,alignCleanWords,correctSubtitles}=require('./transcript_formatter');
const {readEnvelope,alignWords,findPauses,speechRegions,findUncovered,musicBed,wordPauses}=require('./word_timing');
const {refineWords,dropPhantomSpeech}=require('./speech_activity');
const fs = require('fs');
const { suggestKeywords, createHighlights, matchHighlights } = require('../editing/highlight_planner');
const path = require('path');
const { execFileSync } = require('child_process');
const { forceAlignWordsToScript } = require('./subtitle_aligner');

const os = require('os');
const crypto = require('crypto');
const LEXICON = require('../../config/lexicon.json');
const { segment } = require('./phrase_segmenter');
const SPEECH_CACHE_VERSION = process.env.FPT_SPEECH_CACHE || 3;
const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE = path.join(WORKSPACE_ROOT, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');
// Best installed model first; the DTW preset gives word times measured on the audio.
const WHISPER_MODELS = [
  { file: 'runtime/whisper/ggml-large-v3-turbo-q5_0.bin', dtw: 'large.v3.turbo' },
  { file: 'runtime/whisper/ggml-small-q5_1.bin', dtw: 'small' }
].filter(m => !process.env.FPT_WHISPER_MODEL || m.dtw === process.env.FPT_WHISPER_MODEL);

// whisper-cli needs an ASCII path. Asking Windows takes half a second, so the answer is remembered.
function getShortPath(dirPath) {
  if (/^[!-~]+$/.test(dirPath)) return dirPath;
  const memo = path.join(PATHS.cache, 'short_path.json');
  try { const known = JSON.parse(fs.readFileSync(memo, 'utf8')); if (known.from === dirPath && fs.existsSync(known.to)) return known.to; } catch (_) {}
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${dirPath.replace(/'/g, "''")}').ShortPath`], { encoding: 'utf8' }).trim();
    if (out && fs.existsSync(out)) {
      try { fs.mkdirSync(PATHS.cache, { recursive: true }); fs.writeFileSync(memo, JSON.stringify({ from: dirPath, to: out })); } catch (_) {}
      return out;
    }
  } catch (_) {}
  return dirPath;
}

const SHORT_WORKSPACE_ROOT = getShortPath(WORKSPACE_ROOT);
const SHORT_WHISPER_CLI = path.join(SHORT_WORKSPACE_ROOT, 'runtime/whisper/release/whisper-cli.exe');
const WHISPER_CHOICE = WHISPER_MODELS.find(m => fs.existsSync(path.join(WORKSPACE_ROOT, m.file)));
const SHORT_WHISPER_MODEL = WHISPER_CHOICE ? path.join(SHORT_WORKSPACE_ROOT, WHISPER_CHOICE.file) : '';

function resolveMediaPath(fileRef) {
  if (!fileRef) return null;
  if (fs.existsSync(fileRef)) return path.resolve(fileRef);
  const aliases=require('../../config/media_aliases.json');
  const alias=aliases[String(fileRef).replace(/\\/g,'/')]||aliases[path.basename(fileRef)];
  if(alias&&fs.existsSync(path.join(PATHS.root,alias)))return path.join(PATHS.root,alias);
  const candidates = [
    path.join(WORKSPACE_ROOT, fileRef),
    path.join(STUDIO_ROOT, fileRef),
    path.join(PATHS.root, 'assets/source-videos', fileRef),
    path.join(PATHS.root, 'assets/source-audio', fileRef),
    path.join(PATHS.root, 'assets/source-videos', fileRef),
    path.join(PATHS.root, 'assets/source-audio', fileRef),
    path.join(STUDIO_ROOT, 'assets', fileRef)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(WORKSPACE_ROOT, fileRef);
}

const durationMemo = new Map();
function getDuration(mediaPath) {
  let key = null;
  try { const s = fs.statSync(mediaPath); key = path.resolve(mediaPath) + '|' + s.size + '|' + s.mtimeMs; } catch (_) {}
  if (key && durationMemo.has(key)) return durationMemo.get(key);
  const value = readDuration(mediaPath);
  if (key && durationMemo.size < 500) durationMemo.set(key, value);
  return value;
}
function readDuration(mediaPath) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', mediaPath
  ]).toString();
  const data = JSON.parse(out);
  return Number(data.format?.duration) || 3.0;
}

function hasAudioStream(mediaPath) {
  try {
    const out = execFileSync(FFPROBE, [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'json', mediaPath
    ]).toString();
    const data = JSON.parse(out);
    return Array.isArray(data.streams) && data.streams.length > 0;
  } catch (_) {
    return false;
  }
}

function buildAtempoFilter(speed) {
  const s = Number(speed) || 1.0;
  if (Math.abs(s - 1.0) < 0.01) return null;
  const clamped = Math.max(0.5, Math.min(2.0, s));
  return `atempo=${clamped.toFixed(3)}`;
}

function speedUpAudio(inputPath, outputPath, voiceSpeed = 1.0) {
  const filter = buildAtempoFilter(voiceSpeed);
  const args = ['-y', '-loglevel', 'error', '-i', inputPath, '-vn'];
  if (filter) args.push('-af', filter);
  args.push('-ar', '48000', '-ac', '2', ...(/\.wav$/i.test(outputPath) ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'libmp3lame', '-b:a', '192k']), outputPath);
  execFileSync(FFMPEG, args);
  return getDuration(outputPath);
}

/**
 * Comprehensive Vietnamese Telecom Phonetic & Dialect Corrector
 * Fixes regional pronunciations (North/Central/South) and common Whisper homophones.
 */

// Voice over music: the recogniser also hears a copy with the music pushed down (band limited to the voice, spectral
// noise reduction), and each phrase keeps whichever reading it is more sure of. Measured on four takes under music
// louder than the voice: "Đàm thoại", "ưu đãi" come back right; the rest is left to the phrase corrector.
const VOICE_FILTER = 'highpass=f=150,lowpass=f=5000,afftdn=nr=24:nf=-28:tn=1';
function runWhisper(wav, prefix, dtwTimes = true) {
  const words = readWhisper(wav, prefix, dtwTimes);
  let envelope = null;try { envelope = readEnvelope(wav); } catch (_) { return words; }
  if (!musicBed(envelope)) return words;
  const voice = wav.replace(/\.wav$/i, '') + '_voice.wav';
  try {
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, '-af', VOICE_FILTER, '-ar', '16000', '-ac', '1', voice]);
    return fuseReadings(words, readWhisper(voice, prefix + '_voice', dtwTimes));
  } catch (error) { console.warn('[SUB] Đọc lần hai bỏ qua: ' + error.message); return words; }
  finally { for (const f of [voice, prefix + '_voice.json']) { try { fs.unlinkSync(f); } catch (_) {} } }
}
// Phrases are cut where the first reading pauses; a phrase takes the second reading when it is clearly surer of it.
function fuseReadings(first, second) {
  if (!second.length) return first;if (!first.length) return second;
  const mean = ws => ws.reduce((s, w) => s + (Number.isFinite(w.p) ? w.p : .5), 0) / Math.max(1, ws.length);
  const chunks = [];let chunk = [];
  first.forEach((w, i) => { if (chunk.length && (w.startMs - first[i - 1].endMs > 180 || chunk.length >= 6)) { chunks.push(chunk); chunk = []; } chunk.push(w); });
  if (chunk.length) chunks.push(chunk);
  const out = [];let used = 0;
  chunks.forEach((c, k) => {
    const from = k ? (chunks[k - 1].at(-1).endMs + c[0].startMs) / 2 : -Infinity, to = k + 1 < chunks.length ? (c.at(-1).endMs + chunks[k + 1][0].startMs) / 2 : Infinity;
    const alt = second.filter(w => { const mid = (w.startMs + w.endMs) / 2; return mid >= from && mid < to; });
    if (alt.length && mean(alt) > mean(c) + .04) { out.push(...alt); used++; } else out.push(...c);
  });
  return out;
}
// One whisper-cli call: words with their own DTW time and the recogniser's confidence (mean token probability).
function readWhisper(wav, prefix, dtwTimes = true) {
  // Use strictly ASCII prompt on Windows CLI to avoid CP1252 '?' token corruption
  const asciiPrompt = 'FPT Telecom, Modem Wi-Fi 6, FPT Play, Camera AI, Internet, combo';
  execFileSync(SHORT_WHISPER_CLI, ['-m', SHORT_WHISPER_MODEL, '-l', 'vi', '-t', String(Math.max(2, Math.min(12, os.cpus().length - 2))),
    ...(dtwTimes ? ['-nfa', '-dtw', WHISPER_CHOICE.dtw] : []), '-bs', '8', '-bo', '8', '-f', wav, '-ml', '1', '-sow', '-ojf', '-of', prefix, '-np', '--prompt', asciiPrompt],
  { stdio: 'pipe', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const jsonPath = `${prefix}.json`;
  if (!fs.existsSync(jsonPath)) throw new Error('Whisper chưa tạo được dữ liệu Sub text. Hãy thử lại với clip có lời nói rõ.');
  const words = [];
  for (const seg of (JSON.parse(fs.readFileSync(jsonPath, 'utf8')).transcription || [])) {
    const word = (seg.text || '').replace(/\[_[^\]]*\]/g, '').trim();
    if (!word) continue;
    const fromMs = Number(seg.offsets?.from ?? 0);
    const dtw = (seg.tokens || []).map(t => Number(t.t_dtw)).find(t => t > 0);
    const probs = (seg.tokens || []).filter(t => !/^\[_/.test(t.text || '') && Number.isFinite(Number(t.p))).map(t => Number(t.p));
    words.push({ word, startMs: fromMs, endMs: Math.max(fromMs + 60, Number(seg.offsets?.to ?? (fromMs + 250))), dtw: dtw == null ? NaN : dtw / 100, p: probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : NaN });
  }
  return dropPhantomSpeech(words);
}
// All clips are read together in story order with their pauses removed: the recogniser hears whole sentences, and the
// cost follows the length of the speech instead of the number of clips. Every word keeps the place it came from.
// Measured: reading faster than recorded saves no time and costs accuracy.
const READ_SPEED = 1, PACK_LIMIT = 27.6 * READ_SPEED, JOIN = 0.14, CLIP_JOIN = 0.3, EDGE = 0.07;
function readSequence(files) {
  const usable = files.map((file, i) => ({ file, i })).filter(x => x.file && fs.existsSync(x.file) && hasAudioStream(x.file));
  if (usable.length < 2) return null;
  const stamp = usable.map(x => { const s = fs.statSync(x.file); return [path.resolve(x.file), s.size, s.mtimeMs].join('|'); }).join('\n');
  const cacheFile = path.join(PATHS.cache, 'speech', 'seq_' + crypto.createHash('sha256').update(stamp + WHISPER_CHOICE.file + SPEECH_CACHE_VERSION + READ_SPEED).digest('hex').slice(0, 28) + '.json');
  try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (_) {}
  const id = path.join(os.tmpdir(), `fpt_seq_${process.pid}_${Date.now()}`), made = [];
  try {
    const pieces = [];
    usable.forEach((x, k) => {
      const wav = `${id}_${k}.wav`; made.push(wav); extractSpeech(x.file, wav);
      const envelope = readEnvelope(wav), pauses = findPauses(envelope);
      if (pauses.length === 1 && pauses[0].startMs === 0 && pauses[0].endMs >= envelope.duration * 1000 - 50) return;
      let cursor = 0;
      for (const p of [...pauses, { startMs: envelope.duration * 1000, endMs: envelope.duration * 1000 }]) {
        const a = Math.max(0, cursor / 1000 - EDGE), b = Math.min(envelope.duration, p.startMs / 1000 + EDGE);
        if (b - a > 0.18) pieces.push({ k, clip: x.i, wav, from: a, to: b });
        cursor = p.endMs;
      }
    });
    if (!pieces.length || pieces.some(p => p.to - p.from > PACK_LIMIT - 1)) return null;
    // Prefer to close a pack at the end of a clip, so a sentence is not torn apart.
    const packs = [[]];
    let length = 0;
    pieces.forEach((p, n) => {
      const add = p.to - p.from + JOIN, newClip = n && pieces[n - 1].clip !== p.clip;
      const rest = newClip ? pieces.filter(q => q.clip === p.clip).reduce((s, q) => s + q.to - q.from + JOIN, 0) : 0;
      if (packs.at(-1).length && (length + add > PACK_LIMIT || (newClip && length > 12 && length + rest > PACK_LIMIT))) { packs.push([]); length = 0; }
      p.at = length + (packs.at(-1).length && newClip ? CLIP_JOIN : 0);
      length = p.at + add; packs.at(-1).push(p);
    });
    const readings = files.map(() => []);
    packs.forEach((pack, n) => {
      const inputs = [], graph = [], joined = `${id}_p${n}.wav`, out = `${id}_p${n}_out`;
      made.push(joined, out + '.json');
      pack.forEach((p, i) => {
        const until = i + 1 < pack.length ? pack[i + 1].at : p.at + p.to - p.from + 0.4;
        inputs.push('-ss', p.from.toFixed(3), '-t', (p.to - p.from).toFixed(3), '-i', p.wav);
        graph.push(`[${i}:a]apad=whole_dur=${(until - p.at).toFixed(3)}[p${i}]`);
      });
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph.join(';') + ';' + pack.map((_, i) => `[p${i}]`).join('') + `concat=n=${pack.length}:v=0:a=1${READ_SPEED === 1 ? '' : ',atempo=' + READ_SPEED}[a]`, '-map', '[a]', '-ar', '16000', '-ac', '1', joined]);
      let at = 0;
      for (const word of runWhisper(joined, out)) {
        const t = (Number.isFinite(word.dtw) ? word.dtw : word.startMs / 1000 + 0.08) * READ_SPEED;
        while (at + 1 < pack.length && t >= pack[at + 1].at - 0.02) at++;
        const p = pack[at], local = Math.max(0.01, Math.min(p.to - p.from - 0.02, t - p.at)) + p.from, span = Math.max(0.06, (word.endMs - word.startMs) / 1000 * READ_SPEED);
        // Words are collected per clip on the clock of that clip.
        readings[p.clip].push({ word: word.word, startMs: Math.round((local - 0.05) * 1000), endMs: Math.round((local + span) * 1000), dtw: local });
      }
    });
    const result = files.map((_, i) => readings[i]);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const temp = cacheFile + '.' + crypto.randomUUID(); fs.writeFileSync(temp, JSON.stringify(result)); fs.renameSync(temp, cacheFile);
    return result;
  } catch (error) { console.warn('[SUB] Đọc liền mạch không thành công, đọc từng clip: ' + error.message); return null; }
  finally { made.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} }); }
}

/**
 * Runs whisper-cli.exe with DTW word timestamps, then snaps every word to the recorded sound
 * and ASCII-only prompt so Windows argv never corrupts UTF-8 characters.
 */
function extractSpeech(audioPath, wavPath) {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', audioPath, '-vn', '-ar', '16000', '-ac', '1', wavPath]);
}
function transcribeFileWordLevel(audioPath, tempDir, prefix, { reading: given = null, tag = '' } = {}) {
  // Same file, same model: reuse the reading instead of listening again on every export.
  const stat = fs.statSync(audioPath);
  const cacheFile = path.join(PATHS.cache, 'speech', crypto.createHash('sha256').update([path.resolve(audioPath), stat.size, stat.mtimeMs, WHISPER_CHOICE.file, SPEECH_CACHE_VERSION, tag].join('|')).digest('hex').slice(0, 32) + '.json');
  try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (_) {}
  const keep = result => {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const temp = cacheFile + '.' + crypto.randomUUID();
    fs.writeFileSync(temp, JSON.stringify(result));
    fs.renameSync(temp, cacheFile);
    return result;
  };
  const safeTemp = os.tmpdir();
  const safeId = `whisper_${prefix}_${process.pid}_${Date.now()}`;
  const wavPath = path.join(safeTemp, `${safeId}.wav`);
  const outPrefix = path.join(safeTemp, `${safeId}_out`);
  extractSpeech(audioPath, wavPath);

  const temporary = [wavPath];
  const whisper = (wav, prefix, dtwTimes = true) => { temporary.push(`${prefix}.json`); return runWhisper(wav, prefix, dtwTimes); };
  try {
    const envelope = readEnvelope(wavPath), totalMs = envelope.duration * 1000, music = musicBed(envelope);
    let pauses = findPauses(envelope);
    if (pauses.length === 1 && pauses[0].startMs === 0 && pauses[0].endMs >= totalMs - 50) return { words: [], pauses, uncovered: [] };
    let raw = given || whisper(wavPath, outPrefix), aligned = alignWords(raw, envelope);
    // Whisper can stop early on difficult audio. Every long stretch of sound without words gets a second reading.
    const tried = new Set();
    for (let round = 0; round < 4; round++) {
      const hole = findUncovered(aligned, pauses, totalMs).find(h => !tried.has(Math.round(h.startMs / 1000)));
      if (!hole) break;
      tried.add(Math.round(hole.startMs / 1000));
      const sliceWav = path.join(safeTemp, `${safeId}_s${round}.wav`);
      temporary.push(sliceWav);
      const from = Math.max(0, hole.startMs - 150);
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', (from / 1000).toFixed(3), '-t', ((hole.endMs - from + 150) / 1000).toFixed(3), '-i', wavPath, '-c', 'copy', sliceWav]);
      let reading = whisper(sliceWav, `${outPrefix}_s${round}`);
      // The DTW decoder is stricter on speech over music; the standard decoder is the fallback for the text.
      if (reading.length < (hole.endMs - hole.startMs) / 1000) reading = whisper(sliceWav, `${outPrefix}_s${round}f`, false);
      const extra = alignWords(reading, readEnvelope(sliceWav))
        .map(w => ({ ...w, startMs: w.startMs + from, endMs: w.endMs + from }))
        .filter(w => w.startMs >= hole.startMs - 60 && w.endMs <= hole.endMs + 150);
      aligned = [...aligned, ...extra].sort((x, y) => x.startMs - y.startMs);
    }
    // Under music the waveform never goes quiet: cut only in the clear gaps between recognised words.
    if (music && aligned.length) pauses = [...pauses, ...wordPauses(aligned, totalMs)].sort((a, b) => a.startMs - b.startMs).reduce((out, p) => { const last = out.at(-1); if (last && p.startMs <= last.endMs) last.endMs = Math.max(last.endMs, p.endMs); else out.push({ ...p }); return out; }, []);
    return keep({ words: aligned, pauses, uncovered: findUncovered(aligned, pauses, totalMs), music });
  } finally {
    temporary.forEach(file => { try { fs.unlinkSync(file); } catch (_) {} });
  }
}

const PROPER_NAMES = /^(?:FPT|Wi-?Fi|Modem|Camera|AI|Internet|Play|World|Cup|Ngoại|Anh|TV|Đà|Nẵng|Combo|Cloud|Premier|League|Champions|Telecom|Mesh|Box|K\+|C1)/i;
const COMPOUND_JOIN_PAIRS = new Set([
  'tiện lợi', 'cực kỳ', 'một ngày', 'lắp đặt', 'lắp mạng', 'mạng fpt', 'internet fpt', 'trang bị', 'bị ngay',
  'modem wi-fi', 'wi-fi 6', 'wifi 6', 'mới nhất', 'đi kèm', '5 tài', 'tài khoản',
  'fpt play', 'truyền hình', 'thỏa sức', 'xem bóng', 'bóng đá', 'ngoại hạng', 'hạng anh',
  'đặc biệt', 'tặng ngay', 'tặng camera', 'camera ai', 'đàm thoại', 'thoại 2', '2 chiều', 'hai chiều',
  'cực tiện', 'tốc độ', 'độ cao', 'chỉ từ', '195k/tháng', '220k/tháng', '7.5k/ngày',
  'phù hợp', 'mọi gia', 'gia đình', 'anh chị', 'liên hệ', 'tư vấn', 'đăng ký',
  'ký combo', 'combo ngay', 'nhận ưu', 'ưu đãi', 'liền tay', 'tác vụ', 'vụ nặng', 'băng thông'
]);

// Every phrase and name of the lexicon stays on one line.
for (const phrase of [...LEXICON.phrases, ...LEXICON.proper, ...LEXICON.compounds]) { const w = phrase.toLocaleLowerCase('vi').split(' '); for (let i = 1; i < w.length; i++) COMPOUND_JOIN_PAIRS.add(w[i - 1] + ' ' + w[i]); }

/**
 * Groups word-level timestamps into natural, meaning-complete Vietnamese phrases (3-6 words)
 * without ever splitting compound words like "Wi-Fi 6", "Ngoại hạng Anh", "Camera AI", "tài khoản".
 */
function groupWordsIntoMeaningfulSubtitles(words = []) {
  if (!words.length) return [];

  // 1. Clean full sentence per clip/block so multi-word phonetic fixes work seamlessly
  const fullRaw = words.map(w => w.word).join(' ');
  const fullCleaned = cleanFptTranscript(fullRaw);
  const cleanTokens = fullCleaned.split(/\s+/).filter(Boolean);

  const aligned = alignCleanWords(words, fullCleaned);

  // 2. Group into natural 3-6 word phrases respecting pauses, punctuation, and compound pairs
  const phrases = [];
  let cur = [];

  const flushCur = () => {
    if (!cur.length) return;
    const textRaw = cur.map(x => x.word).join(' ').replace(/[,.;!?]+$/g, '').trim();
    if (textRaw) {
      const formatted = textRaw.charAt(0).toUpperCase() + textRaw.slice(1);
      phrases.push({
        id: phrases.length + 1,
        start: Number((cur[0].startMs / 1000).toFixed(2)),
        end: Number((cur[cur.length - 1].endMs / 1000).toFixed(2)),
        text: formatted,
        words: cur.map(w => ({
          word: w.word,
          text: w.word + ' ',
          startMs: w.startMs,
          endMs: w.endMs,
          timestampMs: Math.round((w.startMs + w.endMs) / 2),
          ...(w.confidence != null ? { confidence: w.confidence } : {})
        }))
      });
    }
    cur = [];
  };

  for (const group of segment(aligned.map(w => ({ ...w, raw: w.word, start: w.startMs / 1000, end: w.endMs / 1000 })))) { cur = group; flushCur(); }

  // Merge any tiny 1-2 word orphan phrase with neighbor if close in time
  const merged = [];
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    const wCount = p.text.split(/\s+/).length;
    if (wCount <= 2 && merged.length > 0 && (p.start - merged[merged.length - 1].end) < 0.35 && (merged[merged.length - 1].text.split(/\s+/).length + wCount) <= 6) {
      const prev = merged[merged.length - 1];
      prev.end = p.end;
      prev.text = `${prev.text} ${p.text.charAt(0).toLowerCase() + p.text.slice(1)}`;
      prev.words = [...(prev.words || []), ...(p.words || [])];
    } else {
      merged.push(p);
    }
  }
  // Never leave one or two words alone: re-divide them with the previous phrase at a natural boundary.
  const joinWords = words => {
    const text = words.map(w => w.word).join(' ').replace(/[,.;!?]+$/g, '').trim();
    return { start: Number((words[0].startMs / 1000).toFixed(2)), end: Number((words.at(-1).endMs / 1000).toFixed(2)), text: text.charAt(0).toUpperCase() + text.slice(1), words };
  };
  for (let i = 1; i < merged.length; i++) {
    const a = merged[i - 1], b = merged[i], all = [...a.words, ...b.words];
    if (b.words.length > 2 || a.words.length < 5 || b.start - a.end > 0.35) continue;
    const plain = all.map(w => w.word.replace(/[,.;!?]+$/g, '').toLowerCase());
    let best = null;
    for (let k = 2; k <= all.length - 3; k++) {
      if (COMPOUND_JOIN_PAIRS.has(`${plain[k - 1]} ${plain[k]}`)) continue;
      const cost = Math.abs(k - all.length / 2);
      if (!best || cost < best.cost) best = { k, cost };
    }
    if (best) { merged[i - 1] = joinWords(all.slice(0, best.k)); merged[i] = joinWords(all.slice(best.k)); }
  }
  return merged.map((p, idx) => ({ ...p, id: idx + 1 }));
}

const FPT_HIGHLIGHT_RULES = [
  // 1. Ngoại Hạng Anh, C1, Bóng Đá, FPT Play Độc Quyền -> Phong cách Premier League & FPT Play
  { regex: /(?:ngoại\s+hạng|nha|premier|bóng\s+đá|c1|champions|fpt\s*play|kho\s+phim|truyền\s+hình)/i, style: 'orange', typo: 'fpt_football_match', sfx: 'ding_correct', broll: 'football' },
  // 2. Wi-Fi & Tốc độ cao, modem, mesh, 1 Gbps, ping thấp -> Cyber HUD High-Tech
  { regex: /(?:wi-?fi\s*[67]|modem|mesh|băng\s+thông|\d+\s*(?:mbps|gbps)|tốc\s+độ|ping|độ\s+trễ|cáp\s+quang|internet)/i, style: 'blue', typo: 'fpt_speed_hud', sfx: 'sfx_01', broll: 'wifi6' },
  // 3. Camera AI & An ninh, đàm thoại, giám sát -> Camera Smart CCTV
  { regex: /(?:camera|an\s+ninh|giám\s+sát|đàm\s+thoại|chuyển\s+động|cloud|bảo\s+vệ|quan\s+sát)/i, style: 'green', typo: 'fpt_camera_smart', sfx: 'flick_camera_flash', broll: 'camera' },
  // 4. Tiền & Deal, cước, giá, chi phí -> Hộp Giá Ưu Đãi
  { regex: /(?:\d+(?:[.,]\d+)?\s*k(?:\s*\/\s*(?:tháng|ngày))?|chỉ\s+từ|giá|tiền|cước|không\s+đổi|tiết\s+kiệm|hời|triệu)/i, style: 'orange', typo: 'fpt_price_burst', sfx: 'cash_money', broll: 'price' },
  // 5. Quà tặng, 0Đ, Voucher, Miễn phí -> Vé Vàng Giảm Giá 3D
  { regex: /(?:0\s*đ|miễn\s+phí|quà\s+tặng|voucher|tặng\s+thêm|deal\s+sốc)/i, style: 'orange', typo: 'fpt_voucher_3d', sfx: 'bell_bright', broll: 'price' },
  // 6. Câu chuyển xếp tầng ưu đãi ("Chưa hết...", "Đặc biệt...", "Tóm lại...") -> Cú Đấm Kép Dual-Tone
  { regex: /(?:chưa\s+hết|đặc\s+biệt|thứ\s+(?:ba|hai|nhất)\s+là|tóm\s+lại|đăng\s+ký\s+ngay|nhanh\s+tay|liên\s+hệ)/i, style: 'orange', typo: 'fpt_split_kicker', sfx: 'bellring', broll: 'price' },
  // 7. Nhấn mạnh, cảm thán, công nghệ đỉnh cao -> Kính Neon 3 Màu FPT
  { regex: /(?:quá\s+hời|siêu\s+phẩm|đỉnh\s+chóp|cực\s+mượt|cháy\s+hàng|bất\s+ngờ|nâng\s+cấp|đừng\s+bỏ\s+lỡ)/i, style: 'blue', typo: 'fpt_neon_glass', sfx: 'sfx_12', broll: 'speedtest' }
];

const TYPO_PRESETS = [
  'fpt_football_match',
  'fpt_speed_hud',
  'fpt_camera_smart',
  'fpt_voucher_3d',
  'fpt_neon_glass',
  'fpt_split_kicker',
  'fpt_tricolor_slab',
  'fpt_orange_block',
  'fpt_price_burst',
  'fpt_green_badge',
  'fpt_blue_pill'
];
const MOTION_PRESETS = ['pop_bounce', 'slide_left', 'slam_drop', 'slide_right'];
const SFX_FALLBACK_CYCLE = ['sfx_01', 'sfx_18', 'sfx_04', 'sfx_16', 'cash_money', 'sfx_14', 'bellring'];

/**
 * 12 Cụm Filler FPT chuẩn 3-6 từ trọn vẹn ngữ nghĩa (không cắt cụt),
 * dùng để giữ nhịp nhảy Text Highlight 1-3s liên tục suốt toàn bộ video.
 */
const FPT_CONTINUOUS_FILLERS = [
  { text: 'Trang Bị Modem Wi-Fi 6', typo: 'fpt_orange_block', motion: 'pop_bounce', sfx: 'sfx_01' },
  { text: 'Tốc Độ 1 Gbps Không Giới Hạn', typo: 'fpt_tricolor_slab', motion: 'slam_drop', sfx: 'sfx_18' },
  { text: 'Chơi Game Không Giật Lag', typo: 'fpt_blue_pill', motion: 'slide_left', sfx: 'sfx_11' },
  { text: 'Camera AI Giám Sát Cloud', typo: 'fpt_stack_outline', motion: 'pop_bounce', sfx: 'flick_camera_flash' },
  { text: 'Xem Độc Quyền Ngoại Hạng Anh', typo: 'fpt_tricolor_slab', motion: 'slide_right', sfx: 'sfx_04' },
  { text: 'Ưu Đãi Chỉ Từ 195K/Tháng', typo: 'fpt_price_burst', motion: 'pop_bounce', sfx: 'cash_register' },
  { text: 'Miễn Phí Lắp Đặt 100%', typo: 'fpt_green_badge', motion: 'slam_drop', sfx: 'bell_bright' },
  { text: 'Tặng Thêm 1 Tháng Cước', typo: 'fpt_orange_block', motion: 'pop_bounce', sfx: 'sfx_19' },
  { text: 'Trọn Gói Tiết Kiệm Tối Đa', typo: 'fpt_blue_pill', motion: 'slam_drop', sfx: 'ding_complex_shine' },
  { text: 'Băng Thông Siêu Tốc Cực Mượt', typo: 'fpt_tricolor_slab', motion: 'slide_left', sfx: 'sfx_21' },
  { text: 'Đàm Thoại Hai Chiều Tiện Lợi', typo: 'fpt_stack_outline', motion: 'pop_bounce', sfx: 'flick_flash_click' },
  { text: 'Combo 3 Trong 1 Siêu Hời', typo: 'fpt_price_burst', motion: 'slide_right', sfx: 'sfx_24' }
];

// Danh sách các từ nối / hư từ tiếng Việt không được đứng ở cuối hoặc đầu cụm để tránh "cắt cụt nghĩa"
const TRAILING_STOPWORDS = new Set([
  'của', 'và', 'để', 'cho', 'với', 'trong', 'tại', 'là', 'thì', 'mà', 'nên', 'khi',
  'vì', 'những', 'các', 'được', 'sẽ', 'rất', 'rồi', 'ra', 'vào', 'ở', 'lại', 'lên',
  'xuống', 'về', 'này', 'đó', 'như', 'có', 'hay', 'bởi', 'do', 'đến', 'tới', 'một', 'mọi'
]);

const LEADING_STOPWORDS = new Set([
  'thì', 'và', 'mà', 'của', 'là', 'để', 'với', 'nên', 'khi', 'vì', 'thế', 'vậy',
  'nữa', 'rồi', 'cũng', 'đã', 'sẽ', 'đang', 'ở', 'tại', 'do', 'bởi', 'nhưng', 'còn'
]);

const FPT_SEMANTIC_PATTERNS = [
  { regex: /(?:trang\s*bị\s*)?(?:modem\s*)?wi-?fi\s*6(?:\s*thế\s*hệ\s*mới)?/i, phrase: "Trang Bị Modem Wi-Fi 6" },
  { regex: /(?:tốc\s*độ\s*)?(?:băng\s*thông\s*)?1\s*(?:gbps|mbps)(?:\s*(?:không\s*giới\s*hạn|cực\s*mượt|siêu\s*tốc))?/i, phrase: "Tốc Độ 1 Gbps Siêu Tốc" },
  { regex: /7[.,]5\s*k\s*(?:một|\/)?\s*ngày/i, phrase: "Trọn Gói 7.5K Một Ngày" },
  { regex: /195\s*(?:k|nghìn)\s*(?:một|\/)?\s*tháng/i, phrase: "Chỉ Từ 195K Một Tháng" },
  { regex: /(?:xem\s*)?(?:độc\s*quyền\s*)?(?:ngoại\s*hạng\s*anh|fpt\s*play|bóng\s*đá|c1)/i, phrase: "Xem Độc Quyền Ngoại Hạng Anh" },
  { regex: /(?:tặng\s*kèm\s*)?(?:camera\s*ai|camera\s*an\s*ninh|camera\s*cloud)/i, phrase: "Tặng Kèm Camera AI" },
  { regex: /(?:miễn\s*phí|0\s*đ|không\s*đồng)/i, phrase: "Miễn Phí Lắp Đặt 100%" },
  { regex: /(?:tặng\s*thêm\s*)?(?:1\s*tháng|một\s*tháng)\s*cước/i, phrase: "Tặng Thêm 1 Tháng Cước" },
  { regex: /(?:đăng\s*ký\s*ngay|nhanh\s*tay)/i, phrase: "Nhanh Tay Đăng Ký Ngay" },
  { regex: /(?:gói\s*cước|combo|deal)(?:\s*cực|\s*siêu)?\s*hời/i, phrase: "Gói Cước Cực Hời" },
  { regex: /(?:chơi\s*game|game\s*thủ)(?:\s*không|\s*0)?\s*lag/i, phrase: "Chơi Game Không Giật Lag" },
  { regex: /(?:đàm\s*thoại\s*2\s*chiều|đàm\s*thoại\s*hai\s*chiều)/i, phrase: "Đàm Thoại Hai Chiều Tiện Lợi" }
];

const INTRO_TRIM_REGEX = /^(?:hôm\s+nay\s+(?:mình|chúng\s+ta|em)\s+(?:sẽ|muốn)?\s*(?:giới\s+thiệu)?(?:\s+đến\s+(?:các\s+bạn|mọi\s+người))?|xin\s+chào\s+(?:các\s+bạn|mọi\s+người)|các\s+bạn\s+ơi|để\s+mình\s+nói\s+cho\s+nghe)\s*/i;

/**
 * Tách và tinh lọc 1 câu thoại thành các cụm từ đắt giá có độ dài đúng 3-6 từ,
 * hoàn chỉnh ngữ nghĩa, không bao giờ bị cắt cụt đầu hay đuôi.
 */
function extractMeaningfulPhrasesFromText(rawText) {
  if (!rawText) return [];
  const cleaned = cleanFptTranscript(rawText).replace(/[,.;!?]+$/g, '').trim();
  if (!cleaned) return [];

  // 1. Kiểm tra trực tiếp các cụm giá trị cốt lõi chuẩn brand FPT (Đảm bảo 100% trọn nghĩa, 3-6 từ)
  for (const pat of FPT_SEMANTIC_PATTERNS) {
    if (pat.regex.test(cleaned)) {
      return [pat.phrase];
    }
  }

  // 2. Nếu không thuộc mẫu có sẵn, lọc bỏ các cụm mở bài thừa ("Hôm nay mình sẽ...")
  const trimmed = cleaned.replace(INTRO_TRIM_REGEX, '').trim();

  // Tách theo dấu ngắt câu hoặc từ nối chính
  const rawClauses = (trimmed || cleaned).split(/[,.;!?\n]+|(?: và | thì | nhưng | mà | nên )/i).map(c => c.trim()).filter(Boolean);
  const resultPhrases = [];

  for (const clause of rawClauses) {
    let words = clause.split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    // Loại bỏ từ nối đầu/đuôi lơ lửng
    while (words.length > 3 && TRAILING_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
      words.pop();
    }
    while (words.length > 3 && LEADING_STOPWORDS.has(words[0].toLowerCase())) {
      words.shift();
    }

    if (words.length >= 3 && words.length <= 6) {
      resultPhrases.push(words.join(' '));
    } else if (words.length > 6) {
      // Ưu tiên lấy 3-5 từ chứa thông tin chính ở cuối hoặc đầu
      let subWords = words.slice(-5);
      while (subWords.length > 3 && TRAILING_STOPWORDS.has(subWords[subWords.length - 1].toLowerCase())) {
        subWords.pop();
      }
      while (subWords.length > 3 && LEADING_STOPWORDS.has(subWords[0].toLowerCase())) {
        subWords.shift();
      }
      if (subWords.length >= 3 && subWords.length <= 6) {
        resultPhrases.push(subWords.join(' '));
      } else {
        resultPhrases.push(words.slice(0, 4).join(' '));
      }
    }
  }

  return resultPhrases;
}

/**
 * Trích xuất danh sách Text Highlight tự động từ Subtitles:
 * - QUY TẮC BẮT BUỘC: Ở câu Hook (0s - 3.5s) PHẢI CÓ cụm Text Highlight.
 * - Suốt toàn bộ video cứ 1-2s lại có 1 Text Highlight liên tục.
 * - Mỗi cụm BẮT BUỘC có nghĩa, dài 3-6 từ, KHÔNG BỊ CẮT CỤT NGHĨA.
 * - Màu sắc chuẩn thương hiệu FPT Telecom, không dùng khung HUD che màn hình.
 */
function extractAutoHighlights(subtitles = [], totalDuration = 30) {
  return createHighlights(subtitles, totalDuration).highlights;
}

function matchCustomHighlightsToSubtitles(phrases = [], subtitles = [], totalDuration = 30) {
  return matchHighlights(phrases, subtitles, totalDuration);
}

/**
 * Bước 1: Quét các cụm từ keyword 3-6 từ từ bản sub trước khi tạo Text Highlight
 */
function scanKeywordsFromSubtitles(subtitles = []) {
  return suggestKeywords(subtitles);
}

/**
 * Automatically derives Hook Title (H1/H2/H3) and Outro Price CTA from the actual spoken transcript
 * so when the user drops ANY video in, the Hook & CTA match the video's content automatically!
 */
function deriveSmartHookFromSubtitles(subtitles = []) {
  const intro=subtitles.filter(s=>s.start<3.5).slice(0,3).map(s=>cleanFptTranscript(s.text).replace(/[.,!?;:]+$/,''));
  if(intro.length>1 && /\sFPT$/i.test(intro[0])){
    intro[0]=intro[0].replace(/\sFPT$/i,'').replace(/[.,!?;:]+$/,'');intro[1]='FPT '+intro[1];
  }
  const total=Math.max(0,...subtitles.map(s=>s.end||0));
  // A lone interjection is not a title line.
  while(intro.length>1&&intro[0].split(/\s+/).length===1&&intro[0].length<=5&&!/\d|fpt/i.test(intro[0]))intro.shift();
  if(intro.length<3)subtitles.filter(s=>s.start>=.2&&s.start<3.5).slice(0,4).forEach(s=>{const t=cleanFptTranscript(s.text).replace(/[.,!?;:]+$/,'');if(intro.length<3&&!intro.some(x=>x.toLowerCase()===t.toLowerCase())&&t.split(/\s+/).length>1)intro.push(t);});
  // The last title line must be a finished thought: it takes the next words when they follow at once.
  if(intro.length){
    const last=subtitles.findIndex(s=>cleanFptTranscript(s.text).replace(/[.,!?;:]+$/,'').toLowerCase()===intro.at(-1).toLowerCase()&&s.start<3.6),cur=subtitles[last],next=subtitles[last+1];
    if(cur&&next&&next.start<3.5&&next.start-cur.end<.15&&!/[.!?]$/.test(cur.text)&&(intro.at(-1)+' '+next.text).length<=30)intro[intro.length-1]+=' '+cleanFptTranscript(next.text.charAt(0).toLocaleLowerCase('vi')+next.text.slice(1)).replace(/[.,!?;:]+$/,'');
  }
  const CTA=/đăng ký|liên hệ|gọi ngay|nhận ưu đãi|bình luận|nhắn tin|để lại số|inbox|gọi tổng đài|để được tư vấn/i;
  const ending=subtitles.filter(s=>s.start>=total*.65),closing=ending.filter(s=>s.start>=total-8);
  const pool=closing.some(s=>CTA.test(s.text))?closing:ending;
  const index=pool.findIndex(s=>CTA.test(s.text));
  // The first Outro line starts at the call to action itself, without the words that lead into it.
  const tail=index>=0?pool.slice(index,index+2).map((s,i)=>{const t=cleanFptTranscript(s.text).replace(/[.,!?;:]+$/,'');return i?t:t.slice(Math.max(0,t.search(CTA)));}):[];
  return {hook:{line1:(intro[0]||'').toUpperCase(),line2:(intro[1]||'').toUpperCase(),line3:(intro[2]||'').toUpperCase(),line4:''},
    outro:{line1:(tail[0]||'').toUpperCase(),line2:(tail[1]||'').toUpperCase(),line3:''},outroCta:''};
}

async function generateAutoSubtitles({ voiceFiles = [], videoFiles = [], voiceSpeed = 1.25, originalScript = '', trimSilence = true }) {
  if (!fs.existsSync(SHORT_WHISPER_CLI) || !fs.existsSync(SHORT_WHISPER_MODEL)) {
    throw new Error('Thiếu whisper-cli.exe hoặc model trong runtime/whisper/');
  }

  const isUsingVideoAudio = !voiceFiles || voiceFiles.length === 0;
  const sourceList = isUsingVideoAudio ? (videoFiles || []) : voiceFiles;
  if (!sourceList || sourceList.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 file Video (có tiếng gốc) hoặc 1 file Voiceover!');
  }

  const speed = Math.max(0.5, Math.min(2.0, Number(voiceSpeed) || 1.25));
  const scriptClean = (originalScript || '').trim();
  const tempDir = path.join(PATHS.cache, '_fpt_autosub_tmp_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sequence = readSequence(sourceList.map(resolveMediaPath));
    const clipWindows = [];
    const speechWarnings = [];
    let subtitles = [];
    let timelineCursorSec = 0;

    for (let i = 0; i < sourceList.length; i++) {
      const srcPath = resolveMediaPath(sourceList[i]);
      if (!srcPath || !fs.existsSync(srcPath)) {
        throw new Error(`Không tìm thấy file nguồn: ${sourceList[i]}`);
      }
      const rawDur = getDuration(srcPath);
      if (!hasAudioStream(srcPath)) {
        const scaledDur = Number((rawDur / speed).toFixed(3));
        clipWindows.push({
          fileRef: sourceList[i],
          srcPath,
          rawDur,
          trimStart: 0,
          trimEnd: rawDur,
          timelineStart: Number(timelineCursorSec.toFixed(3)),
          timelineDur: scaledDur
        });
        timelineCursorSec += scaledDur;
        continue;
      }

      const reading = sequence?.[i]?.length ? sequence[i] : null;
      const speech = transcribeFileWordLevel(srcPath, tempDir, `seg_${i + 1}`, reading ? { reading, tag: crypto.createHash('sha256').update(JSON.stringify(reading)).digest('hex').slice(0, 16) } : {});
      for (const gap of speech.uncovered) speechWarnings.push({ code: 'speech_not_recognised', text: `${path.basename(String(sourceList[i]))}: ${(gap.startMs / 1000).toFixed(1)}–${(gap.endMs / 1000).toFixed(1)}s có âm thanh nhưng không nhận dạng được lời nói. Hãy nghe lại trước khi đăng.` });
      const rawWords = refineWords(speech.words, rawDur, speech.pauses);

      if (trimSilence && isUsingVideoAudio && rawWords.length > 0) {
        // Chỉ cắt trong khoảng lặng thật (>= 250ms) đo trên sóng âm; không bao giờ cắt cụt tiếng nói.
        const speechIntervals = speechRegions(rawWords, speech.pauses, rawDur * 1000);

        // Xuất từng đoạn nói thành một cửa sổ cảnh cắt mượt (Snappy Jump-Cut)
        for (const interval of speechIntervals) {
          const tStart = Number((interval.startMs / 1000).toFixed(3));
          const tEnd = Number((interval.endMs / 1000).toFixed(3));
          const chunkRawDur = Math.max(0.001, tEnd - tStart);
          const scaledDur = Number((chunkRawDur / speed).toFixed(3));

          const sliceWords = interval.words.map(w => {
            const relStartSec = Math.max(0, (w.startMs / 1000) - tStart) / speed;
            const relEndSec = Math.min(scaledDur, Math.max(relStartSec + 0.06, ((w.endMs / 1000) - tStart) / speed));
            return {
              word: w.word,
              startMs: Math.round((timelineCursorSec + relStartSec) * 1000),
              endMs: Math.round((timelineCursorSec + relEndSec) * 1000)
            };
          });

          const sliceSubs = groupWordsIntoMeaningfulSubtitles(sliceWords);
          for (const cs of sliceSubs) {
            subtitles.push({
              ...cs,
              id: subtitles.length + 1,
              clipIdx: clipWindows.length
            });
          }

          clipWindows.push({
            fileRef: sourceList[i],
            srcPath,
            rawDur,
            trimStart: tStart,
            trimEnd: tEnd,
            timelineStart: Number(timelineCursorSec.toFixed(3)),
            timelineDur: scaledDur
          });

          timelineCursorSec += scaledDur;
        }
      } else {
        const scaledDur = Number((rawDur / speed).toFixed(3));
        const timedWords = rawWords.map(w => ({ word: w.word,
          startMs: Math.round(timelineCursorSec * 1000 + w.startMs / speed),
          endMs: Math.round(timelineCursorSec * 1000 + w.endMs / speed) }));
        for (const sub of groupWordsIntoMeaningfulSubtitles(timedWords))
          subtitles.push({ ...sub, id: subtitles.length + 1, clipIdx: clipWindows.length });
        clipWindows.push({
          fileRef: sourceList[i],
          srcPath,
          rawDur,
          trimStart: 0,
          trimEnd: rawDur,
          timelineStart: Number(timelineCursorSec.toFixed(3)),
          timelineDur: scaledDur
        });
        timelineCursorSec += scaledDur;
      }
    }

    // Keep a short silent tail so the final fade never covers the last words of the CTA.
    const tail = clipWindows.at(-1);
    if (tail && isUsingVideoAudio && trimSilence) {
      const before = tail.trimEnd;
      tail.trimEnd = Number(Math.min(tail.rawDur, tail.trimEnd + speed).toFixed(3));
      const grown = Number(((tail.trimEnd - before) / speed).toFixed(3));
      tail.timelineDur = Number((tail.timelineDur + grown).toFixed(3));
      timelineCursorSec += grown;
    }

    if (!subtitles.length) throw new Error('Không tạo được Sub text: video không có lời nói nhận diện được. Kiểm tra âm thanh video hoặc chọn clip có giọng nói rõ.');

    if (scriptClean && subtitles.length > 0) {
      const flatCaps = [];
      subtitles.forEach(s => (s.words || []).forEach(w => flatCaps.push(w)));
      const alignedCaps = forceAlignWordsToScript(flatCaps, scriptClean);
      subtitles = groupWordsIntoMeaningfulSubtitles(
        alignedCaps.map(c => ({ word: c.text.trim(), startMs: c.startMs, endMs: c.endMs }))
      );
    }

    const totalDur = Number(timelineCursorSec.toFixed(2));
    const highlights = extractAutoHighlights(subtitles, totalDur);
    const smartMeta = deriveSmartHookFromSubtitles(subtitles);

    return {
      ok: true,
      voiceSpeed: speed,
      speechWarnings,
      totalDuration: totalDur,
      subtitles: correctSubtitles(subtitles).map(s => ({ ...s, origin: 'asr' })),
      highlights,
      clipWindows,
      autoHook: smartMeta.hook,
      autoOutro: smartMeta.outro,
      autoOutroCta: smartMeta.outroCta
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  generateAutoSubtitles,
  extractAutoHighlights,
  matchCustomHighlightsToSubtitles,
  scanKeywordsFromSubtitles,
  deriveSmartHookFromSubtitles,
  cleanFptTranscript,
  speedUpAudio,
  getDuration,
  hasAudioStream,
  resolveMediaPath
};
