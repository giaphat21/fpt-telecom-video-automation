const {normalize}=require('../editing/timeline_rules');
const {isNegative}=require('../editing/tone');

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
  'type_terminal','stamp_seal','swing_tag','curtain_bar','glitch_cut','wave_bounce','corner_frame','spotlight_ring','arrow_rush','tri_blocks',
  'neon_glow','extrude_pop','split_open','light_beam']);
// Problem set: used only, and first, on phrases about a problem (src/editing/tone.js).
const NEGATIVE_STYLES = Object.freeze(['neg_wall_block','neg_weak_signal','neg_lag_glitch','neg_strike_cross','neg_warning_tape','neg_crack_sink','neg_wifi_off','neg_down_trend']);
// B-roll set (user, 24/11/2026): looks made for one picture. A Highlight shown while that B-roll is on screen (or
// on a phrase that names the topic) takes the look of its picture first, then related looks of the main set.
const BROLL_STYLES = Object.freeze(['fpt_game_crosshair','fpt_game_victory','fpt_score_bar','fpt_cam_rec','fpt_play_cinema','fpt_play_button']);
const BROLL_THEMES = [
  {topic:'game',ids:/^(stock_lienminh|stock_lienquan|stock_gaming)$/,text:/lien minh|lien quan|choi game|\bgame\b|gaming|esports?|leo rank|game thu/,styles:['fpt_game_crosshair','fpt_game_victory','fpt_speed_hud']},
  {topic:'football',ids:/^stock_football$/,text:/ngoai hang|bong da|premier|champions|world cup|tran dau|cau thu|ban thang/,styles:['fpt_score_bar','fpt_football_match']},
  {topic:'camera',ids:/^(stock_camera|mg_camera)/,text:/camera|an ninh|giam sat|dam thoai/,styles:['fpt_cam_rec','fpt_camera_smart','fpt_bracket_focus']},
  {topic:'fptplay',ids:/^(stock_fptplay|mg_movie)$/,text:/fpt play|kho phim|xem phim|truyen hinh/,styles:['fpt_play_cinema','fpt_play_button','fpt_neon_glass']},
  {topic:'network',ids:/^(stock_wifi6|mg_mesh|mg_speed|mg_signal|mg_work)$/,text:null,styles:['fpt_wifi_wave','fpt_router_led','fpt_signal_bars','fpt_speed_gauge','fpt_fiber_line']}
];
// The theme of the B-roll on screen when the Highlight appears. Words alone keep the softer topical preference below,
// so the same script still gets different looks from one video to the next.
function brollTheme(h,brolls=[]){
  const s=Number(h.start),on=(brolls||[]).find(b=>b&&b.enabled!==false&&b.brollId&&s>=Number(b.start)-.05&&s<Number(b.end));
  const theme=on&&BROLL_THEMES.find(th=>th.ids.test(on.brollId));return theme?{...theme,key:on.uid||on.brollId+'@'+on.start}:null;
}
const hash = text => parseInt(require('crypto').createHash('sha256').update(String(text)).digest('hex').slice(0,8),16);
const MOTIONS = ['pop_bounce','slide_left','slam_drop','slide_right'];
const TOPICS=[
  [['fpt_football_match'],/ngoai hang|bong da|premier|champions|world cup|tran dau/],
  [['fpt_camera_smart','fpt_bracket_focus'],/camera|an ninh|giam sat|dam thoai/],
  [['fpt_speed_hud','fpt_wifi_wave','fpt_speed_gauge','fpt_fiber_line','fpt_signal_bars','fpt_router_led','fpt_data_stream'],/wifi|modem|internet|toc do|bang thong|gbps|mbps|cap quang|game|lag|mang/],
  // whole words: 'gia' in 'giai tri', 'tang' (tầng) and 'qua' (quá) are not prices or gifts
  [['fpt_price_burst','fpt_tricolor_slab','fpt_split_kicker'],/\b\d+ ?k\b|\b\d[\d.,]* ?(dong|d|nghin|trieu)\b|\bgia (chi|tu|cuoc|re|uu dai|goc)\b|\bgoi cuoc\b|\bcuoc phi\b/],
  [['fpt_voucher_3d','fpt_green_badge'],/^tang\b|\btang (ngay|kem|them|mien phi|camera|modem|thiet bi|\d)|\bmien phi\b|\buu dai\b|\bqua tang\b|\bvoucher\b|\b0 ?d\b/],
  [['fpt_neon_glass','fpt_connect_nodes','fpt_logo_blocks'],/fpt play|phim|truyen hinh|kenh|tai khoan/]
];
// A price burst or a voucher on a phrase that is not about price or a gift reads as a false offer.
const THEMED=new Map([['fpt_football_match',0],['fpt_camera_smart',1],['fpt_speed_hud',2],['fpt_speed_gauge',2],['fpt_price_burst',3],['fpt_voucher_3d',4]]);
function topicStyles(text){const t=normalize(text);return TOPICS.filter(([,re])=>re.test(t)).flatMap(([s])=>s);}
// A themed look on the wrong message (football look on a price) reads as an editing mistake.
function misleading(style,text){return !!text&&THEMED.has(style)&&!TOPICS[THEMED.get(style)][1].test(normalize(text));}
const VIDEO_WEIGHT=[3.2,2.2,1.4,.9,.5,.25];
// seed + history make the same script look different in the next video; without them the result is stable.
// videos: styles used by earlier videos, newest first. The whole set of 24 styles rotates before one comes back.
function applyTypographyVariety(items,{seed=null,recentStyles=[],videos=null,brolls=[]}={}) {
  const offset = seed==null?0:hash(seed), penalty = new Map();
  if(videos)videos.forEach((styles,v)=>new Set(styles).forEach(s=>penalty.set(s,(penalty.get(s)||0)+(VIDEO_WEIGHT[v]||0))));
  else recentStyles.forEach((s,i)=>{if(!penalty.has(s))penalty.set(s,3*(1-i/Math.max(1,recentStyles.length)));});
  const used = new Map(), recent = [], output = [];
  const chronological = items.map((h,index)=>({h,index})).sort((a,b)=>Number(a.h.start)-Number(b.h.start));
  // At most two Highlights per picture wear its look: enough to tie text and picture, the rest keep the rotation.
  const perPicture=new Map();
  let lastMotion = null;const ceiling=Math.max(2,Math.ceil(items.length/BRAND_STYLES.length)+1);
  chronological.forEach(({h,index},order) => {
    // A problem phrase draws from the problem set first; any other phrase never gets it.
    const negative = isNegative(h.text), pool = negative ? [...NEGATIVE_STYLES,...BRAND_STYLES] : BRAND_STYLES;
    const candidates = pool.filter(s=>!recent.slice(-2).includes(s));
    const ranked = negative ? candidates.filter(s=>NEGATIVE_STYLES.includes(s)) : candidates, choices = ranked.length ? ranked : candidates;
    const minimum = Math.min(...choices.map(s=>used.get(s)||0));
    const fresh = choices.filter(s=>(used.get(s)||0)===minimum);
    const topical = topicStyles(h.text), proper = fresh.filter(s=>!misleading(s,h.text));
    let style;
    // A choice made on the timeline stays; it only yields to the rule against repeating a look within three cues.
    const theme = negative ? null : brollTheme(h,brolls), themed = theme && (perPicture.get(theme.key)||0)<2 ? theme.styles.filter(s=>!recent.slice(-2).includes(s)&&(used.get(s)||0)<ceiling) : [];
    if (h.styleFrom==='user' && [...BRAND_STYLES,...NEGATIVE_STYLES,...BROLL_STYLES].includes(h.typo) && !recent.slice(-2).includes(h.typo)) style = h.typo;
    // the look of the picture on screen: least used first, the picture's own looks before related ones
    else if (themed.length) {
      const low=Math.min(...themed.map(s=>used.get(s)||0)),least=themed.filter(s=>(used.get(s)||0)===low);
      // between videos the picture's looks take turns too (penalty of recent videos), the picture's own looks first
      perPicture.set(theme.key,(perPicture.get(theme.key)||0)+1);
      style = seed==null ? least[0] : least.map((s,k)=>({s,v:(penalty.get(s)||0)+k*.4+(hash(seed+s+order)%100)/400})).sort((a,b)=>a.v-b.v)[0].s;
    }
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
module.exports={topicStyles,brollTheme,BROLL_STYLES,BROLL_THEMES,BRAND_COLORS,BRAND_STYLES,NEGATIVE_STYLES,HOOK_STYLES,MOTIONS,applyTypographyVariety};
