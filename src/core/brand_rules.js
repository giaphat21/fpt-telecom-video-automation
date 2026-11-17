const PATHS=require('../../config/paths.js');

'use strict';
const BRAND_COLORS = Object.freeze({ orange:'#F37021',blue:'#0066B3',green:'#00A651',navy:'#0B1F3F',white:'#FFFFFF' });
const BRAND_STYLES = Object.freeze([
  'fpt_editorial_stack','fpt_offset_echo','fpt_bracket_focus','fpt_ribbon_cut',
  'fpt_price_burst','fpt_voucher_3d','fpt_football_match','fpt_speed_hud',
  'fpt_camera_smart','fpt_neon_glass','fpt_split_kicker','fpt_tricolor_slab',
  'fpt_orange_block','fpt_blue_pill','fpt_green_badge','fpt_stack_outline'
]);
const MOTIONS = ['pop_bounce','slide_left','slam_drop','slide_right'];
function applyTypographyVariety(items) {
  const used = new Map(), recent = [], output = [];
  const chronological = items.map((h,index)=>({h,index})).sort((a,b)=>Number(a.h.start)-Number(b.h.start));
  for (const {h,index} of chronological) {
    const candidates = BRAND_STYLES.filter(s=>!recent.slice(-2).includes(s));
    const minimum = Math.min(...candidates.map(s=>used.get(s)||0));
    const fresh = candidates.filter(s=>(used.get(s)||0)===minimum);
    // Keep a valid caller preference only when it satisfies the shared diversity rule.
    const style = fresh.includes(h.typo) ? h.typo : fresh[index % fresh.length];
    const motion = MOTIONS[index % MOTIONS.length];
    used.set(style,(used.get(style)||0)+1); recent.push(style);
    output[index]={...h,typo:style,motion,y:350,scale:1.4};
  }
  return output;
}
module.exports={BRAND_COLORS,BRAND_STYLES,applyTypographyVariety};
