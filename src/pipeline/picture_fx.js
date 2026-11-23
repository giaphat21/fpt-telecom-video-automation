'use strict';
// Effects the user puts anywhere on the picture. Titles and Sub are drawn after them and stay steady.
const KINDS={
  zoom_in:{name:'Zoom nhấn',dur:.35},zoom_slow:{name:'Đẩy máy chậm',dur:1.6},zoom_out:{name:'Thu máy',dur:.6},
  shake:{name:'Rung',dur:.35},flash:{name:'Chớp sáng',dur:.22},dip:{name:'Chớp tối',dur:.35},blur:{name:'Mờ chuyển',dur:.3},swing:{name:'Lắc ngang',dur:.5}
};
const round=n=>Math.round(n*1000)/1000;
function normalizeFx(list,totalDur){
  return (Array.isArray(list)?list.slice(0,80):[]).map((e,i)=>({uid:String(e.uid||'f'+i),kind:e.kind,start:round(Math.max(0,Number(e.start)||0)),end:round(Math.min(totalDur,Number(e.end)||0))}))
    .filter(e=>KINDS[e.kind]&&e.end-e.start>=.05);
}
// The same curves drive the export (FFmpeg expressions) and the live preview (numbers).
function frameFx(list,t){
  const out={zoom:1,dx:0,dy:0,light:0,blur:0};
  for(const e of list){
    if(t<e.start||t>=e.end)continue;
    const d=e.end-e.start,p=(t-e.start)/d;
    if(e.kind==='zoom_in')out.zoom+=.14*Math.pow(1-p,3);
    else if(e.kind==='zoom_slow')out.zoom+=.10*p;
    else if(e.kind==='zoom_out')out.zoom+=.12*(1-p);
    else if(e.kind==='shake'){out.zoom+=.05*(1-p);out.dx+=16*Math.sin(t*95)*(1-p);out.dy+=12*Math.cos(t*80)*(1-p);}
    else if(e.kind==='swing'){out.zoom+=.06*(1-p);out.dx+=26*Math.sin(p*18)*(1-p);}
    else if(e.kind==='flash')out.light+=.42*(1-p);
    else if(e.kind==='dip')out.light-=.75*Math.sin(Math.PI*p);
    else if(e.kind==='blur')out.blur=Math.max(out.blur,14*Math.sin(Math.PI*p));
  }
  return out;
}
function fxFilters(list){
  if(!list||!list.length)return '';
  const parts={zoom:[],dx:[],dy:[],light:[]},blurs=[];
  for(const e of list){
    const a=e.start.toFixed(3),b=e.end.toFixed(3),d=(e.end-e.start).toFixed(3),p='((t-'+a+')/'+d+')',on='gte(t,'+a+')*lt(t,'+b+')*';
    if(e.kind==='zoom_in')parts.zoom.push(on+'0.14*pow(1-'+p+',3)');
    else if(e.kind==='zoom_slow')parts.zoom.push(on+'0.10*'+p);
    else if(e.kind==='zoom_out')parts.zoom.push(on+'0.12*(1-'+p+')');
    else if(e.kind==='shake'){parts.zoom.push(on+'0.05*(1-'+p+')');parts.dx.push(on+'16*sin(t*95)*(1-'+p+')');parts.dy.push(on+'12*cos(t*80)*(1-'+p+')');}
    else if(e.kind==='swing'){parts.zoom.push(on+'0.06*(1-'+p+')');parts.dx.push(on+'26*sin('+p+'*18)*(1-'+p+')');}
    else if(e.kind==='flash')parts.light.push(on+'0.42*(1-'+p+')');
    else if(e.kind==='dip')parts.light.push('-'+on+'0.75*sin(3.14159*'+p+')');
    else if(e.kind==='blur')blurs.push('gblur=sigma=9:steps=2:enable=\'between(t,'+a+','+(e.end-.001).toFixed(3)+')\'');
  }
  const chain=[];
  if(parts.zoom.length){
    const z='(1+'+parts.zoom.join('+')+')',x=parts.dx.length?'+'+parts.dx.join('+'):'',y=parts.dy.length?'+'+parts.dy.join('+'):'';
    chain.push("scale=w='2*trunc(540*"+z+")':h='2*trunc(960*"+z+")':eval=frame:flags=bicubic","crop=1080:1920:x='max(0,min(in_w-1080,(in_w-1080)/2"+x+"))':y='max(0,min(in_h-1920,(in_h-1920)/2"+y+"))'",'setsar=1');
  }
  if(parts.light.length)chain.push("eq=eval=frame:brightness='max(-1,min(1,"+parts.light.join('+').replace(/\+-/g,'-')+"))'");
  return [...chain,...blurs].join(',');
}
module.exports={KINDS,normalizeFx,frameFx,fxFilters};
