const {normalize}=require('../editing/timeline_rules');

'use strict';
const BRAND_COLORS = Object.freeze({ orange:'#F37021',blue:'#0066B3',green:'#00A651',navy:'#0B1F3F',white:'#FFFFFF' });
const BRAND_STYLES = Object.freeze([
  'fpt_editorial_stack','fpt_offset_echo','fpt_bracket_focus','fpt_ribbon_cut',
  'fpt_price_burst','fpt_voucher_3d','fpt_football_match','fpt_speed_hud',
  'fpt_camera_smart','fpt_neon_glass','fpt_split_kicker','fpt_tricolor_slab',
  'fpt_orange_block','fpt_blue_pill','fpt_green_badge','fpt_stack_outline',
  'fpt_logo_blocks','fpt_fiber_line','fpt_signal_bars','fpt_wifi_wave','fpt_router_led','fpt_data_stream','fpt_speed_gauge','fpt_connect_nodes'
]);
const HOOK_STYLES = Object.freeze(['slab_stack','logo_blocks','mega_outline','glass_card','ribbon_wave','signal_pop','ticket_banner','fiber_neon',
  'type_terminal','stamp_seal','swing_tag','curtain_bar','glitch_cut','wave_bounce','corner_frame','spotlight_ring','arrow_rush','tri_blocks']);
const hash = text => parseInt(require('crypto').createHash('sha256').update(String(text)).digest('hex').slice(0,8),16);
const MOTIONS = ['pop_bounce','slide_left','slam_drop','slide_right'];
const TOPICS=[
  [['fpt_football_match'],/ngoai hang|bong da|premier|champions|world cup|tran dau/],
  [['fpt_camera_smart','fpt_bracket_focus'],/camera|an ninh|giam sat|dam thoai/],
  [['fpt_speed_hud','fpt_wifi_wave','fpt_speed_gauge','fpt_fiber_line','fpt_signal_bars','fpt_router_led','fpt_data_stream'],/wifi|modem|internet|toc do|bang thong|gbps|mbps|cap quang|game|lag|mang/],
  [['fpt_price_burst','fpt_tricolor_slab','fpt_split_kicker'],/\d+ ?k\b|dong|gia|cuoc/],
  [['fpt_voucher_3d','fpt_green_badge'],/tang|mien phi|uu dai|qua|0 ?d\b/],
  [['fpt_neon_glass','fpt_connect_nodes','fpt_logo_blocks'],/fpt play|phim|truyen hinh|kenh|tai khoan/]
];
const THEMED=new Map([['fpt_football_match',0],['fpt_camera_smart',1],['fpt_speed_hud',2],['fpt_speed_gauge',2]]);
function topicStyles(text){const t=normalize(text);return TOPICS.filter(([,re])=>re.test(t)).flatMap(([s])=>s);}
// A themed look on the wrong message (football look on a price) reads as an editing mistake.
function misleading(style,text){return !!text&&THEMED.has(style)&&!TOPICS[THEMED.get(style)][1].test(normalize(text));}
const VIDEO_WEIGHT=[3.2,2.2,1.4,.9,.5,.25];
// seed + history make the same script look different in the next video; without them the result is stable.
// videos: styles used by earlier videos, newest first. The whole set of 24 styles rotates before one comes back.
function applyTypographyVariety(items,{seed=null,recentStyles=[],videos=null}={}) {
  const offset = seed==null?0:hash(seed), penalty = new Map();
  if(videos)videos.forEach((styles,v)=>new Set(styles).forEach(s=>penalty.set(s,(penalty.get(s)||0)+(VIDEO_WEIGHT[v]||0))));
  else recentStyles.forEach((s,i)=>{if(!penalty.has(s))penalty.set(s,3*(1-i/Math.max(1,recentStyles.length)));});
  const used = new Map(), recent = [], output = [];
  const chronological = items.map((h,index)=>({h,index})).sort((a,b)=>Number(a.h.start)-Number(b.h.start));
  let lastMotion = null;
  chronological.forEach(({h,index},order) => {
    const candidates = BRAND_STYLES.filter(s=>!recent.slice(-2).includes(s));
    const minimum = Math.min(...candidates.map(s=>used.get(s)||0));
    const fresh = candidates.filter(s=>(used.get(s)||0)===minimum);
    const topical = topicStyles(h.text), proper = fresh.filter(s=>!misleading(s,h.text));
    let style;
    // A choice made on the timeline stays; it only yields to the rule against repeating a look within three cues.
    if (h.styleFrom==='user' && candidates.includes(h.typo)) style = h.typo;
    else if ((seed==null||h.styleFrom==='plan') && !(seed!=null&&!h.styleFrom) && fresh.includes(h.typo) && !misleading(h.typo,h.text)) style = h.typo;
    else if (seed==null) style = topical.find(s=>fresh.includes(s)) || proper[index % Math.max(1,proper.length)] || fresh[index % fresh.length];
    else {
      const score = s => (penalty.get(s)||0) - (topical.includes(s)?1.6:0) + (hash(seed+s+order)%100)/180;
      style = [...(proper.length?proper:fresh)].sort((a,b)=>score(a)-score(b))[0];
    }
    let motion = h.styleFrom&&MOTIONS.includes(h.motion) ? h.motion : MOTIONS[(order+offset) % MOTIONS.length];
    if(motion===lastMotion&&h.styleFrom!=='user')motion=MOTIONS[(MOTIONS.indexOf(motion)+1)%MOTIONS.length];
    lastMotion=motion;
    used.set(style,(used.get(style)||0)+1); recent.push(style);
    output[index]={...h,typo:style,motion,y:350,scale:1.4};
  });
  return output;
}
module.exports={topicStyles,BRAND_COLORS,BRAND_STYLES,HOOK_STYLES,MOTIONS,applyTypographyVariety};
