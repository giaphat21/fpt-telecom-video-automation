'use strict';
// Vietnamese/FPT compounds that a display line must never break.
const {normalize}=require('./timeline_rules');
const COMPOUNDS=['tien loi','cuc ky','mot ngay','mot thang','lap dat','lap mang','trang bi','wifi 6','modem wifi','moi nhat','di kem',
  'tai khoan','fpt play','fpt telecom','truyen hinh','thoa suc','xem bong da','bong da','ngoai hang anh','dac biet','tang ngay','camera ai','dam thoai',
  '2 chieu','hai chieu','toc do','toc do cao','gia chi','chi tu','gia dinh','lien he','dang ky','uu dai','lien tay','bang thong','cap quang','mien phi',
  'giat lag','choi game','do tre','an ninh','giam sat','kho phim','tra gop','khuyen mai','qua tang','dong ngay','1 gbps','da nang'].map(c=>c.split(' '));
// Word pairs from config/lexicon.json ("bức tường", "tín hiệu"…). Node loads them here; the Studio bundle sets the same
// list, so a title breaks its lines identically in the preview and in the render.
let PAIRS=null;
function setPairs(list){PAIRS=new Set(list);}
if(typeof window==='undefined'){try{const load=require;setPairs([...load('../speech/phrase_segmenter').PAIRS].map(p=>normalize(p)));}catch(_){}}
const KEY=/\d|mien phi|tang|camera|wifi|fpt play|ngoai hang|bong da|internet|uu dai|combo/;
function joins(tokens){
  const locked=new Set();
  for(const c of COMPOUNDS)for(let i=0;i+c.length<=tokens.length;i++)
    if(c.every((t,k)=>tokens[i+k]===t))for(let k=1;k<c.length;k++)locked.add(i+k);
  if(PAIRS)for(let i=1;i<tokens.length;i++)if(PAIRS.has(tokens[i-1]+' '+tokens[i]))locked.add(i);
  // Keep a number with its unit ("7.000 đồng", "5 tài khoản").
  const unit=/^(k|nghin|ngan|trieu|dong|thang|ngay|tai|kenh|chieu|gbps|mbps|gb|tran|thiet|nguoi|nam|gio)$/;
  tokens.forEach((t,i)=>{if(i&&/\d$/.test(tokens[i-1])&&unit.test(t))locked.add(i);});
  return locked;
}
// Returns 1–2 arrays of word indexes: a short lead-in and the line that carries the message.
function splitLines(words,{maxSingle=13}={}){
  const tokens=words.map(w=>normalize(w)),total=words.join(' ').length;
  if(words.length<=2||total<=maxSingle)return [words.map((_,i)=>i)];
  const locked=joins(tokens);let best=null;
  for(let i=1;i<words.length;i++){
    const lead=words.slice(0,i).join(' ').length,main=words.slice(i).join(' ').length;
    let cost=Math.abs(lead/(lead+main)-.42)*20;
    if(locked.has(i))cost+=40;
    if(i===1&&words.length>4)cost+=3;
    if(main<4)cost+=10;
    if(!KEY.test(tokens.slice(i).join(' ')))cost+=2;
    if(!best||cost<best.cost)best={cost,i};
  }
  if(best.cost>=40&&total<=22)return [words.map((_,i)=>i)];
  return [words.slice(0,best.i).map((_,i)=>i),words.slice(best.i).map((_,i)=>i+best.i)];
}
const FILLER=new Set('thì mà là và của để cho với nên khi vì những các được sẽ rất rồi ra vào ở lại lên xuống về này đó đấy như có hay bởi do đến tới cũng đã đang à ạ nhé nha luôn vậy thế còn nữa mình em cái ấy thôi nói nhưng đây ừ ờ ơ kìa'.split(' '));
const isFiller=word=>FILLER.has(String(word).normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]/gu,''));
// Removes spoken padding from both ends; returns [] when nothing meaningful is left.
function meaningfulWords(words){
  let a=0,b=words.length;
  while(a<b&&isFiller(words[a].raw))a++;
  while(b>a&&isFiller(words[b-1].raw))b--;
  const kept=words.slice(a,b);
  return kept.filter(w=>!isFiller(w.raw)).length>=2?kept:[];
}
// Higher = carries an offer, number or product, so it deserves the screen over ordinary narration.
const emphasisScore=text=>(KEY.test(normalize(text))?3:0)+Math.min(2,String(text).split(/\s+/).length/3);
module.exports={emphasisScore,splitLines,meaningfulWords,isFiller,COMPOUNDS,setPairs};
