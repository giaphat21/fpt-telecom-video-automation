'use strict';
// Finds the host through the FPT orange uniform: the face is directly above its collar. Used only to keep centred
// B-roll off the face; without a clear uniform it returns null and the default position is used.
const {spawn}=require('child_process');
const PATHS=require('../../config/paths.js');
const W=108,H=192,SCALE=1080/W;
function uniformInFrame(rgb){
  const mask=new Uint8Array(W*H),seen=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++){const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];if(r>150&&r-b>95&&r-g>55&&g>30&&g<r*.68)mask[i]=1;}
  let best=null;
  for(let start=0;start<W*H;start++){
    if(!mask[start]||seen[start])continue;
    const stack=[start],points=[];seen[start]=1;
    while(stack.length){
      const p=stack.pop(),x=p%W,y=(p-x)/W;points.push(p);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,q=ny*W+nx;if(nx>=0&&nx<W&&ny>=0&&ny<H&&mask[q]&&!seen[q]){seen[q]=1;stack.push(q);}}
    }
    if(!best||points.length>best.length)best=points;
  }
  // A uniform covers a real part of the picture; captions and small props do not.
  if(!best||best.length<W*H*.014)return null;
  const xs=best.map(p=>p%W).sort((a,b)=>a-b),q=k=>xs[Math.min(xs.length-1,Math.floor(xs.length*k))];
  const x0=q(.04),x1=q(.96),width=x1-x0+1,mid0=x0+width*.25,mid1=x0+width*.75;
  if(width<16)return null;
  const rows=new Map();for(const p of best){const x=p%W;if(x>=mid0&&x<=mid1){const y=(p-x)/W;rows.set(y,(rows.get(y)||0)+1);}}
  const collar=[...rows.entries()].filter(([,n])=>n>=Math.max(3,width*.12)).map(([y])=>y).sort((a,b)=>a-b)[0];
  return collar==null?null:{collar,width,cx:(x0+x1)/2};
}
const sampleFrames=(video,start,end,samples)=>new Promise(resolve=>{
  const span=Math.max(.1,end-start),child=spawn(PATHS.ffmpeg,['-v','error','-ss',start.toFixed(3),'-t',span.toFixed(3),'-i',video,'-vf','fps='+(samples/span).toFixed(4)+',scale='+W+':'+H+':flags=area','-frames:v',String(samples),'-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','ignore']});
  const chunks=[];child.stdout.on('data',d=>chunks.push(d));child.on('error',()=>resolve([]));
  child.on('close',()=>{const b=Buffer.concat(chunks),size=W*H*3,out=[];for(let i=0;i+size<=b.length;i+=size)out.push(b.subarray(i,i+size));resolve(out);});
});
async function detectFace(video,start,end,samples=7){
  const found=(await sampleFrames(video,start,end,samples)).map(uniformInFrame).filter(Boolean);
  if(found.length<Math.ceil(samples*.5))return null;
  const median=k=>found.map(f=>f[k]).sort((a,b)=>a-b)[Math.floor(found.length/2)];
  const collar=median('collar'),width=Math.min(72,median('width'));
  if(found.filter(f=>Math.abs(f.collar-collar)<=12).length<found.length*.6)return null;
  const head=Math.max(15,Math.min(42,width*.62));
  const bottom=Math.round((collar+2)*SCALE),top=Math.max(0,Math.round((collar-head)*SCALE));
  return {top,bottom,cy:Math.round((top+bottom)/2),cx:Math.round(median('cx')*SCALE),frames:found.length};
}
// Vertical place for a centred card between the Highlight (ends ~600) and the subtitles (start ~1500).
function cardTop(face,card,{top=610,bottom=1490}={}){
  if(!face||face.top>=top+card.height+10||face.bottom<=top)return top;
  const below=face.bottom+24;
  return below+card.height<=bottom?Math.max(top,below):bottom-card.height;
}
// Where each B-roll cue should put its card or the host, measured on the assembled picture.
// cuts: where the picture changes; the host can stand somewhere else after each of them.
async function layoutBrolls(video,specs,card,cuts=[]){
  return Promise.all(specs.map(async spec=>{
    if(spec.layout==='cutaway')return spec;
    if(spec.layout==='pip'){
      const edges=[spec.start,...cuts.filter(c=>c>spec.start+.25&&c<spec.end-.25),spec.end],parts=await Promise.all(edges.slice(0,-1).map(async(start,i)=>({start,face:await detectFace(video,start,edges[i+1],edges.length>2?5:7)})));
      const known=parts.find(p=>p.face)?.face||null,cardParts=parts.map(p=>({start:p.start,y:cardTop(p.face||known,card)}));
      return {...spec,cardY:cardParts[0].y,cardParts};
    }
    const face=await detectFace(video,spec.start,spec.end);
    // Split screen: frame the host by the detected face unless the user set the focus.
    return face&&spec.autoDetected&&!spec.focusChosen?{...spec,hostFocusY:Math.max(.2,Math.min(.8,face.cy/1920))}:spec;
  }));
}
module.exports={layoutBrolls,detectFace,cardTop,uniformInFrame};
