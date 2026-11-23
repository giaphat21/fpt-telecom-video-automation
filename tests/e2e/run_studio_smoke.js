'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const P=require('../../config/paths');
const port=process.env.FPT_TEST_PORT||'3468';
const env={...process.env,FPT_STUDIO_PORT:port,FPT_OUTPUT_DIR:path.join(P.qa,'rendered')};
const server=spawn(process.execPath,[path.join(P.root,'src/server.js')],{cwd:os.tmpdir(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='';
server.stdout.on('data',b=>{logs+=b;});
server.stderr.on('data',b=>{logs+=b;});
(async()=>{
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Studio startup timeout: '+logs)),20000);
   server.once('error',e=>{clearTimeout(timer);reject(e);});
   server.once('exit',code=>{clearTimeout(timer);reject(Error('Studio exited '+code+': '+logs));});
   server.stdout.on('data',()=>{if(logs.includes('localhost:'+port)){clearTimeout(timer);resolve();}});
  });
  const only=process.argv[2],tests=['ui_render_direct_smoke.js','ui_timeline_smoke.js','ui_long_smoke.js','ui_studio_smoke.js','ui_subtext_smoke.js','ui_highlight_count_smoke.js','ui_render_mandatory_smoke.js'].filter(t=>!only||t.includes(only));
  for(const name of tests){
   const test=spawn(process.execPath,[path.join(__dirname,name)],{cwd:os.tmpdir(),env,windowsHide:true,stdio:'inherit'});
   const code=await new Promise((resolve,reject)=>{test.once('error',reject);test.once('exit',resolve);});
   if(code!==0)throw Error(name+' failed ('+code+')');
  }
  if(only&&!'ui_render_direct_smoke.js'.includes(only))return;
  const quality=JSON.parse(fs.readFileSync(path.join(env.FPT_OUTPUT_DIR,'QA_FPT_Direct/quality_report.json'),'utf8'));
  const ui=JSON.parse(fs.readFileSync(path.join(P.qa,'qa_direct_render_browser/result.json'),'utf8'));
  fs.writeFileSync(path.join(P.root,'var/qa/render_validation.json'),JSON.stringify({passed:quality.passed&&ui.passed,launchedFrom:os.tmpdir(),quality,ui},null,2));
  console.log('PASS isolated Studio from an unrelated working directory');
 }finally{
  if(server.exitCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

