'use strict';
// Spelling, tone marks and capitalisation of everything shown on screen. Only spelling changes: never adds or removes content.
const LEXICON=require('../../config/lexicon.json');
const VOWELS={a:'aàáảãạ',ă:'ăằắẳẵặ',â:'âầấẩẫậ',e:'eèéẻẽẹ',ê:'êềếểễệ',i:'iìíỉĩị',o:'oòóỏõọ',ô:'ôồốổỗộ',ơ:'ơờớởỡợ',u:'uùúủũụ',ư:'ưừứửữự',y:'yỳýỷỹỵ'};
const TONE_OF=new Map();for(const [base,row] of Object.entries(VOWELS))[...row].forEach((c,i)=>TONE_OF.set(c,[base,i]));
const lower=s=>String(s).normalize('NFC').toLocaleLowerCase('vi');
const plain=s=>lower(s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
const capital=s=>{const i=String(s).search(/[\p{L}\p{N}]/u);return i<0?s:s.slice(0,i)+s[i].toLocaleUpperCase('vi')+s.slice(i+1);};
// ---- tone marks: one modern spelling everywhere ("thỏa", "hòa", "thúy"), so the same word never appears in two forms
const PAIRS={oa:[0,1],oe:[0,1],uy:[0,1]};
function placeTones(text){
  return String(text).normalize('NFC').replace(/([oOuU])([aàáảãạeèéẻẽẹyỳýỷỹỵ])(?![\p{L}])/gu,(m,first,second,offset,all)=>{
    const [base,tone]=TONE_OF.get(second.toLowerCase())||[];
    if(!tone||!PAIRS[first.toLowerCase()+base])return m;
    if(/[qQ]/.test(all[offset-1]||''))return m;
    const row=VOWELS[first.toLowerCase()],marked=row[tone];
    return (first===first.toUpperCase()?marked.toUpperCase():marked)+(second===second.toUpperCase()&&second!==second.toLowerCase()?base.toUpperCase():base);
  });
}
// ---- phrases that differ from the dictionary only by diacritics
const phraseMap=new Map();
for(const phrase of [...LEXICON.phrases,...LEXICON.proper.filter(p=>/\s/.test(p))]){
  const key=plain(phrase);if(!key.includes(' '))continue;
  phraseMap.set(key,phraseMap.has(key)&&phraseMap.get(key)!==phrase?null:phrase);
}
const LONGEST=Math.max(...[...phraseMap.keys()].map(k=>k.split(' ').length));
const properMap=new Map(LEXICON.proper.map(p=>[lower(p),p]));
const commonWords=new Set(LEXICON.phrases.flatMap(p=>lower(p).split(' ')));
const splitWord=w=>{const m=/^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}+]*)$/u.exec(w);return m?[m[1],m[2],m[3]]:['',w,''];};
function fixPhrases(text){
  const words=text.split(/\s+/).filter(Boolean),parts=words.map(splitWord),keys=parts.map(p=>plain(p[1]));
  for(let i=0;i<words.length;i++)for(let n=Math.min(LONGEST,words.length-i);n>1;n--){
    // Punctuation inside the span means the words do not belong together.
    if(parts.slice(i,i+n-1).some(p=>p[2])||parts.slice(i+1,i+n).some(p=>p[0]))continue;
    const phrase=phraseMap.get(keys.slice(i,i+n).join(' '));
    if(!phrase)continue;
    phrase.split(' ').forEach((w,k)=>{parts[i+k][1]=w;});i+=n-1;break;
  }
  return parts.map(p=>p.join('')).join(' ');
}
function properNames(text){
  const words=text.split(/\s+/).filter(Boolean),parts=words.map(splitWord);
  for(let i=0;i<parts.length;i++){
    let done=false;
    for(let n=Math.min(4,parts.length-i);n>0&&!done;n--){
      if(n>1&&parts.slice(i,i+n-1).some(p=>p[2]))continue;
      const proper=properMap.get(parts.slice(i,i+n).map(p=>lower(p[1])).join(' '));
      if(proper){proper.split(' ').forEach((w,k)=>{parts[i+k][1]=w;parts[i+k].proper=true;});i+=n-1;done=true;}
    }
    // A capital in the middle of a line is kept only for names; ordinary words the recogniser capitalised go back down.
    if(!done&&i>0&&/^\p{Lu}\p{Ll}*$/u.test(parts[i][1])&&commonWords.has(lower(parts[i][1])))parts[i][1]=lower(parts[i][1]);
  }
  return parts.map(p=>p[0]+p[1]+p[2]).join(' ');
}
function tidy(text){
  return String(text).normalize('NFC').replace(/\s+/g,' ').replace(/\s+([,.;:!?%])/g,'$1').replace(/([,;:!?])(?=\p{L})/gu,'$1 ')
    .replace(/(\d)\s*(?:đ|vnđ)(?![\p{L}])/giu,'$1đ').replace(/(\d[\d.,]*)\s+đồng\s+(?:một|mỗi|1)\s+(ngày|tháng|năm)/giu,'$1 đồng/$2').trim();
}
// Same spelling rules for Sub, Highlight, Hook and Outro; only Sub lines get a capital first letter.
function polishText(text,{capitalise=false,typed=false}={}){
  if(!text)return '';
  // What a person typed keeps its words and capitals; only spacing and tone placement are normalised.
  if(typed)return placeTones(tidy(text));
  const out=properNames(fixPhrases(placeTones(tidy(text))));
  return capitalise?capital(out):out;
}
// ---- spelling check -----------------------------------------------------------------------------------
const ONSETS='ngh|ng|nh|gh|gi|kh|ph|qu|th|tr|ch|b|c|d|đ|g|h|k|l|m|n|p|r|s|t|v|x';
const RIMES=new Set(('a ac ach ai am an ang anh ao ap at au ay ăc ăm ăn ăng ăp ăt âc âm ân âng âp ât âu ây e ec em en eng eo ep et ê êch êm ên ênh êp êt êu '+
  'i ia ich im in inh ip it iu iêc iêm iên iêng iêp iêt iêu o oa oac oach oai oam oan oang oanh oao oap oat oay oăc oăm oăn oăng oăt oc oe oen oeo oet oi om on ong ooc oong op ot '+
  'ô ôc ôi ôm ôn ông ôp ôt ơ ơi ơm ơn ơp ơt u ua uân uâng uât uây uc uê uêch uênh ui um un ung uôc uôi uôm uôn uông uôt up ut uy uya uych uyên uyêt uynh uyt uyu uơ uao uau uai uan '+
  'ư ưa ưc ưi ưm ưn ưng ươc ươi ươm ươn ương ươp ươt ươu ưt ưu y yêm yên yêng yêt yêu ynh yt ych').split(' '));
