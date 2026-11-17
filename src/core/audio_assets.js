const PATHS=require('../../config/paths.js');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const ASSETS_DIR = path.join(STUDIO_ROOT, 'assets');
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');

const REMOTION_MEDIA = path.join(PATHS.assets,'audio-sources/remotion-media');
const REMOTION_BRAND = path.join(PATHS.assets,'audio-sources/remotion-brand');
const REMOTION_DOCS = path.join(PATHS.assets,'audio-sources/remotion-docs');
const REMOTION_RECORDER = path.join(PATHS.assets,'audio-sources/remotion-recorder');
const HOWLER_AUDIO = path.join(PATHS.assets,'audio-sources/howler-audio');

const SAMPLE_RATE = 44100;

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

function wavToMp3(wavPath, mp3Path) {
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', wavPath,
    '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', mp3Path
  ]);
  if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
}

function masterStudioTrack(srcPath, outMp3, filterStr = ' loudnorm=I=-16:TP=-1.5:LRA=11') {
  if (!fs.existsSync(srcPath)) return false;
  try {
    execFileSync(FFMPEG, [
      '-y', '-loglevel', 'error', '-i', srcPath,
      '-af', filterStr.trim(),
      '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', outMp3
    ]);
    return fs.existsSync(outMp3);
  } catch (_) {
    return false;
  }
}

function mixStudioSfx(srcA, srcB, outMp3, filterComplex) {
  if (!fs.existsSync(srcA)) return false;
  try {
    if (srcB && fs.existsSync(srcB)) {
      execFileSync(FFMPEG, [
        '-y', '-loglevel', 'error', '-i', srcA, '-i', srcB,
        '-filter_complex', filterComplex,
        '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', outMp3
      ]);
    } else {
      execFileSync(FFMPEG, [
        '-y', '-loglevel', 'error', '-i', srcA,
        '-af', filterComplex,
        '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', outMp3
      ]);
    }
    return fs.existsSync(outMp3);
  } catch (_) {
    return false;
  }
}

function generateRiserFallback(outMp3) {
  const dur = 0.80;
  const len = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / dur;
    const env = Math.pow(progress, 2.2) * Math.sin(Math.min(1, (dur - t) / 0.05) * Math.PI * 0.5);
    const freq = 220 * Math.pow(6.2, progress);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const white = (Math.random() * 2 - 1) * 0.25;
    out[i] = (Math.sin(phase) * 0.6 + Math.sin(phase * 1.5) * 0.25 + white) * env * 0.85;
  }
  const tmpWav = outMp3.replace(/\.mp3$/, '.wav');
  writeWav(tmpWav, out);
  wavToMp3(tmpWav, outMp3);
}

