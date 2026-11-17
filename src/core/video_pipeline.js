const PATHS=require('../../config/paths.js');
const referenceProfile=require('../../config/approved_reference.json');
const {createReferenceHighlights,speechBoundaries}=require('./reference_editor');
const {requirePlan,inspectOutput}=require('./quality_gate');
const {normalizeClipWindows,mapConcurrent}=require('./render_inputs');
const {probeMedia,portraitFilter}=require('./media_profile');
const {applyTypographyVariety}=require('./brand_rules');
const {correctSubtitles,cleanFptTranscript}=require('./transcript_formatter');
const {suggestKeywords,matchHighlightRequest}=require('./highlight_planner');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const {
  generateAutoSubtitles,
  extractAutoHighlights,
  deriveSmartHookFromSubtitles,
  speedUpAudio,
  getDuration,
  hasAudioStream,
  resolveMediaPath
} = require('./subtitle_generator');
const { generateAllFptAudio } = require('./audio_assets');
const { getBrollWarnings, selectBrollSpecs, autoDetectBrollFromSubtitles, composeBrollCutaway, resolveBrollSpec, getBrollCatalog } = require('./broll_compositor');

const { prepareHighlightsForRender, boundaries, scheduleHighlights, scheduleSfx } = require('./timeline_rules');

