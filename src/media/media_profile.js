'use strict';
const fs = require('fs'), path = require('path'), {execFile, execFileSync} = require('child_process');
const P = require('../../config/paths');
const VIDEO_EXTENSIONS = /\.(mp4|mov|mkv|webm|avi|m4v|3gp|mts|m2ts)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|flac|ogg|opus|mp4|webm)$/i;
const PROBE = file => ['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file];
const PROBE_OPTIONS = {encoding:'utf8', windowsHide:true, timeout:30000, maxBuffer:4*1024*1024};
const unreadable = () => Error('Không đọc được media. Tệp có thể bị hỏng hoặc codec không được hỗ trợ.');
function probeMedia(file, kind = 'video') {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw Error('Không tìm thấy tệp media.');
  let data;
  try { data = JSON.parse(execFileSync(P.ffprobe, PROBE(file), {...PROBE_OPTIONS, stdio:'pipe'})); } catch (_) { throw unreadable(); }
  return profileOf(data, kind);
}
const probeMediaAsync = (file, kind = 'video') => new Promise((resolve, reject) => execFile(P.ffprobe, PROBE(file), PROBE_OPTIONS, (error, out) => {
  try { if (error) throw unreadable(); resolve(profileOf(JSON.parse(out), kind)); } catch (e) { reject(e instanceof SyntaxError ? unreadable() : e); }
}));
function profileOf(data, kind) {
  const v=data.streams?.find(s=>s.codec_type==='video' && !s.disposition?.attached_pic);
  const a=data.streams?.find(s=>s.codec_type==='audio');
  const duration=Number(data.format?.duration || v?.duration || a?.duration);
  if (!Number.isFinite(duration) || duration<=0) throw Error('Media không có thời lượng hợp lệ.');
  if (kind==='video' && (!v || !v.width || !v.height)) throw Error('Tệp không có luồng hình hợp lệ.');
  if (kind==='audio' && !a) throw Error('Tệp không có âm thanh.');
  const rotation=Number(v?.side_data_list?.find(x=>x.rotation!==undefined)?.rotation || v?.tags?.rotate || 0);
  const sar=String(v?.sample_aspect_ratio||'1:1').split(':').map(Number);
  const pixelAspect=sar[0]>0 && sar[1]>0 ? sar[0]/sar[1] : 1;
  const swapped=Math.abs(rotation)%180===90;
  const width=v ? (swapped?v.height:v.width*pixelAspect) : 0;
  const height=v ? (swapped?v.width*pixelAspect:v.height) : 0;
  const hdr=['smpte2084','arib-std-b67'].includes(v?.color_transfer);
  return {duration,width,height,rotation,hdr,hasAudio:!!a,videoCodec:v?.codec_name,audioCodec:a?.codec_name,
    sourceWidth:v?.width,sourceHeight:v?.height,lowResolution:!!v && Math.min(width,height)<1080};
}
function portraitFilter(info, {input='[0:v]', output='[vout]', prefix='', punch=false}={}) {
  // FFmpeg autorotates before this graph. Normalize non-square pixels before framing.
  const hdr=info.hdr ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,' : '';
  const base=input+prefix+hdr+'scale=w=trunc(iw*sar/2)*2:h=ih:flags=lanczos,setsar=1,';
  const aspect=info.width/info.height;
  if (aspect>=0.5 && aspect<=0.65) {
    return base+'scale='+(punch?1144:1080)+':'+(punch?2034:1920)+
      ':force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,format=yuv420p'+output;
  }
  // Retain the whole landscape/square image; use its own blurred picture as the vertical background.
  return base+'split=2[portrait_bg][portrait_fg];'+
    '[portrait_bg]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,gblur=sigma=28,setsar=1[portrait_blur];'+
    '[portrait_fg]scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setsar=1[portrait_fit];'+
    '[portrait_blur][portrait_fit]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,format=yuv420p'+output;
}
module.exports={probeMedia,probeMediaAsync,portraitFilter,VIDEO_EXTENSIONS,AUDIO_EXTENSIONS};
