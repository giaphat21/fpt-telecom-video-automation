const PATHS=require('../../config/paths.js');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORKSPACE_ROOT = PATHS.root;
const PYTHON_BRIDGE = path.join(WORKSPACE_ROOT, 'scripts/tools/align_audio.py');
const WHISPER_CLI = path.join(WORKSPACE_ROOT, 'runtime/whisper/release/whisper-cli.exe');
const WHISPER_MODEL_SMALL = path.join(WORKSPACE_ROOT, 'runtime/whisper/ggml-small-q5_1.bin');
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');

function normalizeToken(w) {
  return (w || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\w]/g, '');
}

/**
 * Dynamic Programming (Needleman-Wunsch) forced alignment between ASR word timestamps
 * and the ground-truth `originalScript` tokens to eliminate 100% of Vietnamese spelling/diacritic errors.
 */
function forceAlignWordsToScript(asrWords, originalScript) {
  const scriptTokens = (originalScript || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (scriptTokens.length === 0) return asrWords;
  if (asrWords.length === 0) return [];

  const n = asrWords.length;
  const m = scriptTokens.length;
  const asrNorm = asrWords.map(w => normalizeToken(w.text));
  const scrNorm = scriptTokens.map(w => normalizeToken(w));

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const ptr = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) { dp[i][0] = -i * 2; ptr[i][0] = 2; }
  for (let j = 1; j <= m; j++) { dp[0][j] = -j * 2; ptr[0][j] = 3; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const exact = asrNorm[i - 1] === scrNorm[j - 1];
      const partial =
        !exact &&
        asrNorm[i - 1].length >= 2 &&
        scrNorm[j - 1].length >= 2 &&
        (asrNorm[i - 1].startsWith(scrNorm[j - 1].slice(0, 2)) ||
          scrNorm[j - 1].startsWith(asrNorm[i - 1].slice(0, 2)));
      const matchScore = exact ? 5 : partial ? 2 : -1;

      const sDiag = dp[i - 1][j - 1] + matchScore;
      const sUp = dp[i - 1][j] - 2;
      const sLeft = dp[i][j - 1] - 2;

      if (sDiag >= sUp && sDiag >= sLeft) {
        dp[i][j] = sDiag; ptr[i][j] = 1;
      } else if (sUp >= sLeft) {
        dp[i][j] = sUp; ptr[i][j] = 2;
      } else {
        dp[i][j] = sLeft; ptr[i][j] = 3;
      }
    }
  }

  const scriptToAsr = new Array(m).fill(null);
  let ci = n, cj = m;
  while (ci > 0 || cj > 0) {
    const move = ptr[ci][cj];
    if (ci > 0 && cj > 0 && move === 1) {
      scriptToAsr[cj - 1] = ci - 1;
      ci--; cj--;
    } else if (ci > 0 && (cj === 0 || move === 2)) {
      ci--;
    } else {
      cj--;
    }
  }

  const aligned = [];
  const totalStartMs = asrWords[0].startMs;
  const totalEndMs = asrWords[asrWords.length - 1].endMs;

  let j = 0;
  while (j < m) {
    const mappedIdx = scriptToAsr[j];
    if (mappedIdx !== null) {
      const a = asrWords[mappedIdx];
      aligned.push({
        text: scriptTokens[j] + ' ',
        startMs: a.startMs,
        endMs: Math.max(a.startMs + 60, a.endMs),
        timestampMs: Math.round((a.startMs + a.endMs) / 2),
        confidence: 1.0
      });
      j++;
    } else {
      let k = j;
      while (k < m && scriptToAsr[k] === null) k++;
      const count = k - j;
      const prevEndMs = aligned.length > 0 ? aligned[aligned.length - 1].endMs : totalStartMs;
      const nextStartMs = (k < m && scriptToAsr[k] !== null) ? asrWords[scriptToAsr[k]].startMs : totalEndMs;
      const span = Math.max(count * 90, nextStartMs - prevEndMs);
      const step = span / count;

      for (let idx = 0; idx < count; idx++) {
        const sMs = Math.round(prevEndMs + idx * step);
        const eMs = Math.round(prevEndMs + (idx + 1) * step);
        aligned.push({
          text: scriptTokens[j + idx] + ' ',
          startMs: sMs,
          endMs: Math.max(sMs + 60, eMs),
          timestampMs: Math.round((sMs + eMs) / 2),
          confidence: 0.98
        });
      }
      j = k;
    }
  }

  return aligned;
}

/**
 * Regroups word-level @remotion/captions into natural subtitle lines (3-8 words) with exact acoustic timestamps
 * while preserving 100% of the ground-truth script spelling.
 */
