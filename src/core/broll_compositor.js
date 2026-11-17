const PATHS=require('../../config/paths.js');
const {createReferenceBrolls}=require('./reference_editor');
/**
 * B-Roll Cut-Away Engine - FPT Telecom AI Video Studio
 * ======================================================
 * Chèn cảnh B-Roll thực (cut-away / top-half split / pip) xen kẽ VJ nói
 * Giống cách video mẫu FPT Play: khi nói về NHA → hiện hẳn trận bóng đá
 * 
 * Layout types:
 *   cutaway   - Cắt hẳn sang B-roll (B-roll chiếm toàn màn hình, VJ mờ dần)
 *   top_half  - B-roll chiếm nửa trên (top 40%), VJ ở nửa dưới (y=780-1920)
 *   pip       - B-roll nổi góc trên phải (Picture-in-Picture), VJ vẫn full
 */

const path = require('path');
const { normalize, round, wordTimeline, findPhrase } = require('./timeline_rules');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');

const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');

const BROLL_LIBRARY_DIR = path.join(STUDIO_ROOT, 'assets', 'broll-library');
const BROLL_USER_DIR = path.join(STUDIO_ROOT, 'assets', 'broll-user');

// Kho B-Roll chuẩn HD cào tự động từ kho dữ liệu mở (hoàn toàn không cắt từ video mẫu)
const BUILT_IN_BROLLS = [
  {
    id: 'stock_football',
    name: 'Ngoại Hạng Anh (broll NHA)',
    icon: '⚽',
    keywords: [
      'ngoại hạng', 'ngoai hang', 'premier league', 'premier', 'NHA', 'C1', 'champions', 'bóng đá', 'bong da', '380 trận', '380 tran',
      'trận đấu', 'tran dau', 'sân cỏ', 'san co', 'cầu thủ', 'cau thu', 'bàn thắng', 'ban thang', 'highlight bóng đá', 'giải bóng đá',
      'chelsea', 'man city', 'manchester', 'arsenal', 'liverpool', 'ngoại hạng anh'
    ],
    file: 'broll_stock_football.mp4',
    thumb: 'thumb_stock_football.jpg',
    defaultLayout: 'top_half',
    duration: 3.8,
    description: 'Trận đấu Ngoại Hạng Anh bản quyền FPT Play chính thức 1080p'
  },
  {
    id: 'stock_wifi6',
    name: 'Modem Wi-Fi 6 Cáp Quang',
    icon: '📶',
    keywords: [
      'wifi', 'wi-fi', 'modem', 'mesh', 'internet', 'gbps', 'mbps', '1 gbps',
      'tốc độ', 'toc do', 'băng thông', 'bang thong', 'cáp quang', 'cap quang', 'đường truyền', 'duong truyen', 'phát sóng'
    ],
    file: 'broll_stock_wifi6.mp4',
    thumb: 'thumb_stock_wifi6.jpg',
    defaultLayout: 'pip',
    duration: 3.5,
    description: 'Công nghệ cáp quang và truyền dữ liệu tốc độ cao 1 Gbps'
  },
  {
    id: 'stock_camera',
    name: 'Camera AI Giám Sát',
    icon: '📷',
    keywords: [
      'camera', 'camera ai', 'AI', 'an ninh', 'giám sát', 'giam sat', 'nhận diện khuôn mặt', 'nhận diện', 'nhan dien',
      'đàm thoại 2 chiều', 'đàm thoại', 'dam thoai', 'chống trộm', 'chong trom', 'cctv', 'cloud', 'bảo vệ', 'bao ve', 'quan sát', 'quan sat'
    ],
    file: 'broll_stock_camera.mp4',
    thumb: 'thumb_stock_camera.jpg',
    defaultLayout: 'pip',
    duration: 3.5,
    description: 'Camera AI an ninh thông minh nhận diện chuyển động 99.8%'
  },
  {
    id: 'stock_fptplay',
    name: 'FPT Play Phim 4K',
    icon: '📺',
    keywords: [
      'kho phim', 'truyền hình', 'truyen hinh', '4k', 'hdr', 'tài khoản', 'tai khoan', 'kênh', 'kenh',
      'fpt play', 'phim chiếu rạp', 'phim 4k', 'phim', 'giải trí', 'giai tri'
    ],
    file: 'broll_stock_fptplay.mp4',
    thumb: 'thumb_stock_fptplay.jpg',
    defaultLayout: 'cutaway',
    duration: 3.8,
    description: 'Xem truyền hình FPT Play, kho phim gia đình 4K sắc nét'
  },
  {
    id: 'stock_gaming',
    name: 'Gaming Tốc Độ Cao',
    icon: '🎮',
    keywords: [
      'chơi game', 'choi game', 'gaming', 'ping thấp', 'ping thap', 'không giật lag', 'khong giat lag', 'độ trễ', 'do tre',
      'esport', 'game thủ', 'game thu', 'combat', 'liên quân', 'tốc chiến', 'fifa'
    ],
    file: 'broll_stock_gaming.mp4',
    thumb: 'thumb_stock_gaming.jpg',
    defaultLayout: 'top_half',
    duration: 3.8,
    description: 'Chơi game trực tuyến tốc độ cao và đa nhiệm nhiều thiết bị'
  }
];



