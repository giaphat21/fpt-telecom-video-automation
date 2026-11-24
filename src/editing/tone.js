'use strict';
// Is a spoken phrase about a problem ("bị bức tường ngăn", "sóng yếu", "giật lag")? Problems get the negative typography
// set and a heavier sound; solutions ("không còn giật lag", "phủ sóng xuyên tường") never do.
const {normalize}=require('./timeline_rules');
const NEGATIVE=new RegExp([
  '(song|mang|wifi|wi fi|tin hieu|ket noi|internet|duong truyen)( bi| rat| qua| hoi| cu| van)? (yeu|kem|cham|chap chon)',
  '\\b(yeu|kem) (song|qua|lam|xiu)\\b','\\b(bi|rat|qua|hoi) (yeu|cham)\\b','\\bcham (qua|lam|ri|xuong|chap|chap)\\b',
  '\\b(toc do|tai|load|vao mang|xem phim)( bi| rat| qua| hoi| thi| lai)? cham\\b',
  '\\bgiat (lag|giat|hinh|cuc)\\b','\\bbi giat\\b','\\blag\\b','\\bchap chon\\b','\\brot mang\\b','\\bdung hinh\\b','\\b(quay|xoay) vong\\b','\\bgoi cuoc (\\w+ )?cham\\b','\\bdat qua xa\\b','\\bdo tre cao\\b','\\bping cao\\b',
  '\\bmat (song|ket noi|mang|tin hieu|wifi)\\b','\\bbuc tuong\\b','\\btuong (day|ngan|gach|be tong|chan)\\b','\\b(nhieu|qua|cach) (buc )?tuong\\b',
  '\\b(ngan can|can tro|chan song|cham song|goc chet|tac nghen|nghen mang|khong vao duoc|khong ket noi duoc|khong xem duoc|loading mai)\\b',
  '\\b(phien phuc|kho chiu|bat tien|buc minh|uc che)\\b'
].join('|'));
// A problem that is said to be gone is good news.
const SOLVED=/\b(khong|het|chang|khoi|tam biet|chong|giam|bot|xoa)( con| bao gio)?( bi| lo)? (giat|lag|cham|yeu|chap chon|rot|mat|bi|lo)|\bxuyen (qua )?(moi |cac |nhieu )?(buc )?tuong\b|\bvuot (qua )?(moi |cac )?(buc )?tuong\b/;
function isNegative(text){const t=normalize(text||'');return NEGATIVE.test(t)&&!SOLVED.test(t);}
module.exports={isNegative};