function isVietnamese(syllable){
  let tone=0;const bare=[...lower(syllable)].map(c=>{const hit=TONE_OF.get(c);if(!hit)return c;if(hit[1])tone=hit[1];return hit[0];}).join('');
  if(!/^[a-zăâđêôơư]+$/.test(bare)||/[fjwz]/.test(bare))return false;
  const m=new RegExp('^('+ONSETS+')?(.*)$').exec(bare),candidates=[[m[1]||'',m[2]]];
  if(m[1]==='gi')candidates.push(['g','i'+m[2]],['gi',m[2]||'i']);
  if(m[1]==='qu')candidates.push(['q','u'+m[2]]);
  return candidates.some(([,rime])=>{
    if(!RIMES.has(rime))return false;
    return !/(?:c|ch|p|t)$/.test(rime)||tone===2||tone===5;
  });
}
const FOREIGN=new Set([...LEXICON.foreign,...LEXICON.proper.flatMap(p=>lower(p).split(' '))].map(lower));
function suspiciousWords(text){
  const out=[];
  for(const raw of String(text||'').split(/\s+/)){
    for(const token of splitWord(raw)[1].split(/[\/]/)){
      const word=lower(token);
      if(!word||/\d/.test(word)||FOREIGN.has(word)||word.split('-').every(w=>FOREIGN.has(w)||isVietnamese(w)))continue;
      out.push(token);
    }
  }
  return [...new Set(out)];
}
// What a person should look at before publishing. index refers to the given list.
function reviewTexts(items){
  return items.flatMap((item,index)=>suspiciousWords(item.text).map(word=>({index,word,text:item.text,start:item.start})));
}
module.exports={polishText,placeTones,capital,suspiciousWords,reviewTexts,isVietnamese};