/**
 * Lấy danh sách tất cả B-Roll có sẵn (built-in + user-upload)
 */
function getBrollCatalog() {
  const manifestPath = path.join(BROLL_LIBRARY_DIR, 'sources.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const assignmentPath = path.join(BROLL_USER_DIR, 'assignments.json');
  const assignments = fs.existsSync(assignmentPath) ? JSON.parse(fs.readFileSync(assignmentPath, 'utf8')) : {};
  const catalog = BUILT_IN_BROLLS.map(b => {
    let fPath = path.join(BROLL_LIBRARY_DIR, b.file);
    if (b.id === 'stock_football') {
      const userNha = path.join(BROLL_USER_DIR, 'premier_league.mp4');
      if (fs.existsSync(userNha)) {
        fPath = userNha;
      }
    }
    const assigned = assignments[b.id] && path.join(BROLL_USER_DIR, path.basename(assignments[b.id]));
    if (assigned && fs.existsSync(assigned)) fPath = assigned;
    const available = fs.existsSync(fPath) && fs.statSync(fPath).isFile();
    const source = manifest[b.file];
    const userProvided = path.dirname(fPath) === BROLL_USER_DIR;
    const autoEligible = available && (userProvided || (source?.status === 'metadata_verified' && source.fileSize === fs.statSync(fPath).size));
    return {
      ...b,
      description: userProvided ? 'Clip do bạn cung cấp cho chủ đề này.' : (source?.title || 'Nguồn stock cũ, chưa xác nhận nội dung/giấy phép.'),
      autoEligible, sourcePage: source?.sourcePage || null,
      sourceWarning: autoEligible ? null : (source?.reason || 'Cần clip đúng chủ đề hoặc nguồn được xác nhận.'),
      filePath: fPath,
      thumbUrl: `/assets/broll-library/${b.thumb}`,
      available: fs.existsSync(fPath)
    };
  });

  // Thêm video user upload vào
  if (fs.existsSync(BROLL_USER_DIR)) {
    const userFiles = fs.readdirSync(BROLL_USER_DIR).filter(f => /\.(mp4|mov|mkv)$/i.test(f));
    userFiles.forEach((f, i) => {
      catalog.push({
        id: 'user_' + Buffer.from(f).toString('base64url'),
        name: `📹 ${path.basename(f, path.extname(f))}`,
        icon: '📹',
        keywords: [path.basename(f, path.extname(f)).toLowerCase()],
        file: f,
        filePath: path.join(BROLL_USER_DIR, f),
        thumb: null,
        thumbUrl: null,
        defaultLayout: 'cutaway',
        duration: 3.0,
        description: 'Video B-Roll tự tải lên',
        available: true,
        isUserUpload: true
      });
    });
  }

  return catalog;
}

// One speech-based planner for API, automatic render, and external callers.
function autoDetectBrollFromSubtitles(subtitles,hookDur=3.5,outroStart=25,allowedIds=null,options={}){
  return createReferenceBrolls(subtitles,Math.max(outroStart,...subtitles.map(s=>Number(s.end)||0)),
    options.catalog||getBrollCatalog(),allowedIds,{hookDur,outroStart});
}
function normalizeBrollSpec(spec) {
  if (!spec || spec.enabled === false) return null;
  const start = Number(spec.start);
  const end = spec.end != null ? Number(spec.end) : start + Number(spec.duration);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start)
    throw new Error('B-roll cần start/end hữu hạn, start >= 0 và end > start.');
  const layout = spec.layout || 'cutaway';
  if (!['cutaway', 'top_half', 'pip'].includes(layout)) throw new Error('Layout B-roll không hợp lệ: ' + layout);
  return { ...spec, start: round(start), end: round(end), duration: round(end - start), layout };
}
function autoDetectReferenceBrolls(subtitles,hookDur=3.5,outroStart=25,allowedIds=null){
  return autoDetectBrollFromSubtitles(subtitles,hookDur,outroStart,allowedIds);
}
function selectBrollSpecs(job, subtitles, hookDur, outroStart) {
  if (job.brollMode === 'auto' && job.autoBroll !== false) return autoDetectReferenceBrolls(subtitles, hookDur, outroStart, job.allowedBrollIds ?? null);
  if (job.autoBroll === false) return [];
  // An explicitly supplied empty timeline means the user deleted all clips.
  if (Array.isArray(job.brollCutaways)) {
    const allowed = Array.isArray(job.allowedBrollIds) ? new Set(job.allowedBrollIds) : null;
    return job.brollCutaways.filter(s => s && s.enabled !== false &&
      (!allowed || !BUILT_IN_BROLLS.some(b => b.id === s.brollId) || allowed.has(s.brollId)))
      .map(normalizeBrollSpec);
  }
  return autoDetectReferenceBrolls(subtitles, hookDur, outroStart, job.allowedBrollIds);
}
async function composeBrollCutaway(inputVideo, brollSpecs, outputVideo, onLog = () => {}) {
  if (path.resolve(inputVideo) === path.resolve(outputVideo)) throw new Error('B-roll output phải khác input.');
  const sorted = (brollSpecs || []).map(normalizeBrollSpec).filter(Boolean).sort((a, b) => a.start - b.start);
  if (!sorted.length) { fs.copyFileSync(inputVideo, outputVideo); return; }
  const inputs = ['-y', '-i', inputVideo], filters = ['[0:v]setsar=1[base]'];
  let prev = 'base';
  sorted.forEach((spec, i) => {
    if (!spec.file || !fs.existsSync(spec.file)) throw new Error('Thiếu B-roll: ' + (spec.file || spec.brollId));
    const duration = spec.duration, st = spec.start, en = spec.end;
    inputs.push('-stream_loop', '-1', '-t', String(duration), '-i', spec.file);
    const enable = "gte(t," + st + ")*lt(t," + en + ")";
    let width = 1080, height = 1920, x = 0, y = 0;
    if (spec.layout === 'pip') { width = 460; height = 260; x = 596; y = 180; }
    if (spec.layout === 'top_half') {
      height = 780;
      // Place the chosen subject focus around the upper third of the lower panel, above captions.
      const focusY = spec.hostFocusY != null && Number.isFinite(Number(spec.hostFocusY)) ? Math.max(0, Math.min(1, Number(spec.hostFocusY))) : 0.55;
      filters.push('[' + prev + ']split=2[keep' + i + '][host' + i + ']');
      filters.push('[host' + i + ']scale=1080:1140:force_original_aspect_ratio=increase,' +
        "crop=1080:1140:(iw-ow)/2:'max(0,min(ih-oh,ih*" + focusY + "-oh*0.3))',setsar=1[lower" + i + ']');
      filters.push('[keep' + i + '][lower' + i + "]overlay=0:780:enable='" + enable + "'[split" + i + ']');
      prev = 'split' + i;
    }
    // Adjacent spoken topics cut on the word boundary; avoid flashing the host between two B-rolls.
    const fade=Math.min(0.25,duration/2);
    const fadeIn=i>0&&Math.abs(sorted[i-1].end-st)<1/30?0:fade;
    const fadeOut=i+1<sorted.length&&Math.abs(sorted[i+1].start-en)<1/30?0:fade;
    const fades=(fadeIn?',fade=t=in:st=0:d='+fadeIn+':alpha=1':'')+
      (fadeOut?',fade=t=out:st='+round(duration-fadeOut)+':d='+fadeOut+':alpha=1':'');
    filters.push('['+(i+1)+':v]trim=duration='+duration+
      ',setpts=PTS-STARTPTS,scale='+width+':'+height+
      ':force_original_aspect_ratio=increase,crop='+width+':'+height+
      ',setsar=1,fps=30,format=rgba'+fades+',setpts=PTS-STARTPTS+'+st+'/TB[br'+i+']');
    filters.push('[' + prev + '][br' + i + ']overlay=' + x + ':' + y +
      ":enable='" + enable + "':eof_action=pass:repeatlast=0[v" + i + ']');
    prev = 'v' + i;
    onLog('[B-ROLL] ' + (spec.name || spec.brollId) + ' ' + spec.layout + ' @ ' + st + '–' + en + 's');
  });
  const args = [...inputs, '-filter_complex_threads', '2', '-filter_complex', filters.join(';'),
    '-map', '[' + prev + ']', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', outputVideo];
  await new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-8000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg B-roll (' + code + '): ' + stderr.slice(-1600))));
  });
}


