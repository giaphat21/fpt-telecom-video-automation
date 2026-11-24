const PATHS=require('../../config/paths.js');
const {createReferenceBrolls}=require('../editing/reference_editor');
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
const { normalize, round, wordTimeline, findPhrase } = require('../editing/timeline_rules');
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
    keywords: ['wifi', 'wi-fi', 'wifi 6', 'wi-fi 6', 'modem', 'internet', 'phát sóng', 'phat song', 'bộ phát', 'mạng fpt', 'lắp mạng', 'lắp đặt internet'],
    file: 'broll_stock_wifi6.mp4',
    productFile: 'mg_wifi6_modem.mp4',
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
    productFile: 'mg_camera_ai.mp4',
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
    productFile: 'mg_fptplay.mp4',
    productLayout: 'pip',
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
      // "chơi game" and the like now bring the user's game footage (stock_lienminh / stock_lienquan, 24/11/2026)
      'ping thấp', 'ping thap', 'không giật lag', 'khong giat lag', 'độ trễ', 'do tre', 'combat', 'tốc chiến', 'fifa'
    ],
    file: 'broll_stock_gaming.mp4',
    thumb: 'thumb_stock_gaming.jpg',
    defaultLayout: 'top_half',
    duration: 3.8,
    description: 'Chơi game trực tuyến tốc độ cao và đa nhiệm nhiều thiết bị'
  },
  // Game footage supplied by the user (24/11/2026), kept in assets/broll-user under userFile.
  {
    id: 'stock_lienminh', name: 'Liên Minh Huyền Thoại', icon: '🎮', userFile: 'lien_minh.mp4', file: 'lien_minh.mp4', thumb: 'thumb_stock_lienminh.jpg', defaultLayout: 'top_half', duration: 4,
    keywords: ['liên minh', 'lien minh', 'liên minh huyền thoại', 'lien minh huyen thoai', 'lmht', 'lol', 'league of legends', 'chung kết thế giới', 'chung ket the gioi', 'cktg', 'faker',
      'chơi game', 'choi game', 'game', 'gaming', 'game thủ', 'game thu', 'esport', 'esports', 'leo rank', 'đánh rank', 'danh rank'],
    description: 'Trận đấu Liên Minh Huyền Thoại (clip do bạn cung cấp)'
  },
  {
    id: 'stock_lienquan', name: 'Liên Quân Mobile', icon: '🎮', userFile: 'lien_quan.mp4', file: 'lien_quan.mp4', thumb: 'thumb_stock_lienquan.jpg', defaultLayout: 'top_half', duration: 4,
    keywords: ['liên quân', 'lien quan', 'liên quân mobile', 'lien quan mobile', 'aov', 'arena of valor', 'đấu trường danh vọng', 'dau truong danh vong', 'đtdv',
      'chơi game', 'choi game', 'game', 'gaming', 'game thủ', 'game thu', 'esport', 'esports', 'leo rank', 'đánh rank', 'danh rank'],
    description: 'Trận đấu Liên Quân Mobile (clip do bạn cung cấp)'
  },
  // Motion graphics drawn for the project (scripts/assets/generate_motion_graphics.js): explain the idea, in the centre card.
  {
    id: 'mg_signal', name: 'Sóng di động 4G/5G', icon: '📡', file: 'mg_signal_5g.mp4', thumb: 'mg_signal_5g.jpg', defaultLayout: 'pip', duration: 4,
    keywords: ['4g', '5g', 'sóng di động', 'song di dong', 'sóng điện thoại', 'song dien thoai', 'dữ liệu di động', 'du lieu di dong', '3g', 'data di động', 'cột sóng', 'cot song', 'trạm phát sóng'],
    description: 'Cột sóng truyền dữ liệu tới điện thoại, 4G lên 5G'
  },
  {
    id: 'mg_wall', name: 'Tường chặn sóng Wi-Fi', icon: '🧱', file: 'mg_wall_block.mp4', thumb: 'mg_wall_block.jpg', defaultLayout: 'pip', duration: 4,
    keywords: ['bức tường', 'buc tuong', 'tường dày', 'tuong day', 'vách tường', 'ngăn cản', 'ngan can', 'cản sóng', 'chặn sóng', 'chan song', 'sóng yếu', 'song yeu', 'yếu sóng', 'mạng yếu', 'mang yeu', 'wifi yếu', 'wi-fi yếu', 'mất sóng', 'mat song', 'chập chờn', 'chap chon', 'góc chết', 'goc chet', 'rớt mạng', 'rot mang', 'đặt quá xa', 'nhà thì lại quá to', 'nhà to'],
    description: 'Sóng Wi-Fi yếu dần qua từng bức tường'
  },
  {
    id: 'mg_mesh', name: 'Wi-Fi Mesh phủ sóng cả nhà', icon: '🏠', file: 'mg_mesh_cover.mp4', thumb: 'mg_mesh_cover.jpg', defaultLayout: 'pip', duration: 4,
    keywords: ['mesh', 'phủ sóng', 'phu song', 'xuyên tường', 'xuyen tuong', 'mọi góc', 'moi goc', 'nhiều tầng', 'nhieu tang', 'mở rộng sóng', 'mo rong song', 'kích sóng', 'kich song', 'bộ kích', 'cả nhà', 'ca nha', 'mọi phòng', 'moi phong'],
    description: 'Các điểm Mesh nối nhau, phòng nào cũng có sóng'
  },
  {
    id: 'mg_speed', name: 'Tốc độ cao', icon: '⚡', file: 'mg_speed_gauge.mp4', thumb: 'mg_speed_gauge.jpg', defaultLayout: 'pip', duration: 4,
    keywords: ['tốc độ', 'toc do', 'băng thông', 'bang thong', 'gbps', 'mbps', '1 gbps', 'cáp quang', 'cap quang', 'đường truyền', 'duong truyen', 'siêu nhanh', 'sieu nhanh', 'tải nhanh', 'tai nhanh', 'mượt mà', 'muot ma'],
    description: 'Đồng hồ tốc độ vượt lên, cáp quang chạy nhanh'
  },
  {
    id: 'mg_lag', name: 'Mạng giật lag', icon: '⏳', file: 'mg_lag_buffer.mp4', thumb: 'mg_lag_buffer.jpg', defaultLayout: 'pip', duration: 4,
    keywords: ['giật lag', 'giat lag', 'bị giật', 'bi giat', 'lag', 'đứng hình', 'dung hinh', 'quay vòng', 'quay vong', 'xoay vòng', 'xoay vong', 'tải chậm', 'tai cham', 'load chậm', 'mạng chậm', 'mang cham', 'chậm xuống', 'cham xuong', 'độ trễ cao', 'ping cao', 'treo máy'],
    description: 'Video đứng hình, vòng tải quay, độ trễ nhảy'
  }
];



