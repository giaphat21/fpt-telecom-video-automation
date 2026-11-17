const PATHS=require('../config/paths.js');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FFMPEG = PATHS.ffmpeg;
const FFPROBE = PATHS.ffprobe;
const sourceDir = process.argv[2] && path.resolve(process.argv[2]);
if (!sourceDir || !fs.existsSync(sourceDir)) throw new Error('Usage: node scripts/import_capcut_sfx.js <source-folder>');
const destDir = path.join(PATHS.assets, 'sfx');
fs.mkdirSync(destDir, { recursive: true });

console.log('Installing CapCut Sound Effects Pack...');

const manifest = [];

function sanitizeName(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

function getDuration(filePath) {
  try {
    const raw = execFileSync(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], { encoding: 'utf8' }).trim();
    const sec = parseFloat(raw);
    return isNaN(sec) ? 1.0 : sec;
  } catch (e) {
    return 1.0;
  }
}

function processAndCopy(srcFile, catName, displayName) {
  const ext = path.extname(srcFile).toLowerCase();
  const baseName = path.basename(srcFile, ext);
  const safeId = sanitizeName(displayName || baseName);
  const outMp3 = path.join(destDir, `${safeId}.mp3`);

  try {
    if (ext === '.mp4' || ext === '.mov') {
      execFileSync(FFMPEG, [
        '-y', '-loglevel', 'error', '-i', srcFile,
        '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', outMp3
      ]);
    } else if (ext === '.mp3' || ext === '.wav' || ext === '.aac') {
      execFileSync(FFMPEG, [
        '-y', '-loglevel', 'error', '-i', srcFile,
        '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', outMp3
      ]);
    }
    
    const durSec = getDuration(outMp3);

    manifest.push({
      id: safeId,
      name: displayName || baseName,
      file: `${safeId}.mp3`,
      url: `/assets/sfx/${safeId}.mp3`,
      cat: catName,
      dur: Number(durSec.toFixed(2))
    });
    console.log(`[${catName}] Copied: ${displayName || baseName} (${durSec.toFixed(2)}s)`);
  } catch (err) {
    console.error(`Failed ${srcFile}:`, err.message);
  }
}

// 1. TRANSITIONS (Whooshes, Swish)
const whooshFiles = [
  'whoosh 1.mp3', 'whoosh 2.mp3', 'whoosh3.mp4', 'transition-signal-2-208053.mp3'
];
whooshFiles.forEach(f => {
  const p = path.join(sourceDir, f);
  if (fs.existsSync(p)) processAndCopy(p, 'Transitions', f.replace(/\.[^.]+$/, ''));
});

if (fs.existsSync(path.join(sourceDir, 'Whooshes'))) {
  const list = fs.readdirSync(path.join(sourceDir, 'Whooshes')).filter(f => f.endsWith('.mp3')).slice(0, 12);
  list.forEach(f => processAndCopy(path.join(sourceDir, 'Whooshes', f), 'Transitions', f.replace('.mp3', '')));
}

if (fs.existsSync(path.join(sourceDir, 'Swish'))) {
  const list = fs.readdirSync(path.join(sourceDir, 'Swish')).filter(f => f.endsWith('.mp3')).slice(0, 8);
  list.forEach(f => processAndCopy(path.join(sourceDir, 'Swish', f), 'Transitions', f.replace('.mp3', '')));
}

// 2. UI (UI, User Interface, Clicks)
const uiFiles = ['click chuột.mp4', 'pop.mp4', 'Neutral, Select Tone 01.mp3', 'scroll-up-scroll-down-102362.mp3', 'data-reveal-sfx-164741.mp3'];
uiFiles.forEach(f => {
  const p = path.join(sourceDir, f);
  if (fs.existsSync(p)) processAndCopy(p, 'UI', f.replace(/\.[^.]+$/, ''));
});

if (fs.existsSync(path.join(sourceDir, 'UI'))) {
  const list = fs.readdirSync(path.join(sourceDir, 'UI')).filter(f => f.endsWith('.mp3')).slice(0, 15);
  list.forEach(f => processAndCopy(path.join(sourceDir, 'UI', f), 'UI', f.replace('.mp3', '')));
}

if (fs.existsSync(path.join(sourceDir, 'User Interface'))) {
  const list = fs.readdirSync(path.join(sourceDir, 'User Interface')).filter(f => f.endsWith('.mp3')).slice(0, 10);
  list.forEach(f => processAndCopy(path.join(sourceDir, 'User Interface', f), 'UI', f.replace('.mp3', '')));
}

// 3. TYPING (Typing, Keyboard)
const typeFiles = ['enter phím.mp4', 'gõ phím.mp4'];
typeFiles.forEach(f => {
  const p = path.join(sourceDir, f);
  if (fs.existsSync(p)) processAndCopy(p, 'Typing', f.replace(/\.[^.]+$/, ''));
});

if (fs.existsSync(path.join(sourceDir, 'Typing'))) {
  const list = fs.readdirSync(path.join(sourceDir, 'Typing')).filter(f => f.endsWith('.mp3')).slice(0, 15);
  list.forEach(f => processAndCopy(path.join(sourceDir, 'Typing', f), 'Typing', f.replace('.mp3', '')));
}

// 4. FLICK & IMPACTS (Flick, Shutter, Impacts, Objects)
if (fs.existsSync(path.join(sourceDir, 'Camera Shutter'))) {
  const list = fs.readdirSync(path.join(sourceDir, 'Camera Shutter')).filter(f => f.endsWith('.mp3')).slice(0, 8);
  list.forEach(f => processAndCopy(path.join(sourceDir, 'Camera Shutter', f), 'Flick', f.replace('.mp3', '')));
}

if (fs.existsSync(path.join(sourceDir, 'Objects'))) {
  const flickObj = fs.readdirSync(path.join(sourceDir, 'Objects')).filter(f => /flick|page|card|switch/i.test(f)).slice(0, 6);
  flickObj.forEach(f => processAndCopy(path.join(sourceDir, 'Objects', f), 'Flick', f.replace('.mp3', '')));
}

if (fs.existsSync(path.join(sourceDir, 'Impacts'))) {
  const list = fs.readdirSync(path.join(sourceDir, 'Impacts')).filter(f => f.endsWith('.mp3')).slice(0, 10);
  list.forEach(f => processAndCopy(path.join(sourceDir, 'Impacts', f), 'Flick', f.replace('.mp3', '')));
}

// 5. BELL, CHIME & HIGHLIGHTS
const chimeFiles = ['bellring.mp4', 'bellring 2.mp4', 'cash money.mp4'];
chimeFiles.forEach(f => {
  const p = path.join(sourceDir, f);
  if (fs.existsSync(p)) processAndCopy(p, 'Chime & Highlight', f.replace(/\.[^.]+$/, ''));
});

// 6. HOOK & BOOM
const hookBoom = ['Bùm.mp4', 'hologram.mp4', 'Hologram1.mp4', 'riser.mp4', 'xé giấy.mp4', 'ồhhhh.mp4'];
hookBoom.forEach(f => {
  const p = path.join(sourceDir, f);
  if (fs.existsSync(p)) processAndCopy(p, 'Hook & Boom', f.replace(/\.[^.]+$/, ''));
});

// Write manifest
const manifestPath = path.join(destDir, 'sfx_manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({ count: manifest.length, sfx: manifest }, null, 2), 'utf8');
console.log(`\nSUCCESS! Installed ${manifest.length} Sound Effects into ${destDir}`);
