'use strict';
// Sub text looks and keyword emphasis. Pure module: the Studio preview uses the same table.
// JavaScript \b is ASCII-only, so Vietnamese needs explicit letter boundaries.
const L='(?<![\\p{L}\\p{N}])',R='(?![\\p{L}\\p{N}])';
const bounded=source=>new RegExp(L+'(?:'+source+')'+R,'iu');
const KEYWORDS=[
  '\\d+(?:[.,]\\d+)?\\s*K(?:\\s*\\/\\s*(?:tháng|ngày))?','\\d+(?:[.,]\\d{3})*\\s*(?:đồng|nghìn|ngàn|triệu)','0\\s*đ','miễn\\s+phí','tiết\\s+kiệm',
  'giảm\\s+ngay','quà\\s+tặng','FPT\\s*Play','FPT','Modem','Wi-?Fi(?:\\s*[67])?','Mesh','Internet','Cáp\\s+quang','\\d+\\s*(?:Mbps|Gbps)',
  'băng\\s+thông','tốc\\s+độ','độ\\s+trễ','ping','Camera(?:\\s+AI)?','an\\s+ninh','giám\\s+sát','đàm\\s+thoại(?:\\s*(?:2|hai)\\s*chiều)?',
  'chuyển\\s+động','Cloud','Ngoại\\s+hạng\\s+Anh','C1','Champions\\s+League','truyền\\s+hình','\\d+\\s+tài\\s+khoản','bóng\\s+đá','kho\\s+phim',
  'Chưa\\s+hết','Đặc\\s+biệt','Thứ\\s+(?:ba|hai|nhất)\\s+là','Tóm\\s+lại','Đăng\\s+ký\\s+ngay','Nhanh\\s+tay','Quá\\s+hời','siêu\\s+phẩm',
  'đỉnh\\s+chóp','cực\\s+mượt','ưu\\s+đãi','combo'].join('|');
