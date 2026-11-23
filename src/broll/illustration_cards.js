'use strict';
// Illustration cards the user adds on purpose. Never inserted automatically.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const PATHS=require('../../config/paths.js');
function illustrationSpecs(job,hookDur){
  const voiceBrollSpecs=[];
  const defaultIllustrationTemplates = {
    wifi6: {
      type: 'wifi6',
      kicker: 'TẦNG 1: Trang Bị Modem Wi-Fi 6',
      title: 'TỐC ĐỘ 1 Gbps KHÔNG GIỚI HẠN',
      features: [
        '✔ Độ trễ cực thấp < 5ms — Chơi Game 0 Lag',
        '✔ Mesh phủ sóng xuyên tường toàn bộ căn hộ',
        '✔ Kết nối cùng lúc 30+ thiết bị mượt mà'
      ],
      accent: 'blue',
      sfx: 'sfx_cyber_whoosh_fast'
    },
    fptplay: {
      type: 'fptplay',
      kicker: 'TẦNG 2: Chưa Hết... 5 Tài Khoản FPT Play',
      title: 'ĐỘC QUYỀN NGOẠI HẠNG ANH & C1',
      features: [
        '✔ Gần 200 kênh truyền hình 4K HDR',
        '✔ Kho phim bom tấn Hollywood cập nhật liên tục',
        '✔ Xem đồng thời trên TV, Mobile & Tablet'
      ],
      accent: 'green',
      sfx: 'sfx_cinema_4k_whoosh'
    },
    camera: {
      type: 'camera',
      kicker: 'TẦNG 3: Đặc Biệt... Tặng Camera AI 0Đ',
      title: 'TẶNG NGAY CAMERA AI 0Đ',
      features: [
        '✔ Nhận diện người AI chính xác 99.8%',
        '✔ Đàm thoại 2 chiều to rõ như điện thoại',
        '✔ Lưu trữ Cloud FPT tại Việt Nam bảo mật 100%'
      ],
      accent: 'orange',
      sfx: 'sfx_camera_shutter_ai'
    },
    speedtest: {
      type: 'speedtest',
      kicker: 'THỰC TẾ ĐO: Speedtest 1.026 Mbps',
      title: 'BĂNG THÔNG VƯỢT TRỘI 1.026 Mbps',
      features: [
        '⚡ Ping 2ms — Cực kỳ mượt mà',
        '🚀 Download 1.026,92 Mbps siêu tốc',
        '📤 Upload 1.018,45 Mbps không giật'
      ],
      accent: 'blue',
      sfx: 'sfx_success_tech_chime'
    }
  };

  if (Array.isArray(job.illustrations) && job.illustrations.length > 0) {
    job.illustrations.forEach((ill, idx) => {
      if (ill.enabled === false) return;
      const tpl = defaultIllustrationTemplates[ill.type] || defaultIllustrationTemplates.wifi6;
      const st = Math.max(hookDur + 0.1, Number(ill.start) || 4.0);
      const en = Number(ill.end) || (st + (Number(ill.dur) || 2.6));
      const dur = Math.max(1.2, Number((en - st).toFixed(2)));
      voiceBrollSpecs.push({
        ...tpl,
        file: `dynamic_broll_${idx + 1}.png`,
        title: ill.title || ill.name || tpl.title,
        kicker: ill.kicker || tpl.kicker,
        start: Number(st.toFixed(2)),
        dur: Number(dur.toFixed(2))
      });
    });
  }

  return voiceBrollSpecs;
}
function renderIllustrations(specs,{workDir,overlayDir}){
  if(!specs.length)return [];
  const config=path.join(workDir,'broll_cards_config.json');
  fs.writeFileSync(config,JSON.stringify({outDir:overlayDir,cards:specs},null,2),'utf8');
  execFileSync('powershell',['-ExecutionPolicy','Bypass','-File',path.join(PATHS.root,'src/broll/render_broll_cards.ps1'),'-ConfigPath',config],{stdio:'inherit'});
  return specs.map(s=>({...s,path:path.join(overlayDir,s.file)})).filter(s=>fs.existsSync(s.path));
}
module.exports={illustrationSpecs,renderIllustrations};
