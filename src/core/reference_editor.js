const PATHS=require('../../config/paths.js');

'use strict';
const {wordTimeline,findPhrase,normalize,boundaries,round}=require('./timeline_rules');
const {correctSubtitles}=require('./transcript_formatter');
const {applyTypographyVariety}=require('./brand_rules');
const profile=require('../../config/approved_reference.json');
function speechWords(subtitles){
  return [...new Map(wordTimeline(correctSubtitles(subtitles)).map(w=>[w.start+':'+w.raw,w])).values()];
}
function speechBoundaries(subtitles,totalDuration){
  const total=Math.max(0,Number(totalDuration)||0),hookDur=Math.min(3.5,total);
  const tokens=wordTimeline(correctSubtitles(subtitles));
  const cta=['đăng ký','liên hệ','gọi ngay','nhận ưu đãi']
    .flatMap(p=>findPhrase(tokens,p)).filter(m=>m.start>=Math.max(hookDur,total*.65)&&m.start<total);
  const outroStart=round(cta.length?Math.min(...cta.map(m=>m.start)):total);
  return {hookDur,outroStart,outroDur:round(total-outroStart)};
}
function spokenSections(subtitles,totalDuration,limits=null){
  const words=speechWords(subtitles),tokens=wordTimeline(correctSubtitles(subtitles));
  const {hookDur,outroStart}=limits||speechBoundaries(subtitles,totalDuration);
  const cta=['đăng ký','liên hệ','gọi ngay','nhận ưu đãi'].flatMap(p=>findPhrase(tokens,p)).filter(m=>m.start>=totalDuration*.65);
  const bodyEnd=Math.min(outroStart,...cta.map(m=>m.start));
  const opens=['đi kèm','thỏa sức','tặng ngay','đàm thoại','cực kỳ tiện lợi','giá chỉ','tốc độ cao','miễn phí','băng thông','không giật lag'];
  let points=opens.flatMap(phrase=>findPhrase(tokens,phrase).map(m=>({...m,phrase})))
    .filter(m=>m.start>=hookDur && m.start<bodyEnd-.05).sort((a,b)=>a.start-b.start);
  const anchors=[];
  for(const point of points)if(!anchors.length||point.start-anchors.at(-1).start>=.25)anchors.push(point);
  if(!anchors.length){
    for(const sub of subtitles){
      const sw=wordTimeline([sub]);
      if(sw.length&&sw[0].start>=hookDur&&sw[0].start<bodyEnd-.05)anchors.push({start:sw[0].start});
    }
  }
  const first=words.find(w=>w.start>=hookDur);
  if(first&&first.start<bodyEnd&&(!anchors.length||first.start<anchors[0].start-.001))anchors.unshift({start:first.start});
  return anchors.map((anchor,i)=>{
    const next=anchors[i+1]?.start??bodyEnd;
    const selected=words.filter(w=>w.start>=anchor.start-.001&&w.start<next-.001);
    return {start:anchor.start,end:Math.min(next,selected.at(-1)?.end??next),words:selected,text:selected.map(w=>w.raw).join(' ')};
  }).filter(s=>s.words.length&&s.end>s.start);
}
function createReferenceHighlights(subtitles,totalDuration){
  const sections=spokenSections(subtitles,totalDuration),cues=[];
  for(const section of sections){
    // The video determines how many cues are needed. Never cap the total count.
    const chunks=[];let current=[];
    for(let i=0;i<section.words.length;i++){
      current.push(section.words[i]);
      const remaining=section.words.length-i-1;
      if(current.length>=8&&remaining>=3){chunks.push(current);current=[];}
    }
    if(current.length)chunks.push(current);
    chunks.forEach((words,j)=>{
      if(words.length<3)return;
      const next=chunks[j+1]?.[0]?.start??sections[sections.indexOf(section)+1]?.start??Infinity;
      const start=words[0].start,end=round(Math.min(section.end,words.at(-1).end,next-profile.highlight.gap));
      if(end-start<1/30)return;
      const i=cues.length;
      cues.push({id:i+1,text:words.map(w=>w.raw).join(' ').replace(/[.,!?;:]+$/,''),
        start:round(start),end,speechStart:start,speechEnd:words.at(-1).end,y:350,scale:1.4,
        typo:profile.highlight.styleSequence[i%profile.highlight.styleSequence.length],
        sfx:profile.highlight.sfxSequence[i%profile.highlight.sfxSequence.length],
        timingPolicy:'preserve_all',timingSource:'word',autoDetected:true,source:'approved_reference'});
    });
  }
  return applyTypographyVariety(cues);
}

