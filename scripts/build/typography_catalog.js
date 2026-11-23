'use strict';
// Brand reference sheet: every Highlight style and Hook look, drawn by the production renderer itself.
const fs=require('fs'),path=require('path');
const {createCanvas}=require('@napi-rs/canvas');
const P=require('../../config/paths');
const K=require('../../src/typography/kinetic_overlay');
const SAMPLE=['Đi kèm 5 tài khoản FPT Play','xem bóng đá Ngoại hạng Anh','tặng ngay Camera AI','đàm thoại 2 chiều','giá chỉ từ 195.000 đồng','miễn phí Modem Wi-Fi 6','tốc độ tăng gấp 3 lần','băng thông cực mạnh'];
const COLS=4,W=540,H=350,HEAD=150,styles=Object.keys(K.STYLES),hooks=Object.keys(K.HOOKS);
const rows=Math.ceil(styles.length/COLS)+Math.ceil(hooks.length/COLS);
const sheet=createCanvas(COLS*W,HEAD*2+rows*H),x=sheet.getContext('2d');
x.fillStyle='#0B1F3F';x.fillRect(0,0,sheet.width,sheet.height);
function title(text,sub,y){x.fillStyle='#FFFFFF';x.font='48px FptHead';x.fillText(text,40,y+72);x.fillStyle='#FFD9BF';x.font='24px FptBody';x.fillText(sub,40,y+112);['#0066B3','#F37021','#00A651'].forEach((c,i)=>{x.fillStyle=c;x.fillRect(sheet.width-340+i*100,y+60,90,14);});}
function cell(plan,t,label,col,y){
  const canvas=K.frameDrawer(K.buildCues(plan))(t),left=col*W;
  x.fillStyle=(col+Math.floor(y/H))%2?'#51645a':'#5d7066';x.fillRect(left+6,y+6,W-12,H-12);
  if(canvas)x.drawImage(canvas,left,y,W,H);
  x.fillStyle='#FFFFFF';x.font='18px FptBody';x.fillText(label,left+20,y+H-20);
}
K.buildCues({totalDur:1,highlights:[]});
title('FPT TELECOM · 24 KIỂU HIGHLIGHT','Cam #F37021 · Xanh dương #0066B3 · Xanh lá #00A651 · Navy #0B1F3F · Trắng',0);
styles.forEach((s,i)=>cell({totalDur:5,highlights:[{text:SAMPLE[i%SAMPLE.length],typo:s,motion:'pop_bounce',start:0,dur:3,y:350,scale:1.4}]},1.1,s,i%COLS,HEAD+Math.floor(i/COLS)*H));
const base=HEAD+Math.ceil(styles.length/COLS)*H;
title(hooks.length+' PHONG CÁCH HOOK / OUTRO','Luân phiên tự động giữa các video',base);
hooks.forEach((s,i)=>cell({totalDur:5,hookDur:3.5,hook:{style:s,line1:'LẮP ĐẶT INTERNET',line2:'FPT TRANG BỊ NGAY',line3:'MODEM WI-FI 6 MỚI NHẤT',y:320,scale:1.3},highlights:[]},1.6,s,i%COLS,base+HEAD+Math.floor(i/COLS)*H));
const out=path.join(P.root,'docs/brand/brand_typography.png');fs.writeFileSync(out,sheet.toBuffer('image/png'));console.log(out);
