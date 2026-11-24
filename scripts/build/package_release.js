'use strict';
// Builds a portable Windows release: app, production dependencies, models, fonts and a private Node runtime.
// Never packaged: secrets, logs, caches, rendered output, uploaded or presenter footage, development skills, git data.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const P=require('../../config/paths'),pkg=require('../../package.json');
const name='FPT-Video-Studio-'+pkg.version+'-win-x64',dist=path.join(P.root,'dist'),target=path.join(dist,name);
const UPLOAD=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;
const SECRET=/^(\.env(\..*)?|.*\.(pem|key|pfx|p12|log|upload|part))$/i;
const INCLUDE=['src','public','config','scripts','assets','runtime/whisper','runtime/caddy','runtime/models','skills/broll-crawler','skills/reference-editing','tests',
  'docs','CHANGELOG.md','package.json','package-lock.json','README.md','AGENTS.md','.env.example'];
const EXCLUDE=[/^assets[\\/]source-(videos|audio)([\\/]|$)/,/^docs[\\/]development([\\/]|$)/];
// The small model stays as the fallback that the program selects when the large one is missing.
function copy(relative){
  const from=path.join(P.root,relative),stat=fs.statSync(from);
  if(EXCLUDE.some(re=>re.test(relative))||UPLOAD.test(path.basename(relative))||(SECRET.test(path.basename(relative))&&path.basename(relative)!=='.env.example'))return;
  if(stat.isDirectory()){for(const entry of fs.readdirSync(from))copy(path.join(relative,entry));return;}
  const to=path.join(target,relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
}
function notices(){
  const lock=JSON.parse(fs.readFileSync(path.join(P.root,'package-lock.json'),'utf8')).packages,rows=[];
  for(const [key,info]of Object.entries(lock)){
    if(!key||info.dev)continue;const dir=path.join(P.root,key);if(!fs.existsSync(dir))continue;
    let license=info.license;try{license=license||JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).license;}catch(_){}
    rows.push('| '+key.replace(/^.*node_modules\//,'')+' | '+info.version+' | '+(typeof license==='string'?license:license?.type||'xem gói')+' |');
  }
  return '# Thông báo bản quyền bên thứ ba\n\n| Thành phần | Phiên bản | Giấy phép |\n|---|---|---|\n'+
    '| Node.js (runtime/node) | '+process.version+' | MIT |\n| FFmpeg (ffmpeg-static) | 6.1.1 | GPL-3.0-or-later |\n| FFprobe (ffprobe-static) | 4.0.2 | GPL |\n| whisper.cpp | 1.9.5 | MIT |\n| MODNet tách nền (runtime/models/modnet.onnx, Hugging Face Xenova/modnet) | onnx | Apache-2.0 |\n| Whisper large-v3-turbo, small (ggml) | q5 | MIT |\n| Caddy | runtime/caddy | Apache-2.0 |\n| Montserrat, Be Vietnam Pro, Barlow | assets/fonts | SIL OFL 1.1 |\n'+rows.sort().join('\n')+
    '\n\n## Nội dung doanh nghiệp cần tự xác nhận quyền sử dụng\n\n- `assets/broll-user`: hình trận đấu.\n- `assets/custom-music`: nhạc nền do người dùng tải lên.\n- `assets/sfx-user`: bộ SFX người dùng cung cấp (bộ duy nhất được dùng).\n- `assets/broll-images`, logo, ảnh sản phẩm FPT.\n';
}
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
function sha256(file){const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),b=Buffer.alloc(4*1024*1024);let n;while((n=fs.readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));fs.closeSync(fd);return h.digest('hex');}
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
for(const item of INCLUDE){if(!fs.existsSync(path.join(P.root,item)))throw Error('Thiếu thành phần đóng gói: '+item);copy(item);}
const lock=JSON.parse(fs.readFileSync(path.join(P.root,'package-lock.json'),'utf8')).packages;
for(const [key,info]of Object.entries(lock))if(key&&!info.dev&&fs.existsSync(path.join(P.root,key)))
  fs.cpSync(path.join(P.root,key),path.join(target,key),{recursive:true,filter:src=>!/[\\/](\.cache|darwin|linux|ia32)([\\/]|$)/.test(path.relative(P.root,src))});
for(const dir of ['assets/source-videos','assets/source-audio','output','var'])fs.mkdirSync(path.join(target,dir),{recursive:true});
fs.mkdirSync(path.join(target,'runtime/node'),{recursive:true});fs.copyFileSync(process.execPath,path.join(target,'runtime/node/node.exe'));
fs.writeFileSync(path.join(target,'THIRD_PARTY_NOTICES.md'),notices());
fs.writeFileSync(path.join(target,'VERSION'),pkg.version+'\n');
fs.writeFileSync(path.join(target,'Mo-FPT-Studio.cmd'),'@echo off\r\ncall "%~dp0scripts\\start_studio.cmd" %*\r\n');
const files=walk(target).sort();
const leaked=files.filter(f=>UPLOAD.test(path.basename(f))||(SECRET.test(path.basename(f))&&path.basename(f)!=='.env.example'&&!f.includes('node_modules')));
if(leaked.length)throw Error('Gói chứa tệp không được phép: '+leaked.slice(0,5).join(', '));
fs.writeFileSync(path.join(target,'SHA256SUMS.txt'),files.map(f=>sha256(f)+'  '+path.relative(target,f).replace(/\\/g,'/')).join('\n')+'\n');
const bytes=files.reduce((s,f)=>s+fs.statSync(f).size,0);
console.log('Gói: '+target+' ('+files.length+' tệp, '+(bytes/1e6).toFixed(0)+' MB)');
if(process.argv.includes('--zip')){
  const zip=target+'.zip';fs.rmSync(zip,{force:true});
  execFileSync(path.join(process.env.SystemRoot||'C:/Windows','System32/tar.exe'),['-a','-c','-f',zip,'-C',dist,name],{stdio:'inherit',windowsHide:true});
  fs.writeFileSync(zip+'.sha256',sha256(zip)+'  '+path.basename(zip)+'\n');
  // The unpacked copy is only the staging area of this run; keep it with --keep.
  if(!process.argv.includes('--keep'))fs.rmSync(target,{recursive:true,force:true});
  console.log('ZIP: '+zip+' ('+(fs.statSync(zip).size/1e6).toFixed(0)+' MB)');
}