/**
 * Lấy server API endpoint để UI hiện thư viện B-roll
 */
function getBrollApiResponse() {
  const catalog = getBrollCatalog();
  return {
    ok: true,
    count: catalog.length,
    brolls: catalog.map(b => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      keywords: b.keywords,
      defaultLayout: b.defaultLayout,
      duration: b.duration,
      description: b.description,
      thumbUrl: b.thumbUrl,
      available: b.available,
      autoEligible: b.autoEligible,
      sourceWarning: b.sourceWarning,
      sourcePage: b.sourcePage,
      isUserUpload: b.isUserUpload || false
    }))
  };
}

/**
 * Resolve B-Roll spec từ brollId + user placement
 */
function resolveBrollSpec(spec) {
  const normalized = normalizeBrollSpec(spec);
  if (!normalized) return null;
  if (spec.file && fs.existsSync(spec.file) && fs.statSync(spec.file).isFile())
    return { ...normalized, file: path.resolve(spec.file) };
  if (spec.file) {
    const userPath = path.join(BROLL_USER_DIR, path.basename(spec.file));
    if (fs.existsSync(userPath) && fs.statSync(userPath).isFile()) return { ...normalized, file: userPath };
  }
  const entry = getBrollCatalog().find(b => b.id === spec.brollId);
  if (entry && entry.available) return { ...normalized, file: entry.filePath, name: spec.name || entry.name };
  throw new Error('Không tìm thấy media cho B-roll: ' + (spec.brollId || spec.file || 'unknown'));
}



