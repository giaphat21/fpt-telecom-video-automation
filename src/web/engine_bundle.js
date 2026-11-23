'use strict';
// Serves the pure typography modules to the Studio so the live preview draws with the render engine itself.
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const ENTRY='typography/kinetic_core.js',ALSO=['typography/subtitle_style.js','editing/phrase_rules.js','editing/timeline_rules.js','pipeline/picture_fx.js'];
let cached=null;
function collect(entry,seen=new Map()){
  if(seen.has(entry))return seen;
  const source=fs.readFileSync(path.join(ROOT,entry),'utf8');seen.set(entry,source);
  for(const [,request] of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){
    const target=path.posix.join(path.posix.dirname(entry),request);
    collect(target.endsWith('.js')?target:target+'.js',seen);
  }
  return seen;
}
function engineBundle(){
  const files=new Map();for(const entry of [ENTRY,...ALSO])collect(entry,files);
  const lexicon=path.join(ROOT,'..','config','lexicon.json');
  const stamp=[...files.keys()].map(f=>fs.statSync(path.join(ROOT,f)).mtimeMs).join()+fs.statSync(lexicon).mtimeMs;
  if(cached?.stamp===stamp)return cached.code;
  const modules=[...files].map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){'+source+'\n}').join(',\n');
  const code='(()=>{const defs={'+modules+'},cache={};'+
    'function load(name){if(cache[name])return cache[name].exports;const m=cache[name]={exports:{}};const dir=name.split("/").slice(0,-1);'+
    'defs[name](m,m.exports,r=>{const parts=[...dir];for(const p of r.split("/")){if(p===".")continue;if(p==="..")parts.pop();else parts.push(p);}const key=parts.join("/");return load(key.endsWith(".js")?key:key+".js");});return m.exports;}'+
    'window.FptEngine={typography:load('+JSON.stringify(ENTRY)+'),subtitle:load("typography/subtitle_style.js"),phrases:load("editing/phrase_rules.js"),rules:load("editing/timeline_rules.js"),fx:load("pipeline/picture_fx.js")};window.FptEngine.phrases.setPairs('+JSON.stringify([...require('../speech/phrase_segmenter').PAIRS].map(p=>require('../editing/timeline_rules').normalize(p)))+');})();\n';
  cached={stamp,code};return code;
}
module.exports={engineBundle};