const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE = path.join(WORKSPACE_ROOT, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');

function wrapSafeLine(text, maxChars = 24) {
  const clean = (text || '').replace(/\r/g, '').trim();
  if (!clean) return '';
  if (clean.includes('\n')) return clean;
  const words = clean.split(/\s+/);
  if (words.length <= 5 && clean.length <= maxChars) return clean;
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(' ')}\n${words.slice(mid).join(' ')}`;
}

function fmtAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}

/**
 * Formats a subtitle line with rich ASS inline styling:
 * - Elastic Pop-Bounce entry (\fscx70\fscy70 -> 118% -> 100%)
 * - Automatic Category Icon/Emoji injection (💰, ⚡, 👁️, ⚽, 🎁)
 * - Automatic Dual-Color Keyword Highlighting (Key terms in Neon Yellow #EFFF00 + thick FPT Orange border, normal words in White + FPT Orange stroke)
 * - Safe Zone Anchor: yPos = 1580 (sits cleanly at lower-third, 100% unobstructed face/chest and safe from TikTok bottom bar)
 */
function formatRichAssSubtitleText(text, yPos = 1580) {
  if (!text) return '';

  let enriched = text.trim();

  // Inject category badge emoji if not already present
  if (!/[⚡💰🚀👁️⚽🎁🔥📶]/.test(enriched)) {
    if (/(?:\b\d+\s*k\b|0\s*đ|tiền|giá|tiết\s+kiệm)/i.test(enriched)) enriched = '💰 ' + enriched;
    else if (/(?:wi-?fi|internet|gbps|mbps|tốc\s+độ|cáp\s+quang|modem|mesh)/i.test(enriched)) enriched = '⚡ ' + enriched;
    else if (/(?:camera|ai|an\s+ninh|giám\s+sát|đàm\s+thoại)/i.test(enriched)) enriched = '👁️ ' + enriched;
    else if (/(?:ngoại\s+hạng|c1|bóng\s+đá|fpt\s+play|kho\s+phim)/i.test(enriched)) enriched = '⚽ ' + enriched;
    else if (/(?:miễn\s+phí|quà\s+tặng|ưu\s+đãi|combo)/i.test(enriched)) enriched = '🎁 ' + enriched;
  }

  const kwRegex = /(\b(?:\d+(?:[.,]\d+)?\s*K(?:\s*\/\s*(?:tháng|ngày))?|\d+(?:[.,]\d+)?\s*k|0\s*đ|miễn\s+phí|tiết\s+kiệm|giảm\s+ngay|quà\s+tặng|FPT(?:\s*Play)?|Wi-?Fi(?:\s*[67])?|Modem|Mesh|Internet|Cáp\s+quang|1\s*Gbps|\d+\s*(?:Mbps|Gbps)|băng\s+thông|tốc\s+độ|độ\s+trễ|ping|Camera(?:\s+AI)?|an\s+ninh|giám\s+sát|đàm\s+thoại(?:\s*2\s*chiều)?|chuyển\s+động|Cloud|Ngoại\s+hạng\s+Anh|C1|Champions\s+League|truyền\s+hình|5\s+tài\s+khoản|bóng\s+đá|kho\s+phim|Chưa\s+hết|Đặc\s+biệt|Thứ\s+(?:ba|hai|nhất)\s+là|Tóm\s+lại|Đăng\s+ký\s+ngay|Nhanh\s+tay|Quá\s+hời|siêu\s+phẩm|đỉnh\s+chóp|cực\s+mượt|ưu\s+đãi|combo)\b)/gi;
  const parts = enriched.split(kwRegex);
  const styled = parts.map(part => {
    if (!part) return '';
    if (kwRegex.test(part)) {
      kwRegex.lastIndex = 0;
      // Highlighted keyword in FPT Telecom brand colors:
      // Bold Neon Yellow (&H0000FFFF&) on heavy FPT Orange outline (&H000166FC&) with 120% pop scale
      return `{\\1c&H0000FFFF&\\3c&H000166FC&\\bord11\\shad5\\fscx120\\fscy120}${part}{\\1c&H00FFFFFF&\\3c&H000166FC&\\bord8\\shad4\\fscx100\\fscy100}`;
    }
    kwRegex.lastIndex = 0;
    return part;
  }).join('');

  // Căn chính giữa trục x=540 trong Safe Zone TikTok (yPos=1580, cách đáy 340px, tuyệt đối không che mặt người nói)
  return `{\\an2\\pos(540,${yPos})\\b1\\bord9\\shad4\\fscx70\\fscy70\\t(0,85,\\fscx118\\fscy118)\\t(85,175,\\fscx100\\fscy100)}${styled}`;
}

async function runFptPipeline(job, onLog = () => {}, onProgress = () => {}) {
  const log = (msg) => { console.log(msg); onLog(msg); };
  onProgress(5, 'Đang chuẩn bị kho tài nguyên FPT Telecom (BGM, SFX, B-Roll)...');

  const safeName = (job.projectName || 'FPT_Telecom_Auto').replace(/[^a-zA-Z0-9_-]/g, '_');
  const workDir = path.join(PATHS.output, safeName);
  const overlayDir = path.join(workDir, 'overlays');
  const tempDir = path.join(workDir, 'temp');
  const voiceWorkDir = path.join(workDir, 'voices');
  fs.mkdirSync(overlayDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(voiceWorkDir, { recursive: true });

  const assetsDir = path.join(STUDIO_ROOT, 'assets');
  const brollLibDir = path.join(assetsDir, 'broll-library');
  const brollAiWifi6 = path.join(brollLibDir, 'broll_ai_wifi6.png');
  const brollAiCamera = path.join(brollLibDir, 'broll_ai_camera.png');
  const brollAiFptPlay = path.join(brollLibDir, 'broll_ai_fptplay.png');
  const brollAiSpeedtest = path.join(brollLibDir, 'broll_ai_speedtest.png');
  const brollAi3Grid = path.join(brollLibDir, 'broll_ai_3grid.png');
  const confettiOverlay = path.join(assetsDir, 'confetti_overlay.png');

  if (!fs.existsSync(brollAiWifi6) || !fs.existsSync(brollAiCamera) || !fs.existsSync(brollAiSpeedtest) || !fs.existsSync(brollAi3Grid)) {
    execFileSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(PATHS.root,'scripts/generate_broll_cards.ps1')], { stdio: 'inherit' });
  }

  const BGM_CATALOG = {
    upbeat: path.join(assetsDir, 'bgm_fpt_upbeat.mp3'),
    bright: path.join(assetsDir, 'bgm_fpt_bright.mp3'),
    fresh:  path.join(assetsDir, 'bgm_fpt_fresh.mp3'),
    synth:  path.join(assetsDir, 'bgm_fpt_synth.mp3'),
    chill:  path.join(assetsDir, 'bgm_fpt_chill.mp3')
  };

  const customBgmDir = path.join(assetsDir, 'custom-music');
  fs.mkdirSync(customBgmDir, { recursive: true });

  const sfxCapcutDir = path.join(assetsDir, 'sfx');

  const resolveSfx = (idOrFile) => {
    if (!idOrFile) return path.join(sfxCapcutDir, 'sfx_12.mp3');
    const clean = idOrFile.replace(/\.mp3$/, '').trim();
    const directPath = path.join(sfxCapcutDir, `${clean}.mp3`);
    if (fs.existsSync(directPath)) return directPath;

    // Bảng bí danh ánh xạ tuyệt đối các tên gọi về đúng 38 file MP3 chuẩn:
    const ALIASES = {
      'whoosh_1': 'sfx_12.mp3',
      'whoosh3': 'sfx_08.mp3',
      'whoosh': 'sfx_12.mp3',
      'swish': 'sfx_22.mp3',
      'pop': 'sfx_04.mp3',
      'click_chu_t': 'sfx_01.mp3',
      'g__ph_m': 'sfx_18.mp3',
      'button_click__input_response__tap__short': 'sfx_06.mp3',
      'b_m': 'sfx_14.mp3',
      'bum': 'sfx_14.mp3',
      'boom': 'sfx_14.mp3',
      'transition-signal-2-208053': 'sfx_08.mp3',
      'camera-flash-204151': 'flick_camera_flash.mp3',
      'camera-with-flash-91817': 'flick_flash_click.mp3',
      'cash_ting': 'cash_money.mp3'
    };
    if (ALIASES[clean] && fs.existsSync(path.join(sfxCapcutDir, ALIASES[clean]))) {
      return path.join(sfxCapcutDir, ALIASES[clean]);
    }

    // Quy tắc định tuyến thông minh vào bộ Sound Effect (bao gồm Cash Money + Ting Ding Ring):
    // 1. Tiền, tiện ích, cước, giá, deal -> cash_money.mp3 / cash_register.mp3 / sfx_24.mp3
    if (/cash|tiền|giá|tiện\s*ích|cước|195|220|0đ|tặng|deal|coin|register/i.test(clean)) {
      if (fs.existsSync(path.join(sfxCapcutDir, 'cash_money.mp3'))) return path.join(sfxCapcutDir, 'cash_money.mp3');
      return path.join(sfxCapcutDir, 'sfx_24.mp3');
    }
    // 2. Ting ding ring, chuông, mở đầu -> bellring.mp3 / bell_ring_ding.mp3 / sfx_03.mp3
    if (/ting|ding|ring|bell|chime|mở|hook/i.test(clean)) {
      if (/ding/i.test(clean) && fs.existsSync(path.join(sfxCapcutDir, 'bell_ring_ding.mp3'))) {
        return path.join(sfxCapcutDir, 'bell_ring_ding.mp3');
      }
      if (fs.existsSync(path.join(sfxCapcutDir, 'bellring.mp3'))) return path.join(sfxCapcutDir, 'bellring.mp3');
      return path.join(sfxCapcutDir, 'sfx_03.mp3');
    }
    // 3. Nhấn mạnh, Bùm nổ, climax, kicker -> sfx_14 (Bùm Impact) / sfx_13 (Flash Punch) / sfx_20 (Heavy Boom)
    if (/bùm|boom|nổ|nhấn|kicker|climax|flash|impact/i.test(clean)) {
      return path.join(sfxCapcutDir, 'sfx_14.mp3');
    }
    // 4. Chuyển cảnh, Whoosh, lướt -> sfx_12 (Fast Whoosh), sfx_08 (Cinematic Whoosh), sfx_07 (Rise), sfx_09 (Metal Swish), sfx_22 (Quick Swish)
    if (/whoosh|transition|swish|cut|jump|whip/i.test(clean)) {
      const wList = ['sfx_12.mp3', 'sfx_08.mp3', 'sfx_22.mp3', 'sfx_09.mp3', 'sfx_07.mp3', 'sfx_20.mp3'];
      for (const w of wList) {
        const p = path.join(sfxCapcutDir, w);
        if (fs.existsSync(p)) return p;
      }
    }
    // 5. Typing gõ phím -> sfx_18 (Fast Keystroke), sfx_16 (Ticking), sfx_17 (Shutter)
    if (/type|typing|phím|keyboard|key/i.test(clean)) {
      const tList = ['sfx_18.mp3', 'sfx_16.mp3', 'sfx_17.mp3'];
      for (const t of tList) {
        const p = path.join(sfxCapcutDir, t);
        if (fs.existsSync(p)) return p;
      }
    }
    // 6. UI nảy text, click, pop, button -> sfx_01, sfx_02, sfx_04, sfx_06, sfx_11, sfx_15, sfx_19, sfx_21, sfx_25, sfx_26
    if (/ui|click|pop|button|select|tap|snap|tick/i.test(clean)) {
      const uList = ['sfx_01.mp3', 'sfx_02.mp3', 'sfx_04.mp3', 'sfx_11.mp3', 'sfx_15.mp3', 'sfx_19.mp3', 'sfx_06.mp3', 'sfx_25.mp3'];
      for (const u of uList) {
        const p = path.join(sfxCapcutDir, u);
        if (fs.existsSync(p)) return p;
      }
    }
    // 7. Flick, flash, camera shutter, snap -> flick_camera_flash, flick_flash_click, sfx_13, sfx_26
    if (/flick|flash|chớp|camera|shutter/i.test(clean)) {
      if (fs.existsSync(path.join(sfxCapcutDir, 'flick_camera_flash.mp3'))) return path.join(sfxCapcutDir, 'flick_camera_flash.mp3');
      if (fs.existsSync(path.join(sfxCapcutDir, 'flick_flash_click.mp3'))) return path.join(sfxCapcutDir, 'flick_flash_click.mp3');
      return path.join(sfxCapcutDir, 'sfx_13.mp3');
    }

    return path.join(sfxCapcutDir, 'sfx_12.mp3');
  };

  const SFX_MAP = {
    pop:            path.join(sfxCapcutDir, 'sfx_04.mp3'),
    whoosh_short:   path.join(sfxCapcutDir, 'sfx_12.mp3'),
    cash_ting:      path.join(sfxCapcutDir, 'sfx_24.mp3'),
    party_popper:   path.join(sfxCapcutDir, 'sfx_03.mp3'),
    record_scratch: path.join(sfxCapcutDir, 'sfx_27.mp3'),
    riser_short:    path.join(sfxCapcutDir, 'sfx_07.mp3'),
    camera_shutter: path.join(sfxCapcutDir, 'sfx_17.mp3'),
    ui_click:       path.join(sfxCapcutDir, 'sfx_01.mp3'),
    chime:          path.join(sfxCapcutDir, 'sfx_03.mp3')
  };

  const outW = 1080;
  const outH = 1920;
  const safeCx = 540;
  const useFptOverlays = job.useBranding !== undefined ? Boolean(job.useBranding) : true;
  const useOriginalVideoAudio = job.useOriginalVideoAudio !== undefined ? Boolean(job.useOriginalVideoAudio) : true;
  const bgmMode = job.bgmMode || 'auto';
  const disableBgm = Boolean(job.disableBgm === true || bgmMode === 'none');
  const bgmKeys = ['upbeat', 'bright', 'fresh', 'synth'];
  
  let activeBgm = null;
  if (!disableBgm) {
    if (job.customBgm) {
      const p = path.isAbsolute(job.customBgm) ? job.customBgm : path.join(customBgmDir, path.basename(job.customBgm));
      if (fs.existsSync(p)) activeBgm = p;
    }
    if (!activeBgm && referenceProfile.audio.defaultBgm) {
      const referenceMusic=path.join(customBgmDir,path.basename(referenceProfile.audio.defaultBgm));
      if(fs.existsSync(referenceMusic))activeBgm=referenceMusic;
    }
    if (!activeBgm) {
      activeBgm = BGM_CATALOG[bgmMode] || BGM_CATALOG[bgmKeys[safeName.length % bgmKeys.length]] || BGM_CATALOG.upbeat;
    }
  }

  if (disableBgm) {
    log('   -> [BGM CONTROL] ĐÃ BẬT CHẾ ĐỘ BỎ NHẠC NỀN: Video xuất ra sẽ HOÀN TOÀN KHÔNG CÓ NHẠC, chỉ giữ Voice + 56 Tech Sound Effects!');
  } else if (job.customBgm && activeBgm) {
    log(`   -> [BGM CONTROL] Sử dụng Nhạc nền TỰ TẢI LÊN: ${path.basename(activeBgm)}`);
  }

  const vList = (job.videoFiles && job.videoFiles.length) ? job.videoFiles : ['presenter_take_01.mp4', 'presenter_take_02.mp4', 'presenter_take_03.mp4', 'presenter_take_04.mp4'];
  const aList = job.voiceFiles || [];
  const sourceProfiles=new Map();
  const profileFor=file=>{if(!sourceProfiles.has(file))sourceProfiles.set(file,probeMedia(file));return sourceProfiles.get(file);};
  vList.forEach(file=>profileFor(resolveMediaPath(file)));
  const inputWarnings=[...sourceProfiles].filter(([,info])=>info.lowResolution).map(([file])=>'Nguồn '+path.basename(file)+' dưới 1080p; xuất 1080×1920 nhưng độ chi tiết phụ thuộc tệp gốc.');
  inputWarnings.forEach(log);
  // Cố định tốc độ giọng VJ mặc định 1.25x (FPT Telecom Gold Standard: dồn dập, năng lượng cao, 0s chết)
  const voiceSpeed = Math.max(0.5, Math.min(2.0, Number(job.voiceSpeed) || 1.25));

  // 1. Automatic Speech-to-Text & Silence Trimming ("chỉ cần bỏ video vào là tự ra sub theo voice & khớp hình 100%")
  let subtitles = Array.isArray(job.subtitles) ? job.subtitles : [];
  let highlights = Array.isArray(job.highlights) ? job.highlights : [];
  let clipWindows = Array.isArray(job.clipWindows) ? job.clipWindows : [];
  let autoHook = null;
  let autoOutroCta = null;

  if ((useOriginalVideoAudio || aList.length > 0) && (subtitles.length === 0 || clipWindows.length === 0)) {
    onProgress(10, 'Đang tự động nhận diện giọng nói (Auto-Sub) & căn chỉnh khớp khẩu hình...');
    log(`[1/6] Tự động bóc băng giọng nói từ ${aList.length ? aList.length + ' file Voice' : vList.length + ' file Video'} & cắt khoảng lặng thừa...`);
    try {
      const autoRes = await generateAutoSubtitles({
        voiceFiles: aList,
        videoFiles: vList,
        voiceSpeed,
        originalScript: job.originalScript || '',
        trimSilence: true
      });
      if (!subtitles.length) subtitles = autoRes.subtitles || [];
      // The approved reference planner selects body highlights after transcription.
      clipWindows = autoRes.clipWindows || [];
      autoHook = autoRes.autoHook;
      autoOutroCta = autoRes.autoOutroCta;
      log(`   -> Đã tạo tự động ${subtitles.length} câu Sub bám sát giọng nói & ${highlights.length} Callout Highlight!`);
    } catch (e) {
      throw new Error('Không tạo được Sub text: '+e.message);
    }
  }

  // Fallback clipWindows if audio was disabled or not transcribed
  if (!clipWindows.length) {
    let cur = 0;
    for (let i = 0; i < vList.length; i++) {
      const vPath = resolveMediaPath(vList[i]);
      const rawDur = getDuration(vPath);
      const scaledDur = Number((rawDur / voiceSpeed).toFixed(3));
      clipWindows.push({
        fileRef: vList[i],
        srcPath: vPath,
        rawDur,
        trimStart: 0,
        trimEnd: rawDur,
        timelineStart: Number(cur.toFixed(3)),
        timelineDur: scaledDur
      });
      cur += scaledDur;
    }
  }

  clipWindows = normalizeClipWindows(clipWindows, vList, voiceSpeed);
  subtitles = correctSubtitles(subtitles);
  highlights = highlights.map(h=>({...h,text:cleanFptTranscript(h.text)}));
  if (!highlights.length && subtitles.length) {
    const duration = clipWindows.reduce((sum,w)=>sum+w.timelineDur,0);
    highlights = createReferenceHighlights(subtitles,duration);
  }

  const runFfAsync = (args) => new Promise((resolve, reject) => {
    const ch = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    ch.on('error',reject);
    ch.stderr.on('data', d => { err += d.toString(); });
    ch.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg (${code}): ${err.slice(-350)}`)));
  });

  // 2. Frame-Accurate Video + Audio Sync Engine ("căn chỉnh sao cho voice khớp với hình 100%")
  let singleMasterVoice = null;
  let totalDur = 25.0;
  const rawConcat = path.join(tempDir, 'raw_concat.mp4');

  if (aList.length === 0 && useOriginalVideoAudio) {
    onProgress(24, 'Đang đồng bộ Khẩu hình & Giọng nói gốc (Frame-Accurate Sync + Jump-Cut)...');
    log(`[2/6] Đồng bộ 100% Khẩu hình & Giọng nói gốc trên ${clipWindows.length} cảnh (kèm đổi cỡ cảnh Jump-Cut mượt mà)...`);

    const syncedClips = clipWindows.map((_, idx) => path.join(tempDir, `synced_clip_${idx + 1}.mp4`));

    await mapConcurrent(clipWindows,2,(win, idx) => {
      const tStart = Number(win.trimStart || 0).toFixed(3);
      const tEnd = Number(win.trimEnd || win.rawDur || 5.0).toFixed(3);
      const vPtsExpr = Math.abs(voiceSpeed - 1.0) >= 0.01 ? `(PTS-STARTPTS)/${voiceSpeed.toFixed(3)}` : `PTS-STARTPTS`;
      const atempoPart = Math.abs(voiceSpeed - 1.0) >= 0.01 ? `,atempo=${voiceSpeed.toFixed(3)}` : '';

      // Chuyển đổi cỡ cảnh mượt mà theo từng phân cảnh (Scene Cut), không giật/nhảy giữa chừng câu nói
      const isPunchIn = (idx % 2 === 1);
      const scaleW = isPunchIn ? 1144 : outW;
      const scaleH = isPunchIn ? 2034 : outH;
      const vFilter = portraitFilter(profileFor(win.srcPath),{prefix:`trim=start=${tStart}:end=${tEnd},setpts=${vPtsExpr},fps=30,`,punch:isPunchIn});

      const aFilter = hasAudioStream(win.srcPath)
        ? `[0:a]atrim=start=${tStart}:end=${tEnd},asetpts=PTS-STARTPTS${atempoPart},acompressor=threshold=-18dB:ratio=4:attack=5:release=50:makeup=2[aout]`
        : `anullsrc=r=48000:cl=stereo,atrim=0:${win.timelineDur}[aout]`;

      return runFfAsync([
        '-y', '-i', win.srcPath,
        '-filter_complex', `${vFilter};${aFilter}`,
        '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '17',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        syncedClips[idx]
      ]);
    });

    // Concatenate video + audio streams together using filter concat so timestamps never drift across clips
    if (syncedClips.length === 1) {
      fs.copyFileSync(syncedClips[0], rawConcat);
    } else {
      const concatArgs = ['-y'];
      syncedClips.forEach(c => concatArgs.push('-i', c));
      const pairStr = syncedClips.map((_, i) => `[${i}:v][${i}:a]`).join('');
      concatArgs.push(
        '-filter_complex', `${pairStr}concat=n=${syncedClips.length}:v=1:a=1[vcat][acat]`,
        '-map', '[vcat]', '-map', '[acat]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '17',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        rawConcat
      );
      await runFfAsync(concatArgs);
    }

    // Extract the locked master audio from rawConcat so BGM and SFX mix cleanly with 0.00ms offset
    singleMasterVoice = path.join(voiceWorkDir, 'master_synced_voice.mp3');
    execFileSync(FFMPEG, [
      '-y', '-loglevel', 'error', '-i', rawConcat, '-vn',
      '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', singleMasterVoice
    ]);
    totalDur = Number(getDuration(rawConcat).toFixed(2));
  } else {
    // Separate voiceFiles or muted video mode
    if (aList.length > 0) {
      log(`[2/6] Xử lý Voiceover rời (${aList.length} file) ở tốc độ ${voiceSpeed}x...`);
      const spedVoices = [];
      for (let i = 0; i < aList.length; i++) {
        const srcPath = resolveMediaPath(aList[i]);
        const outPath = path.join(voiceWorkDir, `sped_voice_${i + 1}.mp3`);
        const dur = speedUpAudio(srcPath, outPath, voiceSpeed);
        spedVoices.push({ path: outPath, dur });
      }
      if (spedVoices.length === 1) {
        singleMasterVoice = spedVoices[0].path;
        totalDur = spedVoices[0].dur;
      } else {
        const masterPath = path.join(voiceWorkDir, 'master_voice.mp3');
        const concatArgs = ['-y', '-loglevel', 'error'];
        spedVoices.forEach(v => concatArgs.push('-i', v.path));
        const inpStr = spedVoices.map((_, i) => `[${i}:a]`).join('');
        concatArgs.push('-filter_complex', `${inpStr}concat=n=${spedVoices.length}:v=0:a=1[aout]`, '-map', '[aout]', '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', masterPath);
        execFileSync(FFMPEG, concatArgs);
        singleMasterVoice = masterPath;
        totalDur = spedVoices.reduce((acc, v) => acc + v.dur, 0);
      }
    } else {
      totalDur = Number(clipWindows.reduce((acc, w) => acc + w.timelineDur, 0).toFixed(2));
    }

    const perClipDur = totalDur / vList.length;
    const clipFiles = vList.map((_, i) => path.join(tempDir, `clip_${i + 1}.mp4`));
    await mapConcurrent(vList,2,(vf, i) => {
      const vPath = resolveMediaPath(vf);
      return runFfAsync([
        '-y', '-stream_loop', '-1', '-t', String(perClipDur), '-i', vPath,
        '-filter_complex', portraitFilter(profileFor(vPath),{prefix:'setpts=PTS-STARTPTS,fps=30,'}), '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '17', '-an', clipFiles[i]
      ]);
    });
    const concatTxt = path.join(tempDir, 'concat.txt');
    fs.writeFileSync(concatTxt, clipFiles.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    await runFfAsync(['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c', 'copy', rawConcat]);
  }

  // 3. Smart Timing for Hook, Contextual B-Rolls, Desaturate Flash & Outro CTA
  const manualOutro=job.titleMode!=='auto'&&job.outro&&['line1','line2','line3'].some(k=>String(job.outro[k]||'').trim());
  const {hookDur,outroDur,outroStart}=manualOutro?boundaries(totalDur):speechBoundaries(subtitles,totalDur);

  const desatStart = Number(Math.max(hookDur + 1.5, outroStart - 0.65).toFixed(2));
  const desatEnd = outroStart;

  // ===== B-ROLL CUT-AWAY ENGINE (Chèn cảnh thực xen kẽ VJ nói) =====
  let brollComposedVideo = rawConcat; // Mặc định dùng rawConcat
  let userBrollSpecs = selectBrollSpecs(job, subtitles, hookDur, outroStart)
    .map(s => ({ ...s, hostFocusY: s.hostFocusY ?? job.hostFocusY ?? 0.55 }));
  const mediaWarnings = [...inputWarnings,...getBrollWarnings(subtitles)];
  mediaWarnings.forEach(w => log('[NGUỒN B-ROLL] ' + w.text));

  if (userBrollSpecs.length > 0) {
    onProgress(35, `Đang chèn ${userBrollSpecs.length} cảnh B-Roll Cut-Away chuyên nghiệp...`);
    log(`[2.5/6] Chèn B-Roll Cut-Away: ${userBrollSpecs.length} cảnh xen kẽ VJ nói...`);
    
    // Resolve file paths
    const resolvedSpecs = userBrollSpecs
      .map(s => resolveBrollSpec(s))
      .filter(Boolean);
    
    if (resolvedSpecs.length > 0) {
      const brollComposedPath = path.join(tempDir, 'broll_composed.mp4');
      try {
        await composeBrollCutaway(rawConcat, resolvedSpecs, brollComposedPath, log);
        if (fs.existsSync(brollComposedPath)) {
          brollComposedVideo = brollComposedPath;
          log(`   -> [B-ROLL] Đã compose ${resolvedSpecs.length} cảnh B-Roll thành công!`);
        }
      } catch (brollErr) {
        throw new Error('Không thể dựng B-roll đã chọn: ' + brollErr.message);
      }
    }
  }
  // ===== END B-ROLL ENGINE =====

  // Dynamic Voice-Driven AI B-Roll Generator:
  // Analyzes the exact spoken subtitles to produce custom high-tech illustration cards matching spoken speech!
  const voiceBrollSpecs = [];
  const textJoined = subtitles.map(s => s.text || '').join(' ').toLowerCase();

  const defaultIllustrationTemplates = {
    wifi6: {
      type: 'wifi6',
      kicker: 'TẦNG 1: Trang Bị Modem Wi-Fi 6',
      title: 'TỐC ĐỘ 1 Gbps KHÔNG GIỚI HẠN',
      features: [
        '✔ Độ trễ cực thấp < 5ms — Chơi Game 0 Lag',
        '✔ Mesh phủ sóng xuyên tường toàn bộ căn hộ',
        '✔ Kết nối cùng lúc 30+ thiết bị mượt mà'
      ],
      accent: 'blue',
      sfx: 'sfx_cyber_whoosh_fast'
    },
    fptplay: {
      type: 'fptplay',
      kicker: 'TẦNG 2: Chưa Hết... 5 Tài Khoản FPT Play',
      title: 'ĐỘC QUYỀN NGOẠI HẠNG ANH & C1',
      features: [
        '✔ Gần 200 kênh truyền hình 4K HDR',
        '✔ Kho phim bom tấn Hollywood cập nhật liên tục',
        '✔ Xem đồng thời trên TV, Mobile & Tablet'
      ],
      accent: 'green',
      sfx: 'sfx_cinema_4k_whoosh'
    },
    camera: {
      type: 'camera',
      kicker: 'TẦNG 3: Đặc Biệt... Tặng Camera AI 0Đ',
      title: 'TẶNG NGAY CAMERA AI 0Đ',
      features: [
        '✔ Nhận diện người AI chính xác 99.8%',
        '✔ Đàm thoại 2 chiều to rõ như điện thoại',
        '✔ Lưu trữ Cloud FPT tại Việt Nam bảo mật 100%'
      ],
      accent: 'orange',
      sfx: 'sfx_camera_shutter_ai'
    },
    speedtest: {
      type: 'speedtest',
      kicker: 'THỰC TẾ ĐO: Speedtest 1.026 Mbps',
      title: 'BĂNG THÔNG VƯỢT TRỘI 1.026 Mbps',
      features: [
        '⚡ Ping 2ms — Cực kỳ mượt mà',
        '🚀 Download 1.026,92 Mbps siêu tốc',
        '📤 Upload 1.018,45 Mbps không giật'
      ],
      accent: 'blue',
      sfx: 'sfx_success_tech_chime'
    }
  };

  // Chỉ chèn ảnh minh họa / B-Roll khi người dùng CHỦ ĐỘNG thêm trên Timeline
  // Tuyệt đối không tự ý chèn ảnh minh họa tự động gây rối mắt hoặc đè lên mặt VJ
  if (Array.isArray(job.illustrations) && job.illustrations.length > 0) {
    job.illustrations.forEach((ill, idx) => {
      if (ill.enabled === false) return;
      const tpl = defaultIllustrationTemplates[ill.type] || defaultIllustrationTemplates.wifi6;
      const st = Math.max(hookDur + 0.1, Number(ill.start) || 4.0);
      const en = Number(ill.end) || (st + (Number(ill.dur) || 2.6));
      const dur = Math.max(1.2, Number((en - st).toFixed(2)));
      voiceBrollSpecs.push({
        ...tpl,
        file: `dynamic_broll_${idx + 1}.png`,
        title: ill.title || ill.name || tpl.title,
        kicker: ill.kicker || tpl.kicker,
        start: Number(st.toFixed(2)),
        dur: Number(dur.toFixed(2))
      });
    });
  }

  // 4. Render Hook, Enlarged Keyword Callouts & Price Pill Overlays
  onProgress(42, 'Đang tạo Cụm Hook, Callout Highlight & Hộp Giá theo giọng nói...');
  const smartMeta = deriveSmartHookFromSubtitles(subtitles);

  const hookCfg = {
    line1: '',
    line2: '',
    line3: '',
    line4: '',
    y: 320,
    scale: 1.30
  };
  if (job.hook && job.titleMode !== 'auto') {
    hookCfg.line1 = (job.hook.line1 != null) ? String(job.hook.line1).trim() : '';
    hookCfg.line2 = (job.hook.line2 != null) ? String(job.hook.line2).trim() : '';
    hookCfg.line3 = (job.hook.line3 != null) ? String(job.hook.line3).trim() : '';
    hookCfg.line4 = (job.hook.line4 != null) ? String(job.hook.line4).trim() : '';
    hookCfg.y = (job.hook.y != null && !isNaN(job.hook.y) && Number(job.hook.y) > 50) ? Number(job.hook.y) : 320;
    hookCfg.scale = (job.hook.scale != null && !isNaN(job.hook.scale) && Number(job.hook.scale) > 0.4) ? Number(job.hook.scale) : 1.30;
  } else if (smartMeta.hook) {
    Object.assign(hookCfg, smartMeta.hook);
  }

  const outroCtaRaw = (!job.outroCta || job.outroCta === '220K Ngoại hạng Anh')
    ? (autoOutroCta || smartMeta.outroCta || '')
    : job.outroCta;
  const outroCtaText = wrapSafeLine(outroCtaRaw, 22);

  log(`[3/6] Render cụm Hook (Dòng 1: ${hookCfg.line1} | Dòng 2: ${hookCfg.line2 || hookCfg.line4}) & ${highlights.length} Callout Highlight...`);

  const hlSpecs = [];
  const typoCycle = ['fpt_tricolor_slab', 'fpt_orange_block', 'fpt_blue_pill', 'fpt_stack_outline', 'fpt_price_burst', 'fpt_green_badge'];
  const motionCycle = ['pop_bounce', 'slide_left', 'slam_drop', 'slide_right'];

  // Sắp xếp các cụm Text Highlight theo thời gian xuất hiện
  const rawHls = applyTypographyVariety(prepareHighlightsForRender(highlights
    .filter(hl => hl && hl.text && hl.text.trim())
    .map(hl => ({
      text: wrapSafeLine(hl.text.trim(), 22),
      start: Number(hl.start),
      end: Number(hl.end) || (Number(hl.start) + 2.0),
      y: (hl.y != null && !isNaN(hl.y) && Number(hl.y) > 50) ? Number(hl.y) : (job.highlightY != null ? Number(job.highlightY) : 350),
      scale: (hl.scale != null && !isNaN(hl.scale) && Number(hl.scale) > 0.4) ? Number(hl.scale) : (job.highlightScale != null ? Number(job.highlightScale) : 1.40),
      typo: hl.typo,
      motion: hl.motion,
      sfx: hl.sfx,
      priority: hl.priority,
      timingPolicy: hl.timingPolicy
    }))
    .sort((a, b) => a.start - b.start), hookDur, outroStart, totalDur))
    .map(hl => ({ ...hl, dur: hl.end - hl.start }));

  rawHls.forEach((hl, idx) => {
    if (hl.dur < 0.35 && hl.timingPolicy !== 'preserve_all') return;
    hlSpecs.push({
      file: `hl_${idx}.png`,
      timingPolicy: hl.timingPolicy,
      text: hl.text,
      y: hl.y,
      scale: hl.scale,
      typo: hl.typo || typoCycle[idx % typoCycle.length],
      motion: hl.motion || motionCycle[idx % motionCycle.length],
      sfx: hl.sfx || (hl.typo === 'fpt_price_burst' ? 'cash_ting' : 'pop'),
      start: Number(hl.start.toFixed(3)),
      dur: Number(hl.dur.toFixed(3))
    });
  });

  const requestedOutro=(job.titleMode==='auto'||!job.outro)?smartMeta.outro:job.outro;
  const outroCfg = {
    line1: (requestedOutro && requestedOutro.line1 != null) ? String(requestedOutro.line1).trim() : '',
    line2: (requestedOutro && requestedOutro.line2 != null) ? String(requestedOutro.line2).trim() : '',
    line3: (requestedOutro && requestedOutro.line3 != null) ? String(requestedOutro.line3).trim() : '',
    y: (requestedOutro && requestedOutro.y != null) ? Number(requestedOutro.y) : hookCfg.y,
    scale: (requestedOutro && requestedOutro.scale != null) ? Number(requestedOutro.scale) : hookCfg.scale
  };

  const hasOutroText = Boolean(outroCfg.line1 || outroCfg.line2 || outroCfg.line3);
  if (hasOutroText) {
    hlSpecs.push({
      file: 'hl_outro.png',
      text: outroCfg.line3 || outroCfg.line1 || '',
      y: outroCfg.y,
      scale: outroCfg.scale,
      start: outroStart,
      dur: outroDur
    });
  }

  const overlayCfgPath = path.join(workDir, 'overlay_config.json');
  fs.writeFileSync(overlayCfgPath, JSON.stringify({
    outDir: overlayDir,
    width: outW,
    height: outH,
    hook: hookCfg,
    outro: outroCfg,
    highlights: hlSpecs
  }, null, 2), 'utf8');

  execFileSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(PATHS.root,'src/renderers/render_typography.ps1'), '-ConfigPath', overlayCfgPath], { stdio: 'inherit' });

  // 5. Generate Dynamic Pop-Bounce Dual-Color ASS Subtitles
  onProgress(55, 'Đang tạo Sub Text hiệu ứng Pop-Bounce & Highlight từ khóa tự động...');
  log(`[4/6] Tạo ${subtitles.length} câu Phụ đề động (Pop-Bounce + Highlight Vàng Chanh #EFFF00 / Cam #FC6601 viền Trắng)...`);

  const assHeader = `[Script Info]
Title: ${safeName}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: ${outW}
PlayResY: ${outH}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: FptRunning,Montserrat-Bold,48,&H00FFFFFF,&H0000FFEF,&H000166FC,&H64000000,-1,0,0,0,100,100,0,0,1,8,4,2,190,190,340,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const subtitleItems = subtitles
    .filter(s => s && s.text && s.text.trim())
    .map(s => {
      const st = Math.max(0, Number(s.start) || 0);
      const en = Math.min(totalDur, Math.max(st + 0.20, Number(s.end) || st + 1.0));
      return { start: st, end: en, text: s.text.replace(/\n/g, ' ').trim() };
    });

  // Running subtitles at y=1580 (TikTok Safe Zone, well below chest/waist callouts at y=1340)
  const assEvents = subtitleItems
    .filter(sb => sb.start < (outroStart + 0.3))
    .map(sb => {
      // Đặt Subtitle cố định tại y=1580 (vùng Safe Zone chuẩn TikTok, cách đáy 340px, tuyệt đối không che mặt và ngực người nói)
      const yPos = 1580;
      return `Dialogue: 0,${fmtAssTime(sb.start)},${fmtAssTime(sb.end)},FptRunning,,0,0,0,,${formatRichAssSubtitleText(sb.text, yPos)}`;
    })
    .join('\n');

  const assPath = path.join(workDir, 'subtitles.ass');
  fs.writeFileSync(assPath, assHeader + assEvents, 'utf8');

  const thumbPath = path.join(workDir, `${safeName}_thumbnail.jpg`);
  execFileSync(FFMPEG, [
    '-y', '-ss', '0.5', '-i', rawConcat,
    '-i', path.join(overlayDir, 'intro_hook.png'),
    '-filter_complex', '[0:v][1:v]overlay=0:0[vout]',
    '-map', '[vout]', '-frames:v', '1', '-q:v', '2', thumbPath
  ]);

  // 6. Final Master Composition (BGM + Locked Voice + 9 Studio SFX + Smooth B-Rolls + Subtitles)
  onProgress(68, 'Đang kết xuất MP4 hoàn chỉnh (Studio BGM + 9 SFX + B-Roll động + Sub)...');
  log(`[5/6] Render Final MP4 (${totalDur}s — Studio BGM + 9 SFX + B-Roll Wi-Fi 6 / Speedtest / Camera AI HUD + Sub)...`);
  const outMp4 = path.join(workDir, `${safeName}.mp4`);

  const inputs = ['-y', '-i', brollComposedVideo]; // Dùng video đã compose B-roll (hoặc rawConcat nếu không có B-roll)
  const filterParts = [
    `[0:v]copy[vbase]`
  ];
  const audioLabels = [];
  let nextIdx = 1;

  // Helper to detect the most energetic drop/chorus in BGM
  function findEnergeticDrop(audioPath, neededDur = 30) {
    try {
      const durRaw = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath], { encoding: 'utf8' }).trim();
      const fullDur = parseFloat(durRaw) || 60;
      if (fullDur <= neededDur + 5) return 0;

      const candidates = [0, 12, 20, 30, 45].filter(s => s + neededDur <= fullDur);
      let bestStart = candidates.includes(12) ? 12 : (candidates[1] || 0);
      let maxVol = -999;

      for (const st of candidates) {
        try {
          execFileSync(FFMPEG, [
            '-ss', String(st), '-t', '6', '-i', audioPath,
            '-af', 'volumedetect', '-f', 'null', '-'
          ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (err) {
          const stderr = err.stderr ? err.stderr.toString() : (err.message || '');
          const m = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
          if (m) {
            const v = parseFloat(m[1]);
            if (v > maxVol) {
              maxVol = v;
              bestStart = st;
            }
          }
        }
      }
      return bestStart;
    } catch (_) {
      return 12;
    }
  }

  // Bright Commercial BGM (-16dB under voice, continuous, starting at energetic drop)
  if (activeBgm && fs.existsSync(activeBgm)) {
    const bgmDropStart = job.bgmFromStart ? 0 : findEnergeticDrop(activeBgm, totalDur);
    log(`   -> [BGM DYNAMICS] Đã chọn đoạn DROP SÔI ĐỘNG NHẤT của bài hát từ giây ${bgmDropStart}s để beat đánh dồn dập ngay mở màn!`);
    const bIdx = nextIdx++;
    inputs.push('-ss', String(bgmDropStart), '-stream_loop', '-1', '-t', String(totalDur), '-i', activeBgm);
    const bgmVol = singleMasterVoice ? referenceProfile.audio.bgmWithVoice : referenceProfile.audio.bgmWithoutVoice;
    filterParts.push(`[${bIdx}:a]atrim=0:${totalDur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.25,afade=t=out:st=${Math.max(0, totalDur - 0.8).toFixed(2)}:d=0.8,volume=${bgmVol}[bgm]`);
    audioLabels.push('[bgm]');
  }

  // Locked Master Voice
  if (singleMasterVoice && fs.existsSync(singleMasterVoice)) {
    const vIdx = nextIdx++;
    inputs.push('-i', singleMasterVoice);
    filterParts.push(`[${vIdx}:a]volume=${referenceProfile.audio.voiceGain}[v_master]`);
    audioLabels.push('[v_master]');
  }

  // Studio SFX Director (Chuyên nghiệp, tinh tế, chống lặp lại âm thanh - Anti-Repetition)
  const sfxCandidates = [];
  const addSfx = (file, start, vol = '0.36', priority = 20, minGap = 0.95) => {
    if (!file || !fs.existsSync(file) || !Number.isFinite(start)) return;
    const opener = start < 0.1;
    sfxCandidates.push({ file, start, vol: String(vol),
      priority: opener ? 100 : priority === true ? 90 : Number(priority) || 20,
      minGap, group: opener ? 'opener' : null });
  };

  // 1. Hook Opener: 1 Bell Ting + 1 Whoosh (Gọn gàng, sang trọng, không nhồi nhét)
  addSfx(resolveSfx('bellring'), 0.0, '0.45', true);
  addSfx(resolveSfx('whoosh_1'), 0.0, '0.40', true);

  // 2. Chuyển cảnh Video / Jump-Cut: Whoosh nhẹ nhàng CHỈ KHI khoảng cách giữa 2 cảnh >= 2.2s
  let lastCutWhooshTime = 0.0;
  clipWindows.slice(1).forEach((win) => {
    const cutTime = Math.max(0, win.timelineStart - 0.03);
    if (cutTime - lastCutWhooshTime >= 2.2 && cutTime > hookDur && cutTime < outroStart - 1.0) {
      addSfx(resolveSfx('sfx_08'), cutTime, '0.30', 70, 1.2);
      lastCutWhooshTime = cutTime;
    }
  });

  // 3. Text Highlights: Luân phiên đa dạng âm thanh, tuyệt đối không lặp lại âm thanh liên tiếp
  const variedSfxBank = ['ding_correct', 'sfx_12', 'flick_flash_click', 'bell_ring_ding', 'sfx_26', 'chime_ding', 'sfx_22', 'sfx_04'];
  let lastHlSfx = '';
  hlSpecs.forEach((hl, hIdx) => {
    if (hl.file === 'hl_outro.png') return;
    let chosenSfx = hl.sfx;
    if (!chosenSfx || chosenSfx === 'sfx_14') {
      const hTxt = (hl.text || '').toLowerCase();
      if (/(?:\b\d+\s*k\b|\b\d+\s*đ\b|k\/tháng|triệu|giá|tiền)/i.test(hTxt)) {
        chosenSfx = 'cash_money';
      } else if (/(?:camera|flash|nhìn|chụp)/i.test(hTxt)) {
        chosenSfx = 'flick_camera_flash';
      } else if (/(?:độc\s*quyền|ngoại\s*hạng|fpt\s*play|bóng\s*đá)/i.test(hTxt)) {
        chosenSfx = 'ding_correct';
      } else {
        const available = variedSfxBank.filter(s => s !== lastHlSfx);
        chosenSfx = available[hIdx % available.length];
      }
    }
    // Chống lặp lại âm thanh: nếu trùng với SFX ngay trước đó, tự động đổi
    if (chosenSfx === lastHlSfx) {
      chosenSfx = variedSfxBank.find(s => s !== lastHlSfx) || 'sfx_12';
    }
    lastHlSfx = chosenSfx;
    addSfx(resolveSfx(chosenSfx), hl.start, '0.38', 60, 0.95);
  });

  // 4. B-Roll Cut-Away Transition: Âm thanh lướt nhẹ khi chuyển vào B-Roll
  if (Array.isArray(userBrollSpecs) && userBrollSpecs.length > 0) {
    userBrollSpecs.forEach(br => {
      if (br.start > hookDur && br.start < outroStart) {
        addSfx(resolveSfx('sfx_08'), br.start, '0.32', 70, 1.0);
      }
    });
  }

  // 5. Outro CTA: Tiền về & Ting chốt deal
  addSfx(resolveSfx('bell_ring_ding'), outroStart + 0.08, '0.45', true);
  addSfx(resolveSfx('cash_register'), outroStart + 1.05, '0.45', true);

  // 7. B-Roll SFX (chỉ khi người dùng chủ động thêm minh họa)
  if (voiceBrollSpecs.length > 0) {
    voiceBrollSpecs.forEach((broll) => {
      if (broll.sfx) {
        addSfx(resolveSfx(broll.sfx), broll.start, '0.48', true);
      }
    });
  }

  const sfxHits = scheduleSfx(sfxCandidates, totalDur);
  const qualityReportPath=path.join(workDir,'quality_report.json');
  requirePlan({totalDur,subtitles,highlights:hlSpecs,brolls:userBrollSpecs,sfx:sfxHits,hookDur,outroStart},qualityReportPath);

  sfxHits.forEach((sx, i) => {
    const sIdx = nextIdx++;
    inputs.push('-i', sx.file);
    const ms = Math.round(sx.start * 1000);
    filterParts.push(`[${sIdx}:a]adelay=${ms}|${ms},volume=${sx.vol}[sx_${i}]`);
    audioLabels.push(`[sx_${i}]`);
  });

  const fadeOutDur = 1.0;
  const fadeOutStart = Math.max(0, Number((totalDur - fadeOutDur).toFixed(2)));

  if (audioLabels.length > 0) {
    filterParts.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:normalize=0,atrim=0:${totalDur},alimiter=limit=0.92,afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[aout]`);
  } else {
    filterParts.push(`anullsrc=r=48000:cl=stereo,atrim=0:${totalDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[aout]`);
  }

  let prevV = 'vbase';

  const requestedMask = hlSpecs.filter(h => h.timingPolicy === 'preserve_all')
    .map(h => '*not(between(t,' + h.start + ',' + Number((h.start + h.dur).toFixed(3)) + '))').join('');

  // 1. Hook Layers (0s -> hookDur) - Dynamic 3D Slam Bounce & Floating Breathing
  // Hỗ trợ từ 2 đến 4 dòng linh hoạt tùy nội dung người dùng nhập:
  const hookLinesCfg = [];
  const hookDelays = [0.0, 0.08, 0.16, 0.24];
  for (let li = 1; li <= 4; li++) {
    const fName = `hook_line${li}.png`;
    const fPath = path.join(overlayDir, fName);
    if (fs.existsSync(fPath) && fs.statSync(fPath).size > 500) {
      hookLinesCfg.push({
        file: fName,
        start: hookDelays[li - 1],
        end: hookDur,
        anim: li === 1 ? 'headline_in' : 'pop_bounce'
      });
    }
  }
  if (hookLinesCfg.length === 0) {
    hookLinesCfg.push({ file: 'intro_hook.png', start: 0.0, end: hookDur, anim: 'headline_in' });
  }

  hookLinesCfg.forEach((hlc, idx) => {
    const lDur = Number(Math.max(0.5, hlc.end - hlc.start).toFixed(2));
    const lFo = Math.max(0.15, lDur - 0.18).toFixed(2);
    const hIdx = nextIdx++;
    inputs.push('-i', path.join(overlayDir, hlc.file));

    let scPart = '';
    let yExpr = '(H-h)/2';
    if (hlc.anim === 'headline_in') {
      // 3D Elastic Slam Drop: 1.36x -> 0.90x -> 1.0x kèm chuyển động floating
      const scExpr = `${outW}*(if(lt(t,0.18),1.36-0.46*(t/0.18),if(lt(t,0.30),0.90+0.12*((t-0.18)/0.12),1.0)))`;
      scPart = `,scale=w='${scExpr}':h=-1:eval=frame:flags=lanczos`;
      yExpr = `(H-h)/2+if(lt(t-${hlc.start},0.22),-30*pow(1-(t-${hlc.start})/0.22,2),0)+3*sin((t-${hlc.start})*3.6)`;
    } else {
      // Elastic Pop-Bounce: 0.55x -> 1.15x -> 1.0x
      const scExpr = `${outW}*(if(lt(t,0.12),0.55+0.60*(t/0.12),if(lt(t,0.24),1.15-0.15*((t-0.12)/0.12),1.0)))`;
      scPart = `,scale=w='${scExpr}':h=-1:eval=frame:flags=lanczos`;
      yExpr = `(H-h)/2+3*sin((t-${hlc.start})*4.2 + 1.2)`;
    }

    const aLbl = `hk_${idx}`;
    const vLbl = `vhk_${idx}`;
    filterParts.push(
      `[${hIdx}:v]format=rgba,loop=loop=-1:size=1:start=0,setpts=N/(30*TB),trim=duration=${lDur},fade=t=in:st=0:d=0.10:alpha=1,fade=t=out:st=${lFo}:d=0.15:alpha=1${scPart},setpts=PTS-STARTPTS+${hlc.start}/TB[${aLbl}]`,
      `[${prevV}][${aLbl}]overlay=(W-w)/2:'${yExpr}':enable='between(t,${hlc.start},${hlc.end})${requestedMask}':eval=frame:eof_action=pass[${vLbl}]`
    );
    prevV = vLbl;
  });

  // 1.5. Dynamic Voice-Driven B-Roll Cards / Brand Illustrations
  if (voiceBrollSpecs.length > 0) {
    const brollCfgPath = path.join(workDir, 'broll_cards_config.json');
    fs.writeFileSync(brollCfgPath, JSON.stringify({
      outDir: overlayDir,
      cards: voiceBrollSpecs
    }, null, 2), 'utf8');
    try {
      execFileSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(PATHS.root,'src/renderers/render_broll_cards.ps1'), '-ConfigPath', brollCfgPath], { stdio: 'inherit' });
      voiceBrollSpecs.forEach((broll, bIdx) => {
        const bPath = path.join(overlayDir, broll.file);
        if (fs.existsSync(bPath)) {
          const bInIdx = nextIdx++;
          inputs.push('-i', bPath);
          const bLbl = `broll_a_${bIdx}`;
          const vbLbl = `vbroll_${bIdx}`;
          const bEnd = Number((broll.start + broll.dur).toFixed(2));
          const fo = Math.max(0.12, broll.dur - 0.15).toFixed(2);
          filterParts.push(
            `[${bInIdx}:v]format=rgba,loop=loop=-1:size=1:start=0,setpts=N/(30*TB),trim=duration=${broll.dur},fade=t=in:st=0:d=0.12:alpha=1,fade=t=out:st=${fo}:d=0.15:alpha=1,scale=1080:-1:flags=lanczos,setpts=PTS-STARTPTS+${broll.start}/TB[${bLbl}]`,
            `[${prevV}][${bLbl}]overlay=0:140:enable='between(t,${broll.start},${bEnd})':eof_action=pass[${vbLbl}]`
          );
          prevV = vbLbl;
        }
      });
    } catch (bErr) {
      log(`   -> [B-ROLL CẢNH BÁO] ${bErr.message}`);
    }
  }

  // 2. Enlarged Keyword Callouts, Price Pill & Outro CTA (Mỗi 1-2s nảy chữ chuẩn màu FPT, vùng giữa trên Y=480)
  hlSpecs.forEach((hl, i) => {
    const hIdx = nextIdx++;
    inputs.push('-i', path.join(overlayDir, hl.file));
    const fadeIn = Math.min(0.10, hl.dur * 0.2).toFixed(3);
    const fadeOut = Math.min(0.14, hl.dur * 0.2).toFixed(3);
    const fo = Math.max(0, hl.dur - Number(fadeOut)).toFixed(3);
    const aLbl = `ha_${i}`;
    const vLbl = `vh_${i}`;
    const isOutro = hl.file === 'hl_outro.png';
    const motion = hl.motion || 'pop_bounce';

    // 3D Kinetic Animation Engine: Elastic Pop Bounce, Slam Drop, Slide & Sway
    let scaleExpr = `${outW}*(if(lt(t,0.12),0.32+0.88*(t/0.12),if(lt(t,0.22),1.20-0.20*((t-0.12)/0.10),1.0)))`;
    let xExpr = `(W-w)/2`;
    let yExpr = `(H-h)/2`;

    if (isOutro) {
      xExpr = `(W-w)/2+8*sin((t-${hl.start})*9.4)`;
    } else if (motion === 'slam_drop') {
      scaleExpr = `${outW}*(if(lt(t,0.14),1.45-0.45*(t/0.14),if(lt(t,0.22),0.94+0.06*((t-0.14)/0.08),1.0)))`;
      yExpr = `(H-h)/2 - if(lt(t-${hl.start},0.14),90*(1-(t-${hl.start})/0.14),0)`;
    } else if (motion === 'slide_left') {
      xExpr = `(W-w)/2 - if(lt(t-${hl.start},0.16),240*pow(1-(t-${hl.start})/0.16,2),0)`;
    } else if (motion === 'slide_right') {
      xExpr = `(W-w)/2 + if(lt(t-${hl.start},0.16),240*pow(1-(t-${hl.start})/0.16,2),0)`;
    } else {
      scaleExpr = `${outW}*(if(lt(t,0.12),0.30+0.92*(t/0.12),if(lt(t,0.22),1.22-0.22*((t-0.12)/0.10),1.0)))`;
      xExpr = `(W-w)/2 + 6*sin((t-${hl.start})*10)`;
    }

    filterParts.push(
      `[${hIdx}:v]format=rgba,loop=loop=-1:size=1:start=0,setpts=N/(30*TB),trim=duration=${hl.dur},fade=t=in:st=0:d=${fadeIn}:alpha=1,fade=t=out:st=${fo}:d=${fadeOut}:alpha=1,scale=w='${scaleExpr}':h=-1:eval=frame:flags=lanczos,setpts=PTS-STARTPTS+${hl.start}/TB[${aLbl}]`,
      `[${prevV}][${aLbl}]overlay='${xExpr}':'${yExpr}':enable='between(t,${hl.start},${(hl.start + hl.dur).toFixed(3)})${isOutro ? requestedMask : ''}':eof_action=pass[${vLbl}]`
    );
    prevV = vLbl;
  });

  const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  // Chừa ra 1s cuối video mờ dần đen dần (Fade to black)
  const fontsEscaped=PATHS.fonts.replace(/\\/g,'/').replace(/:/g,'\\:');
  filterParts.push(`[${prevV}]subtitles='${assEscaped}':fontsdir='${fontsEscaped}',fade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[vout]`);

  await new Promise((resolve, reject) => {
    const ffArgs = [
      ...inputs,
      '-filter_complex', filterParts.join(';'),
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30',
      '-threads', String(Math.max(1,Math.min(8,Number(process.env.FPT_RENDER_THREADS)||4))), '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-t', String(totalDur),
      '-progress', 'pipe:1',
      '-nostats',
      outMp4
    ];
    const child = spawn(FFMPEG, ffArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.on('error',reject);
    let errBuf = '';
    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      const m = text.match(/out_time_us=(\d+)/);
      if (m && totalDur > 0) {
        const curSec = Number(m[1]) / 1e6;
        const pct = Math.min(99, Math.max(68, Math.round(68 + (curSec / totalDur) * 31)));
        onProgress(pct, `Đang xuất MP4 chuẩn FPT Telecom (${pct}%)...`);
      }
    });
    child.stderr.on('data', chunk => { errBuf += chunk.toString(); });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (${code}): ${errBuf.slice(-400)}`));
    });
  });

  const qualityReport=inspectOutput(outMp4,totalDur,qualityReportPath);
  log('[QUALITY] Đạt chuẩn '+referenceProfile.id+' — timeline và MP4 đã kiểm tra.');
  fs.writeFileSync(path.join(workDir, 'job.json'), JSON.stringify({
    referenceProfile: referenceProfile.id,qualityReport,
    ...job,
    brollCutaways: userBrollSpecs,
    renderedHighlights: hlSpecs,
    renderedSfx: sfxHits,
    mediaWarnings,
    subtitles,
    highlights,
    clipWindows,
    hook: hookCfg,
    outroCta: outroCtaRaw,
    totalDur,
    outMp4,
    thumbPath,
    safeName
  }, null, 2), 'utf8');

  // 7. Auto-Create Native CapCut Desktop Draft ("khi xuất phải xuất luôn vào capcut 1 bản")
  let capcutDraftName = safeName;
  let capcutDraftDir = null;
  let capcutSuccess = false;
  if (job.exportCapcut !== false) {
  try {
    log(`[6/6] Đồng bộ tự động 1 bản nháp đầy đủ Track vào CapCut Desktop...`);
    const capcutEngine = require('../integrations/capcut_engine');
    
    // Build clean storyboard for CapCut Desktop
    const capcutStoryboard = {
      title: safeName,
      ratio: '9:16',
      fps: 30,
      bgm: (activeBgm && fs.existsSync(activeBgm)) ? activeBgm : null,
      bgmVolume: 0.22,
      scenes: []
    };

    // Add video clips
    clipWindows.forEach((win, idx) => {
      capcutStoryboard.scenes.push({
        id: idx + 1,
        startTime: win.timelineStart,
        duration: win.timelineDur,
        video: win.srcPath,
        audio: (singleMasterVoice && fs.existsSync(singleMasterVoice)) ? singleMasterVoice : undefined,
        audioVolume: 1.0
      });
    });

    // Add subtitles as text segments in CapCut (starts after Intro Hook)
    subtitles.forEach((sb, sIdx) => {
      const st = Math.max(0, Number(sb.start) || 0);
      if (st < hookDur) return;
      const en = Math.min(totalDur, Math.max(st + 0.2, Number(sb.end) || st + 1.2));
      capcutStoryboard.scenes.push({
        id: 100 + sIdx,
        startTime: st,
        duration: Number((en - st).toFixed(2)),
        subtitle: sb.text,
        fontSize: 7.5,
        textColor: '#FC6601',
        y: -0.64
      });
    });

    const capcutRes = capcutEngine.compileStoryboard(capcutStoryboard, { ratio: '9:16', fps: 30 });
    if (capcutRes && capcutRes.draft_dir) {
      capcutDraftDir = capcutRes.draft_dir;
      capcutDraftName = capcutRes.draft_name;
      capcutSuccess = true;
      log(`   -> [CAPCUT DESKTOP] Đã tạo thành công bản nháp "${capcutDraftName}" tại: ${capcutDraftDir}`);

      // Đồng bộ trực tiếp các mốc SFX điểm nhấn vào CapCut Desktop timeline
      try {
        const topSfx = sfxHits.slice(0, 16);
        topSfx.forEach((sx) => {
          if (fs.existsSync(sx.file)) {
            const dur = Math.min(2.5, getDuration(sx.file));
            capcutEngine.addAudioSegment(capcutDraftDir, {
              filePath: sx.file,
              startSec: sx.start,
              durationSec: dur,
              volume: Number(sx.vol) || 0.45,
              trackName: 'SFX Track'
            });
          }
        });
        log(`   -> [CAPCUT DESKTOP] Đã chèn thành công ${topSfx.length} hiệu ứng SFX vào track âm thanh.`);
      } catch (sfxErr) {
        log(`   -> [CAPCUT SFX LƯU Ý] ${sfxErr.message}`);
      }
    }
  } catch (capcutErr) {
    log(`   -> [CAPCUT DESKTOP CẢNH BÁO] ${capcutErr.message}`);
  }

  }

  onProgress(100, 'Hoàn tất 100%!');
  log(`>>> HOÀN TẤT! Video FPT Telecom: ${outMp4}`);
  return {
    outMp4,
    thumbPath,
    safeName,
    totalDur,
    subtitles,
    highlights: rawHls.map(({dur,...highlight})=>highlight),
    clipWindows,
    brollCutaways: userBrollSpecs,
    hook: hookCfg,
    capcutDraftName,
    capcutDraftDir,
    capcutSuccess,
    mediaWarnings,qualityReport
  };
}

module.exports = { runFptPipeline };
