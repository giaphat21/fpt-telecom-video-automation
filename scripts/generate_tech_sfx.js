const PATHS=require('../config/paths.js');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const SFX_DIR = path.join(STUDIO_ROOT, 'assets/sfx-tech');
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');

fs.mkdirSync(SFX_DIR, { recursive: true });

const SAMPLE_RATE = 44100;

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

function wavToMp3(wavPath, mp3Path) {
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', wavPath,
    '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', mp3Path
  ]);
  if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
}

// DSP Helper generator definitions
const SFX_RECIPES = [
  // 1. Cyber Whooshes & Transitions
  {
    id: 'sfx_cyber_whoosh_fast',
    name: 'Whip Cyber Whoosh',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.35,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const freq = 180 + 900 * Math.sin(p * Math.PI);
      const noise = (Math.random() * 2 - 1) * 0.45;
      return (Math.sin(2 * Math.PI * freq * t) * 0.55 + noise) * env * 0.9;
    }
  },
  {
    id: 'sfx-tech_swoosh_high',
    name: 'Tech Swoosh High',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.42,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.pow(Math.sin(p * Math.PI), 1.4);
      const freq = 350 * Math.pow(4.5, p);
      const osc = Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.3;
      return (osc + (Math.random() * 2 - 1) * 0.25) * env;
    }
  },
  {
    id: 'sfx_fiber_optic_pass',
    name: 'Fiber Optic Pass',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.50,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.pow(Math.sin(p * Math.PI), 2.0);
      const freq = 200 + 1200 * Math.pow(p, 1.8);
      const resonance = Math.sin(2 * Math.PI * (freq + 15 * Math.sin(p * 40)) * t);
      return (resonance * 0.7 + (Math.random() * 2 - 1) * 0.3) * env;
    }
  },
  {
    id: 'sfx_data_warp_speed',
    name: 'Data Warp Speed',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.45,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const sweep = 120 + 1800 * Math.pow(p, 2.5);
      return Math.sin(2 * Math.PI * sweep * t) * env * 0.85;
    }
  },
  {
    id: 'sfx_quantum_slide',
    name: 'Quantum Slide',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.38,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f = 800 - 600 * p;
      return (Math.sin(2 * Math.PI * f * t) * 0.6 + (Math.random() * 2 - 1) * 0.3) * env;
    }
  },
  {
    id: 'sfx_hologram_open',
    name: 'Hologram Open',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.40,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI * 0.95);
      const f1 = 440 + 880 * p;
      const f2 = 880 + 1760 * p;
      return (Math.sin(2 * Math.PI * f1 * t) * 0.5 + Math.sin(2 * Math.PI * f2 * t) * 0.35) * env;
    }
  },
  {
    id: 'sfx_hologram_close',
    name: 'Hologram Close',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.32,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f1 = 1200 - 900 * p;
      return Math.sin(2 * Math.PI * f1 * t) * env * 0.8;
    }
  },
  {
    id: 'sfx_air_whip_tech',
    name: 'Air Whip Tech',
    cat: 'Whoosh & Chuyển Cảnh',
    dur: 0.28,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.pow(Math.sin(p * Math.PI), 2.5);
      const noise = (Math.random() * 2 - 1);
      return noise * env * 0.95;
    }
  },

  // 2. UI Clicks, Pops & Micro-interactions
  {
    id: 'sfx_ui_pop_bright',
    name: 'UI Pop Bright',
    cat: 'UI Click & Pop',
    dur: 0.14,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 14);
      const freq = 450 + 750 * (1 - p);
      return Math.sin(2 * Math.PI * freq * t) * env;
    }
  },
  {
    id: 'sfx_ui_click_glass',
    name: 'Glass UI Tap',
    cat: 'UI Click & Pop',
    dur: 0.08,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 32);
      return (Math.sin(2 * Math.PI * 1800 * t) * 0.7 + (Math.random() * 2 - 1) * 0.3) * env;
    }
  },
  {
    id: 'sfx_digital_tap',
    name: 'Digital Soft Tap',
    cat: 'UI Click & Pop',
    dur: 0.09,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 26);
      return Math.sin(2 * Math.PI * 920 * t) * env * 0.9;
    }
  },
  {
    id: 'sfx_subtle_tick',
    name: 'Subtle Metronome Tick',
    cat: 'UI Click & Pop',
    dur: 0.06,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 45);
      return Math.sin(2 * Math.PI * 2200 * t) * env;
    }
  },
  {
    id: 'sfx_bubble_pop_tech',
    name: 'Bubble Pop Tech',
    cat: 'UI Click & Pop',
    dur: 0.16,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 12);
      const f = 300 + 900 * Math.pow(p, 0.4);
      return Math.sin(2 * Math.PI * f * t) * env;
    }
  },
  {
    id: 'sfx_button_confirm',
    name: 'Button Confirm',
    cat: 'UI Click & Pop',
    dur: 0.18,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 9);
      const f = t < 0.08 ? 659.25 : 880; // E5 -> A5
      return Math.sin(2 * Math.PI * f * t) * env;
    }
  },
  {
    id: 'sfx_toggle_switch',
    name: 'Cyber Toggle Switch',
    cat: 'UI Click & Pop',
    dur: 0.12,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 18);
      const f = t < 0.05 ? 1200 : 700;
      return (Math.sin(2 * Math.PI * f * t) * 0.7 + (Math.random() * 2 - 1) * 0.2) * env;
    }
  },
  {
    id: 'sfx_card_flip',
    name: 'Card Flip Micro',
    cat: 'UI Click & Pop',
    dur: 0.15,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f = 250 + 600 * p;
      return ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * f * t) * 0.4) * env;
    }
  },

  // 3. Data Streams, Scans & Laser Beams
  {
    id: 'sfx_data_stream_typing',
    name: 'Data Stream Rapid Typing',
    cat: 'Data & Scan Laser',
    dur: 0.65,
    gen: (t, d) => {
      const step = Math.floor(t * 22);
      const subT = (t * 22) - step;
      const env = Math.exp(-subT * 18);
      const f = 800 + ((step * 137) % 600);
      return Math.sin(2 * Math.PI * f * t) * env * 0.75;
    }
  },
  {
    id: 'sfx_ai_scan_beam',
    name: 'AI Camera Scan Beam',
    cat: 'Data & Scan Laser',
    dur: 0.55,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const sweep = 600 + 400 * Math.sin(p * Math.PI * 4);
      return Math.sin(2 * Math.PI * sweep * t) * env * 0.8;
    }
  },
  {
    id: 'sfx_laser_hud_ping',
    name: 'Laser HUD Ping',
    cat: 'Data & Scan Laser',
    dur: 0.22,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 10);
      const f = 2400 - 1600 * Math.pow(p, 0.5);
      return Math.sin(2 * Math.PI * f * t) * env;
    }
  },
  {
    id: 'sfx_barcode_scan_success',
    name: 'Scan Success Beep',
    cat: 'Data & Scan Laser',
    dur: 0.15,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 14);
      return Math.sin(2 * Math.PI * 1760 * t) * env;
    }
  },
  {
    id: 'sfx_biometric_face_scan',
    name: 'Biometric Face Scan',
    cat: 'Data & Scan Laser',
    dur: 0.60,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 12);
      const f = 1000 + 500 * Math.sin(p * Math.PI * 3);
      return Math.sin(2 * Math.PI * f * t) * env * pulse * 0.85;
    }
  },
  {
    id: 'sfx_radar_pulse',
    name: 'Radar Sonar Pulse',
    cat: 'Data & Scan Laser',
    dur: 0.50,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 5);
      return Math.sin(2 * Math.PI * 1250 * t) * env * 0.85;
    }
  },
  {
    id: 'sfx_modem_handshake_blip',
    name: 'Wi-Fi 6 Modem Handshake',
    cat: 'Data & Scan Laser',
    dur: 0.35,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f = 1200 + 400 * Math.sin(p * 35);
      return (Math.sin(2 * Math.PI * f * t) * 0.6 + (Math.random() * 2 - 1) * 0.25) * env;
    }
  },
  {
    id: 'sfx_glitch_digital_byte',
    name: 'Digital Glitch Byte',
    cat: 'Data & Scan Laser',
    dur: 0.26,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const sq = (Math.sin(2 * Math.PI * 320 * t) > 0 ? 1 : -1) * 0.4;
      const noise = (Math.random() * 2 - 1) * 0.5;
      return (sq + noise) * env;
    }
  },

  // 4. Notifications, Alerts & Success Chimes
  {
    id: 'sfx_cash_register_ting',
    name: 'Cash Register Ting (Báo Giá)',
    cat: 'Thông Báo & Chime',
    dur: 0.55,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 4.5);
      const f1 = 2093.0; // C7
      const f2 = 4186.0; // C8 harmonic
      return (Math.sin(2 * Math.PI * f1 * t) * 0.65 + Math.sin(2 * Math.PI * f2 * t) * 0.35) * env;
    }
  },
  {
    id: 'sfx_smart_bell_ding',
    name: 'Smart Bell Ding',
    cat: 'Thông Báo & Chime',
    dur: 0.65,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 4.0);
      const f1 = 1760.0; // A6
      const f2 = 2793.8; // F7
      return (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t) * 0.35) * env;
    }
  },
  {
    id: 'sfx_success_tech_chime',
    name: 'Success Tech Chime',
    cat: 'Thông Báo & Chime',
    dur: 0.60,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 4.2);
      const note = t < 0.15 ? 1046.5 : (t < 0.30 ? 1318.5 : 2093.0); // C6 -> E6 -> C7
      return Math.sin(2 * Math.PI * note * t) * env;
    }
  },
  {
    id: 'sfx_reply_notification',
    name: 'TikTok Reply Notification',
    cat: 'Thông Báo & Chime',
    dur: 0.28,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 8);
      const f = t < 0.12 ? 880 : 1320;
      return Math.sin(2 * Math.PI * f * t) * env * 0.9;
    }
  },
  {
    id: 'sfx_gift_unlocked_sparkle',
    name: 'Gift Unlocked Sparkle',
    cat: 'Thông Báo & Chime',
    dur: 0.70,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 3.8);
      const f1 = 1500 + 400 * Math.sin(p * 28);
      const f2 = 2500 + 600 * Math.cos(p * 32);
      return (Math.sin(2 * Math.PI * f1 * t) * 0.5 + Math.sin(2 * Math.PI * f2 * t) * 0.4) * env;
    }
  },
  {
    id: 'sfx_high_priority_alert',
    name: 'High Priority Alert',
    cat: 'Thông Báo & Chime',
    dur: 0.40,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f = t < 0.20 ? 987.77 : 1318.51; // B5 -> E6
      return Math.sin(2 * Math.PI * f * t) * env;
    }
  },
  {
    id: 'sfx_camera_shutter_ai',
    name: 'FPT Camera AI Shutter',
    cat: 'Thông Báo & Chime',
    dur: 0.25,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 14);
      const click = (t < 0.05 || (t > 0.09 && t < 0.14)) ? 1 : 0.2;
      return ((Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 900 * t) * 0.3) * env * click;
    }
  },
  {
    id: 'sfx_dual_tone_beep',
    name: 'Dual Tone Beep',
    cat: 'Thông Báo & Chime',
    dur: 0.24,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 7);
      return (Math.sin(2 * Math.PI * 1200 * t) * 0.5 + Math.sin(2 * Math.PI * 1600 * t) * 0.5) * env;
    }
  },

  // 5. Risers, Impacts & Drops
  {
    id: 'sfx-tech_riser_1s',
    name: 'Cyber Tech Riser',
    cat: 'Riser & Impact',
    dur: 0.85,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.pow(p, 2.5);
      const sweep = 180 * Math.pow(7, p);
      return (Math.sin(2 * Math.PI * sweep * t) * 0.7 + (Math.random() * 2 - 1) * 0.3) * env;
    }
  },
  {
    id: 'sfx_cyber_charge_up',
    name: 'Energy Charge Up',
    cat: 'Riser & Impact',
    dur: 0.75,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.pow(p, 2.0);
      const freq = 120 + 1400 * Math.pow(p, 2);
      return Math.sin(2 * Math.PI * freq * t) * env * 0.9;
    }
  },
  {
    id: 'sfx_sub_bass_drop',
    name: 'Sub Bass Drop',
    cat: 'Riser & Impact',
    dur: 0.70,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 3.5);
      const freq = 130 * Math.exp(-p * 2.8); // 130Hz -> ~30Hz
      return Math.sin(2 * Math.PI * freq * t) * env * 0.95;
    }
  },
  {
    id: 'sfx_matrix_impact',
    name: 'Matrix Slam Impact',
    cat: 'Riser & Impact',
    dur: 0.60,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 6);
      const f = 90 * Math.exp(-p * 3);
      const noise = (Math.random() * 2 - 1) * Math.exp(-p * 15) * 0.5;
      return (Math.sin(2 * Math.PI * f * t) * 0.7 + noise) * env;
    }
  },
  {
    id: 'sfx_power_on_surge',
    name: 'System Power Surge',
    cat: 'Riser & Impact',
    dur: 0.65,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI * 0.9);
      const sweep = 60 + 800 * Math.pow(p, 1.5);
      return Math.sin(2 * Math.PI * sweep * t) * env * 0.85;
    }
  },
  {
    id: 'sfx_record_scratch_fx',
    name: 'Record Scratch Cut',
    cat: 'Riser & Impact',
    dur: 0.45,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f = 800 * Math.sin(p * Math.PI * 8);
      const noise = (Math.random() * 2 - 1) * 0.6;
      return (Math.sin(2 * Math.PI * f * t) * 0.4 + noise) * env;
    }
  },
  {
    id: 'sfx_party_confetti_boom',
    name: 'Party Confetti Popper',
    cat: 'Riser & Impact',
    dur: 0.55,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 5);
      const sub = Math.sin(2 * Math.PI * 110 * t) * Math.exp(-p * 10);
      const crackle = (Math.random() * 2 - 1) * 0.7;
      return (sub * 0.5 + crackle * 0.5) * env;
    }
  },
  {
    id: 'sfx_whoosh_impact_slam',
    name: 'Whoosh Slam Impact',
    cat: 'Riser & Impact',
    dur: 0.58,
    gen: (t, d) => {
      const p = t / d;
      const env = t < 0.25 ? Math.sin((t / 0.25) * Math.PI * 0.5) : Math.exp(-(t - 0.25) * 6);
      const f = t < 0.25 ? (200 + 800 * (t / 0.25)) : (90 * Math.exp(-(t - 0.25) * 3));
      return (Math.sin(2 * Math.PI * f * t) * 0.65 + (Math.random() * 2 - 1) * 0.35) * env;
    }
  },

  // 6. Network, Cloud & Hardware
  {
    id: 'sfx_wifi6_gigabit_burst',
    name: 'Wi-Fi 6 Gigabit Burst',
    cat: 'Network & Cloud',
    dur: 0.50,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f1 = 800 + 1200 * p;
      const f2 = 1600 + 800 * p;
      return (Math.sin(2 * Math.PI * f1 * t) * 0.5 + Math.sin(2 * Math.PI * f2 * t) * 0.4) * env;
    }
  },
  {
    id: 'sfx_mesh_node_link',
    name: 'Mesh Node Linked',
    cat: 'Network & Cloud',
    dur: 0.42,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 4.5);
      const f = t < 0.14 ? 784 : (t < 0.28 ? 987.7 : 1318.5); // G5 -> B5 -> E6
      return Math.sin(2 * Math.PI * f * t) * env;
    }
  },
  {
    id: 'sfx_cloud_sync_done',
    name: 'Cloud FPT Synced',
    cat: 'Network & Cloud',
    dur: 0.48,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 4.5);
      const f = 1046.5 + 500 * p; // C6 upward
      return Math.sin(2 * Math.PI * f * t) * env * 0.9;
    }
  },
  {
    id: 'sfx_fiber_core_glow',
    name: 'Fiber Core Optical Beam',
    cat: 'Network & Cloud',
    dur: 0.55,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const sweep = 400 + 800 * Math.sin(p * Math.PI * 3);
      return Math.sin(2 * Math.PI * sweep * t) * env * 0.85;
    }
  },
  {
    id: 'sfx_security_shield_lock',
    name: 'Security Shield Lock',
    cat: 'Network & Cloud',
    dur: 0.38,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 8);
      const f = t < 0.12 ? 440 : 880;
      const clank = (Math.random() * 2 - 1) * Math.exp(-p * 20) * 0.4;
      return (Math.sin(2 * Math.PI * f * t) * 0.6 + clank) * env;
    }
  },
  {
    id: 'sfx_low_ping_beep',
    name: 'Ping 2ms Ultra Low',
    cat: 'Network & Cloud',
    dur: 0.14,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 15);
      return Math.sin(2 * Math.PI * 2600 * t) * env;
    }
  },
  {
    id: 'sfx_packet_transfer_fast',
    name: 'Packet Transfer Fast',
    cat: 'Network & Cloud',
    dur: 0.32,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f = 1400 + 600 * Math.sin(p * 20);
      return Math.sin(2 * Math.PI * f * t) * env * 0.85;
    }
  },
  {
    id: 'sfx_download_complete',
    name: 'Download Complete Ding',
    cat: 'Network & Cloud',
    dur: 0.50,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 5);
      const f = t < 0.20 ? 880 : 1760;
      return Math.sin(2 * Math.PI * f * t) * env;
    }
  },

  // 7. Special Gaming & Entertainment
  {
    id: 'sfx_esports_score_ting',
    name: 'eSports Score Ring',
    cat: 'Gaming & Giải Trí',
    dur: 0.55,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 4.5);
      const f1 = 1568; // G6
      const f2 = 3136; // G7
      return (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t) * 0.4) * env;
    }
  },
  {
    id: 'sfx_cinema_4k_whoosh',
    name: 'FPT Play 4K Cinematic Intro',
    cat: 'Gaming & Giải Trí',
    dur: 0.65,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const f = 140 + 900 * Math.pow(p, 1.8);
      return (Math.sin(2 * Math.PI * f * t) * 0.7 + (Math.random() * 2 - 1) * 0.3) * env;
    }
  },
  {
    id: 'sfx_stadium_cheer_burst',
    name: 'Ngoại Hạng Anh Stadium Burst',
    cat: 'Gaming & Giải Trí',
    dur: 0.75,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI * 0.95);
      const rumble = Math.sin(2 * Math.PI * 95 * t) * 0.4;
      const crowd = (Math.random() * 2 - 1) * 0.6;
      return (rumble + crowd) * env * 0.85;
    }
  },
  {
    id: 'sfx_level_up_tech',
    name: 'Level Up Tech Arp',
    cat: 'Gaming & Giải Trí',
    dur: 0.55,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 4);
      const step = Math.min(3, Math.floor(t * 7));
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      return Math.sin(2 * Math.PI * notes[step] * t) * env;
    }
  },
  {
    id: 'sfx_ultra_speed_turbo',
    name: 'Turbo Boost Speed',
    cat: 'Gaming & Giải Trí',
    dur: 0.50,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const sweep = 220 * Math.pow(5.5, p);
      return Math.sin(2 * Math.PI * sweep * t) * env * 0.9;
    }
  },
  {
    id: 'sfx_game_zero_lag_hit',
    name: 'Zero Lag Crisp Hit',
    cat: 'Gaming & Giải Trí',
    dur: 0.22,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 14);
      return (Math.sin(2 * Math.PI * 750 * t) * 0.6 + (Math.random() * 2 - 1) * 0.4) * env;
    }
  },
  {
    id: 'sfx_digital_applause',
    name: 'Digital Mini Applause',
    cat: 'Gaming & Giải Trí',
    dur: 0.60,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.sin(p * Math.PI);
      const pops = (Math.random() * 2 - 1) * Math.sin(p * Math.PI * 18);
      return pops * env * 0.85;
    }
  },
  {
    id: 'sfx_futuristic_logo_sting',
    name: 'FPT Futuristic Sting',
    cat: 'Gaming & Giải Trí',
    dur: 0.70,
    gen: (t, d) => {
      const p = t / d;
      const env = Math.exp(-p * 3.5);
      const f1 = 880;  // A5
      const f2 = 1320; // E6
      const f3 = 1760; // A6
      return (Math.sin(2 * Math.PI * f1 * t) * 0.4 + Math.sin(2 * Math.PI * f2 * t) * 0.35 + Math.sin(2 * Math.PI * f3 * t) * 0.25) * env;
    }
  }
];

function generateAllTechSfx() {
  console.log(`Bắt đầu sinh ${SFX_RECIPES.length} Technology Sound Effects...`);
  const manifest = [];

  for (const recipe of SFX_RECIPES) {
    const mp3Name = `${recipe.id}.mp3`;
    const wavName = `${recipe.id}.wav`;
    const mp3Path = path.join(SFX_DIR, mp3Name);
    const wavPath = path.join(SFX_DIR, wavName);

    const len = Math.floor(SAMPLE_RATE * recipe.dur);
    const samples = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      samples[i] = recipe.gen(t, recipe.dur);
    }
    writeWav(wavPath, samples);
    wavToMp3(wavPath, mp3Path);

    manifest.push({
      id: recipe.id,
      name: recipe.name,
      cat: recipe.cat,
      dur: recipe.dur,
      file: mp3Name,
      url: `/assets/sfx-tech/${mp3Name}`
    });
  }

  const manifestPath = path.join(SFX_DIR, 'sfx_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✅ Đã sinh thành công ${SFX_RECIPES.length} Technology Sound Effects vào thư mục: ${SFX_DIR}`);
  return manifest;
}

if (require.main === module) {
  generateAllTechSfx();
}

module.exports = { generateAllTechSfx, SFX_RECIPES };
