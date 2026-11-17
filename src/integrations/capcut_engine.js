const PATHS=require('../../config/paths.js');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * CapCut Draft Engine
 * Powered by local capcut-cli wrapper for native CapCut 8.x/9.x compatibility.
 */

const CLI_PATH = path.join(PATHS.root, 'node_modules', 'capcut-cli', 'dist', 'index.js');

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env
      }
    });
    return stdout;
  } catch (err) {
    const errMsg = err.stdout || err.stderr || err.message;
    throw new Error(`CapCut CLI error (${args.join(' ')}): ${errMsg}`);
  }
}

function getCapCutDraftsDir() {
  if (process.env.CAPCUT_DRAFT_DIR && fs.existsSync(process.env.CAPCUT_DRAFT_DIR)) {
    return process.env.CAPCUT_DRAFT_DIR;
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
    const defaultPath = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
    if (fs.existsSync(defaultPath)) return defaultPath;
  } else if (process.platform === 'darwin') {
    const defaultPath = path.join(process.env.HOME, 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
    if (fs.existsSync(defaultPath)) return defaultPath;
  }
  return path.join(PATHS.root, 'var/capcut-drafts');
}

function resolveDraftPath(draftIdentifier) {
  const draftsDir = getCapCutDraftsDir();
  if (fs.existsSync(draftIdentifier) && fs.existsSync(path.join(draftIdentifier, 'draft_content.json'))) {
    return path.resolve(draftIdentifier);
  }
  const byFolder = path.join(draftsDir, draftIdentifier);
  if (fs.existsSync(byFolder) && fs.existsSync(path.join(byFolder, 'draft_content.json'))) {
    return byFolder;
  }
  const all = listDrafts();
  const match = all.find(d => d.draft_name === draftIdentifier || d.folder === draftIdentifier);
  if (match) {
    return match.full_path;
  }
  throw new Error(`Bản nháp '${draftIdentifier}' không tìm thấy trong ${draftsDir}`);
}

function listDrafts() {
  const draftsDir = getCapCutDraftsDir();
  if (!fs.existsSync(draftsDir)) return [];

  const entries = fs.readdirSync(draftsDir, { withFileTypes: true });
  const drafts = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(draftsDir, entry.name, 'draft_meta_info.json');
    const contentPath = path.join(draftsDir, entry.name, 'draft_content.json');

    if (fs.existsSync(metaPath) && fs.existsSync(contentPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
        drafts.push({
          folder: entry.name,
          draft_id: meta.draft_id || entry.name,
          draft_name: meta.draft_name || entry.name,
          duration_sec: ((content.duration || meta.tm_duration || 0) / 1000000).toFixed(2),
          ratio: content.canvas_config ? content.canvas_config.ratio : 'original',
          tracks_count: content.tracks ? content.tracks.length : 0,
          updated_at: meta.tm_draft_modified || null,
          full_path: path.join(draftsDir, entry.name)
        });
      } catch (err) {
        // Skip unparseable
      }
    }
  }
  return drafts.reverse();
}

function createBaseDraft(draftName, options = {}) {
  const sanitizedName = draftName.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9 -]/g, '_').trim();
  const ratio = options.ratio || '9:16';
  
  const args = ['init', sanitizedName, '--ratio', ratio, '--force-write'];
  if (options.template) {
    args.push('--template', options.template);
  }
  
  const out = runCli(args);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    parsed = { ok: true, name: sanitizedName };
  }

  const draftsDir = getCapCutDraftsDir();
  const draftDir = path.join(draftsDir, sanitizedName);

  return {
    ok: true,
    draft_name: sanitizedName,
    draft_dir: draftDir,
    ratio: ratio,
    details: parsed
  };
}

function addMediaSegment(draftPath, options) {
  const resolved = resolveDraftPath(draftPath);
  const mediaFile = path.resolve(options.filePath);
  const startSec = Number(options.startSec) || 0;
  const durationSec = Number(options.durationSec) || 5;

  const args = ['add-video', resolved, mediaFile, String(startSec), String(durationSec), '--force-write'];
  if (options.trackName) args.push('--track-name', options.trackName);

  const out = runCli(args);
  try {
    return JSON.parse(out);
  } catch (e) {
    return { ok: true, raw: out };
  }
}

