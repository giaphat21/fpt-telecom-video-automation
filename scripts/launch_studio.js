'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const {spawn,execFile,execFileSync}=require('child_process');
const VERSION=require('../package.json').version;
const P=require('../config/paths');
const port=Number(process.env.FPT_STUDIO_PORT)||3457;
if(!Number.isInteger(port)||port<1||port>65535)throw Error('FPT_STUDIO_PORT không hợp lệ.');
const url='http://127.0.0.1:'+port;
const noBrowser=process.argv.includes('--no-browser');
const lock=path.join(P.root,'var','studio-'+port+'.lock');
const pidFile=path.join(P.root,'var','studio-'+port+'.pid');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let running=null;
function probe(){
  running=null;
  return new Promise(resolve=>{
    const request=http.get(url+'/api/config',response=>{
      let body='';
      response.on('data',chunk=>{body+=chunk;if(body.length>65536)request.destroy();});
      response.on('end',()=>{
        try{
          const data=JSON.parse(body);
          running=data;
          resolve(data.output?.width===1080&&data.output?.height===1920&&typeof data.webMode==='boolean'?'studio':'occupied');
        }catch(_){resolve('occupied');}
      });
      response.on('error',()=>resolve('occupied'));
    });
    request.setTimeout(2000,()=>request.destroy());
    request.on('error',error=>resolve(error.code==='ECONNREFUSED'?'offline':'occupied'));
  });
}
function alive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}
function removeStaleLock(){
  try{
    const text=fs.readFileSync(lock,'utf8');
    const owner=text?JSON.parse(text):null;
    if(owner?.pid&&!alive(owner.pid))fs.unlinkSync(lock);
    else if(!owner&&Date.now()-fs.statSync(lock).mtimeMs>30000)fs.unlinkSync(lock);
  }catch(error){if(error.code!=='ENOENT')return;}
}
// After an update the old server is still in memory and would serve a mix of old and new files: replace it when idle.
async function retireOldVersion(){
  if(running?.version===VERSION)return false;
  if(process.argv.includes('--replace')){await delay(300);return true;}
  let owner=null;try{owner=JSON.parse(fs.readFileSync(pidFile,'utf8'));}catch(_){}
  let listener=0;
  try{listener=Number(execFileSync('powershell.exe',['-NoProfile','-Command','(Get-NetTCPConnection -LocalPort '+port+' -State Listen | Select-Object -First 1).OwningProcess'],{encoding:'utf8',windowsHide:true}));}catch(_){}
  if(!owner||owner.root!==P.root||owner.pid!==listener)throw Error('Cổng '+port+' đang chạy một bản Studio khác ('+(running?.version||'cũ')+'). Hãy đóng bản đó rồi mở lại.');
  if(running?.busy)throw Error('Bản Studio cũ đang xử lý video. Đợi xong rồi mở lại để dùng bản '+VERSION+'.');
  console.log('Cập nhật Studio '+(running?.version||'cũ')+' → '+VERSION+'…');
  process.kill(listener);
  for(let i=0;i<50&&await probe()!=='offline';i++)await delay(100);
  return true;
}
function openBrowser(){
  if(noBrowser)return Promise.resolve();
  return new Promise(resolve=>{
    // The visible browser is the app the user requested; PowerShell itself stays hidden.
    execFile('powershell.exe',['-NoProfile','-Command',"Start-Process -FilePath '"+url+"'"],
      {windowsHide:true},error=>{
        if(error)console.log('Mở trình duyệt tại '+url);resolve();
      });
  });
}
async function main(){
  if(process.env.FPT_WEB_MODE==='1'){
    throw Error('Dự án đang bật web mode. Dùng tên miền đã cấu hình; đặt FPT_WEB_MODE=0 để chạy local.');
  }
  fs.mkdirSync(P.logs,{recursive:true});
  let locked=false;
  const deadline=Date.now()+30000;
  try{
    while(Date.now()<deadline){
      const state=await probe();
      if(state==='studio'){
        if(await retireOldVersion())continue;
        console.log('Studio đã chạy. Mở '+url);
        await openBrowser();return;
      }
      if(state==='occupied')throw Error('Cổng '+port+' đang được ứng dụng khác sử dụng. Không khởi động thêm Studio.');
      try{
        const fd=fs.openSync(lock,'wx');
        fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);locked=true;break;
      }catch(error){
        if(error.code!=='EEXIST')throw error;
        removeStaleLock();await delay(200);
      }
    }
    if(!locked)throw Error('Studio đang khởi động. Vui lòng mở lại sau vài giây.');
    // A second launcher or npm start may have finished while the lock was acquired.
    const current=await probe();
    if(current==='studio'){console.log('Studio đã chạy. Mở '+url);await openBrowser();return;}
    if(current==='occupied')throw Error('Cổng '+port+' đang được ứng dụng khác sử dụng.');
    const logPath=path.join(P.logs,'studio-'+port+'.log'),errorPath=path.join(P.logs,'studio-'+port+'-error.log');
    const out=fs.openSync(logPath,'a'),err=fs.openSync(errorPath,'a');
    let child,launchError;
    try{
      child=spawn(process.execPath,[path.join(P.root,'src/server.js')],
        {cwd:P.root,env:{...process.env,FPT_LAUNCHED:'1'},detached:true,windowsHide:true,stdio:['ignore',out,err]});
      child.once('error',error=>{launchError=error;});
      child.unref();
    }finally{fs.closeSync(out);fs.closeSync(err);}
    if(child.pid)fs.writeFileSync(pidFile,JSON.stringify({pid:child.pid,port,root:P.root}));
    while(Date.now()<deadline){
      if(launchError)throw launchError;
      if(await probe()==='studio'){
        console.log('Studio đã sẵn sàng: '+url);
        console.log('Ứng dụng chạy nền. Có thể đóng cửa sổ này.');
        await openBrowser();return;
      }
      if(child.exitCode!==null)break;
      await delay(250);
    }
    throw Error('Chưa mở được Studio. Xem log: '+errorPath);
  }finally{if(locked&&fs.existsSync(lock))fs.unlinkSync(lock);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
