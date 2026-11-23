'use strict';
const PATHS=require('../config/paths');
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {execFile}=require('child_process');
const {createReferenceHighlights,speechBoundaries}=require('./editing/reference_editor');
const {resolveMediaPath}=require('./speech/subtitle_generator');
const {FPT_KNOWLEDGE_BASE,ensureRealBrollClips}=require('./broll/resource_catalog');
const {getBrollWarnings,assignBrollUpload,getBrollApiResponse,autoDetectReferenceBrolls,BROLL_USER_DIR}=require('./broll/broll_compositor');
const {matchHighlightRequest,createHighlights,PROFILES}=require('./editing/highlight_planner');
const {catalog:sfxCatalog}=require('./audio/sfx_director');
const {VIDEO_EXTENSIONS,AUDIO_EXTENSIONS,probeMediaAsync}=require('./media/media_profile');
const {TaskQueue}=require('./web/task_queue');
const {engineBundle}=require('./web/engine_bundle');
const {planForClient}=require('./pipeline/edit_plan');
const {normalizeClipWindows}=require('./pipeline/render_inputs');
const {ROOT:BASE_DIR}=require('./pipeline/base_cache');
const {BRAND_STYLES,HOOK_STYLES,MOTIONS}=require('./typography/brand_rules');
const {WEB,httpError,inside,confinedPath,sendJson,createGuard,readJson,saveUpload,serveStatic}=require('./web/http_utils');
const VERSION=require('../package.json').version;
const PORT=Number(process.env.FPT_STUDIO_PORT)||3457, HOST=process.env.FPT_STUDIO_HOST||'127.0.0.1';
if(WEB && !['127.0.0.1','::1'].includes(HOST))throw Error('Web mode phải nghe loopback phía sau HTTPS proxy.');
const ASSETS_DIR=PATHS.assets,VIDEO_DIR=PATHS.videos,VOICE_DIR=PATHS.voices,OUTPUT_DIR=PATHS.output;
for(const dir of [ASSETS_DIR,VIDEO_DIR,VOICE_DIR,OUTPUT_DIR,PATHS.logs])fs.mkdirSync(dir,{recursive:true});
ensureRealBrollClips();
const diskVersion=()=>{try{return JSON.parse(fs.readFileSync(path.join(PATHS.root,'package.json'),'utf8')).version;}catch(_){return VERSION;}};
// After an update the code on disk is newer than the one in memory: the launcher starts the new server on the same port.
function restartSelf(){
  setTimeout(()=>{
    require('child_process').spawn(process.execPath,[path.join(PATHS.root,'scripts/launch_studio.js'),'--no-browser','--replace'],{cwd:PATHS.root,detached:true,windowsHide:true,stdio:'ignore'}).unref();
    queue.close();server.closeAllConnections?.();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();
  },200);
}
// Fingerprint of a media file: size plus its first and last megabyte. Enough to recognise a clip that is already here.
const prints=new Map();
function fingerprint(file){
  const s=fs.statSync(file),key=file+'|'+s.size+'|'+s.mtimeMs;if(prints.has(key))return prints.get(key);
  const fd=fs.openSync(file,'r'),part=Math.min(1<<20,s.size),head=Buffer.alloc(part),tail=Buffer.alloc(part);
  try{fs.readSync(fd,head,0,part,0);fs.readSync(fd,tail,0,part,s.size-part);}finally{fs.closeSync(fd);}
  const value=s.size+'-'+crypto.createHash('sha256').update(head).update(tail).digest('hex').slice(0,32);prints.set(key,value);return value;
}
const guard=createGuard(),queue=new TaskQueue(),jobs=new Map(),shared=new Map();
// The same analysis requested twice (prewarm, then the button) runs once.
function once(key,start){
  if(shared.has(key))return shared.get(key);
  const work=start().finally(()=>shared.delete(key));shared.set(key,work);return work;
}
const voiceSpeedOf=payload=>Math.max(.5,Math.min(2,Number(payload.voiceSpeed)||1.25));
function autosub(payload,media){
  const task={...media,videoCount:media.videoFiles.length||1,voiceSpeed:voiceSpeedOf(payload),prompt:payload.prompt||'',originalScript:payload.originalScript||''};
  return once('autosub:'+JSON.stringify(task),()=>queue.enqueue('autosub',task));
}
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
const cutsOf=payload=>(Array.isArray(payload.clipWindows)?payload.clipWindows:[]).map(w=>Number(w.timelineStart)).filter(t=>t>0);
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
      if(route==='/studio/engine.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'private, no-cache'});return res.end(engineBundle());}
      if(route.startsWith('/studio/'))return serveStatic(req,res,confinedPath(path.join(PATHS.root,'public/studio'),decodeURIComponent(route.slice(8))));
      if(/^\/preview\/[0-9a-f]{24}\/proxy\.mp4$/.test(route))return serveStatic(req,res,confinedPath(BASE_DIR,route.slice(9)));
      if(route.startsWith('/output/'))return serveStatic(req,res,confinedPath(OUTPUT_DIR,decodeURIComponent(route.slice(8))));
      if(route.startsWith('/assets/'))return serveStatic(req,res,confinedPath(ASSETS_DIR,decodeURIComponent(route.slice(8))));
    }
    if(req.method==='GET'){
      if(route==='/api/config')return sendJson(res,200,{webMode:WEB,version:VERSION,busy:queue.busy,output:{width:1080,height:1920,fps:30},maxUploadMB:Number(process.env.FPT_MAX_UPLOAD_MB||2048)});
      if(route==='/api/version')return sendJson(res,200,{running:VERSION,installed:diskVersion(),busy:queue.busy,canRestart:!WEB&&Boolean(process.env.FPT_LAUNCHED)});
      if(route==='/api/styles')return sendJson(res,200,{highlight:BRAND_STYLES,hook:HOOK_STYLES,motion:MOTIONS});
      if(route==='/api/fpt-hub')return sendJson(res,200,{ok:true,hub:FPT_KNOWLEDGE_BASE});
      if(['/api/tech-sfx','/api/sfx-catalog'].includes(route))
        return sendJson(res,200,{ok:true,...sfxCatalog()});
      if(['/api/bgm-list','/api/bgm-library'].includes(route)){
        const directory=path.join(ASSETS_DIR,'custom-music');
        const custom=fs.existsSync(directory)?fs.readdirSync(directory).filter(f=>AUDIO_EXTENSIONS.test(f)).map(f=>({
          id:'custom_'+f,name:f,type:'custom',file:f,url:'/assets/custom-music/'+encodeURIComponent(f)})):[];
        const builtIn=['upbeat','bright','fresh','synth','chill'].map(id=>({id,name:id,type:'preset',file:'music-presets/bgm_fpt_'+id+'.mp3',url:'/assets/music-presets/bgm_fpt_'+id+'.mp3'}));
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
          file=>probeMediaAsync(file,isVideo?'video':'audio'));
        if(isBroll&&topic)assignBrollUpload(topic,uploaded.fileName);
        return sendJson(res,200,{ok:true,...uploaded,kind,url:'/assets/'+path.relative(ASSETS_DIR,dir).replace(/\\/g,'/')+'/'+encodeURIComponent(uploaded.fileName)});
      }
      if(route==='/api/crawl-brolls'){
        const results=await queue.enqueue('crawl-brolls',{topic:url.searchParams.get('topic')||'all'});
        return sendJson(res,200,{ok:true,crawled:results.filter(r=>r.ok!==false).length,results,catalog:getBrollApiResponse()});
      }
      if(route==='/api/crawl-fpt')return sendJson(res,200,{ok:true,hub:await queue.enqueue('crawl-fpt',{})});
      if(route==='/api/upload-known'){
        const ask=await readJson(req),list=Array.isArray(ask.prints)?ask.prints.slice(0,100).map(String):[],known={};
        if(list.length)for(const f of fs.readdirSync(VIDEO_DIR).filter(f=>VIDEO_EXTENSIONS.test(f))){const full=path.join(VIDEO_DIR,f),size=fs.statSync(full).size;if(list.some(p=>p.startsWith(size+'-'))){const p=fingerprint(full);if(list.includes(p))known[p]=f;}}
        return sendJson(res,200,{ok:true,known});
      }
      if(route==='/api/restart'){
        if(WEB||!process.env.FPT_LAUNCHED)throw httpError(403,'Hãy mở lại Studio bằng start_studio.cmd.');
        if(queue.busy)throw httpError(409,'Studio đang xử lý video. Đợi xong rồi cập nhật.');
        sendJson(res,200,{ok:true});restartSelf();return;
      }
      const payload=await readJson(req);
      validSubtitles(payload);
      if(route==='/api/autosub'){
        const media=selectedMedia(payload);
        if(!media.videoFiles.length&&!media.voiceFiles.length)throw httpError(400,'Hãy chọn video hoặc voice để tạo Sub text.');
        return sendJson(res,200,addBrolls({...await autosub(payload,media)},payload));
      }
      if(route==='/api/prewarm'){
        // Starts listening as soon as the clips are chosen, so the Sub text button answers at once.
        const media=selectedMedia(payload);
        if(media.videoFiles.length&&!queue.busy)autosub(payload,media).catch(()=>{});
        return sendJson(res,200,{ok:true});
      }
      if(route==='/api/plan'||route==='/api/prepare'){
        const media=selectedMedia(payload);
        if(!media.videoFiles.length||!Array.isArray(payload.clipWindows)||!payload.clipWindows.length)throw httpError(400,'Cần video và khoảng cắt.');
        const windows=normalizeClipWindows(payload.clipWindows,media.videoFiles,voiceSpeedOf(payload)),job={...payload,...media};
        if(route==='/api/plan')return sendJson(res,200,{ok:true,plan:planForClient(job,windows)});
        const plan=planForClient(job,windows);
        const task={windows,voiceSpeed:voiceSpeedOf(payload),fx:payload.fx||{},brolls:plan.brolls,projectName:payload.projectName,bgm:{disableBgm:payload.disableBgm,bgmMode:payload.bgmMode,customBgm:payload.customBgm,bgmFromStart:payload.bgmFromStart}};
        const preview=await once('prepare:'+JSON.stringify(task),()=>queue.enqueue('prepare',task));
        return sendJson(res,200,{ok:true,preview});
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
        const keywords=createReferenceHighlights(subs,total,{cuts:cutsOf(payload)});return sendJson(res,200,{ok:true,count:keywords.length,keywords});
      }
      if(['/api/autohighlight','/api/generate-highlights'].includes(route)){
        const subs=payload.subtitles||[],total=Number(payload.totalDuration)||(subs.length?Number(subs.at(-1).end||24)+2:24);
        const phrases=payload.customPhrases||payload.phrases||payload.textList||payload.text;
        const hasPhrases=phrases&&(Array.isArray(phrases)?phrases.length:String(phrases).trim().length);
        const result=hasPhrases?matchHighlightRequest(phrases,subs,total):{highlights:createReferenceHighlights(subs,total,{cuts:cutsOf(payload)}),unmatched:[]};
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
server.listen(PORT,HOST,()=>{
  console.log('FPT Video Studio: http://localhost:'+PORT+' ('+(WEB?'web':'local')+')');
  // Fonts and sound measurements are loaded before the first edit asks for them.
  setTimeout(()=>{try{sfxCatalog();require('./typography/kinetic_overlay').buildCues({totalDur:1,highlights:[{text:'FPT',typo:'fpt_orange_block',start:0,dur:1,y:350,scale:1.4}]});}catch(error){console.warn(error.message);}},300).unref();
});
function shutdown(){queue.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