/**
 * Lấy danh sách tất cả B-Roll có sẵn (built-in + user-upload)
 */
const GENERATED = ['brand_product_render', 'brand_motion_graphic'];
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
    if (b.userFile && fs.existsSync(path.join(BROLL_USER_DIR, b.userFile))) fPath = path.join(BROLL_USER_DIR, b.userFile);
    const assigned = assignments[b.id] && path.join(BROLL_USER_DIR, path.basename(assignments[b.id]));
    if (assigned && fs.existsSync(assigned)) fPath = assigned;
    // No verified stock for the topic: use the motion clip made from the supplied FPT product photo, never an unrelated scene.
    let file = b.file;
    const stockReady = () => fs.existsSync(fPath) && manifest[b.file]?.status === 'metadata_verified';
    if (b.productFile && path.dirname(fPath) !== BROLL_USER_DIR && !stockReady()) {
      const product = path.join(BROLL_LIBRARY_DIR, b.productFile);
      if (fs.existsSync(product) && GENERATED.includes(manifest[b.productFile]?.status)) { fPath = product; file = b.productFile; }
    }
    const available = fs.existsSync(fPath) && fs.statSync(fPath).isFile();
    const source = manifest[file];
    const userProvided = path.dirname(fPath) === BROLL_USER_DIR;
    const autoEligible = available && (userProvided || (['metadata_verified', ...GENERATED].includes(source?.status) && source.fileSize === fs.statSync(fPath).size));
    return {
      ...b,
      // One layout for every topic (user, 24/11/2026): the picture sits behind the cut-out presenter.
      // Three layouts to choose from (user, 24/11/2026); every B-roll starts on the upper half.
      defaultLayout: 'top_half', generated: GENERATED.includes(source?.status),
      description: userProvided ? 'Clip do bạn cung cấp cho chủ đề này.' : (source?.title || 'Nguồn stock cũ, chưa xác nhận nội dung/giấy phép.'),
      autoEligible, sourcePage: source?.sourcePage || null,
      sourceWarning: autoEligible ? null : (source?.reason || 'Cần clip đúng chủ đề hoặc nguồn được xác nhận.'),
      filePath: fPath,
      thumbUrl: (thumb => fs.existsSync(path.join(BROLL_LIBRARY_DIR, thumb)) ? `/assets/broll-library/${thumb}` : null)(file === b.file ? b.thumb : file.replace(/\.mp4$/, '.jpg')),
      available
    };
  });

  // Thêm video user upload vào
  if (fs.existsSync(BROLL_USER_DIR)) {
    const claimed = new Set(BUILT_IN_BROLLS.map(b => b.userFile).filter(Boolean));
    const userFiles = fs.readdirSync(BROLL_USER_DIR).filter(f => /\.(mp4|mov|mkv)$/i.test(f) && !claimed.has(f));
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
        defaultLayout: 'top_half',
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
  if (!['cutaway', 'top_half', 'pip', 'behind', 'above_sub'].includes(layout)) throw new Error('Layout B-roll không hợp lệ: ' + layout);
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
// The illustration card sits in the centre, below the Highlight and above the host's face and the subtitles.
const CARD = Object.freeze({ width: 720, height: 406, x: 180, y: 610 });
// 'above_sub': the same rounded card, fixed just above the Sub lines (Sub sits at y 1580).
const ABOVE_SUB_Y = 1030;
// Rounded illustration card: alpha mask, white frame and soft shadow.
function pipArtwork(directory) {
  const { createCanvas } = require('@napi-rs/canvas');
  const pad = 24, w = CARD.width, h = CARD.height, r = 34, width = w + 2 * pad, height = h + 2 * pad;
  const mask = createCanvas(w, h), m = mask.getContext('2d');
  m.fillStyle = '#000'; m.fillRect(0, 0, w, h);
  m.fillStyle = '#fff'; m.beginPath(); m.roundRect(0, 0, w, h, r); m.fill();
  const frame = createCanvas(width, height), f = frame.getContext('2d');
  f.shadowColor = 'rgba(4,12,28,.55)'; f.shadowBlur = 16; f.shadowOffsetY = 6;
  f.strokeStyle = '#FFFFFF'; f.lineWidth = 10; f.beginPath(); f.roundRect(pad, pad, w, h, r); f.stroke();
  f.shadowColor = 'transparent'; f.strokeStyle = '#F37021'; f.lineWidth = 5; f.beginPath(); f.roundRect(pad - 7, pad - 7, w + 14, h + 14, r + 7); f.stroke();
  ['#0066B3', '#F37021', '#00A651'].forEach((color, k) => { f.fillStyle = color; f.beginPath(); f.roundRect(pad + w / 2 - 138 + k * 94, pad + h - 5, 88, 12, 6); f.fill(); });
  const maskPath = path.join(directory, 'pip_mask.png'), framePath = path.join(directory, 'pip_frame.png');
  fs.writeFileSync(maskPath, mask.toBuffer('image/png'));
  fs.writeFileSync(framePath, frame.toBuffer('image/png'));
  return { mask: maskPath, frame: framePath, pad, width, height };
}
// Filters and inputs for every B-roll cue, so the final render can compose them in one pass. Input 0 is the base picture.
// Behind the presenter (layout 'behind'): the picture covers about 70% of the frame and melts away just below; the
// presenter, cut out with the matte from src/media/matting.js, is laid back on top (user, 24/11/2026). No outline.
// Full screen fills the 9:16 frame (user, 24/11/2026). Drawn graphics have a portrait version, <name>_portrait.mp4
// (scripts/assets/generate_motion_graphics.js), so nothing of the design is cropped away.
function portraitOf(file) {
  if (!file || !/\.mp4$/i.test(file)) return null;
  const p = file.replace(/\.mp4$/i, '_portrait.mp4');
  return fs.existsSync(p) ? p : null;
}
const BEHIND = Object.freeze({ solid: 1200, height: 1340 });
// Upper half (layout 'top_half'): the picture runs a little past the split line and melts into the presenter's panel
// instead of ending on a hard edge (user, 24/11/2026).
const TOP = Object.freeze({ split: 780, solid: 700, height: 900 });
function fadeMask(directory, { solid, height }, name) {
  const { createCanvas } = require('@napi-rs/canvas');
  const c = createCanvas(1080, height), g = c.getContext('2d'), grad = g.createLinearGradient(0, solid, 0, height);
  for (let i = 0; i <= 10; i++) { const k = i / 10, a = 1 - k * k * (3 - 2 * k); grad.addColorStop(k, 'rgba(255,255,255,' + a.toFixed(3) + ')'); }
  g.fillStyle = '#000'; g.fillRect(0, 0, 1080, height); g.fillStyle = '#fff'; g.fillRect(0, 0, 1080, solid); g.fillStyle = grad; g.fillRect(0, solid, 1080, height - solid);
  const file = path.join(directory, name + '_mask.png'); fs.writeFileSync(file, c.toBuffer('image/png')); return file;
}
const behindMask = directory => fadeMask(directory, BEHIND, 'behind');
function brollGraph(brollSpecs, { artDir, base = '0:v', firstInput = 1, onLog = () => {} } = {}) {
  const sorted = (brollSpecs || []).map(normalizeBrollSpec).filter(Boolean).map(s => s.layout === 'behind' && !s.matte ? { ...s, layout: 'top_half' } : s.layout === 'above_sub' ? { ...s, layout: 'pip', cardY: ABOVE_SUB_Y, cardParts: null } : s).sort((a, b) => a.start - b.start);
  const inputs = [], filters = ['[' + base + ']setsar=1[base]'];
  const mask = sorted.some(s => s.layout === 'behind') ? behindMask(artDir) : null;
  const topMask = sorted.some(s => s.layout === 'top_half') ? fadeMask(artDir, TOP, 'top') : null;
  let prev = 'base', nextInput = firstInput;
  const art = sorted.some(s => s.layout === 'pip') ? pipArtwork(artDir) : null;
  sorted.forEach((spec, i) => {
    if (!spec.file || !fs.existsSync(spec.file)) throw new Error('Thiếu B-roll: ' + (spec.file || spec.brollId));
    const duration = spec.duration, st = spec.start, en = spec.end;
    const clipInput = nextInput++;
    inputs.push('-stream_loop', '-1', '-t', String(duration), '-i', (spec.layout === 'cutaway' && portraitOf(spec.file)) || spec.file);
    const enable = "gte(t," + st + ")*lt(t," + en + ")";
    let width = 1080, height = 1920, x = 0, y = 0;
    if (spec.layout === 'pip') { width = CARD.width; height = CARD.height; x = CARD.x; y = Number.isFinite(spec.cardY) ? spec.cardY : CARD.y; }
    const behind = spec.layout === 'behind';
    if (behind) {
      height = BEHIND.height;
      filters.push('[' + prev + ']split=2[keep' + i + '][fg' + i + ']');
      prev = 'keep' + i;
    }
    if (spec.layout === 'top_half') {
      height = TOP.height;
      // Place the chosen subject focus around the upper third of the lower panel, above captions.
      const focusY = spec.hostFocusY != null && Number.isFinite(Number(spec.hostFocusY)) ? Math.max(0, Math.min(1, Number(spec.hostFocusY))) : 0.55;
      filters.push('[' + prev + ']split=2[keep' + i + '][host' + i + ']');
      filters.push('[host' + i + ']scale=1080:1140:force_original_aspect_ratio=increase,' +
        "crop=1080:1140:(iw-ow)/2:'max(0,min(ih-oh,ih*" + focusY + "-oh*0.3))',setsar=1[lower" + i + ']');
      filters.push('[keep' + i + '][lower' + i + "]overlay=0:" + TOP.split + ":enable='" + enable + "'[split" + i + ']');
      prev = 'split' + i;
    }
    // Adjacent spoken topics cut on the word boundary; avoid flashing the host between two B-rolls.
    const joinsPrevious = i > 0 && Math.abs(sorted[i-1].end - st) < 1/30;
    const joinsNext = i + 1 < sorted.length && Math.abs(sorted[i+1].start - en) < 1/30;
    const limit = v => Math.max(0.03, Math.min(v ?? 0.25, duration / 2)), easeIn = limit(spec.easeIn), easeOut = limit(spec.easeOut);
    // A split screen ends on a clean cut: fading only its upper half would expose two framings of the host.
    const fadeIn = joinsPrevious ? 0 : easeIn, fadeOut = joinsNext || spec.layout === 'top_half' ? 0 : easeOut;
    const fades = (fadeIn && spec.layout !== 'top_half' ? ',fade=t=in:st=0:d=' + fadeIn + ':alpha=1' : '') +
      (fadeOut ? ',fade=t=out:st=' + round(duration - fadeOut) + ':d=' + fadeOut + ':alpha=1' : '');
    // Cinematic push: settle on entry, then a slow drift across the whole spoken section.
    const zoom = '(1+0.05*t/' + duration + (spec.layout === 'cutaway' && fadeIn ? '+0.10*pow(1-min(t/0.35,1),3)' : '') + ')';
    const push = ",scale=w='2*trunc(" + width / 2 + '*' + zoom + ")':h='2*trunc(" + height / 2 + '*' + zoom + ")':eval=frame:flags=bicubic,crop=" + width + ':' + height;
    let chain = '[' + clipInput + ':v]trim=duration=' + duration + ',setpts=PTS-STARTPTS,scale=' + width + ':' + height +
      ':force_original_aspect_ratio=increase:flags=lanczos,crop=' + width + ':' + height + ',setsar=1,fps=30' + push + ',setsar=1,format=rgba';
    // Behind the presenter every picture, drawn graphics included, fills the area sharp (user, 24/11/2026): no blurred fill.
    if (behind || spec.layout === 'top_half') {
      const maskInput = nextInput++;
      inputs.push('-loop', '1', '-t', String(duration), '-r', '30', '-i', behind ? mask : topMask);
      filters.push(chain + '[pic' + i + ']', '[' + maskInput + ':v]format=gray[mask' + i + ']');
      chain = '[pic' + i + '][mask' + i + ']alphamerge';
    }
    if (spec.layout === 'pip') {
      const maskInput = nextInput++, frameInput = nextInput++;
      inputs.push('-loop', '1', '-t', String(duration), '-r', '30', '-i', art.mask, '-loop', '1', '-t', String(duration), '-r', '30', '-i', art.frame);
      filters.push(chain + '[pic' + i + ']', '[' + maskInput + ':v]format=gray[mask' + i + ']', '[pic' + i + '][mask' + i + ']alphamerge,pad=' + art.width + ':' + art.height + ':' + art.pad + ':' + art.pad + ':color=black@0[card' + i + ']');
      chain = '[card' + i + '][' + frameInput + ':v]overlay=0:0:format=rgb';
      x -= art.pad; y -= art.pad;
    }
    filters.push(chain + fades + ',setpts=PTS-STARTPTS+' + st + '/TB[br' + i + ']');
    // Enter/exit moves end exactly on the mandatory coordinates and stay inside the spoken window.
    const enter = fadeIn ? 'pow(1-min((t-' + st + ')/' + easeIn + ',1),3)' : '0', leave = fadeOut ? 'pow(max(0,(t-' + round(en - easeOut) + ')/' + easeOut + '),3)' : '0';
    const xPos = String(x), padY = spec.layout === 'pip' ? art.pad : 0;
    // The card moves with the picture cuts, never in the middle of a shot.
    const stepped = base => (spec.cardParts || []).slice(1).reduceRight((rest, part, k, all) => 'if(lt(t,' + part.start + '),' + (k ? all[k - 1].y - padY : base) + ',' + rest + ')', String(spec.cardParts?.length > 1 ? spec.cardParts.at(-1).y - padY : base));
    const yPos = spec.layout === 'top_half' ? y + '-' + height + '*(' + enter + '+' + leave + ')'
      : spec.layout === 'pip' ? stepped(y) + '+150*' + enter + '+90*' + leave + '+3*sin((t-' + st + ')*2.2)*(1-' + enter + ')' : String(y);
    filters.push('[' + prev + '][br' + i + "]overlay=x='" + xPos + "':y='" + yPos + "':enable='" + enable + "':eof_action=pass:repeatlast=0[v" + i + ']');
    prev = 'v' + i;
    if (behind) {
      // the presenter, cut out with the shared matte (firmer edge: alpha cubed), goes back on top of the picture
      const m = nextInput++, a = round(spec.matte.start);
      inputs.push('-c:v', 'libvpx-vp9', '-i', spec.matte.file);
      filters.push('[' + m + ':v]format=yuva420p,alphaextract,scale=1080:1920:flags=bicubic,setpts=PTS-STARTPTS+' + a + '/TB[ma' + i + ']',
        '[fg' + i + ']trim=start=' + a + ':end=' + round(spec.matte.end ?? (a + duration + 2)) + ',setpts=PTS[fgs' + i + ']', '[ma' + i + "]lut=c0='pow(val/255,3)*255'[mt" + i + ']', '[fgs' + i + '][mt' + i + ']alphamerge[person' + i + ']',
        '[' + prev + '][person' + i + "]overlay=0:0:enable='" + enable + "':eof_action=pass:repeatlast=0[vp" + i + ']');
      prev = 'vp' + i;
    }
    onLog('[B-ROLL] ' + (spec.name || spec.brollId) + ' ' + spec.layout + ' @ ' + st + '–' + en + 's');
  });
  return { inputs, filters, output: prev, nextInput };
}
async function composeBrollCutaway(inputVideo, brollSpecs, outputVideo, onLog = () => {}) {
  if (path.resolve(inputVideo) === path.resolve(outputVideo)) throw new Error('B-roll output phải khác input.');
  if (!(brollSpecs || []).filter(s => s && s.enabled !== false).length) { fs.copyFileSync(inputVideo, outputVideo); return; }
  const { inputs: media, filters, output: prev } = brollGraph(brollSpecs, { artDir: path.dirname(path.resolve(outputVideo)), onLog });
  const inputs = ['-y', '-i', inputVideo, ...media];
  const graphPath = outputVideo + '.graph.txt';
  fs.writeFileSync(graphPath, filters.join(';\n'), 'utf8');
  const args = [...inputs, '-filter_complex_threads', '2', '-filter_complex_script', graphPath,
    '-map', '[' + prev + ']', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
    '-threads', '4', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', outputVideo];
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
  if (entry && entry.available) return { ...normalized, file: entry.filePath, name: spec.name || entry.name, fit: !!entry.generated };
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
  portraitOf,
  BEHIND,
  TOP,
  ABOVE_SUB_Y,
  brollGraph,
  autoDetectReferenceBrolls,
  getBrollWarnings,
  assignBrollUpload,
  CARD,
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