function createReferenceBrolls(subtitles,totalDuration,catalog,allowedIds=null,limits=null){
  const sections=spokenSections(subtitles,totalDuration,limits);
  const tokens=wordTimeline(correctSubtitles(subtitles));
  const allowed=Array.isArray(allowedIds)?new Set(allowedIds):null;
  const matches=[];
  // Read all topics, including missing media, before deciding which clips can be used.
  for(const clip of catalog)for(const keyword of clip.keywords||[])for(const match of findPhrase(tokens,keyword)){
    if(['ai','nha'].includes(normalize(keyword))&&tokens[match.index].raw.replace(/[^\p{L}]/gu,'')!==keyword.toUpperCase())continue;
    matches.push({...match,clip,keyword});
  }
  matches.sort((a,b)=>a.start-b.start||b.length-a.length);
  const hits=[];let covered=-1;
  for(const hit of matches){
    if(hit.index<covered)continue;
    hits.push(hit);covered=hit.index+hit.length;
  }
  const spans=[];let active=null;
  const append=(section,hit)=>{
    if(section.end<=section.start)return;
    if(active?.brollId===hit.clip.id&&section.start-active.speechEnd<=.4){
      active.end=active.speechEnd=round(section.end);active.duration=round(active.end-active.start);
      return;
    }
    active={brollId:hit.clip.id,name:hit.clip.name,icon:hit.clip.icon,
      layout:hit.clip.defaultLayout||'cutaway',start:round(section.start),end:round(section.end),
      speechStart:round(section.start),speechEnd:round(section.end),duration:round(section.end-section.start),
      matchedKeyword:hit.keyword,keywordStart:hit.start,timingSource:'spoken_context',autoDetected:true,
      hostFocusY:profile.broll.hostFocusY,available:hit.clip.available,autoEligible:hit.clip.autoEligible};
    spans.push(active);
  };
  for(const section of sections){
    const local=hits.filter(h=>h.start>=section.start-.001&&h.start<section.end-.001);
    const commercial=/^(gia chi|chi tu|dang ky|nhan uu dai|lien he|goi ngay)\b/.test(normalize(section.text));
    if(!local.length){
      if(commercial){active=null;continue;}
      if(active&&section.start-active.speechEnd<=.4){
        active.end=active.speechEnd=round(section.end);active.duration=round(active.end-active.start);
      }
      continue;
    }
    const changes=local.filter((h,i)=>!i||h.clip.id!==local[i-1].clip.id);
    const cuts=[section.start];
    for(const hit of changes.slice(1)){
      let cut=hit.start;
      const preceding=section.words.filter(w=>w.start<cut-.001).at(-1);
      if(preceding&&/^(va|con|rieng|kem|voi)$/.test(normalize(preceding.raw))&&preceding.start>cuts.at(-1))cut=preceding.start;
      cuts.push(cut);
    }
    changes.forEach((hit,i)=>{
      const next=cuts[i+1]??section.end;
      const words=section.words.filter(w=>w.start>=cuts[i]-.001&&w.start<next-.001);
      if(words.length)append({start:cuts[i],end:Math.min(next,words.at(-1).end)},hit);
    });
  }
  return spans.filter(s=>s.available&&s.autoEligible!==false&&(!allowed||allowed.has(s.brollId)))
    .map(({available,autoEligible,...s})=>s);
}
module.exports={speechBoundaries,spokenSections,createReferenceHighlights,createReferenceBrolls};
