'use strict';
// Plays only the user's own sound set (assets/sfx-user, described in config/sfx_library.json). Chooses sounds by
// meaning, lands the audible hit (not the file start) on the cue, evens out loudness, and keeps one video from repeating.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const PATHS=require('../../config/paths.js');
const LIBRARY=require('../../config/sfx_library.json');
const {normalize}=require('../editing/timeline_rules');
const DIR=path.join(PATHS.assets,LIBRARY.folder);
const round=v=>Math.round(v*1000)/1000;
const ALIGN_ON_PEAK=new Set(['whoosh','riser']);
// ---- measurement --------------------------------------------------------------------------------------
const HOP=110,RATE=22050,STEP=HOP/RATE,VERSION=5,memory=new Map();
function decode(file){
  const run=spawnSync(PATHS.ffmpeg,['-v','error','-i',file,'-ac','1','-ar',String(RATE),'-f','s16le','pipe:1'],{windowsHide:true,maxBuffer:64*1024*1024});
  if(run.status!==0||!run.stdout.length)throw Error('Không đọc được SFX '+path.basename(file));
  const n=Math.floor(run.stdout.length/2/HOP),rms=[];let crossings=0,last=0;
  for(let i=0;i<n;i++){let s=0;for(let k=0;k<HOP;k++){const v=run.stdout.readInt16LE((i*HOP+k)*2)/32768;s+=v*v;if((v>=0)!==(last>=0))crossings++;last=v;}rms.push(Math.sqrt(s/HOP));}
  return {rms,brightness:n?crossings/(n*STEP)/2:0};
}
function analyse(file,take){
  const {rms}=decode(file),a=Math.max(0,Math.floor((take.from||0)/STEP)),b=Math.min(rms.length,take.to?Math.ceil(take.to/STEP):rms.length);
  const slice=rms.slice(a,b),max=Math.max(...slice,1e-6);
  let hit=take.hit!=null?Math.max(0,Math.min(slice.length-1,Math.round(take.hit/STEP)-a)):slice.findIndex(v=>v>=max*.7);
  if(take.hit!=null){for(let k=Math.max(0,hit-12);k<Math.min(slice.length,hit+12);k++)if(slice[k]>slice[hit])hit=k;}
  else while(hit+1<slice.length&&slice[hit+1]>slice[hit])hit++;
  let onset=hit;while(onset>0&&hit-onset<40&&slice[onset-1]>=slice[hit]*.22)onset--;
  const peakAligned=ALIGN_ON_PEAK.has(take.family),lead=peakAligned?Math.min(take.family==='riser'?.95:.45,hit*STEP):Math.min(.012,onset*STEP);
  const align=peakAligned?hit*STEP:onset*STEP,limit=take.family==='run'?.95:take.family==='riser'?.6:['bell','cash'].includes(take.family)?1.35:1.1;
  let end=hit,quiet=0;for(let i=hit;i<slice.length&&(i-hit)*STEP<limit;i++){end=i;quiet=slice[i]<max*.03?quiet+1:0;if(quiet>=(take.family==='run'?44:22))break;}
  return {from:round(a*STEP+align-lead),lead:round(lead),duration:round(Math.max(.08,(end+1)*STEP-(align-lead))),gain:round(Math.min(14,Math.max(.12,.3/Math.max(max,1e-4))))};
}
// New files dropped into the folder work at once; a person can refine them later in sfx_library.json.
function classify(file){
  const {rms,brightness}=decode(file),max=Math.max(...rms,1e-6),peak=rms.indexOf(max),dur=rms.length*STEP,onset=rms.findIndex(v=>v>=max*.25);
  let hits=0,above=false;for(const v of rms){if(!above&&v>max*.55){hits++;above=true;}else if(above&&v<max*.15)above=false;}
  if(hits>=3&&dur<1.2)return 'run';
  if((peak-onset)*STEP>.6)return 'riser';
  if((peak-onset)*STEP>.09&&dur>.35)return 'whoosh';
  if(brightness<450)return 'impact';
  return dur<.35?'pop':'tone';
}
let takes=null;
function loadTakes(){
  if(takes)return takes;
  const files=new Set(fs.existsSync(DIR)?fs.readdirSync(DIR).filter(f=>/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f)):[]);
  takes=LIBRARY.takes.filter(t=>files.has(t.file));
  const known=new Set(LIBRARY.takes.map(t=>t.file));
  for(const file of files)if(!known.has(file)){
    try{takes.push({id:path.basename(file,path.extname(file)),file,family:classify(path.join(DIR,file)),name:path.basename(file,path.extname(file)),auto:true});}catch(_){}
  }
  if(!takes.length)throw Error('Không tìm thấy bộ SFX trong assets/'+LIBRARY.folder);
  return takes;
}
function measure(take){
  const file=path.join(DIR,take.file),stat=fs.statSync(file),key=[take.id,take.file,stat.size,take.family,take.from||0,take.to||0,take.hit||0,VERSION].join(':');
  if(memory.has(key))return memory.get(key);
  const cacheFile=path.join(PATHS.cache,'sfx_profiles.json');
  let cache={};try{cache=JSON.parse(fs.readFileSync(cacheFile,'utf8'));}catch(_){}
  if(!cache[key]){
    cache[key]=analyse(file,take);
    fs.mkdirSync(PATHS.cache,{recursive:true});
    const temp=cacheFile+'.'+crypto.randomUUID();fs.writeFileSync(temp,JSON.stringify(cache));fs.renameSync(temp,cacheFile);
  }
  memory.set(key,cache[key]);return cache[key];
}
function catalog(){
  const sfx=loadTakes().map(t=>({id:t.id,name:t.name,file:t.file,cat:LIBRARY.families[t.family]||t.family,url:'/assets/'+LIBRARY.folder+'/'+encodeURIComponent(t.file)+(t.from||t.to?'#t='+(t.from||0)+(t.to?','+t.to:''):''),dur:measure(t).duration}));
  return {count:sfx.length,sfx};
}
// ---- meaning ------------------------------------------------------------------------------------------
const {isNegative}=require('../editing/tone');
// Whole words only: 'gia' inside 'giai tri', 'tang' (tầng) or 'qua' (quá) must not sound like money or a gift.
const INTENTS=[
  [/\b\d+ ?k\b|\b\d[\d.,]* ?(dong|d|nghin|trieu)\b|\bgia (chi|tu|cuoc|re|uu dai|goc)\b|\bgoi cuoc\b|\bcuoc phi\b|\b(tiet kiem|re hon|chi phi)\b/,['cash','run','bell','impact']],
  [/^tang\b|\btang (ngay|kem|them|mien phi|camera|modem|thiet bi|\d)|\bmien phi\b|\buu dai\b|\bqua tang\b|\bvoucher\b|\b0 ?d\b/,['bell','cash','tone','pop']],
  [/\b(ngoai hang|bong da|premier|world cup|tran dau|cau thu|ban thang)\b/,['impact','bell','whoosh','run']],
  [/camera|an ninh|giam sat|dam thoai|nhan dien/,['mech','pop','tone','run']],
  [/wifi|modem|internet|toc do|bang thong|gbps|mbps|cap quang|game|lag|mang/,['run','whoosh','tone','pop']],
  [/fpt play|phim|truyen hinh|kenh|4k/,['bell','tone','pop','run']],
  [/dang ky|lien he|goi ngay/,['bell','cash','tone']]
];
// Fallback for any phrase: money is never heard on a phrase that is not about money.
const GENERAL=['pop','tone','run','impact','whoosh','mech','bell'];
function familiesFor(text){if(isNegative(text))return ['mech','impact','tone','run'];const t=normalize(text);return (INTENTS.find(([re])=>re.test(t))||[null,GENERAL])[1];}
// ---- selection ----------------------------------------------------------------------------------------
const hash=text=>parseInt(crypto.createHash('sha256').update(String(text)).digest('hex').slice(0,8),16);
class SfxDirector{
  constructor({seed='',recent=[],maxUses=2,maxFileUses=4}={}){
    Object.assign(this,{seed,maxUses,maxFileUses,recent:new Set(recent),uses:new Map(),fileUses:new Map(),familyUses:new Map(),history:[]});
  }
  blocked(take,start){
    return (this.uses.get(take.id)||0)>=this.maxUses||(this.fileUses.get(take.file)||0)>=this.maxFileUses||
      this.history.some(h=>h.source===take.file&&Math.abs(h.start-start)<3.5);
  }
  // only: a picture cut must sound like a movement, so it never falls back to an unrelated family.
  pick(families,{start=0,only=false}={}){
    const wanted=only?families:[...families,...GENERAL.filter(f=>!families.includes(f))],last=this.history.at(-1),options=[];
    for(const take of loadTakes()){
      const rank=wanted.indexOf(take.family);
      if(rank<0||this.blocked(take,start))continue;
      options.push({take,score:(this.uses.get(take.id)||0)*12+(this.fileUses.get(take.file)||0)*5+rank*4.5+(this.familyUses.get(take.family)||0)*1.6+
        (last?.family===take.family?7:0)+(this.recent.has(take.id)?2.5:0)+(hash(this.seed+take.id)%100)/40});
    }
    if(!options.length)return null;
    return this.commit(options.sort((a,b)=>a.score-b.score)[0].take,start);
  }
  // A sound the user chose in Studio is kept unless it would repeat within this video.
  prefer(id,start,{force=false}={}){
    const take=loadTakes().find(t=>t.id===String(id||'').replace(/\.mp3$/i,''));
    if(!take||(!force&&(this.blocked(take,start)||this.history.slice(-2).some(h=>h.id===take.id))))return null;
    return this.commit(take,start);
  }
  commit(take,start){
    const add=(map,key)=>map.set(key,(map.get(key)||0)+1);
    add(this.uses,take.id);add(this.fileUses,take.file);add(this.familyUses,take.family);
    this.history.push({id:take.id,source:take.file,family:take.family,start});
    return {file:path.join(DIR,take.file),id:take.id,family:take.family,...measure(take)};
  }
}
module.exports={SfxDirector,familiesFor,measure,loadTakes,catalog,DIR};
