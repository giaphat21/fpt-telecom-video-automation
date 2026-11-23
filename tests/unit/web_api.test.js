'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {spawn}=require('child_process');
const P=require('../../config/paths'),{confinedPath}=require('../../src/web/http_utils');
test('Path confinement blocks encoded Windows traversal, sibling roots and drive paths',()=>{
  for(const value of ['../assets-private/secret','..\\..\\.env','C:\\Windows\\win.ini','x:secret'])
    assert.throws(()=>confinedPath(P.assets,value));
  assert.equal(confinedPath(P.assets,'source-videos/presenter_take_01.mp4'),path.join(P.videos,'presenter_take_01.mp4'));
});
test('Web API requires auth, rejects cross-site writes, validates uploads and streams byte ranges',{timeout:60000},async()=>{
  const salt=crypto.randomBytes(16).toString('hex'),password=crypto.randomBytes(24).toString('hex');
  const hash='scrypt:'+salt+':'+crypto.scryptSync(password,salt,32).toString('hex');
  const base='http://127.0.0.1:3469',authorization='Basic '+Buffer.from('admin:'+password).toString('base64');
  const child=spawn(process.execPath,[path.join(P.root,'src/server.js')],{cwd:require('os').tmpdir(),windowsHide:true,
    env:{...process.env,FPT_WEB_MODE:'1',FPT_STUDIO_PORT:'3469',FPT_PUBLIC_URL:'https://studio.example.com',FPT_ADMIN_PASSWORD_HASH:hash,FPT_MAX_UPLOAD_MB:'1'},
    stdio:['ignore','pipe','pipe']});
  let logs='',uploaded;
  child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  try{
    for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch(_){}await new Promise(r=>setTimeout(r,100));}
    assert.equal((await fetch(base+'/')).status,401,logs);
    assert.equal((await fetch(base+'/api/media')).status,401);
    assert.equal((await fetch(base+'/assets/source-videos/presenter_take_01.mp4')).status,401);
    const headers={authorization,'Content-Type':'application/json'};
    const post=(route,data,extra={})=>fetch(base+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
    assert.equal((await post('/api/render',{videoFiles:['C:\\Windows\\win.ini']})).status,403);
    assert.equal((await post('/api/open-folder',{})).status,403);
    assert.equal((await post('/api/scan-keywords',{}, {Origin:'https://evil.example'})).status,403);
    assert.equal((await post('/api/autosub',{})).status,400);
    assert.equal((await post('/api/creative-plan',{subtitles:'invalid'})).status,400);
    const oversized=await post('/api/scan-keywords',{text:'x'.repeat(2*1024*1024)});
    assert.equal(oversized.status,413);
    assert.equal((await fetch(base+'/assets/..%5c..%5c.env',{headers:{authorization}})).status,403);
    const range=await fetch(base+'/assets/source-videos/presenter_take_01.mp4',{headers:{authorization,Range:'bytes=0-99'}});
    assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
    assert.match(range.headers.get('content-range'),/^bytes 0-99\//);
    const upload=(name,data)=>fetch(base+'/api/upload?kind=video&name='+encodeURIComponent(name),{method:'POST',headers:{authorization},body:data});
    assert.equal((await upload('payload.html','<script>bad</script>')).status,415);
    assert.equal((await upload('broken.mp4','not media')).status,500);
    const response=await upload('qa-silent.mp4',fs.readFileSync(path.join(__dirname, '../fixtures/silent_video.mp4')));
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
    uploaded=path.join(P.videos,result.fileName);assert.ok(fs.existsSync(uploaded));assert.equal(result.metadata.hasAudio,false);
    assert.equal((await upload('large.mp4',Buffer.alloc(1024*1024+1))).status,413);
    assert.equal(fs.readdirSync(P.videos).filter(f=>f.endsWith('.upload')).length,0);
    // Real Whisper work must not block the HTTP event loop.
    const sub=post('/api/autosub',{videoFiles:['presenter_take_01.mp4']});
    await new Promise(r=>setTimeout(r,500));
    const started=Date.now();
    assert.equal((await fetch(base+'/api/media',{headers:{authorization},signal:AbortSignal.timeout(1500)})).status,200);
    assert.ok(Date.now()-started<1500);
    const subResult=await(await sub).json();assert.ok(subResult.subtitles?.length,JSON.stringify(subResult));
  }finally{
    if(uploaded&&fs.existsSync(uploaded))fs.unlinkSync(uploaded);
    if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
  }
});
