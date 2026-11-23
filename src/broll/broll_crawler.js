const PATHS=require('../../config/paths.js');
/**
 * B-Roll Automated Crawler & Media Fetcher
 * ==========================================
 * Tự động tìm kiếm, cào và tải B-Roll video HD 1080p/720p bản quyền mở (không watermark)
 * từ các kho tư liệu stock chuyên nghiệp (Mixkit, Open Stock Repositories).
 * 
 * Chủ đề hỗ trợ:
 * - football (Bóng đá, cầu thủ, sân vận động, Ngoại Hạng Anh)
 * - technology (Công nghệ, cáp quang, Wi-Fi, modem, viễn thông)
 * - security (Camera AI, CCTV, an ninh gia đình)
 * - television (Truyền hình 4K, xem phim gia đình, giải trí)
 * - gaming (Chơi game tốc độ cao, độ trễ thấp, không giật lag)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
const BROLL_LIB_DIR = path.join(STUDIO_ROOT, 'assets/broll-library');

fs.mkdirSync(BROLL_LIB_DIR, { recursive: true });

// Danh mục chủ đề B-Roll chuẩn FPT Telecom
const CRAWL_TOPICS = {
  football: {
    name: 'Trận Bóng Đá Đỉnh Cao',
    icon: '⚽',
    mixkitTag: 'football',
    keywords: ['ngoại hạng', 'premier', 'bóng đá', 'fpt play', 'nha', 'c1', 'champions', '380 trận'],
    defaultLayout: 'top_half',
    targetFile: 'broll_stock_football.mp4',
    thumbFile: 'thumb_stock_football.jpg',
    description: 'Cảnh trận bóng đá thực tế, cầu thủ tranh chấp trên sân cỏ'
  },
  technology: {
    name: 'Mạng Cáp Quang & Modem Wi-Fi',
    icon: '📶',
    mixkitTag: 'technology',
    keywords: ['wifi', 'wi-fi', 'modem', 'mesh', 'internet', 'gbps', 'mbps', '1 gbps', 'tốc độ'],
    defaultLayout: 'pip',
    targetFile: 'broll_stock_wifi6.mp4',
    thumbFile: 'thumb_stock_wifi6.jpg',
    description: 'Cảnh công nghệ cáp quang, truyền dữ liệu siêu tốc'
  },
  security: {
    name: 'Camera AI & Giám Sát An Ninh',
    icon: '📷',
    mixkitTag: 'security',
    keywords: ['camera', 'an ninh', 'giám sát', 'ai', 'nhận diện', 'đàm thoại'],
    defaultLayout: 'pip',
    targetFile: 'broll_stock_camera.mp4',
    thumbFile: 'thumb_stock_camera.jpg',
    description: 'Hệ thống camera giám sát an ninh công nghệ cao'
  },
  television: {
    name: 'Giải Trí Truyền Hình & Phim 4K',
    icon: '📺',
    mixkitTag: 'television',
    keywords: ['fpt play', 'kho phim', 'truyền hình', '4k', 'hdr', 'tài khoản', 'kênh'],
    defaultLayout: 'cutaway',
    targetFile: 'broll_stock_fptplay.mp4',
    thumbFile: 'thumb_stock_fptplay.jpg',
    description: 'Gia đình thư giãn xem TV 4K, kho phim bom tấn sắc nét'
  },
  gaming: {
    name: 'Gaming & Đa Nhiệm Mượt Mà',
    icon: '🎮',
    mixkitTag: 'gaming',
    keywords: ['chơi game', 'gaming', 'ping thấp', 'không giật lag', 'độ trễ', 'esport'],
    defaultLayout: 'top_half',
    targetFile: 'broll_stock_gaming.mp4',
    thumbFile: 'thumb_stock_gaming.jpg',
    description: 'Chơi game trực tuyến tốc độ cao không giật lag'
  }
};


const { pipeline } = require('stream/promises');
const crypto = require('crypto');
const { normalize } = require('../editing/timeline_rules');
const SOURCE_MANIFEST = path.join(BROLL_LIB_DIR, 'sources.json');
const TOPIC_FILTERS = {
  football: { terms: ['premier league', 'ngoai hang anh'], requiresOwnedMedia: true },
  technology: { terms: ['router', 'modem', 'fiber optic', 'fibre optic', 'ethernet', 'network cable'], tag: 'internet' },
  security: { terms: ['security camera', 'cctv camera', 'surveillance camera'], tag: 'security-camera' },
  television: { terms: ['fpt play'], requiresOwnedMedia: true },
  gaming: { terms: ['gaming', 'gamer', 'video game', 'video games'], tag: 'gaming', seedPages: ['https://mixkit.co/free-stock-video/three-friends-having-fun-playing-video-games-42672/'] }
};
function topicMatches(topicKey, title) {
  const t = ' ' + normalize(title) + ' ';
  if (topicKey === 'security' && /thie[fv]|guard|control|woman|man |room/.test(t)) return false;
  return (TOPIC_FILTERS[topicKey]?.terms || []).some(term => t.includes(' ' + term + ' '));
}
function parseVideoObjects(html) {
  const videos = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value['@type'] === 'VideoObject') videos.push(value);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch (_) {}
  }
  return [...new Map(videos.map(v => [v['@id'] || v.contentUrl, v])).values()];
}
function isCommercialFree(video) {
  // The generic #videoFree link also appears on Restricted items; it is NOT evidence.
  return (/^(?:mixkit (?:stock video )?)?free license$/i.test(video.copyrightNotice || '') ||
    (video.copyrightNotice === 'Free' && video.license === 'https://mixkit.co/license/#videoFree')) &&
    !/restricted|personal use only/i.test(video.copyrightNotice || '');
}
function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['mixkit.co', 'assets.mixkit.co'].includes(target.hostname))
      return reject(new Error('Nguồn tải không thuộc Mixkit HTTPS.'));
    if (redirects > 5) return reject(new Error('Quá nhiều redirect.'));
    const req = https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(request(new URL(res.headers.location, target).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      res.setTimeout(30000, () => res.destroy(new Error('Hết thời gian tải nguồn.')));
      resolve(res);
    });
    req.setTimeout(30000, () => req.destroy(new Error('Hết thời gian kết nối nguồn.')));
    req.on('error', reject);
  });
}
async function fetchHtml(url) {
  const res = await request(url); let html = '';
  for await (const chunk of res) {
    html += chunk.toString();
    if (html.length > 8 * 1024 * 1024) { res.destroy(); throw new Error('Trang nguồn quá lớn.'); }
  }
  return html;
}
async function downloadFile(url, destPath) {
  const response = await request(url);
  await pipeline(response, fs.createWriteStream(destPath, { flags: 'wx' }));
  return destPath;
}
function generateThumbnail(videoPath, thumbPath) {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '1', '-i', videoPath,
    '-vf', 'scale=360:-2', '-frames:v', '1', '-update', '1', thumbPath], { windowsHide: true });
}
function normalizeBrollClip(rawPath, destPath) {
  // Preserve source composition; crop only when the renderer knows the selected layout.
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-stream_loop', '-1', '-i', rawPath, '-t', '4',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-threads', '2', '-an', destPath], { windowsHide: true });
  if (fs.statSync(destPath).size < 10000) throw new Error('Clip chuẩn hóa không hợp lệ.');
}
const activeTopics = new Set();
async function crawlBrollTopic(topicKey, onLog = console.log) {
  const topic = CRAWL_TOPICS[topicKey], filter = TOPIC_FILTERS[topicKey];
  if (!topic || !filter) throw new Error('Chủ đề không hợp lệ: ' + topicKey);
  if (filter.requiresOwnedMedia) throw new Error('Cần clip ' + (topicKey === 'football' ? 'Ngoại Hạng Anh' : 'giao diện FPT Play') +
    ' đúng nội dung do bạn cung cấp; không thay bằng stock chung.');
  if (activeTopics.has(topicKey)) throw new Error('Chủ đề này đang được tải.');
  activeTopics.add(topicKey);
  try {
    const pageUrl = 'https://mixkit.co/free-stock-video/' + filter.tag + '/';
    const html = await fetchHtml(pageUrl);
    const listed = parseVideoObjects(html).filter(v => topicMatches(topicKey, v.name) && isCommercialFree(v));
    const pages = new Set([...(filter.seedPages || []), ...listed.map(v => String(v['@id'] || '').split('#')[0])]);
    for (const link of html.matchAll(/href=["']((?:https:\/\/mixkit\.co)?\/free-stock-video\/([^"']+-\d+)\/)["']/g)) {
      if (topicMatches(topicKey, link[2].replace(/-/g, ' '))) pages.add(new URL(link[1], 'https://mixkit.co').href);
    }
    let chosen, detailUrl;
    for (const url of [...pages].slice(0, 12)) {
      if (!url.startsWith('https://mixkit.co/free-stock-video/')) continue;
      const detail = parseVideoObjects(await fetchHtml(url)).find(v => String(v['@id'] || '').split('#')[0] === url && isCommercialFree(v) && topicMatches(topicKey, v.name));
      if (detail) { chosen = detail; detailUrl = url; break; }
    }
    if (!chosen) throw new Error('Trang chi tiết chưa xác nhận được nội dung và giấy phép.');
    const nonce = crypto.randomUUID(), staging = path.join(BROLL_LIB_DIR, '.staging', nonce);
    fs.mkdirSync(staging, { recursive: true });
    const raw = path.join(staging, 'source.mp4'), normalized = path.join(staging, topic.targetFile);
    onLog('[CRAWLER] ' + chosen.name + ' — ' + detailUrl);
    await downloadFile(chosen.contentUrl, raw);
    normalizeBrollClip(raw, normalized);
    generateThumbnail(normalized, path.join(staging, topic.thumbFile));
    const finalVideo = path.join(BROLL_LIB_DIR, topic.targetFile);
    const backup = path.join(BROLL_LIB_DIR, '.previous', nonce);
    fs.mkdirSync(backup, { recursive: true });
    for (const name of [topic.targetFile, topic.thumbFile]) {
      const dest = path.join(BROLL_LIB_DIR, name);
      if (fs.existsSync(dest)) fs.copyFileSync(dest, path.join(backup, name));
      fs.renameSync(path.join(staging, name), dest);
    }
    const manifest = fs.existsSync(SOURCE_MANIFEST) ? JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8')) : {};
    const record = { topic: topicKey, file: topic.targetFile, title: chosen.name, status: 'metadata_verified',
      sourcePage: detailUrl, sourceUrl: chosen.contentUrl, license: chosen.copyrightNotice,
      licenseUrl: chosen.license, downloadedAt: new Date().toISOString(), fileSize: fs.statSync(finalVideo).size };
    manifest[topic.targetFile] = record;
    const tempManifest = SOURCE_MANIFEST + '.' + nonce + '.tmp';
    fs.writeFileSync(tempManifest, JSON.stringify(manifest, null, 2));
    fs.renameSync(tempManifest, SOURCE_MANIFEST);
    // Keep downloaded originals and previous versions for audit/recovery.
    return record;
  } finally { activeTopics.delete(topicKey); }
}
async function crawlAllTopics(onLog = console.log) {
  const results = [];
  for (const topic of Object.keys(CRAWL_TOPICS)) {
    try { results.push({ ok: true, ...(await crawlBrollTopic(topic, onLog)) }); }
    catch (error) { results.push({ ok: false, topic, error: error.message }); onLog('[CRAWLER] ' + error.message); }
  }
  return results;
}
module.exports = { CRAWL_TOPICS, TOPIC_FILTERS, topicMatches, parseVideoObjects, isCommercialFree,
  crawlBrollTopic, crawlAllTopics, BROLL_LIB_DIR };
