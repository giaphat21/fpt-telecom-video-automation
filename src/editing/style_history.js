'use strict';
// Remembers what the last videos looked and sounded like, so the next one is different. Re-exporting the same
// project keeps its look. Runtime data only: deleting the file is always safe.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const PATHS=require('../../config/paths.js');
// Test renders (output under var/) keep their own history so they never use up the styles of real videos.
const isTest=()=>!path.relative(path.dirname(PATHS.qa),PATHS.output).startsWith('..');
const FILE=()=>path.join(PATHS.cache,isTest()?'style_history_qa.json':'style_history.json'),KEEP=24;
function load(){try{const v=JSON.parse(fs.readFileSync(FILE(),'utf8'));return Array.isArray(v)?v:[];}catch(_){return [];}}
const hash=text=>parseInt(crypto.createHash('sha256').update(String(text)).digest('hex').slice(0,8),16);
function chooseStyle(kind,styles,project,{requested=null,history=load()}={}){
  if(requested&&styles.includes(requested))return requested;
  const same=history.find(h=>h.project===project&&styles.includes(h[kind]));
  if(same)return same[kind];
  const order=history.filter(h=>h[kind]).map(h=>h[kind]);
  const age=style=>{const i=order.indexOf(style);return i<0?Infinity:i;};
  // Least recently used; ties are broken by the project so a fresh install does not always start the same way.
  return [...styles].sort((a,b)=>(age(b)===age(a)?0:age(b)-age(a))||hash(project+a)-hash(project+b))[0];
}
function remember(entry){
  const history=[entry,...load().filter(h=>h.project!==entry.project)].slice(0,KEEP);
  fs.mkdirSync(PATHS.cache,{recursive:true});
  const temp=FILE()+'.'+crypto.randomUUID();fs.writeFileSync(temp,JSON.stringify(history,null,1));fs.renameSync(temp,FILE());
}
const recentSounds=(history=load(),videos=2)=>[...new Set(history.slice(0,videos).flatMap(h=>h.sfx||[]))];
module.exports={chooseStyle,remember,recentSounds,load,historyFile:FILE};
