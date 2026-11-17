const PATHS=require('../../config/paths.js');
const {cleanFptTranscript,alignCleanWords}=require('./transcript_formatter');
const fs = require('fs');
const { suggestKeywords, createHighlights, matchHighlights } = require('./highlight_planner');
const path = require('path');
const { execFileSync } = require('child_process');
const { forceAlignWordsToScript } = require('../integrations/subtitle_aligner');
let createTikTokStyleCaptions = null;
try {
  ({ createTikTokStyleCaptions } = require('@remotion/captions'));
} catch (_) {}

const os = require('os');
const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE = path.join(WORKSPACE_ROOT, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');
const WHISPER_MODEL_SMALL = path.join(WORKSPACE_ROOT, 'runtime/whisper/ggml-small-q5_1.bin');
const WHISPER_MODEL_BASE = path.join(WORKSPACE_ROOT, 'runtime/whisper/ggml-base.bin');

function getShortPath(dirPath) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${dirPath.replace(/'/g, "''")}').ShortPath`], { encoding: 'utf8' }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch (_) {}
  return dirPath;
}

const SHORT_WORKSPACE_ROOT = getShortPath(WORKSPACE_ROOT);
const SHORT_WHISPER_CLI = path.join(SHORT_WORKSPACE_ROOT, 'runtime/whisper/release/whisper-cli.exe');
const SHORT_WHISPER_MODEL = path.join(SHORT_WORKSPACE_ROOT, fs.existsSync(WHISPER_MODEL_SMALL) ? 'runtime/whisper/ggml-small-q5_1.bin' : 'runtime/whisper/ggml-base.bin');

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

function getDuration(mediaPath) {
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
  args.push('-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', outputPath);
  execFileSync(FFMPEG, args);
  return getDuration(outputPath);
}

/**
 * Comprehensive Vietnamese Telecom Phonetic & Dialect Corrector
 * Fixes regional pronunciations (North/Central/South) and common Whisper homophones.
 */

/**
 * Runs whisper-cli.exe with word-level timestamps (-ml 1 -sow -ojf -t 8)
 * and ASCII-only prompt so Windows argv never corrupts UTF-8 characters.
 */
function transcribeFileWordLevel(audioPath, tempDir, prefix) {
  const safeTemp = os.tmpdir();
  const safeId = `whisper_${prefix}_${Date.now()}`;
  const wavPath = path.join(safeTemp, `${safeId}.wav`);
  const outPrefix = path.join(safeTemp, `${safeId}_out`);
  
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', audioPath,
    '-vn', '-ar', '16000', '-ac', '1', wavPath
  ]);

  // Use strictly ASCII prompt on Windows CLI to avoid CP1252 '?' token corruption
  const asciiPrompt = 'FPT Telecom, Modem Wi-Fi 6, FPT Play, Camera AI, Internet, combo';

  const args = [
    '-m', SHORT_WHISPER_MODEL,
    '-l', 'vi',
    '-t', '8',
    '-f', wavPath,
    '-ml', '1',
    '-sow',
    '-ojf',
    '-of', outPrefix,
    '-np',
    '--prompt', asciiPrompt
  ];

  execFileSync(SHORT_WHISPER_CLI, args, { stdio: 'pipe' });
  const jsonPath = `${outPrefix}.json`;
  if (!fs.existsSync(jsonPath)) throw new Error('Whisper chưa tạo được dữ liệu Sub text. Hãy thử lại với clip có lời nói rõ.');

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const rawWords = [];
  for (const seg of (data.transcription || [])) {
    const rawText = (seg.text || '').replace(/\[_[^\]]*\]/g, '').trim();
    if (!rawText) continue;
    const fromMs = Number(seg.offsets?.from ?? 0);
    const toMs = Math.max(fromMs + 60, Number(seg.offsets?.to ?? (fromMs + 250)));
    rawWords.push({
      word: rawText,
      startMs: fromMs,
      endMs: toMs
    });
  }

  try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch (_) {}
  try { if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath); } catch (_) {}

  return rawWords;
}

const COMPOUND_JOIN_PAIRS = new Set([
  'tiện lợi', 'cực kỳ', 'một ngày', 'lắp đặt', 'lắp mạng', 'mạng fpt', 'internet fpt', 'trang bị', 'bị ngay',
  'modem wi-fi', 'wi-fi 6', 'wifi 6', 'mới nhất', 'đi kèm', '5 tài', 'tài khoản',
  'fpt play', 'truyền hình', 'thỏa sức', 'xem bóng', 'bóng đá', 'ngoại hạng', 'hạng anh',
  'đặc biệt', 'tặng ngay', 'tặng camera', 'camera ai', 'đàm thoại', 'thoại 2', '2 chiều', 'hai chiều',
  'cực tiện', 'tốc độ', 'độ cao', 'chỉ từ', '195k/tháng', '220k/tháng', '7.5k/ngày',
  'phù hợp', 'mọi gia', 'gia đình', 'anh chị', 'liên hệ', 'tư vấn', 'đăng ký',
  'ký combo', 'combo ngay', 'nhận ưu', 'ưu đãi', 'liền tay', 'tác vụ', 'vụ nặng', 'băng thông'
]);

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

  const DANGLING_END_WORDS = new Set(['khi', 'để', 'với', 'cho', 'vì', 'nếu', 'mà', 'và', 'hoặc', 'nhưng', 'tại', 'ở', 'từ']);

  for (let i = 0; i < aligned.length; i++) {
    const w = aligned[i];
    const nextW = aligned[i + 1];
    const cleanW = w.word.replace(/[,.;!?]+$/g, '').toLowerCase();

    // Never leave a conjunction/preposition like "khi", "cho", "để" dangling at the end of a phrase
    if (cur.length >= 3 && DANGLING_END_WORDS.has(cleanW) && nextW) {
      flushCur();
    }

    let chainLength=1;
    while(i+chainLength<aligned.length && COMPOUND_JOIN_PAIRS.has(aligned[i+chainLength-1].word.replace(/[,.;!?]+$/g,'').toLowerCase()+' '+aligned[i+chainLength].word.replace(/[,.;!?]+$/g,'').toLowerCase())) chainLength++;
    if(cur.length>=3 && cur.length+chainLength>6) flushCur();
    cur.push(w);

    const hasPunct = /[,.;!?]$/.test(w.word);
    const pauseMs = nextW ? (nextW.startMs - w.endMs) : 9999;
    const cleanA = cleanW;
    const cleanB = nextW ? nextW.word.replace(/[,.;!?]+$/g, '').toLowerCase() : '';
    const isCompound = nextW && COMPOUND_JOIN_PAIRS.has(`${cleanA} ${cleanB}`);

    if (!nextW) {
      flushCur();
      break;
    }

    // Break if long acoustic pause (> 380ms) or punctuation (as long as we have >= 3 words)
    if (pauseMs > 380 && cur.length >= 2) {
      flushCur();
      continue;
    }
    if (hasPunct && cur.length >= 3 && !isCompound) {
      flushCur();
      continue;
    }

    // Target 4-5 words per phrase, never split compound pairs
    if (cur.length >= 5 && !isCompound) {
      flushCur();
    } else if (cur.length >= 6) {
      flushCur();
    }
  }
  flushCur();

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
    intro[0]=intro[0].replace(/\sFPT$/i,'');intro[1]='FPT '+intro[1];
  }
  const total=Math.max(0,...subtitles.map(s=>s.end||0));
  const ending=subtitles.filter(s=>s.start>=total*.65);
  const index=ending.findIndex(s=>/đăng ký|liên hệ|gọi ngay|nhận ưu đãi/i.test(s.text));
  const tail=index>=0?ending.slice(index,index+2).map(s=>cleanFptTranscript(s.text).replace(/[.,!?;:]+$/,'')):[];
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
    const clipWindows = [];
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

      const rawWords = transcribeFileWordLevel(srcPath, tempDir, `seg_${i + 1}`);

      if (trimSilence && isUsingVideoAudio && rawWords.length > 0) {
        // AI Cắt khoảng nghỉ: Gom nhóm các từ thành các khoảng nói liên tục, loại bỏ hoàn toàn khoảng lặng >= 250ms
        const speechIntervals = [];
        let curChunk = {
          startMs: Math.max(0, rawWords[0].startMs - 35),
          endMs: Math.min(rawDur * 1000, rawWords[0].endMs + 35),
          words: [rawWords[0]]
        };

        for (let wIdx = 1; wIdx < rawWords.length; wIdx++) {
          const w = rawWords[wIdx];
          const gapMs = w.startMs - curChunk.endMs;
          if (gapMs <= 250) {
            // Khoảng nghỉ nhỏ (chuyển âm tự nhiên), gộp vào cùng một đoạn nói
            curChunk.endMs = Math.min(rawDur * 1000, w.endMs + 35);
            curChunk.words.push(w);
          } else {
            // Phát hiện khoảng nghỉ / ngắt hơi >= 250ms: Cắt bỏ khoảng chết, chốt đoạn trước và tạo đoạn mới
            speechIntervals.push(curChunk);
            curChunk = {
              startMs: Math.max(0, w.startMs - 35),
              endMs: Math.min(rawDur * 1000, w.endMs + 35),
              words: [w]
            };
          }
        }
        speechIntervals.push(curChunk);

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

    let tiktokPages = [];
    if (createTikTokStyleCaptions && subtitles.length > 0) {
      try {
        const caps = [];
        subtitles.forEach(s => (s.words || []).forEach(w => caps.push(w)));
        const res = createTikTokStyleCaptions({ captions: caps, combineTokensWithinMilliseconds: 950 });
        tiktokPages = res.pages || [];
      } catch (_) {}
    }

    return {
      ok: true,
      voiceSpeed: speed,
      totalDuration: totalDur,
      subtitles,
      highlights,
      clipWindows,
      autoHook: smartMeta.hook,
      autoOutro: smartMeta.outro,
      autoOutroCta: smartMeta.outroCta,
      tiktokPages
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
