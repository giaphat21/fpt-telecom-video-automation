'use strict';
// Turns Whisper output into acoustic word times. Segment offsets can be 0.6 s away from the voice; DTW lands inside
// the right syllable, and the energy envelope then gives the moment that syllable starts and stops.
const fs=require('fs');
const HOP=.01;
function readEnvelope(wavPath){
  const b=fs.readFileSync(wavPath);let at=12,data=null,rate=16000;
  while(at+8<=b.length){
    const id=b.toString('ascii',at,at+4),size=b.readUInt32LE(at+4);
    if(id==='fmt ')rate=b.readUInt32LE(at+12);
    if(id==='data'){data=b.subarray(at+8,Math.min(b.length,at+8+size));break;}
    at+=8+size+(size&1);
  }
  if(!data)throw Error('Không đọc được âm thanh để căn mốc từ.');
  const hop=Math.round(rate*HOP),n=Math.floor(data.length/2/hop),db=new Float32Array(n);
  for(let i=0;i<n;i++){
    let sum=0;for(let k=0;k<hop;k++){const v=data.readInt16LE((i*hop+k)*2)/32768;sum+=v*v;}
    db[i]=10*Math.log10(sum/hop+1e-9);
  }
  // 30 ms smoothing: keeps syllable valleys, removes pitch ripple.
  const smooth=db.map((_,i)=>{let s=0,c=0;for(let k=Math.max(0,i-1);k<=Math.min(n-1,i+1);k++){s+=db[k];c++;}return s/c;});
  const sorted=Float32Array.from(smooth).sort(),q=p=>sorted[Math.min(n-1,Math.floor(p*n))]??-90;
  const floor=q(.05),peak=q(.95);
  return {values:smooth,floor,peak,speech:floor+Math.max(6,(peak-floor)*.35),duration:n*HOP};
}
function alignWords(words,envelope){
  const E=envelope.values,last=E.length-1,idx=t=>Math.max(0,Math.min(last,Math.round(t/HOP)));
  const anchors=[];
  words.forEach((w,i)=>{
    let a=Number.isFinite(w.dtw)&&w.dtw>=0?w.dtw:w.startMs/1000+.08;
    if(i)a=Math.max(a,anchors[i-1]+.04);
    anchors.push(a);
  });
  const starts=words.map((_,i)=>{
    const a=idx(anchors[i]),from=i?idx(Math.max(anchors[i-1]+.03,anchors[i]-.38)):idx(anchors[i]-.5);
    // First cross any pause: the word begins where sound rises again, not where the silence began.
    let k=a;while(k>from&&E[k]>=envelope.speech)k--;
    if(E[k]<envelope.speech&&k<a)return (k+1)*HOP;
    // Continuous speech: the valley between the two syllables.
    let best=a,low=Infinity;
    for(let j=from;j<=a;j++){const v=E[j]+(a-j)*.02;if(v<low){low=v;best=j;}}
    return best*HOP;
  });
  return words.map((w,i)=>{
    const start=Math.max(i?starts[i-1]+.03:0,starts[i]),limit=i+1<words.length?Math.max(start+.04,starts[i+1]):Math.min(envelope.duration,anchors[i]+.9);
    let k=idx(Math.max(anchors[i],start+.05));
    while(k*HOP<limit&&E[k]>=envelope.speech)k++;
    const end=Math.min(limit,Math.max(start+.06,k*HOP+.02));
    return {word:w.word,startMs:Math.round(start*1000),endMs:Math.round(Math.max(start+.04,end)*1000)};
  });
}
// Pauses are measured on the recording itself, relative to its own noise floor.
function findPauses(envelope,minMs=250){
  const {values:E,floor,peak,duration}=envelope,total=Math.round(duration*1000);
  if(peak<-48)return [{startMs:0,endMs:total}];
  if(peak-floor<8)return [];
  const limit=floor+Math.max(6,(peak-floor)*.3),output=[];let open=-1;
  for(let i=0;i<=E.length;i++){
    const quiet=i<E.length&&E[i]<limit;
    if(quiet&&open<0)open=i;
    if(!quiet&&open>=0){
      const startMs=Math.round(open*HOP*1000),endMs=i===E.length?total:Math.round(i*HOP*1000);
      if(endMs-startMs>=minMs)output.push({startMs,endMs});
      open=-1;
    }
  }
  return output;
}
// Keeps every stretch of sound that contains recognised speech, whole. A cut can only fall inside a real pause.
// Long sound without words may be speech the recogniser missed: it stays in the picture and is reported, never cut.
function speechRegions(words,pauses,durationMs,padMs=45,keepUnknownMs=1500){
  const sounds=[];let cursor=0;
  for(const p of pauses){if(p.startMs>cursor)sounds.push([cursor,p.startMs]);cursor=p.endMs;}
  if(cursor<durationMs)sounds.push([cursor,durationMs]);
  const output=[];
  for(const [a,b] of sounds){
    const inside=words.filter(w=>{const m=(w.startMs+w.endMs)/2;return m>=a-padMs&&m<b+padMs&&!output.some(r=>r.words.includes(w));});
    if(inside.length||(words.length&&b-a>=keepUnknownMs))output.push({startMs:Math.max(output.at(-1)?.endMs??0,a-padMs),endMs:Math.min(durationMs,b+padMs),words:inside});
  }
  return output;
}
function findUncovered(words,pauses,durationMs,minMs=2000){
  const output=[],edges=[0,...words.flatMap(w=>[w.startMs,w.endMs]),durationMs];
  for(let i=0;i<edges.length;i+=2){
    let a=edges[i],b=edges[i+1];
    for(const p of pauses){if(p.startMs<=a+120&&p.endMs>a)a=p.endMs;if(p.endMs>=b-120&&p.startMs<b)b=p.startMs;}
    const quiet=pauses.reduce((s,p)=>s+Math.max(0,Math.min(p.endMs,b)-Math.max(p.startMs,a)),0);
    if(b-a-quiet>=minMs)output.push({startMs:a,endMs:b});
  }
  return output;
}
const soundEdge=(envelope,fromEnd)=>{const E=envelope.values;let k=fromEnd?E.length-1:0;while(k>=0&&k<E.length&&E[k]<envelope.speech)k+=fromEnd?-1:1;return Math.max(0,Math.min(E.length,k+(fromEnd?1:0)))*HOP;};
const firstSound=envelope=>soundEdge(envelope,false),lastSound=envelope=>soundEdge(envelope,true);
// Music under the voice: the quietest tenth of the recording stays within ~20 dB of its loudest parts (clean speech
// drops close to silence between words). Measured: clean takes 25–27 dB, a voice under music 17–19 dB.
function musicBed(envelope){const v=Float32Array.from(envelope.values).sort();return v.length>20&&envelope.peak-v[Math.floor(v.length*.1)]<20.5;}
// With music, the waveform has no quiet gaps: the pauses between recognised words stand in for them (longer gaps and
// wider margins than for real silence, so speech is never cut).
function wordPauses(words,durationMs,minMs=420,margin=110){
  const out=[],edges=[{endMs:0},...words,{startMs:durationMs}];
  for(let i=1;i<edges.length;i++){const a=(edges[i-1].endMs||0)+(i>1?margin:0),b=(edges[i].startMs??durationMs)-(i<edges.length-1?margin:0);if(b-a>=minMs-2*margin)out.push({startMs:Math.round(a),endMs:Math.round(b)});}
  return out;
}
module.exports={firstSound,lastSound,findUncovered,readEnvelope,alignWords,findPauses,speechRegions,musicBed,wordPauses};