function addAudioSegment(draftPath, options) {
  const resolved = resolveDraftPath(draftPath);
  const audioFile = path.resolve(options.filePath);
  const startSec = Number(options.startSec) || 0;
  const durationSec = Number(options.durationSec) || 5;

  const args = ['add-audio', resolved, audioFile, String(startSec), String(durationSec), '--force-write'];
  if (options.volume !== undefined) args.push('--volume', String(options.volume));
  if (options.trackName) args.push('--track-name', options.trackName);

  const out = runCli(args);
  try {
    return JSON.parse(out);
  } catch (e) {
    return { ok: true, raw: out };
  }
}

function addTextSegment(draftPath, options) {
  const resolved = resolveDraftPath(draftPath);
  const startSec = Number(options.startSec) || 0;
  const durationSec = Number(options.durationSec) || 3;
  const text = String(options.text || '');

  const args = ['add-text', resolved, String(startSec), String(durationSec), text, '--force-write'];
  if (options.y !== undefined) args.push('--y', String(options.y));
  if (options.x !== undefined) args.push('--x', String(options.x));
  if (options.fontSize !== undefined) args.push('--font-size', String(options.fontSize));
  if (options.textColor) {
    let col = options.textColor;
    if (col.startsWith('#') && col.length === 9) col = col.substring(0, 7); // Strip alpha for cli hex
    args.push('--color', col);
  }
  if (options.trackName) args.push('--track-name', options.trackName);

  const out = runCli(args);
  try {
    return JSON.parse(out);
  } catch (e) {
    return { ok: true, raw: out };
  }
}

function compileStoryboard(storyboard, options = {}) {
  const title = options.name || storyboard.title || `AutoVideo_${Date.now()}`;
  const ratio = storyboard.ratio || options.ratio || '9:16';

  // 1. Create base project with clean skeleton matching app version
  const newDraft = createBaseDraft(title, { ratio });
  const draftDir = newDraft.draft_dir;

  let currentTimelineSec = 0;
  const scenes = storyboard.scenes || [];
  const sceneResults = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const duration = Number(scene.duration) || 5;
    const sceneStart = scene.startTime !== undefined ? Number(scene.startTime) : currentTimelineSec;
    const res = { sceneIndex: i + 1, startSec: sceneStart, durationSec: duration };

    // Video / image
    if (scene.video || scene.image) {
      const media = scene.video || scene.image;
      if (fs.existsSync(media)) {
        res.media = addMediaSegment(draftDir, {
          filePath: media,
          startSec: sceneStart,
          durationSec: duration
        });
      }
    }

    // Audio / voiceover
    if (scene.audio) {
      if (fs.existsSync(scene.audio)) {
        res.audio = addAudioSegment(draftDir, {
          filePath: scene.audio,
          startSec: sceneStart,
          durationSec: duration,
          volume: scene.audioVolume !== undefined ? scene.audioVolume : 1.0,
          trackName: 'Voice Track'
        });
      }
    }

    // Text / subtitle
    const textContent = scene.subtitle || scene.text;
    if (textContent) {
      res.text = addTextSegment(draftDir, {
        text: textContent,
        startSec: sceneStart,
        durationSec: duration,
        fontSize: scene.fontSize || 10.0,
        textColor: scene.textColor || '#FFFFFF',
        y: scene.y !== undefined ? scene.y : -0.75
      });
    }

    sceneResults.push(res);
    currentTimelineSec = Math.max(currentTimelineSec, sceneStart + duration);
  }

  // Root BGM
  if (storyboard.bgm && fs.existsSync(storyboard.bgm)) {
    addAudioSegment(draftDir, {
      filePath: storyboard.bgm,
      startSec: 0,
      durationSec: currentTimelineSec,
      volume: storyboard.bgmVolume || 0.25,
      trackName: 'BGM Track'
    });
  }

  return {
    success: true,
    draft_name: newDraft.draft_name,
    draft_dir: draftDir,
    total_duration_sec: currentTimelineSec,
    scenes_processed: sceneResults.length,
    scenes: sceneResults
  };
}

module.exports = {
  getCapCutDraftsDir,
  listDrafts,
  resolveDraftPath,
  createBaseDraft,
  addMediaSegment,
  addAudioSegment,
  addTextSegment,
  compileStoryboard
};