const SPLIT=new RegExp('('+L+'(?:'+KEYWORDS+')'+R+')','giu');
const ICONS=[
  ['👁️',bounded('camera|an\\s+ninh|giám\\s+sát|đàm\\s+thoại')],
  ['⚽',bounded('ngoại\\s+hạng|c1|bóng\\s+đá|fpt\\s+play|kho\\s+phim')],
  ['💰',bounded('\\d+\\s*k|\\d+(?:[.,]\\d{3})+\\s*đồng|0\\s*đ|tiền|giá|tiết\\s+kiệm')],
  ['⚡',bounded('wi-?fi|internet|gbps|mbps|tốc\\s+độ|cáp\\s+quang|modem|mesh')],
  ['🎁',bounded('miễn\\s+phí|quà\\s+tặng|ưu\\s+đãi|combo')]
];
function subtitleIcon(text){
  if(/[⚡💰🚀👁⚽🎁🔥📶]/u.test(text))return '';
  const hit=ICONS.find(([,re])=>re.test(text));
  return hit?hit[0]+' ':'';
}
// User text can contain braces or backslashes; ASS would read them as override tags.
function escapeAss(text){
  return String(text).replace(/\\/g,'/').replace(/\{/g,'(').replace(/\}/g,')').replace(/[\r\n]+/g,' ');
}
function styleSubtitleKeywords(text,open,close){
  return text.split(SPLIT).map((part,i)=>i%2?open+part+close:part).join('');
}
// ---- looks --------------------------------------------------------------------------------------------
const O='#F37021',B='#0066B3',G='#00A651',N='#0B1F3F',W='#FFFFFF',STD='#FC6601',YELLOW='#FFFF00';
// text/outline: ordinary words. key/keyOutline: keywords. box: solid background. active: the word being spoken.
const SUB_STYLES={
  chuan:{name:'Vàng viền cam (chuẩn)',text:W,outline:STD,w:8,key:YELLOW,keyOutline:STD,kw:11,scale:120},
  trang_vien_cam:{name:'Trắng viền cam',text:W,outline:O,w:10,key:W,keyOutline:O,kw:13,scale:118},
  trang_vien_xanh:{name:'Trắng viền xanh dương',text:W,outline:B,w:10,key:W,keyOutline:B,kw:13,scale:118},
  trang_vien_navy:{name:'Trắng viền navy',text:W,outline:N,w:10,key:O,keyOutline:W,kw:9,scale:118},
  trang_vien_la:{name:'Trắng viền xanh lá',text:W,outline:G,w:10,key:W,keyOutline:G,kw:13,scale:118},
  trang_hai_vien:{name:'Trắng, từ khóa viền xanh',text:W,outline:O,w:9,key:W,keyOutline:B,kw:12,scale:120},
  cam_vien_trang:{name:'Cam viền trắng',text:O,outline:W,w:9,key:B,keyOutline:W,kw:11,scale:118},
  xanh_vien_trang:{name:'Xanh viền trắng',text:B,outline:W,w:9,key:O,keyOutline:W,kw:11,scale:118},
  hop_cam:{name:'Hộp cam chữ trắng',text:W,key:W,box:O,scale:100},
  hop_xanh:{name:'Hộp xanh chữ trắng',text:W,key:W,box:B,scale:100},
  hop_navy:{name:'Hộp navy, từ khóa cam',text:W,key:O,box:N,scale:100},
  hop_trang:{name:'Hộp trắng, từ khóa cam',text:N,key:O,box:W,scale:100},
  doc_theo_cam:{name:'Sáng từng từ (cam)',text:W,outline:N,w:10,active:O,activeOutline:W,scale:112},
  doc_theo_la:{name:'Sáng từng từ (xanh lá)',text:W,outline:N,w:10,active:G,activeOutline:W,scale:112}
};
const DEFAULT_SUB='chuan';
const subStyle=id=>SUB_STYLES[id]?id:DEFAULT_SUB;
// ---- ASS (colours are stored as BGR) ------------------------------------------------------------------
const assColor=hex=>hex.slice(5,7)+hex.slice(3,5)+hex.slice(1,3);
const c1=hex=>'\\1c&H00'+assColor(hex)+'&',c3=hex=>'\\3c&H00'+assColor(hex)+'&';
const normal=s=>s.box?'{'+c1(s.text)+c3(s.box)+'}':'{'+c1(s.text)+c3(s.outline)+'\\bord'+s.w+'\\shad4\\fscx100\\fscy100}';
const emphasised=s=>s.box?'{'+c1(s.key)+c3(s.box)+'}':'{'+c1(s.key)+c3(s.keyOutline)+'\\bord'+s.kw+'\\shad5\\fscx'+s.scale+'\\fscy'+s.scale+'}';
const KEYWORD_OPEN=emphasised(SUB_STYLES.chuan),KEYWORD_CLOSE='{\\1c&H00FFFFFF&\\3c&H000166FC&\\bord8\\shad4\\fscx100\\fscy100}';
const styleLines=()=>{
  const base='Montserrat-Bold,48,&H00FFFFFF,&H00FFFFFF,&H00'+assColor(STD)+',&H64000000,-1,0,0,0,100,100,0,0,1,8,4,2,190,190,340,1',out=['Style: FptRunning,'+base];
  for(const [id,s] of Object.entries(SUB_STYLES))if(s.box)out.push('Style: Fpt_'+id+',Montserrat-Bold,48,&H00'+assColor(s.text)+',&H00'+assColor(s.text)+',&H00'+assColor(s.box)+',&H00'+assColor(s.box)+',-1,0,0,0,100,100,0,0,3,16,0,2,190,190,340,1');
  return out.join('\n');
};
const POP='\\fscx70\\fscy70\\t(0,85,\\fscx118\\fscy118)\\t(85,175,\\fscx100\\fscy100)';
// One or more events for a Sub. Karaoke looks get one event per spoken word so the light follows the voice.
function assEvents(sub,styleId,time,y=1580){
  const id=subStyle(styleId),s=SUB_STYLES[id],clean=escapeAss(String(sub.text||'').trim());if(!clean)return [];
  const head='{\\an2\\pos(540,'+y+')\\b1'+(s.box?'':'\\bord'+(s.w+1)+'\\shad4'),layer=s.box?'Fpt_'+id:'FptRunning';
  const event=(a,b,body,pop)=>'Dialogue: 0,'+time(a)+','+time(b)+','+layer+',,0,0,0,,'+head+(pop?POP:'')+'}'+body;
  const text=subtitleIcon(clean)+clean;
  if(!s.active){
    // The approved look is written exactly as before; the others set their colours first.
    const body=id==='chuan'?styleSubtitleKeywords(text,KEYWORD_OPEN,KEYWORD_CLOSE):normal(s)+styleSubtitleKeywords(text,emphasised(s),normal(s));
    return [event(sub.start,sub.end,id==='chuan'||s.box?body:body.replace('\\fscx100\\fscy100}','}'),true)];
  }
  const shown=clean.split(/\s+/),words=(sub.words||[]).map(w=>Number(w.startMs)/1000).filter(Number.isFinite);
  const starts=shown.map((_,i)=>words.length===shown.length?words[i]:sub.start+(sub.end-sub.start)*i/shown.length);
  const icon=subtitleIcon(clean),on='{'+c1(s.active)+c3(s.activeOutline)+'\\bord'+(s.w-1)+'\\fscx'+s.scale+'\\fscy'+s.scale+'}';
  return shown.map((_,i)=>{
    const a=i?Math.max(sub.start,starts[i]):sub.start,b=i+1<shown.length?Math.max(sub.start,starts[i+1]):sub.end;
    if(b-a<.02)return null;
    const body=normal(s)+icon+shown.map((w,k)=>k===i?on+w+normal(s):w).join(' ');
    return event(a,b,i?body:body.replace('\\fscx100\\fscy100}','}'),!i);
  }).filter(Boolean);
}
const ALLOWED=new Set(['000000',...Object.values(SUB_STYLES).flatMap(s=>[s.text,s.outline,s.key,s.keyOutline,s.box,s.active,s.activeOutline]).filter(Boolean).map(assColor)]);
// Sub is the one place where yellow is allowed (AGENTS.md 8.1); titles keep the FPT palette.
function assertBrandSubtitles(ass){
  const bad=[...String(ass).matchAll(/&H([0-9A-F]{6,8})&?/gi)].map(m=>m[1].toUpperCase().slice(-6)).filter(c=>!ALLOWED.has(c));
  if(bad.length)throw new Error('Sub dùng màu ngoài các kiểu đã duyệt: '+[...new Set(bad)].join(', '));
}
module.exports={subtitleIcon,styleSubtitleKeywords,escapeAss,assertBrandSubtitles,KEYWORD_OPEN,KEYWORD_CLOSE,SUB_STYLES,DEFAULT_SUB,subStyle,styleLines,assEvents};
