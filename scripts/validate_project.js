'use strict';
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),{createRequire,builtinModules}=require('module');
const P=require('../config/paths');
const errors=[],checked=[],warn=[];
const inside=file=>{const rel=path.relative(P.root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const dir of ['src','scripts','config','tests']){
 for(const file of files(path.join(P.root,dir)).filter(f=>f.endsWith('.js'))){
  try{execFileSync(process.execPath,['--check',file],{stdio:'pipe',windowsHide:true});}catch(e){errors.push({file:path.relative(P.root,file),error:String(e.stderr||e.message)});}
  const req=createRequire(file),source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/require\((['"])([^'"]+)\1\)/g)){
   const id=match[2];if(builtinModules.includes(id)||id.startsWith('node:'))continue;
   try{const resolved=req.resolve(id);if(!inside(resolved))errors.push({file:path.relative(P.root,file),error:'Dependency outside project: '+id});}
   catch(e){errors.push({file:path.relative(P.root,file),error:'Unresolved dependency: '+id});}
  }
  checked.push(path.relative(P.root,file));
 }
}
for(const key of ['ffmpeg','ffprobe','whisper','modelSmall','modelBase','videos','voices','fonts'])
 if(!fs.existsSync(P[key]))errors.push({error:'Missing runtime path: '+key,path:P[key]});
for(const name of ['Montserrat-Bold.ttf','BeVietnamPro-Black.ttf','Barlow-Black.ttf','Barlow-Bold.ttf'])
 if(!fs.existsSync(path.join(P.fonts,name)))errors.push({error:'Missing font '+name});
for(const binary of ['ffmpeg','ffprobe']){
 try{execFileSync(P[binary],['-version'],{stdio:'pipe',windowsHide:true});}catch(e){errors.push({error:'Cannot execute '+binary});}
}
try{
 const aliases=require('../config/media_aliases.json');
 for(const [name,target]of Object.entries(aliases))if(!fs.existsSync(path.join(P.root,target)))errors.push({error:'Broken media alias',name,target});
}catch(e){errors.push({error:e.message});}
const report={passed:errors.length===0,checkedFiles:checked.length,errors,warnings:warn,node:process.version,projectRoot:P.root};
if(process.argv.includes('--report'))fs.writeFileSync(path.join(P.root,'docs/validation_report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));process.exitCode=errors.length?1:0;

