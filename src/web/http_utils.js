'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {pipeline}=require('stream/promises'),{Transform}=require('stream');
const P=require('../../config/paths');
const WEB=process.env.FPT_WEB_MODE==='1';
const MAX_JSON=2*1024*1024;
const MAX_UPLOAD=Number(process.env.FPT_MAX_UPLOAD_MB||2048)*1024*1024;
function httpError(status,message){return Object.assign(Error(message),{status});}
function inside(root,file) {
  const rel=path.relative(path.resolve(root),path.resolve(file));
  return rel!=='' && rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);
}
function confinedPath(root,relative) {
  if (!relative || relative.includes('\0') || relative.includes(':')) throw httpError(403,'Đường dẫn không hợp lệ.');
  const file=path.resolve(root,relative);
  if(!inside(root,file))throw httpError(403,'Đường dẫn nằm ngoài thư mục cho phép.');
  if(fs.existsSync(file)&&!inside(fs.realpathSync(root),fs.realpathSync(file)))throw httpError(403,'Đường dẫn liên kết không được phép.');
  return file;
}
function sendJson(res,code,data){
  if(res.writableEnded || res.destroyed)return;
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function createGuard() {
  const username=process.env.FPT_ADMIN_USER || 'admin';
  const [algorithm,salt,hash]=String(process.env.FPT_ADMIN_PASSWORD_HASH||'').split(':');
  const publicUrl=process.env.FPT_PUBLIC_URL;
  if(WEB && (algorithm!=='scrypt' || !/^[a-f0-9]{32}$/.test(salt||'') || !/^[a-f0-9]{64}$/.test(hash||'')))
    throw Error('Web mode cần FPT_ADMIN_PASSWORD_HASH hợp lệ. Chạy scripts/configure_web.ps1.');
  if(WEB && (!publicUrl || new URL(publicUrl).protocol!=='https:'))throw Error('FPT_PUBLIC_URL phải là địa chỉ HTTPS.');
  let acceptedDigest=null;
  const failures=new Map();
  return (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    if(!WEB)return true;
    const ip=req.socket.remoteAddress||'unknown',now=Date.now(),rate=failures.get(ip);
    if(rate && rate.until>now && rate.count>=20){sendJson(res,429,{error:'Đăng nhập sai nhiều lần. Thử lại sau 60 giây.'});return false;}
    const auth=String(req.headers.authorization||'');
    const digest=crypto.createHash('sha256').update(auth).digest('hex');
    let valid=acceptedDigest===digest;
    if(!valid && auth.startsWith('Basic ') && auth.length<2048){
      const decoded=Buffer.from(auth.slice(6),'base64').toString('utf8'),colon=decoded.indexOf(':');
      if(colon>=0 && decoded.slice(0,colon)===username){
        const derived=crypto.scryptSync(decoded.slice(colon+1),salt,32);
        valid=crypto.timingSafeEqual(derived,Buffer.from(hash,'hex'));
      }
      if(valid)acceptedDigest=digest;
    }
    if(!valid){
      if(auth)failures.set(ip,{count:rate?.until>now?rate.count+1:1,until:rate?.until>now?rate.until:now+60000});
      res.setHeader('WWW-Authenticate','Basic realm="FPT Video Studio", charset="UTF-8"');
      sendJson(res,401,{error:'Đăng nhập để sử dụng FPT Video Studio.'});return false;
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      const origin=req.headers.origin;
      if((origin && origin!==new URL(publicUrl).origin)||req.headers['sec-fetch-site']==='cross-site'){
        sendJson(res,403,{error:'Yêu cầu từ website khác bị từ chối.'});return false;
      }
    }
    return true;
  };
}
async function readJson(req) {
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw httpError(415,'Cần gửi JSON.');
  if(Number(req.headers['content-length'])>MAX_JSON)throw httpError(413,'Dữ liệu yêu cầu quá lớn.');
  let size=0,chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_JSON)throw httpError(413,'Dữ liệu yêu cầu quá lớn.');chunks.push(chunk);}
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
  catch(_){throw httpError(400,'JSON không hợp lệ.');}
}
async function saveUpload(req,directory,name,allowed,verify) {
  if(!allowed.test(name))throw httpError(415,'Định dạng media chưa được hỗ trợ.');
  if(Number(req.headers['content-length'])>MAX_UPLOAD)throw httpError(413,'Tệp vượt giới hạn tải lên.');
  const original=path.basename(name).replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(-140);
  const filename=crypto.randomUUID()+'_'+original;
  const file=confinedPath(directory,filename),temporary=file+'.upload';
  fs.mkdirSync(directory,{recursive:true});
  let count=0;
  const limiter=new Transform({transform(chunk,encoding,callback){
    count+=chunk.length;callback(count>MAX_UPLOAD?httpError(413,'Tệp vượt giới hạn tải lên.'):null,chunk);
  }});
  try{
    await pipeline(req,limiter,fs.createWriteStream(temporary,{flags:'wx'}));
    if(!count)throw httpError(400,'Tệp tải lên rỗng.');
    const metadata=await verify(temporary);
    fs.renameSync(temporary,file);
    return {fileName:filename,metadata};
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function serveStatic(req,res,file){
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw httpError(404,'Không tìm thấy tệp.');
  const ext=path.extname(file).toLowerCase();
  const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4',
    '.webm':'video/webm','.mov':'video/quicktime','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4',
    '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.json':'application/json'}[ext]||'application/octet-stream';
  const size=fs.statSync(file).size,headers={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'private, no-cache'};
  let start=0,end=size-1,status=200;
  if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end();}
    if(!match[1])start=Math.max(0,size-Number(match[2]));
    else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(start>=size||start>end){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end();}
    status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
  }
  headers['Content-Length']=Math.max(0,end-start+1);
  res.writeHead(status,headers);
  if(req.method==='HEAD'||!size)return res.end();
  const stream=fs.createReadStream(file,{start,end});
  stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
module.exports={WEB,httpError,inside,confinedPath,sendJson,createGuard,readJson,saveUpload,serveStatic};
