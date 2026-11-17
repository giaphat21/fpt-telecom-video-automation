const PATHS=require('../config/paths.js');
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { composeBrollCutaway } = require('../src/core/broll_compositor');
const root = path.resolve(__dirname, '..'), workspace = PATHS.root;
const ffmpeg = path.join(workspace, 'node_modules/ffmpeg-static/ffmpeg.exe');
const probe = path.join(workspace, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');
const out = path.join(root, 'var/qa', 'qa_creative_broll');
fs.mkdirSync(out, { recursive: true });
const run = args => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
const info = file => JSON.parse(execFileSync(probe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
const pixel = (file, time, x, y) => [...run(['-ss', String(time), '-i', file, '-vf',
  'crop=2:2:' + x + ':' + y + ',scale=1:1,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])];
const red = p => p[0] > 180 && p[1] < 50 && p[2] < 50;
const yellow = p => p[0] > 180 && p[1] > 180 && p[2] < 50;
const blue = p => p[2] > 180 && p[0] < 50;
(async () => {
  const base = path.join(out, 'base_silent.mp4'), clip = path.join(out, 'red_broll.mp4');
  run(['-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:r=30:d=3', '-vf',
    'drawbox=x=0:y=1000:w=1080:h=200:color=yellow:t=fill', '-c:v', 'libx264', '-preset', 'ultrafast', '-an', base]);
  run(['-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=0.6', '-c:v', 'libx264', '-preset', 'ultrafast', '-an', clip]);
  const results = [];
  for (const layout of ['cutaway', 'top_half', 'pip']) {
    const file = path.join(out, layout + '.mp4');
    await composeBrollCutaway(base, [{ file: clip, layout, start: 0.5, end: 2, duration: 99 }], file);
    const metadata = info(file);
    assert.ok(Math.abs(Number(metadata.format.duration) - 3) < 0.1);
    assert.ok(blue(pixel(file, 0.1, 100, 100)));
    assert.ok(blue(pixel(file, 2.5, 100, 100)));
    if (layout === 'cutaway') assert.ok(red(pixel(file, 1, 100, 1000)));
    if (layout === 'top_half') {
      assert.ok(red(pixel(file, 1, 100, 100)));
      assert.ok(yellow(pixel(file, 1, 540, 1100)), 'Host focus must stay above captions');
      assert.ok(blue(pixel(file, 1, 100, 1500)));
    }
    if (layout === 'pip') {
      assert.ok(red(pixel(file, 1, 700, 250)));
      assert.ok(blue(pixel(file, 1, 100, 100)));
      assert.ok(blue(pixel(file, 1, 700, 700)));
    }
    run(['-ss', '1', '-i', file, '-frames:v', '1', '-update', '1', path.join(out, layout + '.jpg')]);
    results.push({ layout, duration: metadata.format.duration, pixelChecks: 'passed' });
    console.log('PASS compositor:', layout);
  }
  const audioBase = path.join(out, 'base_audio.mp4'), audioOut = path.join(out, 'audio_preserved.mp4');
  run(['-i', base, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-shortest', audioBase]);
  await composeBrollCutaway(audioBase, [{ file: clip, layout: 'pip', start: 0.5, end: 2 }], audioOut);
  const audioHash = file => run(['-i', file, '-map', '0:a', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', 'pipe:1']).toString().trim();
  assert.equal(audioHash(audioBase), audioHash(audioOut));
  await assert.rejects(composeBrollCutaway(base, [{ file: path.join(out, 'missing.mp4'), start: 0.5, end: 2 }], path.join(out, 'missing_output.mp4')));
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ results, originalAudioUnchanged: true }, null, 2));
  console.log('PASS original audio preserved bit-for-bit; missing media rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
