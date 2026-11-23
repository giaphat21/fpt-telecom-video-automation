'use strict';
// Runs one production: speech -> plan -> base -> one final FFmpeg pass -> checks. The plan comes from edit_plan.js, the
// same one the Studio timeline shows.
const PATHS=require('../../config/paths.js');
const referenceProfile=require('../../config/approved_reference.json');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const {requirePlan,inspectOutput}=require('./quality_gate');
const {normalizeClipWindows,mapConcurrent}=require('./render_inputs');
const {prepareBase,voiceGain}=require('./base_cache');
const {fxFilters}=require('./picture_fx');
const {createEditPlan,prepareContent,gateInput,safeProject}=require('./edit_plan');
const {probeMedia,portraitFilter}=require('../media/media_profile');
const {reviewTexts}=require('../speech/text_quality');
const { renderStill, streamFrames, RAW_INPUT, TOP: TYPO_TOP } = require('../typography/kinetic_overlay');
const { meanVolume } = require('../speech/speech_activity');
const { assertBrandSubtitles, styleLines, assEvents: subtitleEvents } = require('../typography/subtitle_style');
const { remember } = require('../editing/style_history');
const { layoutBrolls } = require('../broll/host_layout');
const { illustrationSpecs, renderIllustrations } = require('../broll/illustration_cards');
const { generateAutoSubtitles, speedUpAudio, getDuration, hasAudioStream, resolveMediaPath } = require('../speech/subtitle_generator');
const { getBrollWarnings, resolveBrollSpec, brollGraph, CARD } = require('../broll/broll_compositor');

const FFMPEG = PATHS.ffmpeg, FFPROBE = PATHS.ffprobe;
const RENDER_THREADS = () => Math.max(1, Math.min(24, Number(process.env.FPT_RENDER_THREADS) || Math.max(4, Math.round(os.cpus().length * 1.5))));
const MUSIC = name => path.join(PATHS.assets, 'music-presets', 'bgm_fpt_' + name + '.mp3');

function fmtAssTime(sec) {
  // Round once in centiseconds: 59.997 must become 0:01:00.00, never 0:00:60.00.
  const cs = Math.max(0, Math.round(sec * 100));
  const pad = (n) => String(n).padStart(2, '0');
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

// Which music plays and from where: the most energetic 30 s, so the beat drives from the first second.
function chooseMusic(job, safeName) {
  const mode = job.bgmMode || 'auto';
  if (job.disableBgm === true || mode === 'none') return null;
  const custom = path.join(PATHS.assets, 'custom-music');
  const candidates = [job.customBgm && (path.isAbsolute(job.customBgm) ? job.customBgm : path.join(custom, path.basename(job.customBgm))),
    ['upbeat', 'bright', 'fresh', 'synth', 'chill'].includes(mode) && MUSIC(mode),
    referenceProfile.audio.defaultBgm && path.join(custom, path.basename(referenceProfile.audio.defaultBgm)),
    MUSIC(['upbeat', 'bright', 'fresh', 'synth'][safeName.length % 4]), MUSIC('upbeat')];
  return candidates.find(f => f && fs.existsSync(f)) || null;
}
const dropCache = new Map();
function musicStart(audioPath, neededDur) {
  const key = audioPath + '|' + Math.round(neededDur);
  if (!dropCache.has(key)) dropCache.set(key, findEnergeticDrop(audioPath, neededDur));
  return dropCache.get(key);
}
// Pieces of music on the timeline: {start,end} in the video, offset in the song. Never overlapping.
function musicSegments(job, totalDur, defaultOffset, defaultVol) {
  const level = v => v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : defaultVol;
  if (!Array.isArray(job.musicSegments)) return [{ start: 0, end: totalDur, offset: defaultOffset(), vol: level(job.bgmVolume) }];
  let cursor = 0;
  return job.musicSegments.slice(0, 60).map(s => ({ start: Math.max(0, Number(s.start) || 0), end: Math.min(totalDur, Number(s.end) || 0), offset: Math.max(0, Number(s.offset) || 0), vol: level(s.vol) }))
    .sort((a, b) => a.start - b.start).map(s => { const start = Math.max(cursor, s.start); cursor = Math.max(cursor, s.end); return { ...s, offset: s.offset + start - s.start, start }; }).filter(s => s.end - s.start > 0.04);
}
// Helper to detect the most energetic drop/chorus in BGM
function findEnergeticDrop(audioPath, neededDur = 30) {
  try {
    const durRaw = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath], { encoding: 'utf8' }).trim();
    const fullDur = parseFloat(durRaw) || 60;
    if (fullDur <= neededDur + 5) return 0;

    const candidates = [0, 12, 20, 30, 45].filter(s => s + neededDur <= fullDur);
    let bestStart = 0;
    let maxVol = -Infinity;
    for (const st of candidates) {
      const v = meanVolume(audioPath, { start: st, duration: 6 });
      if (v > maxVol + 0.2) {
        maxVol = v;
        bestStart = st;
      }
    }
    return bestStart;
  } catch (_) {
    return 0;
  }
}


