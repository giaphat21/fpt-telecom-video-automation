'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname, '..');
const envFile=path.join(root,'.env');
if(fs.existsSync(envFile)&&typeof process.loadEnvFile==='function')process.loadEnvFile(envFile);
const within=(...parts)=>path.join(root,...parts);
module.exports=Object.freeze({
 root,assets:within('assets'),videos:within('assets/source-videos'),voices:within('assets/source-audio'),
 output:process.env.FPT_OUTPUT_DIR?path.resolve(process.env.FPT_OUTPUT_DIR):within('output'),
 cache:within('var/cache'),logs:within('var/logs'),qa:within('var/qa'),
 ffmpeg:within('node_modules/ffmpeg-static/ffmpeg.exe'),
 ffprobe:within('node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe'),
 whisper:within('runtime/whisper/release/whisper-cli.exe'),
 modelTurbo:within('runtime/whisper/ggml-large-v3-turbo-q5_0.bin'),
 modelSmall:within('runtime/whisper/ggml-small-q5_1.bin'),
fonts:within('assets/fonts')
});