function groupCaptionsIntoSubtitleLines(captions, maxWordsPerLine = 7) {
  if (!Array.isArray(captions) || captions.length === 0) return [];
  const lines = [];
  let bucket = [];

  for (let i = 0; i < captions.length; i++) {
    const item = captions[i];
    const w = (item.text || '').trim();
    if (!w) continue;
    bucket.push(item);

    const hasEndPunct = /[,.;!?]$/.test(w);
    const next1 = captions[i + 1] ? (captions[i + 1].text || '').trim() : '';
    const next2 = captions[i + 2] ? (captions[i + 2].text || '').trim() : '';
    const nextHasPunctSoon = /[,.;!?]$/.test(next1) || /[,.;!?]$/.test(next2);
    const pauseGapMs = captions[i + 1] ? (captions[i + 1].startMs - item.endMs) : 9999;

    const shouldBreakOnPunct = bucket.length >= 3 && (hasEndPunct || pauseGapMs >= 320);
    const shouldBreakOnLen = bucket.length >= maxWordsPerLine && !nextHasPunctSoon;
    const hardCap = bucket.length >= maxWordsPerLine + 2;

    if (shouldBreakOnPunct || shouldBreakOnLen || hardCap || i === captions.length - 1) {
      const sSec = Number((bucket[0].startMs / 1000).toFixed(2));
      const eSec = Number(Math.max(sSec + 0.25, bucket[bucket.length - 1].endMs / 1000).toFixed(2));
      const txt = bucket.map(b => b.text.trim()).join(' ');
      lines.push({
        id: lines.length + 1,
        start: sSec,
        end: eSec,
        text: txt.charAt(0).toUpperCase() + txt.slice(1),
        words: bucket
      });
      bucket = [];
    }
  }
  return lines;
}

async function alignSubtitleWithScript(options) {
  const {
    audioPath,
    originalScript = '',
    language = 'vi',
    modelName = 'small',
    device = 'cpu',
    outputJsonPath
  } = options || {};

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const tempDir = path.join(PATHS.cache, `_align_tmp_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const tempOutJson = path.join(tempDir, 'captions.json');

  try {
    if (fs.existsSync(PYTHON_BRIDGE)) {
      try {
        execFileSync('python', [
          PYTHON_BRIDGE,
          '--audio', audioPath,
          '--script', originalScript,
          '--lang', language,
          '--model', modelName,
          '--device', device,
          '--out', tempOutJson
        ], { stdio: 'pipe', timeout: 120000 });
        if (fs.existsSync(tempOutJson)) {
          const captions = JSON.parse(fs.readFileSync(tempOutJson, 'utf8'));
          if (outputJsonPath) {
            fs.mkdirSync(path.dirname(path.resolve(outputJsonPath)), { recursive: true });
            fs.writeFileSync(outputJsonPath, JSON.stringify(captions, null, 2), 'utf8');
          }
          return captions;
        }
      } catch (_) {}
    }

    const wavPath = path.join(tempDir, 'input_16k.wav');
    const outPrefix = path.join(tempDir, 'whisper_words');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', audioPath, '-ar', '16000', '-ac', '1', wavPath]);

    const whisperModel = WHISPER_MODEL_SMALL;
    const promptText = originalScript.trim() || 'Thủy Ngân Limousine, xe giường nằm, cabin đôi, ghế da massage êm như mây, ổ sạc riêng, đèn LED chill, rèm kéo kín, hotline 0388.96.96.04';

    execFileSync(WHISPER_CLI, [
      '-m', path.relative(WORKSPACE_ROOT, whisperModel),
      '-l', language,
      '-f', path.relative(WORKSPACE_ROOT, wavPath),
      '-ml', '1',
      '-sow',
      '-oj',
      '-of', path.relative(WORKSPACE_ROOT, outPrefix),
      '-np',
      '--prompt', promptText.slice(0, 450)
    ], { cwd: WORKSPACE_ROOT, stdio: 'pipe' });

    const rawData = JSON.parse(fs.readFileSync(`${outPrefix}.json`, 'utf8'));
    const asrWords = (rawData.transcription || [])
      .map(seg => {
        const txt = String(seg.text || '').trim();
        const sMs = Number(seg.offsets?.from ?? 0);
        const eMs = Math.max(sMs + 60, Number(seg.offsets?.to ?? sMs + 160));
        return {
          text: txt + ' ',
          startMs: sMs,
          endMs: eMs,
          timestampMs: Math.round((sMs + eMs) / 2),
          confidence: 0.96
        };
      })
      .filter(w => w.text.trim().length > 0);

    const finalCaptions = originalScript.trim()
      ? forceAlignWordsToScript(asrWords, originalScript)
      : asrWords;

    if (outputJsonPath) {
      fs.mkdirSync(path.dirname(path.resolve(outputJsonPath)), { recursive: true });
      fs.writeFileSync(outputJsonPath, JSON.stringify(finalCaptions, null, 2), 'utf8');
    }
    return finalCaptions;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  forceAlignWordsToScript,
  groupCaptionsIntoSubtitleLines,
  alignSubtitleWithScript
};
