'use strict';
// Effects on the picture: the user's own and the transitions the plan puts at picture cuts. Titles and Sub are drawn
// after them and stay steady. Transitions move and blur the picture only: no light, no glare (user, 24/11/2026).
const KINDS={
  zoom_in:{name:'Zoom nhấn',dur:.35},zoom_slow:{name:'Đẩy máy chậm',dur:1.6},zoom_out:{name:'Thu máy',dur:.6},
  shake:{name:'Rung',dur:.35},flash:{name:'Chớp sáng',dur:.22},dip:{name:'Chớp tối',dur:.35},blur:{name:'Mờ chuyển',dur:.3},swing:{name:'Lắc ngang',dur:.5},
  whip:{name:'Lia ngang',dur:.42},whip_v:{name:'Lia dọc',dur:.42},zoom_blur:{name:'Zoom mờ',dur:.4},push_in:{name:'Đẩy vào nhanh',dur:.4},
  pull_out:{name:'Kéo ra',dur:.45},spin:{name:'Xoay chuyển',dur:.5},glitch:{name:'Giật hình',dur:.36},bounce:{name:'Nảy hình',dur:.5}
};
// Transitions at picture cuts, in rotation. pre: seconds of the effect before the cut, so its peak lands on the cut.
const TRANSITIONS={whip:{pre:.13},whip_v:{pre:.13},zoom_blur:{pre:.16},spin:{pre:.18},pull_out:{pre:.15},push_in:{pre:0},glitch:{pre:.06},bounce:{pre:0}};
const SPIN=.15;
// the share of the effect before the cut
const cutAt=e=>TRANSITIONS[e.kind]?Math.min(.9,TRANSITIONS[e.kind].pre/((e.end-e.start)||1)):.5;
// in and out of the cut: rises to 1 at the cut, falls back after it
const through=(p,f,inPow,outPow)=>p<f?Math.pow(p/f,inPow):Math.pow(1-(p-f)/(1-f),outPow);
const round=n=>Math.round(n*1000)/1000;
function normalizeFx(list,totalDur){
  return (Array.isArray(list)?list.slice(0,80):[]).map((e,i)=>({uid:String(e.uid||'f'+i),kind:e.kind,start:round(Math.max(0,Number(e.start)||0)),end:round(Math.min(totalDur,Number(e.end)||0))}))
    .filter(e=>KINDS[e.kind]&&e.end-e.start>=.05);
}
// The same curves drive the export (FFmpeg expressions) and the live preview (numbers).
function frameFx(list,t){
  const out={zoom:1,dx:0,dy:0,light:0,blur:0,spin:0};
  for(const e of list){
    if(t<e.start||t>=e.end)continue;
    const d=e.end-e.start,p=(t-e.start)/d,bell=Math.sin(Math.PI*p),f=cutAt(e);
    if(e.kind==='zoom_in')out.zoom+=.14*Math.pow(1-p,3);
    else if(e.kind==='zoom_slow')out.zoom+=.10*p;
    else if(e.kind==='zoom_out')out.zoom+=.12*(1-p);
    else if(e.kind==='shake'){out.zoom+=.05*(1-p);out.dx+=16*Math.sin(t*95)*(1-p);out.dy+=12*Math.cos(t*80)*(1-p);}
    else if(e.kind==='swing'){out.zoom+=.06*(1-p);out.dx+=26*Math.sin(p*18)*(1-p);}
    else if(e.kind==='flash')out.light+=.42*(1-p);
    else if(e.kind==='dip')out.light-=.75*Math.sin(Math.PI*p);
    else if(e.kind==='blur')out.blur=Math.max(out.blur,14*Math.sin(Math.PI*p));
    else if(e.kind==='whip'||e.kind==='whip_v'){const s=p<f?-140*Math.pow(p/f,2):140*Math.pow(1-(p-f)/(1-f),3);out.zoom+=.25*bell;if(e.kind==='whip')out.dx+=s;else out.dy+=s;if(Math.abs(p-f)<.13)out.blur=Math.max(out.blur,12);}
    else if(e.kind==='zoom_blur'){out.zoom+=.2*bell;if(p>.2&&p<.8)out.blur=Math.max(out.blur,10);}
    else if(e.kind==='push_in')out.zoom+=.22*Math.pow(1-p,2);
    else if(e.kind==='pull_out'){out.zoom+=.2*through(p,f,2,2);if(Math.abs(p-f)<.14)out.blur=Math.max(out.blur,9);}
    else if(e.kind==='spin'){out.zoom+=.34*bell;out.spin+=SPIN*(p<f?Math.pow(p/f,2):-Math.pow(1-(p-f)/(1-f),2));if(p>.22&&p<.6)out.blur=Math.max(out.blur,8);}
    else if(e.kind==='glitch'){const step=Math.floor(t*30);out.zoom+=.06;out.dx+=16*((step*37)%9-4)/4*(1-p);out.dy+=6*((step*53)%5-2)/2*(1-p);}
    else if(e.kind==='bounce')out.zoom+=.09*Math.abs(Math.sin(p*3*Math.PI))*(1-p);
  }
  return out;
}
function fxFilters(list){
  if(!list||!list.length)return '';
  const parts={zoom:[],dx:[],dy:[],light:[],spin:[]},blurs=[],spins=[];
  const blur=(a,b,s=9)=>blurs.push('gblur=sigma='+s+':steps=2:enable=\'between(t,'+a.toFixed(3)+','+(b-.001).toFixed(3)+')\'');
  for(const e of list){
    const a=e.start.toFixed(3),b=e.end.toFixed(3),dd=e.end-e.start,d=dd.toFixed(3),p='((t-'+a+')/'+d+')',on='gte(t,'+a+')*lt(t,'+b+')*',bell='sin(3.14159*'+p+')',f=cutAt(e),F=f.toFixed(4),G=(1-f).toFixed(4);
    if(e.kind==='zoom_in')parts.zoom.push(on+'0.14*pow(1-'+p+',3)');
    else if(e.kind==='zoom_slow')parts.zoom.push(on+'0.10*'+p);
    else if(e.kind==='zoom_out')parts.zoom.push(on+'0.12*(1-'+p+')');
    else if(e.kind==='shake'){parts.zoom.push(on+'0.05*(1-'+p+')');parts.dx.push(on+'16*sin(t*95)*(1-'+p+')');parts.dy.push(on+'12*cos(t*80)*(1-'+p+')');}
    else if(e.kind==='swing'){parts.zoom.push(on+'0.06*(1-'+p+')');parts.dx.push(on+'26*sin('+p+'*18)*(1-'+p+')');}
    else if(e.kind==='flash')parts.light.push(on+'0.42*(1-'+p+')');
    else if(e.kind==='dip')parts.light.push('-'+on+'0.75*sin(3.14159*'+p+')');
    else if(e.kind==='blur')blurs.push('gblur=sigma=9:steps=2:enable=\'between(t,'+a+','+(e.end-.001).toFixed(3)+')\'');
    else if(e.kind==='whip'||e.kind==='whip_v'){parts.zoom.push(on+'0.25*'+bell);(e.kind==='whip'?parts.dx:parts.dy).push(on+'if(lt('+p+','+F+'),-140*pow('+p+'/'+F+',2),140*pow(1-('+p+'-'+F+')/'+G+',3))');blur(e.start+(f-.13)*dd,e.start+(f+.13)*dd,8);}
    else if(e.kind==='zoom_blur'){parts.zoom.push(on+'0.2*'+bell);blur(e.start+.2*dd,e.start+.8*dd,7);}
    else if(e.kind==='push_in')parts.zoom.push(on+'0.22*pow(1-'+p+',2)');
    else if(e.kind==='pull_out'){parts.zoom.push(on+'0.2*if(lt('+p+','+F+'),pow('+p+'/'+F+',2),pow(1-('+p+'-'+F+')/'+G+',2))');blur(e.start+(f-.14)*dd,e.start+(f+.14)*dd,6);}
    else if(e.kind==='spin'){parts.zoom.push(on+'0.34*'+bell);spins.push(on+SPIN+'*if(lt('+p+','+F+'),pow('+p+'/'+F+',2),-pow(1-('+p+'-'+F+')/'+G+',2))');spins.on=(spins.on||[]).concat('between(t,'+a+','+b+')');blur(e.start+.22*dd,e.start+.6*dd,6);}
    else if(e.kind==='glitch'){parts.zoom.push(on+'0.06');parts.dx.push(on+'16*(mod(floor(t*30)*37,9)-4)/4*(1-'+p+')');parts.dy.push(on+'6*(mod(floor(t*30)*53,5)-2)/2*(1-'+p+')');}
    else if(e.kind==='bounce')parts.zoom.push(on+'0.09*abs(sin('+p+'*9.42478))*(1-'+p+')');
  }
  const chain=[];
  // the frame turns on its centre first; the zoom after it pushes the uncovered corners out of the frame
  if(spins.length)chain.push("rotate=a='"+spins.join('+')+"':fillcolor=black:enable='"+spins.on.join('+')+"'");
  if(parts.zoom.length){
    const z='(1+'+parts.zoom.join('+')+')',x=parts.dx.length?'+'+parts.dx.join('+'):'',y=parts.dy.length?'+'+parts.dy.join('+'):'';
    chain.push("scale=w='2*trunc(540*"+z+")':h='2*trunc(960*"+z+")':eval=frame:flags=bicubic","crop=1080:1920:x='max(0,min(in_w-1080,(in_w-1080)/2"+x+"))':y='max(0,min(in_h-1920,(in_h-1920)/2"+y+"))'",'setsar=1');
  }
  if(parts.light.length)chain.push("eq=eval=frame:brightness='max(-1,min(1,"+parts.light.join('+').replace(/\+-/g,'-')+"))'");
  return [...chain,...blurs].join(',');
}
module.exports={KINDS,TRANSITIONS,normalizeFx,frameFx,fxFilters};
