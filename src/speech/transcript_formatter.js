'use strict';
const {polishText}=require('./text_quality');
const LEXICON=require('../../config/lexicon.json');
// ---- near misses of the usual FPT phrases ("trang hình ngay" → "trang bị ngay", "họ sắp xem bóng đá" → "thỏa sức xem
// bóng đá"). Same number of syllables only, so every word keeps its own time; at most one syllable differs (two in a
// phrase of five or more), the first or the last one must match, and a tone-only difference counts as a match.
const bare=s=>String(s).normalize('NFC').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
const FUZZY=(LEXICON.fuzzy||[]).map(p=>({phrase:p.split(' '),keys:p.split(' ').map(bare)})).filter(p=>p.keys.length>=3).sort((a,b)=>b.keys.length-a.keys.length);
function editDistance(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
function fixNearMisses(text){
  const words=text.split(' ');
  for(let i=0;i<words.length;i++)for(const {phrase,keys} of FUZZY){
    const n=keys.length;if(i+n>words.length)continue;
    const span=words.slice(i,i+n);if(span.slice(0,-1).some(w=>/[.,!?;:]$/.test(w)))continue;
    const got=span.map(bare),diff=got.reduce((d,k,j)=>d+(k===keys[j]?0:1),0);
    if(!diff||diff>(n>=5?2:1)||(got[0]!==keys[0]&&got[n-1]!==keys[n-1]))continue;
    // two changed syllables must each sound alike ("tu"/"ưu", "họ sắp"/"thỏa sức"), not be other words ("bóng đá"/"xem trọn")
    if(diff===2&&got.some((k,j)=>k!==keys[j]&&editDistance(k,keys[j])>2))continue;
    // a three-syllable phrase is restored only through its middle, or when the odd syllable sounds alike ("tốc độ Wi-Fi" stays)
    if(n===3&&diff===1&&got[1]===keys[1]&&got.some((k,j)=>k!==keys[j]&&editDistance(k,keys[j])>1))continue;
    // a single changed syllable must not be a number: "đi kèm 3 tài khoản" stays as said
    if(got.some((k,j)=>k!==keys[j]&&(/\d/.test(k)||/\d/.test(keys[j]))))continue;
    phrase.forEach((w,j)=>{const tail=(span[j].match(/[.,!?;:]+$/)||[''])[0];words[i+j]=(j===0&&/^\p{Lu}/u.test(span[0])?w.charAt(0).toLocaleUpperCase('vi')+w.slice(1):w)+tail;});
    i+=n-1;break;
  }
  return words.join(' ');
}
function cleanFptTranscript(text) {
  if (!text) return '';
  let t = text
    .replace(/\[_[^\]]*\]/g, '')
    .replace(/["""]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const replacements = [
    [/tạm\s+ngay(?=\s+camera)/gi,'tặng ngay'],
    [/tạng\s+ngay/gi,'tặng ngay'],
    [/tuyện\s+lợi/gi,'tiện lợi'],
    [/(?:đam|đạm)\s+thoại/gi,'đàm thoại'],
    // Brand & Product names
    [/(?<![\p{L}\p{N}])FVT(?![\p{L}\p{N}])/gu, 'FPT'],
    [/(?:model|modern|mô\s*đen)(?=\s+(?:wi-?\s?fi|MFV))/gi,'Modem'],
    [/(?<![\p{L}\p{N}])(?:MFV|VFV|Wi-?Fi\s*V)\s*6(?![\p{L}\p{N}])/giu,'Wi-Fi 6'],
    [/giá\s+trị(?=\s+từ(?:\s+hơn)?\s+\d)/gi,'giá chỉ'],
    [/(?:ngoài|ngoại)\s+ngang(?!\s*[\p{L}]*\s*hàng)/giu,'ngoại hạng'],
    [/(?<![\p{L}])uy\s+đá(?=\s+gì)/giu,'ưu đãi'],
    [/trường\s+hình(?![\p{L}])/giu,'truyền hình'],
    [/giật\s+(?:lát|lác|lắc)(?![\p{L}])/giu,'giật lag'],
    [/mang\s+thông(?![\p{L}])/giu,'băng thông'],
    [/biễn\s+phí/gi,'miễn phí'],
    [/(?<![\p{L}])ưu\s+đã(?![\p{L}])/giu,'ưu đãi'],
    [/(?<![\p{L}])(?:gói|quái|gối)\s+(?:cướp|cướt|cước|cất|cứt|cuốc)(?![\p{L}])/giu,'gói cước'],
    [/(?<![\p{L}])tiếng\s+hiệu(?![\p{L}])/giu,'tín hiệu'],
    [/(?<![\p{L}])mở\s+(?:rụng|rộn|dụng)(?![\p{L}])/giu,'mở rộng'],
    [/(?<![\p{L}])bất\s+tường(?=\s+(?:ngăn|chắn|cản|dày))/giu,'bức tường'],
    [/(?<![\p{L}])(?:model|modeo|mô\s*đeo)(?=\s+(?:lại|đặt|để|nhà|mạng|thì|của|bị|ở|này|cũ|mới))/giu,'Modem'],
    [/(?<![\p{L}])bộ\s+(?:pháp|phác|phát)(?=\s+(?:của|wi-?\s?fi|sóng|mạng))/giu,'bộ phát'],
    [/(?<![\p{L}])học\s+on\s*lai(?:n)?(?![\p{L}])/giu,'học online'],
    [/ưu\s+(?:đá|đại)(?![\p{L}])/giu,'ưu đãi'],
    [/đồng\s*\/\s*ngay(?![\p{L}])/giu,'đồng/ngày'],
    [/(?:quả|quà)\s+nặng(?![\p{L}])/giu,'quà tặng'],
    [/tác\s+bộ\s+nặng/gi,'tác vụ nặng'],
    [/giá\s+cứu(?![\p{L}])/giu,'giá cước'],
    [/lặp\s+mạng/gi,'lắp mạng'],
    [/trăm\s+bị(?=\s+(?:wi-?\s?fi|modem))/gi, 'trang bị'],
    [/(?:ép\s+pê\s+tê|ép\s+pi\s+ti|f\s*p\s*t)/gi, 'FPT'],
    [/(?:oai\s+phai|quay\s+phai|wi\s*fi|wifi)/gi, 'Wi-Fi'],
    [/wi-fi\s*(?:sáu|6)/gi, 'Wi-Fi 6'],
    [/(?:cam\s+mê\s+ra|ca\s+me\s+ra|camera)/gi, 'Camera'],
    [/camera\s*(?:ê\s*ai|ai|a\s*i)/gi, 'Camera AI'],
    [/fpt\s*(?:pờ\s*lây|play|lay)/gi, 'FPT Play'],
    [/(?:in\s+tơ\s+nét|in\s+tờ\s+nét|internet)/gi, 'Internet'],
    [/(?:mô\s+đem|mô\s+đun|mo\s*dem|modem)/gi, 'Modem'],

    // Common phonetic variations in Vietnamese telecom promos
    [/(?:lát\s+đặt|lãp\s+đặt|lấp\s+đặt|lắp\s+đặt)/gi, 'lắp đặt'],
    [/(?:lát\s+mạng|lặp\s+mạng|lắc\s+mạng|lãp\s+mạng|lấp\s+mạng|lắp\s+mạng)/gi, 'lắp mạng'],
    [/(?:tra\s+bị|chạm\s+bị|chăng\s+bị|ch\?ng\s+bị|trăng\s+bị|trang\s+bị)/gi, 'trang bị'],
    [/mới\s+(?:nhớ|nhứt|nhất)/gi, 'mới nhất'],
    [/(?:^|\b)(?:y\s+kem|y\s+kèm|đi\s+kem|đi\s+kèm)\b/gi, 'Đi kèm'],
    [/(?:năm|5)\s+(?:tại\s+khoảng|tài\s+khoảng|tại\s+khoản|tài\s+khoản)/gi, '5 tài khoản'],
    [/(?:tại\s+khoảng|tài\s+khoảng|tại\s+khoản)/gi, 'tài khoản'],
    [/(?:thỏ\s+sắc|thỏ\s+xác|thỏa\s+sắc|thoả\s+xác|thỏa\s+sức)/gi, 'thỏa sức'],
    [/(?:xe\s+bóng\s+đáng|xem\s+bóng\s+đáng|xe\s+bóng\s+đá|xem\s+bóng\s+đá)/gi, 'xem bóng đá'],
    [/(?:ngoại\s+hàng\s+ăn|ngoại\s+hạng\s+ăn|ngo\?i\s+h\?ng(?:\s+anh)?|ngoại\s+hạng\s+anh)/gi, 'Ngoại hạng Anh'],
    [/(?:t\?ng|tặn|tặng)\s+ngay/gi, 'tặng ngay'],
    [/(?:tóc\s+độ|tốc\s+độ)\s+cao/gi, 'tốc độ cao'],
    [/(\d+)\s*k\s*(?:đồng)?\s*(?:1|một)?\s*(?:tháng|thá|há)\b/gi, '$1K/tháng'],
    [/(\d+(?:[.,]\d+)?)\s*k\s*(?:1|một)\s*ngày/gi, '$1K/ngày'],
    [/(?:đăng\s+ký|dán\s+kích|đăng\s+kí)\s+(?:con\s+bó|con\s+bô|com\s+bo|combo)/gi, 'Đăng ký combo'],
    [/(?:con\s+bó|con\s+bô|com\s+bo)/gi, 'combo'],
    [/ưu\s+(?:đại|đãi)/gi, 'ưu đãi'],
    [/liền\s+(?:tây|tay)/gi, 'liền tay'],
    [/đàm\s+thoại\s+(?:2|hai)\s+chiều/gi, 'đàm thoại 2 chiều'],
    [/tác\s+vụ\s+nặng/gi, 'tác vụ nặng'],
    [/băng\s+thông/gi, 'băng thông'],
    [/\s{2,}/g, ' ']
  ];

  for (const [re, rep] of replacements) {
    t = t.replace(re, rep);
  }
  return polishText(fixNearMisses(t));
}

function alignCleanWords(words,cleanText) {
  const tokens=String(cleanText||'').trim().split(/\s+/).filter(Boolean);
  const norm=s=>String(s).normalize('NFC').toLocaleLowerCase('vi').replace(/[.,!?;:"]/g,'').trim();
  const raw=words.map(w=>({...w,word:String(w.word||w.text||'').trim()}));
  const a=raw.map(w=>norm(w.word)),b=tokens.map(norm),n=a.length,m=b.length;
  if(!n||!m)return [];
  // Match unchanged words first; changes are timed only inside their original local span.
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const anchors=[];let i=0,j=0;
  while(i<n&&j<m){if(a[i]===b[j]){anchors.push([i++,j++]);}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
  const output=[];let prevI=-1,prevJ=-1;
  for(const [ri,ti] of [...anchors,[n,m]]){
    const rawStart=prevI+1,rawEnd=ri-1,newStart=prevJ+1,newCount=ti-newStart;
    if(newCount>0){
      const first=raw[Math.min(rawStart,n-1)],last=raw[Math.max(rawStart,rawEnd)]||first;
      const st=Number(first.startMs??first.start*1000),en=Number(last.endMs??last.end*1000);
      for(let k=0;k<newCount;k++){
        // No global proportional reassignment: unchanged anchors retain exact timestamps.
        const rs=rawEnd>=rawStart?raw[Math.min(rawEnd,rawStart+Math.floor(k*(rawEnd-rawStart+1)/newCount))]:first;
        const oneToOne = rawEnd-rawStart+1 === newCount;
        const startMs=oneToOne?Number(rs.startMs??rs.start*1000):Math.round(st+(en-st)*k/newCount),endMs=oneToOne?Number(rs.endMs??rs.end*1000):Math.round(st+(en-st)*(k+1)/newCount);
        output.push({...rs,word:tokens[newStart+k],text:tokens[newStart+k]+' ',startMs,endMs,
          ...(rs.start!=null?{start:startMs/1000,end:endMs/1000}:{}),timestampMs:Math.round((startMs+endMs)/2)});
      }
    }
    if(ri<n)output.push({...raw[ri],word:tokens[ti],text:tokens[ti]+' '});
    prevI=ri;prevJ=ti;
  }
  return output;
}


function correctSubtitles(subtitles=[]) {
  // Correct across subtitle rows too: a display line is not a linguistic boundary.
  const raw=subtitles.flatMap((sub,index)=>(sub.words||[]).map(w=>({...w,subtitleIndex:index})));
  const groups=Array.from({length:subtitles.length},()=>[]);
  // Keep corrections local to continuous speech, never bridge distant takes.
  const batches=[];let batch=[];
  for(const word of raw){
    const prev=batch.at(-1);
    const start=Number(word.startMs??word.start*1000),end=prev?Number(prev.endMs??prev.end*1000):start;
    if(prev&&start-end>800){batches.push(batch);batch=[];}
    batch.push(word);
  }
  if(batch.length)batches.push(batch);
  for(const words of batches){
    const clean=cleanFptTranscript(words.map(w=>w.word||w.text||'').join(' '));
    for(const word of alignCleanWords(words,clean)){
      const {subtitleIndex,...timedWord}=word;
      groups[subtitleIndex].push(timedWord);
    }
  }
  const norm=s=>String(s||'').normalize('NFC').toLocaleLowerCase('vi').replace(/[.,!?;:"]/g,'').replace(/\s+/g,' ').trim();
  return subtitles.map((sub,index)=>{
    const original=(sub.words||[]).map(w=>w.word||w.text||'').join(' ').trim();
    const words=groups[index],sameText=original&&norm(original)===norm(sub.text);
    const text=sameText?words.map(w=>w.word||w.text||'').join(' ').trim():cleanFptTranscript(sub.text);
    if(!text)return null;
    const display=sub.edited?polishText(sub.text,{typed:true}):polishText(text.replace(/[.,;:]+$/,''),{capitalise:true});
    const start=words.length?Math.min(Number(sub.start),Number(words[0].startMs??words[0].start*1000)/1000):sub.start;
    const end=words.length?Math.max(Number(sub.end),Number(words.at(-1).endMs??words.at(-1).end*1000)/1000):sub.end;
    return {...sub,text:display||text,words,start:Number.isFinite(start)?start:sub.start,end:Number.isFinite(end)?end:sub.end};
  }).filter(Boolean);
}
module.exports={cleanFptTranscript,alignCleanWords,correctSubtitles,fixNearMisses};
