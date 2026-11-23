'use strict';
// Splits recognised words into phrases people actually say: at pauses, punctuation and connectives; never inside a
// compound, between a number and its unit, or after a word that needs what follows. Used for Sub lines and Highlights.
const LEXICON=require('../../config/lexicon.json');
const clean=w=>String(w||'').normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}+/-]/gu,'');
const PAIRS=new Set(),NAMES=new Set();
for(const list of [LEXICON.phrases,LEXICON.proper,LEXICON.compounds||[]])for(const phrase of list){const w=phrase.toLocaleLowerCase('vi').split(' ');for(let i=1;i<w.length;i++)PAIRS.add(w[i-1]+' '+w[i]);}
for(const name of LEXICON.proper)NAMES.add(name.toLocaleLowerCase('vi').split(' ')[0]);
const set=text=>new Set(text.split(' '));
// Words that open a new thought / that lean on the next word / that close the one before.
const STARTERS=set('mà nhưng thì và hay hoặc để với vì nên do nếu khi dù thế vậy còn chỉ dành cũng đặc lại như giúp đôi từ bằng sau trước ngoài riêng');
const LEANING=set('của cho những các một là có được sẽ đang đã rất quá với để trong bộ cái và hay hoặc từ đến bằng như mà thì khi nếu vì do tại ở trên dưới về theo cùng mỗi mọi vẫn cũng lại nên phải cần muốn bị hơn bao đâu chẳng không chưa hãy đừng mấy chiếc gói giá làm còn chỉ hết ngôi số lắp khiến giúp nhiều ít đầy thêm');
const TRAILING=set('nha nhé nhá ạ à á đó đấy nè rồi luôn lắm vậy ta hen ha thôi không chứ đi nhỉ');
const UNIT=/^(k|nghìn|ngàn|triệu|đồng|tháng|ngày|tài|kênh|chiều|gbps|mbps|gb|trận|thiết|người|năm|giờ|tầng|phòng|mét|m2|%)/;
const joined=(a,b)=>PAIRS.has(a+' '+b)||(/\d$/.test(a)&&UNIT.test(b));
// words: [{raw,start,end}] in seconds. cuts: picture cuts (real pauses in the recording) on the same clock.
function boundaryCost(words,i,cuts){
  const prev=words[i-1],next=words[i],a=clean(prev.raw),b=clean(next.raw),gap=next.start-prev.end;
  let cost=0;
  if(joined(a,b))cost+=9;
  if(/[.!?…]["”]?$/.test(prev.raw))cost-=6;else if(/[,;:]["”]?$/.test(prev.raw))cost-=3.6;
  if(gap>=.25)cost-=5;else if(cuts.some(c=>c>prev.end-.06&&c<next.start+.06))cost-=3;else if(gap>=.06)cost-=1;
  if(/^\p{Lu}/u.test(next.raw)&&!NAMES.has(b)&&!/^\p{Lu}{2,}/u.test(next.raw))cost-=2.2;
  if(STARTERS.has(b))cost-=1.5;
  if(LEANING.has(a))cost+=2.8;
  if(TRAILING.has(b)&&gap<.2)cost+=2.6;
  return cost;
}
function segment(words,{ideal=4.5,min=2,max=6,maxSeconds=2.8,cuts=[],weight=.35}={}){
  const n=words.length;if(!n)return [];
  const best=Array(n+1).fill(Infinity),from=Array(n+1).fill(0);best[0]=0;
  const boundary=words.map((_,i)=>i?boundaryCost(words,i,cuts):0);
  for(let j=1;j<=n;j++)for(let i=Math.max(0,j-max-2);i<j;i++){
    const count=j-i;let cost=best[i]+(j<n?boundary[j]:0)+weight*(count-ideal)**2;
    if(count<min)cost+=2.4*(min-count);
    if(count>max)cost+=5*(count-max);
    const seconds=words[j-1].end-words[i].start;if(seconds>maxSeconds)cost+=3*(seconds-maxSeconds);
    // A hard stop inside a phrase is as bad as a cut inside a compound.
    for(let k=i+1;k<j;k++)if(boundary[k]<-4.5)cost+=-boundary[k]*.9;
    if(cost<best[j]){best[j]=cost;from[j]=i;}
  }
  const out=[];for(let j=n;j>0;j=from[j])out.unshift([from[j],j]);
  return out.map(([i,j])=>words.slice(i,j));
}
module.exports={segment,clean,joined,PAIRS,STARTERS,LEANING,TRAILING};
