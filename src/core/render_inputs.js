const PATHS=require('../../config/paths.js');

'use strict';
const fs=require('fs');
const {resolveMediaPath,getDuration}=require('./subtitle_generator');
function normalizeClipWindows(windows,videoFiles,speed=1.25) {
  const durationByFile=new Map();
  let cursor=0;
  return windows.map((win,index)=>{
    const fileRef=win.fileRef||win.srcPath||videoFiles[index];
    if(!fileRef)throw new Error('Thiếu video nguồn ở cảnh '+(index+1)+'. Hãy chọn lại video.');
    const srcPath=resolveMediaPath(fileRef);
    if(!srcPath||!fs.existsSync(srcPath))throw new Error('Không tìm thấy video: '+fileRef);
    if(!durationByFile.has(srcPath)) durationByFile.set(srcPath,getDuration(srcPath));
    const rawDur=durationByFile.get(srcPath);
    const trimStart=Number(win.trimStart??0), trimEnd=Math.min(rawDur,Number(win.trimEnd??rawDur));
    if(!Number.isFinite(trimStart)||!Number.isFinite(trimEnd)||trimStart<0||trimEnd<=trimStart)
      throw new Error('Khoảng cắt không hợp lệ ở video '+fileRef);
    const timelineDur=Math.round((trimEnd-trimStart)/speed*1000)/1000;
    const result={...win,fileRef,srcPath,rawDur,trimStart,trimEnd,timelineStart:Math.round(cursor*1000)/1000,timelineDur};
    cursor+=timelineDur;
    return result;
  });
}
async function mapConcurrent(items,limit,task) {
  let next=0,error=null;const output=new Array(items.length);
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(!error){
      const index=next++;if(index>=items.length)return;
      try{output[index]=await task(items[index],index);}catch(e){error=e;return;}
    }
  }));
  if(error)throw error;
  return output;
}
module.exports={normalizeClipWindows,mapConcurrent};
