'use strict';
// Separates the presenter from the background so a split-screen B-roll can sit behind them.
// Model: MODNet portrait matting (runtime/models/modnet.onnx, Apache-2.0, from Hugging Face Xenova/modnet), run with
// onnxruntime-node on the GPU (DirectML) when there is one, otherwise on the CPU.
// Output: a VP9 WebM with alpha (white where the person is), cached per span of the base video. The Studio preview
// draws it in the browser and the export reads the same file, so both cut the presenter out identically.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const PATHS=require('../../config/paths.js');
const MODEL=path.join(PATHS.root,'runtime','models','modnet.onnx');
const CACHE=path.join(PATHS.root,'var','cache','matte');
const MW=320,MH=576,OW=540,OH=960,FPS=30,VERSION='m3';
let sessionPromise=null,provider=null;
const available=()=>fs.existsSync(MODEL);
function session(){
  if(!sessionPromise)sessionPromise=(async()=>{
    const ort=require('onnxruntime-node');
    for(const executionProviders of [['dml'],['cpu']]){try{const s=await ort.InferenceSession.create(MODEL,{executionProviders});provider=executionProviders[0];return {s,ort};}catch(_){}}
    throw new Error('Không nạp được model tách nền.');
  })().catch(e=>{sessionPromise=null;throw e;});
  return sessionPromise;
}
// Whole seconds around the span, so moving a B-roll edge a little reuses the same matte.
const range=(start,end)=>({from:Math.max(0,Math.floor(start)),to:Math.ceil(end+.001)});
function keyFor(video,from,to){const st=fs.statSync(video);return crypto.createHash('sha1').update([VERSION,path.resolve(video),st.size,Math.round(st.mtimeMs),from,to].join('|')).digest('hex').slice(0,24);}
const pending=new Map();
let line=Promise.resolve();
// One matte at a time: the GPU is shared with the render.
const rest=()=>new Promise(r=>setTimeout(r,120));
const inTurn=job=>{const run=line.then(rest).then(job,job);line=run.catch(()=>{});return run;};
// The matte if it is already made, without making it.
function cachedSpan(video,start,end){const {from,to}=range(start,end),key=keyFor(video,from,to),file=path.join(CACHE,key+'.webm');return fs.existsSync(file)?{file,name:key+'.webm',start:from,end:to}:null;}
// Returns {file,name,start} where start is the video time of the matte's first frame.
async function matteSpan(video,start,end){
  const {from,to}=range(start,end),key=keyFor(video,from,to),file=path.join(CACHE,key+'.webm');
  if(fs.existsSync(file))return {file,name:key+'.webm',start:from,end:to};
  if(!pending.has(key))pending.set(key,inTurn(()=>fs.existsSync(file)?null:buildApart(video,from,to,file)).finally(()=>pending.delete(key)));
  await pending.get(key);return {file,name:key+'.webm',start:from,end:to};
}
async function build(video,from,to,file){
  fs.mkdirSync(CACHE,{recursive:true});
  const {s,ort}=await session(),temp=file+'.'+process.pid+'.tmp.webm';
  const decode=spawn(PATHS.ffmpeg,['-v','error','-threads','2','-ss',String(from),'-t',String(to-from),'-i',video,'-an','-vf','fps='+FPS+',scale='+MW+':'+MH+':flags=area','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const encode=spawn(PATHS.ffmpeg,['-y','-v','error','-f','rawvideo','-pix_fmt','gray','-s',MW+'x'+MH,'-r',String(FPS),'-i','pipe:0',
    '-f','lavfi','-i','color=c=white:s='+OW+'x'+OH+':r='+FPS+':d='+(to-from),
    '-filter_complex','[0:v]scale='+OW+':'+OH+':flags=bicubic,format=gray[a];[1:v][a]alphamerge,format=yuva420p[v]','-map','[v]','-shortest',
    '-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-b:v','0','-crf','28','-deadline','realtime','-cpu-used','8','-threads','2',temp],{stdio:['pipe','ignore','pipe'],windowsHide:true});
  let err='';for(const c of [decode,encode]){c.stderr.on('data',d=>{err=(err+d).slice(-1500);});
    // background work: the person editing in the Studio always comes first
    try{require('os').setPriority(c.pid,require('os').constants.priority.PRIORITY_BELOW_NORMAL);}catch(_){}}
  const done=c=>new Promise((res,rej)=>{c.once('error',rej);c.once('close',code=>code===0?res():rej(new Error('FFmpeg tách nền ('+code+'): '+err)));});
  const decoded=done(decode),encoded=done(encode);
  const size=MW*MH*3,input=new Float32Array(3*MW*MH),out=Buffer.alloc(MW*MH);let prev=null,buf=Buffer.alloc(0);
  const frame=async raw=>{
    for(let i=0,p=0;i<MW*MH;i++,p+=3){input[i]=raw[p]/127.5-1;input[i+MW*MH]=raw[p+1]/127.5-1;input[i+2*MW*MH]=raw[p+2]/127.5-1;}
    const r=await s.run({[s.inputNames[0]]:new ort.Tensor('float32',input,[1,3,MH,MW])}),m=r[s.outputNames[0]].data;
    // a little memory between frames keeps the edge from flickering
    if(!prev)prev=Float32Array.from(m);else for(let i=0;i<m.length;i++)prev[i]=prev[i]*.35+m[i]*.65;
    for(let i=0;i<out.length;i++)out[i]=Math.max(0,Math.min(255,Math.round(prev[i]*255)));
    if(!encode.stdin.write(Buffer.from(out)))await new Promise(r=>encode.stdin.once('drain',r));
  };
  for await(const chunk of decode.stdout){
    buf=buf.length?Buffer.concat([buf,chunk]):chunk;
    while(buf.length>=size){const raw=buf.subarray(0,size);await frame(raw);buf=buf.subarray(size);}
  }
  encode.stdin.end();await decoded;await encoded;
  fs.renameSync(temp,file);
}
// Transitions keep the presenter sharp only where the matte is quick to make (a GPU); on a CPU it would slow every preview.
async function gpu(){if(!available())return false;try{await session();}catch(_){return false;}return provider==='dml';}
// The window around a picture cut that a transition can cover; preview and export ask for the same one.
const cutRange=cut=>({start:Math.max(0,cut-.35),end:cut+.6});
// The model runs in its own low-priority process, so the Studio's own work (preview, timeline) is never held up.
// One helper process, started once and kept: it loads the model a single time and makes mattes one after another at
// low priority, so the Studio's own work (preview, timeline, export) is never held up and no model is loaded twice.
const {fork}=require('child_process');
let helper=null,nextJob=0;const jobs=new Map();
function startHelper(){
  const child=fork(__filename,['--serve'],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
  try{require('os').setPriority(child.pid,require('os').constants.priority.PRIORITY_BELOW_NORMAL);}catch(_){}
  let err='';child.stderr.on('data',d=>{err=(err+d).slice(-1500);});
  child.on('message',m=>{const j=jobs.get(m.id);if(!j)return;jobs.delete(m.id);m.ok?j.resolve():j.reject(new Error(m.error));});
  const gone=()=>{if(helper===child)helper=null;for(const [id,j] of jobs){jobs.delete(id);j.reject(new Error('Tách nền dừng giữa chừng. '+err));}};
  child.once('exit',gone);child.once('error',gone);
  return child;
}
// While it has nothing to do, the helper must not keep the process that started it alive (task workers exit when done).
function hold(on){if(!helper)return;try{if(on){helper.ref();helper.channel?.ref();helper.stderr?.ref?.();}else{helper.unref();helper.channel?.unref();helper.stderr?.unref?.();}}catch(_){}}
function buildApart(video,from,to,file){
  if(!helper)helper=startHelper();
  hold(true);
  return new Promise((resolve,reject)=>{const id=++nextJob;jobs.set(id,{resolve,reject});helper.send({id,video,from,to,file});})
    .finally(()=>{if(!jobs.size)hold(false);});
}
process.once('exit',()=>{try{helper?.kill();}catch(_){}});
if(require.main===module&&process.argv[2]==='--serve'){
  // jobs arrive in order; the parent already sends them one at a time
  process.on('disconnect',()=>process.exit(0));
  process.on('message',async m=>{try{await build(m.video,m.from,m.to,m.file);process.send({id:m.id,ok:true});}catch(e){process.send({id:m.id,ok:false,error:e.message});}});
}
module.exports={cachedSpan,gpu,cutRange,available,matteSpan,MATTE_DIR:CACHE,MATTE_SIZE:{width:OW,height:OH}};
