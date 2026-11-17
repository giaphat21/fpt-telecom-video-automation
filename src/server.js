'use strict';
const PATHS=require('../config/paths');
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {execFile}=require('child_process');
const {createReferenceHighlights,speechBoundaries}=require('./core/reference_editor');
const {resolveMediaPath}=require('./core/subtitle_generator');
const {FPT_KNOWLEDGE_BASE,ensureRealBrollClips}=require('./core/resource_catalog');
const {getBrollWarnings,assignBrollUpload,getBrollApiResponse,autoDetectReferenceBrolls,BROLL_USER_DIR}=require('./core/broll_compositor');
const {matchHighlightRequest,createHighlights,PROFILES}=require('./core/highlight_planner');
const {VIDEO_EXTENSIONS,AUDIO_EXTENSIONS}=require('./core/media_profile');
const {TaskQueue}=require('./web/task_queue');
const {WEB,httpError,inside,confinedPath,sendJson,createGuard,readJson,saveUpload,serveStatic}=require('./web/http_utils');
const PORT=Number(process.env.FPT_STUDIO_PORT)||3457, HOST=process.env.FPT_STUDIO_HOST||'127.0.0.1';
if(WEB && !['127.0.0.1','::1'].includes(HOST))throw Error('Web mode phải nghe loopback phía sau HTTPS proxy.');
const ASSETS_DIR=PATHS.assets,VIDEO_DIR=PATHS.videos,VOICE_DIR=PATHS.voices,OUTPUT_DIR=PATHS.output;
for(const dir of [ASSETS_DIR,VIDEO_DIR,VOICE_DIR,OUTPUT_DIR,PATHS.logs])fs.mkdirSync(dir,{recursive:true});
ensureRealBrollClips();
const guard=createGuard(),queue=new TaskQueue(),jobs=new Map();
function jsonFile(file,fallback){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;}
function selectedMedia(payload){
  const list=(plural,singular,alias)=>Array.isArray(payload[plural])&&payload[plural].length?payload[plural]:
    payload[singular]?[payload[singular]]:payload[alias]?[payload[alias]]:[];
  const videoFiles=list('videoFiles','video','videoFile'),voiceFiles=list('voiceFiles','voice','voiceFile');
  if(videoFiles.length>100||voiceFiles.length>100)throw httpError(400,'Tối đa 100 tệp trong một lượt.');
  if(WEB){
    const check=file=>{
      if(typeof file!=='string'||file.length>1024)throw httpError(400,'Tên media không hợp lệ.');
      const resolved=resolveMediaPath(file);
      if(!resolved||!fs.existsSync(resolved)||!fs.statSync(resolved).isFile()||
        !inside(fs.realpathSync(ASSETS_DIR),fs.realpathSync(resolved)))throw httpError(403,'Chỉ dùng media trong thư viện hoặc tệp đã tải lên.');
    };
    [...videoFiles,...voiceFiles].forEach(check);
    for(const win of payload.clipWindows||[])check(win.fileRef||win.srcPath);
    if(payload.customBgm){
      const file=path.isAbsolute(payload.customBgm)?payload.customBgm:path.join(ASSETS_DIR,'custom-music',path.basename(payload.customBgm));
      check(file);payload.customBgm=file;
    }
    for(const broll of payload.brollCutaways||[])if(broll.file)check(broll.file);
    const sfx=[...(payload.highlights||[]).map(h=>h.sfx),payload.introSfx,payload.outroSfx].filter(Boolean);
    if(sfx.some(s=>typeof s!=='string'||/[\\/:]/.test(s)||s.includes('..')))throw httpError(400,'SFX không hợp lệ.');
  }
  return {videoFiles,voiceFiles};
}
function validSubtitles(payload){
  if(payload.subtitles!==undefined && !Array.isArray(payload.subtitles))throw httpError(400,'Sub text không hợp lệ.');
}
function addBrolls(result,payload){
  const total=Number(result.totalDuration)||(result.subtitles?.at(-1)?.end||0);
  const bounds=speechBoundaries(result.subtitles||[],total);
  result.detectedBrolls=payload.autoBroll===false?[]:autoDetectReferenceBrolls(result.subtitles||[],bounds.hookDur,bounds.outroStart,payload.allowedBrollIds??null);
  result.brollWarnings=getBrollWarnings(result.subtitles||[]);return result;
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost:'+PORT),route=url.pathname;
    if(route==='/healthz' && req.method==='GET')return sendJson(res,200,{ok:true});
    if(!guard(req,res))return;
    if(['GET','HEAD'].includes(req.method)){
      if(route==='/')return serveStatic(req,res,path.join(PATHS.root,'public/index.html'));
      if(route.startsWith('/output/'))return serveStatic(req,res,confinedPath(OUTPUT_DIR,decodeURIComponent(route.slice(8))));
      if(route.startsWith('/assets/'))return serveStatic(req,res,confinedPath(ASSETS_DIR,decodeURIComponent(route.slice(8))));
    }
    if(req.method==='GET'){
      if(route==='/api/config')return sendJson(res,200,{webMode:WEB,output:{width:1080,height:1920,fps:30},maxUploadMB:Number(process.env.FPT_MAX_UPLOAD_MB||2048)});
      if(route==='/api/fpt-hub')return sendJson(res,200,{ok:true,hub:FPT_KNOWLEDGE_BASE});
      if(['/api/tech-sfx','/api/sfx-catalog'].includes(route))
        return sendJson(res,200,{ok:true,...jsonFile(path.join(ASSETS_DIR,'sfx/sfx_manifest.json'),{count:0,sfx:[]})});
      if(['/api/bgm-list','/api/bgm-library'].includes(route)){
        const directory=path.join(ASSETS_DIR,'custom-music');
        const custom=fs.existsSync(directory)?fs.readdirSync(directory).filter(f=>AUDIO_EXTENSIONS.test(f)).map(f=>({
          id:'custom_'+f,name:f,type:'custom',file:f,url:'/assets/custom-music/'+encodeURIComponent(f)})):[];
        const builtIn=['upbeat','bright','fresh','synth','chill'].map(id=>({id,name:id,type:'preset',file:'bgm_fpt_'+id+'.mp3',url:'/assets/bgm_fpt_'+id+'.mp3'}));
        return sendJson(res,200,{ok:true,builtIn,custom});
      }
      if(route==='/api/brolls')return sendJson(res,200,{ok:true,...jsonFile(path.join(ASSETS_DIR,'broll-images/broll_manifest.json'),{count:0,brolls:[]})});
      if(route==='/api/broll-catalog')return sendJson(res,200,getBrollApiResponse());
      if(route==='/api/media')return sendJson(res,200,{
        videos:fs.readdirSync(VIDEO_DIR).filter(f=>VIDEO_EXTENSIONS.test(f)),
        voices:fs.readdirSync(VOICE_DIR).filter(f=>AUDIO_EXTENSIONS.test(f))});
      if(route.startsWith('/api/status/')){
        const job=jobs.get(route.slice('/api/status/'.length));
        if(!job)throw httpError(404,'Không tìm thấy tác vụ. Máy chủ có thể đã khởi động lại.');
        return sendJson(res,200,job);
      }
    }
    if(req.method==='POST'){
      if(route==='/api/open-folder' && WEB)throw httpError(403,'Bản web tải MP4 trực tiếp về máy của bạn.');
      if(route==='/api/upload'||route==='/api/upload-broll'){
        const isBroll=route.endsWith('upload-broll'),kind=isBroll?'broll':url.searchParams.get('kind');
        if(!['video','voice','bgm','broll'].includes(kind))throw httpError(400,'Loại media không hợp lệ.');
        const topic=url.searchParams.get('topic');
        if(topic&&!getBrollApiResponse().brolls.some(b=>b.id===topic&&!b.isUserUpload))throw httpError(400,'Chủ đề B-roll không hợp lệ.');
        const dir=isBroll?BROLL_USER_DIR:kind==='voice'?VOICE_DIR:kind==='bgm'?path.join(ASSETS_DIR,'custom-music'):VIDEO_DIR;
        const isVideo=kind==='video'||isBroll;
        const uploaded=await saveUpload(req,dir,url.searchParams.get('name')||'',isVideo?VIDEO_EXTENSIONS:AUDIO_EXTENSIONS,
          file=>queue.enqueue('probe',{file,kind:isVideo?'video':'audio'}));
        if(isBroll&&topic)assignBrollUpload(topic,uploaded.fileName);
        return sendJson(res,200,{ok:true,...uploaded,kind,url:'/assets/'+path.relative(ASSETS_DIR,dir).replace(/\\/g,'/')+'/'+encodeURIComponent(uploaded.fileName)});
      }
      if(route==='/api/crawl-brolls'){
        const results=await queue.enqueue('crawl-brolls',{topic:url.searchParams.get('topic')||'all'});
        return sendJson(res,200,{ok:true,crawled:results.filter(r=>r.ok!==false).length,results,catalog:getBrollApiResponse()});
      }
      if(route==='/api/crawl-fpt')return sendJson(res,200,{ok:true,hub:await queue.enqueue('crawl-fpt',{})});
      const payload=await readJson(req);
      validSubtitles(payload);
      if(route==='/api/autosub'){
        const media=selectedMedia(payload);
        if(!media.videoFiles.length&&!media.voiceFiles.length)throw httpError(400,'Hãy chọn video hoặc voice để tạo Sub text.');
        const result=await queue.enqueue('autosub',{...media,videoCount:media.videoFiles.length||1,
          voiceSpeed:Math.max(.5,Math.min(2,Number(payload.voiceSpeed)||1.25)),prompt:payload.prompt||'',originalScript:payload.originalScript||''});
        return sendJson(res,200,addBrolls(result,payload));
      }
      if(route==='/api/detect-brolls'){
        const subs=payload.subtitles||[],total=Number(payload.totalDuration)||Math.max(0,...subs.map(s=>Number(s.end)||0));
        const hookDur=Number(payload.hookDur)||3.5,outro=payload.outroStart??speechBoundaries(subs,total).outroStart;
        const detected=autoDetectReferenceBrolls(subs,hookDur,outro,payload.allowedBrollIds??null);
        return sendJson(res,200,{ok:true,count:detected.length,brolls:detected,diagnostics:getBrollWarnings(subs)});
      }
      if(route==='/api/creative-plan'){
        if(!Array.isArray(payload.subtitles))throw httpError(400,'Cần phụ đề có timestamp từng từ.');
        const total=Number(payload.totalDuration)||Math.max(0,...payload.subtitles.map(s=>Number(s.end)||0));
        const plan=createHighlights(payload.subtitles,total,{profile:payload.profile,seed:payload.seed}),bounds=speechBoundaries(payload.subtitles,total);
        const brolls=payload.autoBroll===false?[]:autoDetectReferenceBrolls(payload.subtitles,bounds.hookDur,bounds.outroStart,payload.allowedBrollIds??null);
        return sendJson(res,200,{ok:true,...plan,diagnostics:[...plan.diagnostics,...getBrollWarnings(payload.subtitles)],brolls,boundaries:bounds,profiles:PROFILES});
      }
      if(route==='/api/scan-keywords'){
        const subs=payload.subtitles||[],total=Number(payload.totalDuration)||Math.max(0,...subs.map(s=>Number(s.end)||0));
        const keywords=createReferenceHighlights(subs,total);return sendJson(res,200,{ok:true,count:keywords.length,keywords});
      }
      if(['/api/autohighlight','/api/generate-highlights'].includes(route)){
        const subs=payload.subtitles||[],total=Number(payload.totalDuration)||(subs.length?Number(subs.at(-1).end||24)+2:24);
        const phrases=payload.customPhrases||payload.phrases||payload.textList||payload.text;
        const hasPhrases=phrases&&(Array.isArray(phrases)?phrases.length:String(phrases).trim().length);
        const result=hasPhrases?matchHighlightRequest(phrases,subs,total):{highlights:createReferenceHighlights(subs,total),unmatched:[]};
        if(result.unmatched.length)return sendJson(res,422,{ok:false,requestedCount:result.requestedCount,unmatched:result.unmatched,
          error:'Chưa tạo đủ các cụm. Không thay danh sách hiện tại. Các dòng chưa khớp:\n'+result.unmatched.map(p=>p.line+'. '+p.text).join('\n')});
        return sendJson(res,200,{ok:true,count:result.highlights.length,requestedCount:result.requestedCount??result.highlights.length,
          shortCount:result.highlights.filter(h=>h.shortDuration).length,highlights:result.highlights});
      }
      if(route==='/api/render'){
        if(queue.busy&&queue.waiting>=queue.maxWaiting)throw httpError(503,'Hàng đợi đang đầy. Vui lòng thử lại sau.');
        const media=selectedMedia(payload);
        if(!media.videoFiles.length)throw httpError(400,'Hãy chọn video trước khi xuất.');
        const jobId=crypto.randomUUID(),job={...payload,...media};
        if(WEB){
          job.projectName=(String(job.projectName||'FPT_Video').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64))+'_'+jobId.slice(0,8);
          job.exportCapcut=false;job.useBranding=true;
        }
        const state={status:'queued',progress:0,progressLabel:'Đang chờ xử lý...',logs:[],result:null,error:null};
        if(jobs.size>=100){for(const [id,old]of jobs){if(['done','error'].includes(old.status)){jobs.delete(id);break;}}}
        jobs.set(jobId,state);
        const completion=queue.enqueue('render',job,event=>{
          if(event.type==='started'){state.status='running';state.progress=2;state.progressLabel='Đang khởi tạo...';}
          if(event.type==='log'){state.logs.push(event.message);if(state.logs.length>200)state.logs.shift();}
          if(event.type==='progress'){state.progress=Math.max(state.progress,Math.min(100,Math.round(event.progress)));state.progressLabel=event.label||state.progressLabel;}
        });
        completion.then(result=>{
          state.status='done';state.progress=100;state.progressLabel='Hoàn tất 100%!';
          state.result={...result,videoUrl:'/output/'+result.safeName+'/'+result.safeName+'.mp4',
            thumbUrl:'/output/'+result.safeName+'/'+result.safeName+'_thumbnail.jpg'};
        }).catch(error=>{state.status='error';state.error=error.message;state.logs.push('ERROR: '+error.message);});
        return sendJson(res,200,{ok:true,jobId});
      }
      if(route==='/api/open-folder'){
        let target=OUTPUT_DIR;
        if(payload.safeName){
          const directory=confinedPath(OUTPUT_DIR,String(payload.safeName));
          const video=confinedPath(directory,String(payload.safeName)+'.mp4');
          if(fs.existsSync(video))target=video;else if(fs.existsSync(directory))target=directory;
        }
        execFile('explorer.exe',fs.statSync(target).isFile()?['/select,',target]:[target],{windowsHide:true},()=>{});
        return sendJson(res,200,{ok:true,path:target});
      }
    }
    throw httpError(404,'Không tìm thấy.');
  }catch(error){sendJson(res,error.status||500,{ok:false,error:error.message});}
});
server.requestTimeout=30*60*1000;server.headersTimeout=60000;server.keepAliveTimeout=5000;
server.listen(PORT,HOST,()=>console.log('FPT Video Studio: http://localhost:'+PORT+' ('+(WEB?'web':'local')+')'));
function shutdown(){queue.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