function getBrollWarnings(subtitles = []) {
  const words = wordTimeline(subtitles);
  return getBrollCatalog().filter(b => b.autoEligible === false &&
    b.keywords.some(kw => findPhrase(words, kw).length)).map(b => ({
      code: 'broll_source_unavailable', brollId: b.id, text: b.name + ': ' + (b.sourceWarning || 'Chưa có media phù hợp.')
    }));
}
function assignBrollUpload(brollId, fileName) {
  if (!BUILT_IN_BROLLS.some(b => b.id === brollId)) throw new Error('Chủ đề B-roll không hợp lệ.');
  const assignmentsPath = path.join(BROLL_USER_DIR, 'assignments.json');
  const assignments = fs.existsSync(assignmentsPath) ? JSON.parse(fs.readFileSync(assignmentsPath, 'utf8')) : {};
  assignments[brollId] = path.basename(fileName);
  const temp = assignmentsPath + '.' + require('crypto').randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(assignments, null, 2));
  fs.renameSync(temp, assignmentsPath);
}

module.exports = {
  autoDetectReferenceBrolls,
  getBrollWarnings,
  assignBrollUpload,
  getBrollCatalog,
  normalizeBrollSpec,
  selectBrollSpecs,
  getBrollApiResponse,
  autoDetectBrollFromSubtitles,
  composeBrollCutaway,
  resolveBrollSpec,
  BROLL_LIBRARY_DIR,
  BROLL_USER_DIR,
  BUILT_IN_BROLLS
};