function generateAllFptAudio() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  // 1. Harvest & Master Real Studio Background Music Tracks (Bright, Upbeat, Commercial Vibes)
  const bgmCatalog = [
    {
      name: 'bgm_fpt_upbeat.mp3',
      src: path.join(REMOTION_RECORDER, 'utope-rhythmic-reverie.mp3'),
      af: 'highpass=f=60,treble=g=2,acompressor=threshold=-16dB:ratio=2.5:makeup=2'
    },
    {
      name: 'bgm_fpt_bright.mp3',
      src: path.join(REMOTION_RECORDER, 'utope-i-woke-up-in-a-dream.mp3'),
      af: 'highpass=f=60,treble=g=3,acompressor=threshold=-16dB:ratio=2.5:makeup=2'
    },
    {
      name: 'bgm_fpt_fresh.mp3',
      src: path.join(REMOTION_RECORDER, 'utope-nature.mp3'),
      af: 'highpass=f=60,acompressor=threshold=-16dB:ratio=2.5:makeup=2'
    },
    {
      name: 'bgm_fpt_synth.mp3',
      src: path.join(HOWLER_AUDIO, 'running_out.mp3'),
      af: 'highpass=f=65,acompressor=threshold=-16dB:ratio=2.5:makeup=2'
    },
    {
      name: 'bgm_fpt_chill.mp3',
      src: path.join(HOWLER_AUDIO, '80s_vibe.mp3'),
      af: 'highpass=f=60,acompressor=threshold=-16dB:ratio=2.5:makeup=2'
    }
  ];

  for (const item of bgmCatalog) {
    const outPath = path.join(ASSETS_DIR, item.name);
    masterStudioTrack(item.src, outPath, item.af);
  }

  // 2. Harvest & Master Real Studio Sound Effects from Workspace Library
  // 2.1 Pop / Bubble (UI Pop + Grow)
  mixStudioSfx(
    path.join(REMOTION_BRAND, 'prompt-appear.wav'),
    path.join(REMOTION_RECORDER, 'grow.m4a'),
    path.join(ASSETS_DIR, 'sfx_pop.mp3'),
    '[0:a]volume=1.3[a0];[1:a]volume=1.1[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0,atrim=0:0.35'
  );

  // 2.2 Whoosh Short (Whip + Whoosh for B-Roll & Transitions)
  mixStudioSfx(
    path.join(REMOTION_MEDIA, 'whip.wav'),
    path.join(REMOTION_MEDIA, 'whoosh.wav'),
    path.join(ASSETS_DIR, 'sfx_whoosh_short.mp3'),
    '[0:a]volume=1.1[a0];[1:a]volume=1.4[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0,atrim=0:0.42'
  );
  fs.copyFileSync(path.join(ASSETS_DIR, 'sfx_whoosh_short.mp3'), path.join(ASSETS_DIR, 'sfx_whoosh.mp3'));

  // 2.3 Cash Register Ting! (Crisp Bell Ding + Chime for Price Pill)
  mixStudioSfx(
    path.join(REMOTION_MEDIA, 'ding.wav'),
    path.join(REMOTION_BRAND, 'chime.mp3'),
    path.join(ASSETS_DIR, 'sfx_cash_ting.mp3'),
    '[0:a]volume=1.35[a0];[1:a]adelay=40|40,volume=0.95[a1];[a0][a1]amix=inputs=2:duration=first:normalize=0,atrim=0:0.85'
  );
  fs.copyFileSync(path.join(ASSETS_DIR, 'sfx_cash_ting.mp3'), path.join(ASSETS_DIR, 'sfx_ding.mp3'));

  // 2.4 Party Popper / Celebration (Partyhorn + Chime for Free Gift & CTA)
  mixStudioSfx(
    path.join(REMOTION_DOCS, 'partyhorn.mp3'),
    path.join(REMOTION_BRAND, 'chime.mp3'),
    path.join(ASSETS_DIR, 'sfx_party_popper.mp3'),
    '[0:a]volume=1.15[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=first:normalize=0,atrim=0:1.15'
  );
  fs.copyFileSync(path.join(ASSETS_DIR, 'sfx_party_popper.mp3'), path.join(ASSETS_DIR, 'sfx_celebrate.mp3'));

  // 2.5 Record Scratch (Real Vinyl Scratch for Desaturate B&W Flash)
  mixStudioSfx(
    path.join(REMOTION_MEDIA, 'record-scratch.wav'),
    null,
    path.join(ASSETS_DIR, 'sfx_record_scratch.mp3'),
    'volume=1.35,atrim=0:0.72'
  );

  // 2.6 Riser Short (0.8s Sweep before Offer Escalation)
  generateRiserFallback(path.join(ASSETS_DIR, 'sfx_riser_short.mp3'));

  // 2.7 Camera Shutter (When Camera AI B-Roll appears)
  mixStudioSfx(
    path.join(REMOTION_MEDIA, 'shutter-modern.wav'),
    path.join(REMOTION_MEDIA, 'switch.wav'),
    path.join(ASSETS_DIR, 'sfx_camera_shutter.mp3'),
    '[0:a]volume=1.4[a0];[1:a]volume=0.9[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0,atrim=0:0.45'
  );

  // 2.8 UI Notification Pop (For Reply Comment Sticker & Tech Badge)
  mixStudioSfx(
    path.join(REMOTION_MEDIA, 'snapchat-notification.wav'),
    null,
    path.join(ASSETS_DIR, 'sfx_ui_click.mp3'),
    'volume=1.35,atrim=0:0.50'
  );
  fs.copyFileSync(path.join(ASSETS_DIR, 'sfx_ui_click.mp3'), path.join(ASSETS_DIR, 'sfx_tip.mp3'));

  // 2.9 Promo Chime
  mixStudioSfx(
    path.join(REMOTION_BRAND, 'chime.mp3'),
    null,
    path.join(ASSETS_DIR, 'sfx_chime.mp3'),
    'volume=1.25,atrim=0:1.10'
  );

  console.log('Mastered all studio BGM (5 tracks) and studio SFX (9 effects) in:', ASSETS_DIR);
}

if (require.main === module) {
  generateAllFptAudio();
}

module.exports = { generateAllFptAudio };
