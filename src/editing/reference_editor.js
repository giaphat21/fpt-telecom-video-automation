const PATHS=require('../../config/paths.js');

'use strict';
const {wordTimeline,findPhrase,normalize,boundaries,round}=require('./timeline_rules');
const {correctSubtitles}=require('../speech/transcript_formatter');
const {applyTypographyVariety,topicStyles}=require('../typography/brand_rules');
const {meaningfulWords,emphasisScore,isFiller}=require('./phrase_rules');
const {segment,clean,joined,STARTERS,TRAILING}=require('../speech/phrase_segmenter');
const profile=require('../../config/approved_reference.json');
function speechWords(subtitles){
  return [...new Map(wordTimeline(correctSubtitles(subtitles)).map(w=>[w.start+':'+w.raw,w])).values()];
}
function speechBoundaries(subtitles,totalDuration){
  const total=Math.max(0,Number(totalDuration)||0),hookDur=Math.min(3.5,total);
  const tokens=wordTimeline(correctSubtitles(subtitles));
  const cta=['đăng ký','liên hệ','gọi ngay','nhận ưu đãi','bình luận','nhắn tin','để lại số','inbox','gọi tổng đài','để được tư vấn']
    .flatMap(p=>findPhrase(tokens,p)).filter(m=>m.start>=Math.max(hookDur,total*.65)&&m.start<total);
  // The closing call to action, not an earlier mention: an Outro title should not cover the last quarter of a long video.
  const closing=cta.filter(m=>m.start>=total-8),chosen=closing.length?Math.min(...closing.map(m=>m.start)):cta.length?Math.max(...cta.map(m=>m.start)):total;
  const outroStart=round(chosen);
  return {hookDur,outroStart,outroDur:round(total-outroStart)};
}
function spokenSections(subtitles,totalDuration,limits=null){
  const words=speechWords(subtitles),tokens=wordTimeline(correctSubtitles(subtitles));
  const {hookDur,outroStart}=limits||speechBoundaries(subtitles,totalDuration);
  const bodyEnd=outroStart;
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
    return {anchored:!!anchor.phrase,start:anchor.start,end:Math.min(next,selected.at(-1)?.end??next),words:selected,text:selected.map(w=>w.raw).join(' ')};
  }).filter(s=>s.words.length&&s.end>s.start);
}
// Ordinary narration: every thought becomes one cue. It appears on its first word and leaves with its last one, so the
// text never lags behind the voice nor stays while the next sentence is spoken.
function narrationHighlights(subtitles,totalDuration,cuts){
  const {hookDur,outroStart}=speechBoundaries(subtitles,totalDuration);
  const words=speechWords(subtitles).filter(w=>w.start>=hookDur-.02&&w.end<=outroStart+.02),cues=[];
  const raw=g=>g.map(w=>w.raw).join(' '),span=g=>g.at(-1).end-g[0].start;
  const trim=g=>{
    let a=0,b=g.length;
    // Connectives and particles carry no message on screen.
    while(b-a>2&&(isFiller(g[a].raw)||STARTERS.has(clean(g[a].raw)))&&!/\d/.test(g[a].raw)&&!/^(đặc|đôi|không)$/.test(clean(g[a].raw))&&!(/^(chỉ|từ|giá)$/.test(clean(g[a].raw))&&g.slice(a+1,a+4).some(w=>/\d/.test(w.raw))))a++;
    while(b-a>2&&TRAILING.has(clean(g[b-1].raw))&&!joined(clean(g[b-2].raw),clean(g[b-1].raw)))b--;
    return g.slice(a,b);
  };
  const groups=segment(words,{ideal:5,min:3,max:8,maxSeconds:2.4,weight:.2,cuts});
  // A fragment joins the thought next to it instead of flashing by.
  for(let i=0;i<groups.length;i++){
    const g=trim(groups[i]),content=g.filter(w=>!TRAILING.has(clean(w.raw))).length;
    if(content>1&&((g.length>=3&&span(g)>=.45)||(span(g)>=.5&&(g.length===2&&emphasisScore(raw(g))>=3||span(g)>=.75))))continue;
    const prev=groups[i-1],next=groups[i+1],fits=(x,y)=>x&&y&&trim([...x,...y]).length<=9&&y[0].start-x.at(-1).end<.3&&y.at(-1).end-x[0].start<=2.9;
    const stop=g=>/[.,!?;:]$/.test(g.at(-1).raw)?1:0,pg=prev?groups[i][0].start-prev.at(-1).end+stop(prev):9,ng=next?next[0].start-groups[i].at(-1).end+stop(groups[i])+(clean(groups[i][0].raw)==='của'?1:0):9;
    if(fits(groups[i],next)&&(ng<=pg||!fits(prev,groups[i]))){groups.splice(i,2,[...groups[i],...next]);i--;}
    else if(fits(prev,groups[i])){groups.splice(i-1,2,[...prev,...groups[i]]);i-=2;if(i<-1)i=-1;}
    else if(g.every(w=>isFiller(w.raw)||STARTERS.has(clean(w.raw)))||span(g)<.28){groups.splice(i,1);i--;}
  }
  const shown=groups.map(trim).filter(g=>g.length);
  shown.forEach((g,i)=>{
    const start=g[0].start,speechEnd=g.at(-1).end,next=shown[i+1]?.[0].start??outroStart,gap=profile.highlight.gap;
    const end=round(Math.min(next-gap,outroStart,Math.max(speechEnd+(next-speechEnd>.5?.3:.06),start+.7)));
    if(end-start<.2)return;
    const text=g.map(w=>w.raw.replace(/[.,!?;:…]+$/,'')).filter(Boolean).join(' ');
    cues.push({id:cues.length+1,text,start:round(start),end,speechStart:start,speechEnd,y:350,scale:1.4,typo:topicStyles(text)[0]||profile.highlight.styleSequence[cues.length%profile.highlight.styleSequence.length],
      timingPolicy:'preserve_all',timingSource:'word',autoDetected:true,source:'narration'});
  });
  return applyTypographyVariety(cues);
}
function createReferenceHighlights(subtitles,totalDuration,{cuts=[]}={}){
  const sections=spokenSections(subtitles,totalDuration),cues=[];
  // A tight offer script is cut at its known offer phrases; anything longer or freer follows the sentences themselves.
  const tight=sections.filter(s=>s.anchored&&s.words.length<=8).length;
  if(sections.length&&tight<sections.length*.7)return narrationHighlights(subtitles,totalDuration,cuts);
  // A long section is divided at Sub text rows (natural phrases), not after an arbitrary number of words.
  const rowByStart=new Map();
  correctSubtitles(subtitles).forEach((sub,row)=>wordTimeline([sub]).forEach(w=>rowByStart.set(w.start+':'+w.raw,row)));
  const rowOf=w=>rowByStart.get(w.start+':'+w.raw);
  for(const section of sections){
    // The video determines how many cues are needed. Never cap the total count.
    const chunks=[];let current=[];
    for(let i=0;i<section.words.length;i++){
      const long=section.words.length>8,breaks=long&&current.length>=3&&rowOf(section.words[i])!==rowOf(current.at(-1));
      if(breaks){chunks.push(current);current=[];}
      current.push(section.words[i]);
      const remaining=section.words.length-i-1;
      if(current.length>=8&&remaining>=3){chunks.push(current);current=[];}
    }
    if(current.length)chunks.push(current);
    // A short section opened by a known offer phrase is kept whole; everything else is ordinary narration.
    const narration=!section.anchored||section.words.length>8;
    chunks.forEach((chunk,j)=>{
      const words=narration?meaningfulWords(chunk):chunk;
      const phrase=words.map(w=>w.raw).join(' ');
      // Ordinary narration needs a full thought; a two-word phrase only counts when it names an offer or product.
      if(words.length<(narration&&emphasisScore(phrase)>=3?2:3))return;
      const next=chunks[j+1]?.[0]?.start??sections[sections.indexOf(section)+1]?.start??Infinity;
      const start=words[0].start,end=round(Math.min(section.end,words.at(-1).end,next-profile.highlight.gap));
      if(end-start<1/30)return;
      const i=cues.length;
      cues.push({id:i+1,text:words.map(w=>w.raw.replace(/[.,!?;:]+$/,'')).filter(Boolean).join(' '),
        start:round(start),end,speechStart:start,speechEnd:words.at(-1).end,y:350,scale:1.4,
        typo:topicStyles(words.map(w=>w.raw).join(' '))[0]||profile.highlight.styleSequence[i%profile.highlight.styleSequence.length],
        timingPolicy:'preserve_all',timingSource:'word',autoDetected:true,source:'approved_reference',
        narration});
    });
  }
  return applyTypographyVariety(readableCues(cues,speechBoundaries(subtitles,totalDuration).outroStart));
}
// Continuous narration yields a phrase every half second. Keep the strongest one per reading slot and let it
// stay until the next cue; starts remain locked to the spoken word.
function readableCues(cues,limit,{slot=1.15,hold=1.9}={}){
  const kept=[];
  for(const cue of cues){
    const last=kept.at(-1);
    if(last&&cue.narration&&last.narration&&cue.start-last.start<slot){
      if(emphasisScore(cue.text)>emphasisScore(last.text)+.5&&!(kept.at(-2)?.narration&&cue.start-kept.at(-2).start<slot))kept[kept.length-1]=cue;
      continue;
    }
    kept.push(cue);
  }
  return kept.map(({narration,...cue},i)=>{
    if(!narration)return cue;
    const next=kept[i+1]?.start??limit;
    const end=round(Math.max(cue.end,Math.min(cue.start+hold,next-profile.highlight.gap,limit)));
    return {...cue,id:i+1,end};
  }).filter(cue=>cue.end-cue.start>=1/30);
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
  // A picture stays while its topic is being talked about: the sentence that names it and the one that completes it.
  let named=0;const FOLLOW=2.4;
  const append=(section,hit)=>{
    if(section.end<=section.start)return;
    if(active?.brollId===hit.clip.id&&section.start-active.speechEnd<=.4){
      active.end=active.speechEnd=round(section.end);active.duration=round(active.end-active.start);named=section.end;
      return;
    }
    active={brollId:hit.clip.id,name:hit.clip.name,icon:hit.clip.icon,
      layout:hit.clip.defaultLayout||'cutaway',start:round(section.start),end:round(section.end),
      speechStart:round(section.start),speechEnd:round(section.end),duration:round(section.end-section.start),
      matchedKeyword:hit.keyword,keywordStart:hit.start,timingSource:'spoken_context',autoDetected:true,
      hostFocusY:profile.broll.hostFocusY,available:hit.clip.available,autoEligible:hit.clip.autoEligible};
    spans.push(active);named=section.end;
  };
  for(const section of sections){
    const local=hits.filter(h=>h.start>=section.start-.001&&h.start<section.end-.001);
    const commercial=/^(gia chi|chi tu|dang ky|nhan uu dai|lien he|goi ngay)\b/.test(normalize(section.text));
    if(!local.length){
      if(commercial){active=null;continue;}
      if(active&&section.start-active.speechEnd<=.4&&section.end-named<=FOLLOW){
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
