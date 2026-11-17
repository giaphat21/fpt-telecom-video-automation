const PATHS=require('../../config/paths.js');
'use strict';
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
    [/(?:lát\s+mạng|lãp\s+mạng|lấp\s+mạng|lắp\s+mạng)/gi, 'lắp mạng'],
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
  return t.trim();
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
    const start=words.length?Math.min(Number(sub.start),Number(words[0].startMs??words[0].start*1000)/1000):sub.start;
    const end=words.length?Math.max(Number(sub.end),Number(words.at(-1).endMs??words.at(-1).end*1000)/1000):sub.end;
    return {...sub,text,words,start:Number.isFinite(start)?start:sub.start,end:Number.isFinite(end)?end:sub.end};
  }).filter(Boolean);
}
module.exports={cleanFptTranscript,alignCleanWords,correctSubtitles};