async function runFptPipeline(job, onLog = () => {}, onProgress = () => {}) {
  try { return await produce(job, onLog, onProgress); }
  catch (error) {
    const dir = path.join(PATHS.output, safeProject(job.projectName));
    if (!fs.existsSync(path.join(dir, 'job.json'))) for (const sub of ['temp', 'overlays', 'voices']) { try { fs.rmSync(path.join(dir, sub), { recursive: true, force: true }); } catch (_) {} }
    throw error;
  }
}
async function produce(job, onLog, onProgress) {
  const log = (msg) => { console.log(msg); onLog(msg); };
  onProgress(4, 'Đang chuẩn bị…');
  const safeName = safeProject(job.projectName), seed = job.styleSeed ? safeProject(job.styleSeed) : safeName;
  const workDir = path.join(PATHS.output, safeName);
  const overlayDir = path.join(workDir, 'overlays'), tempDir = path.join(workDir, 'temp'), voiceWorkDir = path.join(workDir, 'voices');
  for (const dir of [overlayDir, tempDir, voiceWorkDir]) fs.mkdirSync(dir, { recursive: true });
  const outW = 1080, outH = 1920;
  const useOriginalVideoAudio = job.useOriginalVideoAudio !== undefined ? Boolean(job.useOriginalVideoAudio) : true;
  const activeBgm = chooseMusic(job, safeName);

  const vList = (job.videoFiles && job.videoFiles.length) ? job.videoFiles : [];
  if (!vList.length) throw new Error('Hãy chọn video trước khi xuất.');
  const aList = job.voiceFiles || [];
  const sourceProfiles = new Map();
  const profileFor = file => { if (!sourceProfiles.has(file)) sourceProfiles.set(file, probeMedia(file)); return sourceProfiles.get(file); };
  vList.forEach(file => profileFor(resolveMediaPath(file)));
  const inputWarnings = [...sourceProfiles].filter(([, info]) => info.lowResolution).map(([file]) => 'Nguồn ' + path.basename(file) + ' dưới 1080p; xuất 1080×1920 nhưng độ chi tiết phụ thuộc tệp gốc.');
  inputWarnings.forEach(log);
  const voiceSpeed = Math.max(0.5, Math.min(2.0, Number(job.voiceSpeed) || 1.25));

  // 1. Speech
  let subtitles = Array.isArray(job.subtitles) ? job.subtitles : [];
  let clipWindows = Array.isArray(job.clipWindows) ? job.clipWindows : [];
  let speechWarnings = [], strictSpeech = false, autoOutroCta = null;
  if ((useOriginalVideoAudio || aList.length > 0) && (subtitles.length === 0 || clipWindows.length === 0)) {
    onProgress(8, 'Đang nhận dạng lời nói và cắt khoảng lặng…');
    log('[1/4] Nhận dạng lời nói từ ' + (aList.length ? aList.length + ' tệp voice' : vList.length + ' video'));
    try {
      const autoRes = await generateAutoSubtitles({ voiceFiles: aList, videoFiles: vList, voiceSpeed, originalScript: job.originalScript || '', trimSilence: true });
      if (!subtitles.length) { subtitles = autoRes.subtitles || []; strictSpeech = true; }
      clipWindows = autoRes.clipWindows || [];
      speechWarnings = autoRes.speechWarnings || [];
      autoOutroCta = autoRes.autoOutroCta;
      log('   -> ' + subtitles.length + ' câu Sub');
    } catch (e) { throw new Error('Không tạo được Sub text: ' + e.message); }
  }
  if (!clipWindows.length) {
    let cur = 0;
    for (const file of vList) {
      const srcPath = resolveMediaPath(file), rawDur = getDuration(srcPath), timelineDur = Number((rawDur / voiceSpeed).toFixed(3));
      clipWindows.push({ fileRef: file, srcPath, rawDur, trimStart: 0, trimEnd: rawDur, timelineStart: Number(cur.toFixed(3)), timelineDur });
      cur += timelineDur;
    }
  }
  clipWindows = normalizeClipWindows(clipWindows, vList, voiceSpeed);

  const runFfAsync = (args) => new Promise((resolve, reject) => {
    const ch = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    ch.on('error', reject);
    ch.stderr.on('data', d => { err += d.toString(); });
    ch.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg (${code}): ${err.slice(-350)}`)));
  });

  // 2. Picture and voice on the 30 fps grid
  let voiceLevel = referenceProfile.audio.voiceGain;
  let singleMasterVoice = null, totalDur = 25, capcutScenes = [], rawConcat = path.join(tempDir, 'raw_concat.mp4');
  if (aList.length === 0 && useOriginalVideoAudio) {
    onProgress(22, 'Đang ghép cảnh và đồng bộ giọng nói…');
    const base = await prepareBase({ windows: clipWindows, voiceSpeed, profileFor, hasAudio: win => hasAudioStream(win.srcPath), fx: job.fx || {} });
    log('[2/4] ' + clipWindows.length + ' cảnh' + (base.reused ? ' (dùng lại bản ghép đã có)' : ''));
    rawConcat = base.raw; singleMasterVoice = base.voice; totalDur = base.totalDur;
    voiceLevel = voiceGain(base.voiceLUFS, referenceProfile.audio);
    let cursor = 0;
    capcutScenes = base.clips.map((file, idx) => { const scene = { file, start: Math.round(cursor / 30 * 1000) / 1000, duration: base.frames[idx] / 30 }; cursor += base.frames[idx]; return scene; });
  } else {
    // Separate voiceFiles or muted video mode
    if (aList.length > 0) {
      log(`[2/6] Xử lý Voiceover rời (${aList.length} file) ở tốc độ ${voiceSpeed}x...`);
      const spedVoices = [];
      for (let i = 0; i < aList.length; i++) {
        const srcPath = resolveMediaPath(aList[i]);
        const outPath = path.join(voiceWorkDir, `sped_voice_${i + 1}.wav`);
        const dur = speedUpAudio(srcPath, outPath, voiceSpeed);
        spedVoices.push({ path: outPath, dur });
      }
      if (spedVoices.length === 1) {
        singleMasterVoice = spedVoices[0].path;
        totalDur = spedVoices[0].dur;
      } else {
        const masterPath = path.join(voiceWorkDir, 'master_voice.wav');
        const concatArgs = ['-y', '-loglevel', 'error'];
        spedVoices.forEach(v => concatArgs.push('-i', v.path));
        const inpStr = spedVoices.map((_, i) => `[${i}:a]`).join('');
        concatArgs.push('-filter_complex', `${inpStr}concat=n=${spedVoices.length}:v=0:a=1[aout]`, '-map', '[aout]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', masterPath);
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
    fs.writeFileSync(concatTxt, clipFiles.map(c => `file '${c.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    await runFfAsync(['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c', 'copy', rawConcat]);
    capcutScenes = clipFiles.map((file, i) => ({ file, start: i * perClipDur, duration: perClipDur }));
  }

  // 3. The plan
  onProgress(36, 'Đang lập kế hoạch chữ, B-roll và âm thanh…');
  const content = prepareContent(job, { subtitles, highlights: Array.isArray(job.highlights) ? job.highlights : [], totalDur });
  subtitles = content.subtitles;
  const illustrations = illustrationSpecs(job, 3.5);
  const plan = createEditPlan({ job, seed, subtitles, highlights: content.highlights, totalDur, scenes: capcutScenes, illustrations, autoOutroCta, strictSpeech });
  const { hookDur, outroStart } = plan, hlSpecs = plan.hlSpecs, sfxHits = plan.sfx;
  const spelling = reviewTexts(subtitles).map(r => ({ code: 'spelling', text: 'Kiểm tra chính tả: "' + r.word + '" trong "' + r.text + '"' }));
  const mediaWarnings = [...inputWarnings, ...speechWarnings, ...getBrollWarnings(subtitles), ...spelling];
  mediaWarnings.forEach(w => log('[LƯU Ý] ' + (w.text || w)));
  log('[3/4] Hook ' + plan.hook.style + ', Outro ' + plan.outro.style + ', ' + (hlSpecs.length - (plan.hasOutro ? 1 : 0)) + ' Highlight, ' + plan.brolls.length + ' B-roll, ' + sfxHits.length + ' SFX');
  fs.writeFileSync(path.join(workDir, 'overlay_config.json'), JSON.stringify({ width: outW, height: outH, hook: plan.hook, outro: plan.outro, highlights: hlSpecs }, null, 2), 'utf8');
  const qualityReportPath = path.join(workDir, 'quality_report.json');
  requirePlan(gateInput(plan), qualityReportPath);

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
${styleLines()}

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
  const assEvents = subtitles
    // The Outro title carries the closing words itself.
    .filter(sb => !plan.hiddenSubs.has(sb))
    .flatMap(sb => subtitleEvents(sb, sb.subStyle || job.subStyle, fmtAssTime))
    .join('\n');
  const assPath = path.join(workDir, 'subtitles.ass');
  assertBrandSubtitles(assHeader + assEvents);
  fs.writeFileSync(assPath, assHeader + assEvents, 'utf8');

  const userBrollSpecs = plan.brolls;
  let resolvedSpecs;
  try { resolvedSpecs = await layoutBrolls(rawConcat, userBrollSpecs.map(s => resolveBrollSpec(s)).filter(Boolean), CARD, plan.scenes.map(s => s.start)); }
  catch (error) { throw new Error('Không thể dựng B-roll đã chọn: ' + error.message); }
  const hookStill = path.join(overlayDir, 'intro_hook.png');
  renderStill(plan.typographyPlan, hookDur > 0 ? plan.hookStart + Math.min(1.2, (hookDur - plan.hookStart) / 2) : 0, hookStill);
  const thumbPath = path.join(workDir, `${safeName}_thumbnail.jpg`);
  const thumbDone = runFfAsync(['-y', '-loglevel', 'error', '-ss', String(Math.min(0.5, totalDur / 2)), '-i', rawConcat, '-i', hookStill,
    '-filter_complex', '[0:v][1:v]overlay=0:0[vout]', '-map', '[vout]', '-frames:v', '1', '-update', '1', '-q:v', '2', thumbPath]);
  thumbDone.catch(() => {});

  // 4. One pass: base + B-roll + titles + Sub + voice + music + SFX. No intermediate encodes after the base.
  onProgress(44, 'Đang xuất MP4…');
  const outMp4 = path.join(workDir, `${safeName}.mp4`);
  const inputs = ['-y', '-thread_queue_size', '256', '-i', rawConcat], filterParts = [], audioLabels = [];
  let nextIdx = 1;
  const graph = resolvedSpecs.length ? brollGraph(resolvedSpecs, { artDir: tempDir, firstInput: nextIdx, onLog: log }) : { inputs: [], filters: ['[0:v]setsar=1[base]'], output: 'base', nextInput: nextIdx };
  inputs.push(...graph.inputs); filterParts.push(...graph.filters); nextIdx = graph.nextInput;
  let prevV = graph.output;
  const fx = fxFilters(plan.customFx);
  if (fx) { filterParts.push(`[${prevV}]${fx}[vfx]`); prevV = 'vfx'; }
  // Music plays in the pieces the user left on the timeline; one piece over the whole video by default.
  const bgmDefault = singleMasterVoice ? referenceProfile.audio.bgmWithVoice : referenceProfile.audio.bgmWithoutVoice;
  const musicPieces = activeBgm ? musicSegments(job, totalDur, () => job.bgmFromStart ? 0 : musicStart(activeBgm, totalDur), bgmDefault) : [];
  musicPieces.forEach((piece, k) => {
    const input = nextIdx++, length = Math.max(0.05, piece.end - piece.start), last = piece.end > totalDur - 0.05, first = piece.start < 0.05;
    const tail = Math.min(last ? 0.8 : 0.12, length / 2), headIn = Math.min(first ? 0.25 : 0.06, length / 2), ms = Math.round(piece.start * 1000);
    inputs.push('-ss', piece.offset.toFixed(3), '-stream_loop', '-1', '-t', length.toFixed(3), '-i', activeBgm);
    filterParts.push(`[${input}:a]atrim=0:${length.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=${headIn.toFixed(3)},afade=t=out:st=${(length - tail).toFixed(3)}:d=${tail.toFixed(3)},volume=${piece.vol}${ms ? `,adelay=${ms}|${ms}` : ''}${last ? '' : ',apad=whole_dur=' + totalDur}[bgm${k}]`);
    audioLabels.push(`[bgm${k}]`);
  });
  if (singleMasterVoice && fs.existsSync(singleMasterVoice)) {
    const vIdx = nextIdx++;
    inputs.push('-i', singleMasterVoice);
    filterParts.push(`[${vIdx}:a]volume=${voiceLevel}[v_master]`);
    audioLabels.push('[v_master]');
  }
  sfxHits.forEach((sx, i) => {
    const sIdx = nextIdx++;
    // Start early by the sound's own lead-in so the part people hear coincides with the picture.
    const early = Math.max(0, sx.lead - sx.start), length = Math.max(0.05, sx.duration - early);
    inputs.push('-ss', (sx.from + early).toFixed(3), '-t', length.toFixed(3), '-i', sx.file);
    const ms = Math.max(0, Math.round((sx.start - sx.lead) * 1000)), fade = Math.min(0.09, length / 3);
    filterParts.push(`[${sIdx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${(sx.gain * sx.vol).toFixed(3)},afade=t=out:st=${(length - fade).toFixed(3)}:d=${fade.toFixed(3)},adelay=${ms}|${ms}[sx_${i}]`);
    audioLabels.push(`[sx_${i}]`);
  });
  const fadeOutDur = plan.fade.duration, fadeOutStart = plan.fade.start;
  filterParts.push(audioLabels.length
    ? `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,atrim=0:${totalDur},alimiter=limit=0.92,afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[aout]`
    : `anullsrc=r=48000:cl=stereo,atrim=0:${totalDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[aout]`);
  renderIllustrations(illustrations, { workDir, overlayDir }).forEach((card, k) => {
    const input = nextIdx++, end = Number((card.start + card.dur).toFixed(2));
    inputs.push('-i', card.path);
    filterParts.push(`[${input}:v]format=rgba,loop=loop=-1:size=1:start=0,setpts=N/(30*TB),trim=duration=${card.dur},fade=t=in:st=0:d=0.12:alpha=1,fade=t=out:st=${Math.max(0.12, card.dur - 0.15).toFixed(2)}:d=0.15:alpha=1,scale=1080:-1:flags=lanczos,setpts=PTS-STARTPTS+${card.start}/TB[illus${k}]`,
      `[${prevV}][illus${k}]overlay=0:140:enable='between(t,${card.start},${end})':eof_action=pass[villus${k}]`);
    prevV = `villus${k}`;
  });
  // Hook, Highlight and Outro frames are drawn while FFmpeg encodes and arrive through a pipe.
  const typoIdx = nextIdx++;
  inputs.push('-thread_queue_size', '64', ...RAW_INPUT, '-i', 'pipe:0');
  filterParts.push(`[${prevV}][${typoIdx}:v]overlay=0:${TYPO_TOP}:eof_action=pass:format=auto[vtypo]`);
  const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"), fontsEscaped = PATHS.fonts.replace(/\\/g, '/').replace(/:/g, '\\:');
  filterParts.push(`[vtypo]subtitles='${assEscaped}':fontsdir='${fontsEscaped}',fade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[vout]`);
  const graphPath = path.join(tempDir, 'final_graph.txt');
  fs.writeFileSync(graphPath, filterParts.join(';\n'), 'utf8');
  await new Promise((resolve, reject) => {
    const threads = RENDER_THREADS();
    const child = spawn(FFMPEG, [...inputs, '-filter_complex_threads', String(Math.min(8, threads)), '-filter_complex_script', graphPath,
      '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30',
      '-threads', String(threads), '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-t', String(totalDur), '-progress', 'pipe:1', '-nostats', outMp4], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let errBuf = '', stopped = null;
    child.on('error', reject);
    child.stdin.on('error', e => { stopped = e; });
    child.stdout.on('data', chunk => {
      const m = chunk.toString().match(/out_time_us=(\d+)/);
      if (m && totalDur > 0) { const pct = Math.min(97, Math.max(44, Math.round(44 + Number(m[1]) / 1e6 / totalDur * 53))); onProgress(pct, `Đang xuất MP4 (${pct}%)…`); }
    });
    child.stderr.on('data', chunk => { errBuf = (errBuf + chunk.toString()).slice(-4000); });
    child.on('close', code => { stopped = stopped || true; code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${errBuf.slice(-400)}`)); });
    streamFrames(plan.typographyPlan, child.stdin, { onError: () => stopped }).catch(error => { stopped = error; child.kill(); reject(error); });
  });
  await thumbDone;

  onProgress(98, 'Đang kiểm tra chất lượng…');
  const qualityReport = inspectOutput(outMp4, totalDur, qualityReportPath);
  log('[4/4] Đạt chuẩn ' + referenceProfile.id + ': timeline và MP4 đã kiểm tra.');
  const highlights = plan.highlights.map(({ dur, ...h }) => ({ ...h, text: h.text.replace(/\s+/g, ' '), styleFrom: h.styleFrom || 'plan' }));
  fs.writeFileSync(path.join(workDir, 'job.json'), JSON.stringify({
    referenceProfile: referenceProfile.id, qualityReport, ...job, styleSeed: seed, hookStyle: plan.hook.style, outroStyle: plan.outro.style,
    brollCutaways: userBrollSpecs, renderedHighlights: hlSpecs, renderedSfx: sfxHits, mediaWarnings, subtitles, highlights, clipWindows,
    hook: plan.hook, outroCta: plan.outroCta, totalDur, outMp4, thumbPath, safeName }, null, 2), 'utf8');
  remember({ project: seed, at: new Date().toISOString(), hookStyle: plan.hook.style, outroStyle: plan.hasOutro ? plan.outro.style : null, sfx: sfxHits.map(sx => sx.id), typos: hlSpecs.map(h => h.typo).filter(Boolean) });

  const outroCtaRaw = plan.outroCta;
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
    const voiceInsideClips = !aList.length && useOriginalVideoAudio;
    // The shared base may be replaced later; a draft keeps its own copy of the clips.
    const keepDir = path.join(workDir, 'temp');
    capcutScenes = capcutScenes.map((scene, idx) => { const own = path.join(keepDir, 'scene_' + (idx + 1) + path.extname(scene.file)); if (path.resolve(own) !== path.resolve(scene.file)) fs.copyFileSync(scene.file, own); return { ...scene, file: own }; });
    capcutScenes.forEach((scene, idx) => {
      capcutStoryboard.scenes.push({ id: idx + 1, startTime: scene.start, duration: scene.duration, video: scene.file });
    });
    if (!voiceInsideClips && singleMasterVoice) capcutStoryboard.scenes.push({ id: 90, startTime: 0, duration: totalDur, audio: singleMasterVoice, audioVolume: 1.0 });

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
        textColor: '#F37021',
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
            // The draft gets the same trimmed hit as the MP4, not the whole source file.
            const early = Math.max(0, sx.lead - sx.start), dur = Math.max(0.1, sx.duration - early);
            const clip = path.join(workDir, 'sfx', `${sx.id}.wav`);
            fs.mkdirSync(path.dirname(clip), { recursive: true });
            execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', (sx.from + early).toFixed(3), '-t', dur.toFixed(3), '-i', sx.file, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', clip], { windowsHide: true });
            capcutEngine.addAudioSegment(capcutDraftDir, {
              filePath: clip,
              startSec: Math.max(0, sx.start - sx.lead),
              durationSec: dur,
              volume: Math.min(2, sx.gain * sx.vol),
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


  if (!capcutSuccess) for (const dir of [tempDir, overlayDir, voiceWorkDir]) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
  onProgress(100, 'Hoàn tất 100%!');
  log(`>>> HOÀN TẤT! Video FPT Telecom: ${outMp4}`);
  return { outMp4, thumbPath, safeName, styleSeed: seed, totalDur, subtitles, highlights, clipWindows, brollCutaways: userBrollSpecs, hook: plan.hook, hookStyle: plan.hook.style, outroStyle: plan.outro.style,
    outro: plan.outro, capcutDraftName, capcutDraftDir, capcutSuccess, mediaWarnings, qualityReport };
}
module.exports = { runFptPipeline, chooseMusic, musicStart, musicSegments };
