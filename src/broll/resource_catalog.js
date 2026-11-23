const PATHS=require('../../config/paths.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const STUDIO_ROOT = PATHS.root;
const WORKSPACE_ROOT = PATHS.root;
const ASSETS_DIR = path.join(STUDIO_ROOT, 'assets');
const BROLL_DIR = path.join(ASSETS_DIR, 'broll-library');
const FFMPEG = path.join(WORKSPACE_ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');

const FPT_KNOWLEDGE_BASE = {
  lastUpdated: new Date().toISOString(),
  brandColors: {
    blue: '#0066B3',
    orange: '#F37021',
    green: '#00A651',
    lime: '#EFFF00',
    dark: '#070B14'
  },
  creativeFormats: [
    {
      id: 'auto_mix',
      name: '🎲 AI Creative Director (Tự Động Biến Hóa Đa Format)',
      badge: 'AI Smart Mix',
      desc: 'Tự động phân tích giọng nói và kết hợp linh hoạt Video B-Roll thực tế (Wi-Fi 6, FPT Play, Camera AI, Speedtest 1026Mbps), thẻ HUD và 3-Grid không lặp lại nhàm chán.'
    },
    {
      id: 'top_band_viral',
      name: '🔥 Top-Band Viral Video B-Roll (Chuẩn TikTok Triệu View)',
      badge: 'Trending #1',
      desc: 'Chèn các cảnh Video B-Roll thực tế chuyển động mượt ở 1/3 trên màn hình (Modem Wi-Fi 6, Camera AI kép, Speedtest 1026Mbps) + Hook Con Số H3.'
    },
    {
      id: 'reply_qna_cards',
      name: '💬 Reply Comment Q&A + Floating Cards (Tương Tác Khách Hàng)',
      badge: 'High Conversion',
      desc: 'Mở đầu bằng Hộp Bình Luận TikTok trả lời khách hàng + Thẻ Video B-Roll bo góc nổi bật đan xen theo từng ưu đãi.'
    },
    {
      id: 'cyber_hud_tech',
      name: '⚡ Cyber Tech HUD & Multi-Grid 3 Khung (Phong Cách Công Nghệ)',
      badge: 'Tech Vibe',
      desc: 'Kết hợp Khung 3-Grid Đa Nhiệm (Lướt Web | Chơi Game 0 Lag | Tác Vụ Nặng) + Thẻ HUD Camera AI 2 Chiều + Đồng hồ Speedtest.'
    },
    {
      id: 'flash_deal_kinetic',
      name: '🎁 Flash Deal Skit & Kinetic Price Pill (Chốt Sale Tốc Độ Cao)',
      badge: ' Hard-Sell',
      desc: 'Nhịp cắt Jump-Cut nhanh, Hộp Giá Pill trắng bật nảy kèm tiếng Ting!, nháy Đen-Trắng Record-Scratch trước cao trào và mưa Confetti.'
    }
  ],
  brollCatalog: [
    {
      id: 'wifi6_ai_mesh',
      title: 'Minh Họa AI: Wi-Fi 6 Ultra Mesh 1Gbps & Độ Trễ < 5ms',
      category: 'AI B-Roll: Internet Wi-Fi 6',
      mediaType: 'image',
      thumbUrl: '/assets/broll-library/broll_ai_wifi6.png',
      videoUrl: '/assets/broll-library/broll_ai_wifi6.png',
      keywords: ['wi-fi 6', 'modem', 'lắp đặt', 'trang bị', 'mạng fpt'],
      sfx: 'whoosh_short'
    },
    {
      id: 'camera_ai_cloud',
      title: 'Minh Họa AI: FPT Camera AI Cloud 0Đ & HUD Viewfinder',
      category: 'AI B-Roll: FPT Camera AI',
      mediaType: 'image',
      thumbUrl: '/assets/broll-library/broll_ai_camera.png',
      videoUrl: '/assets/broll-library/broll_ai_camera.png',
      keywords: ['camera', 'camera ai', 'tặng ngay', 'đàm thoại', 'an ninh'],
      sfx: 'camera_shutter'
    },
    {
      id: 'fptplay_ai_sports',
      title: 'Minh Họa AI: FPT Play 4K & Độc Quyền Ngoại Hạng Anh',
      category: 'AI B-Roll: FPT Play 4K',
      mediaType: 'image',
      thumbUrl: '/assets/broll-library/broll_ai_fptplay.png',
      videoUrl: '/assets/broll-library/broll_ai_fptplay.png',
      keywords: ['fpt play', 'tài khoản', 'truyền hình', 'ngoại hạng anh', 'bóng đá'],
      sfx: 'party_popper'
    },
    {
      id: 'speedtest_ai_gigabit',
      title: 'Minh Họa AI: Speedtest 1.026,92 Mbps & Ping 2ms Cực Thấp',
      category: 'AI B-Roll: Tốc Độ Cao',
      mediaType: 'image',
      thumbUrl: '/assets/broll-library/broll_ai_speedtest.png',
      videoUrl: '/assets/broll-library/broll_ai_speedtest.png',
      keywords: ['tốc độ cao', 'internet', 'băng thông', 'mbps', 'mượt'],
      sfx: 'chime'
    },
    {
      id: 'multitask_ai_3grid',
      title: 'Minh Họa AI: Hệ Sinh Thái Đa Nhiệm (Gaming 0 Lag | Phim 4K | Họp)',
      category: 'AI B-Roll: Hệ Sinh Thái',
      mediaType: 'image',
      thumbUrl: '/assets/broll-library/broll_ai_3grid.png',
      videoUrl: '/assets/broll-library/broll_ai_3grid.png',
      keywords: ['đa nhiệm', 'chơi game', 'lướt web', 'gia đình', 'combo'],
      sfx: 'pop'
    }
  ],
  tiktokTrends: [
    {
      id: 'trend_combo3in1',
      channelRef: '@fpttelecom_official',
      title: 'Combo 3 Trong 1: Wi-Fi 6 + FPT Play + Camera AI',
      hookStyle: 'H3_number',
      hook1: 'COMBO FPT 3 TRONG 1',
      hook2: 'Wi-Fi 6 + FPT Play + Camera AI',
      hook3: 'Chỉ từ',
      hook4: '195K / Tháng',
      outroCta: 'Chỉ từ 195K / Tháng',
      creativeFormat: 'top_band_viral',
      bgmMode: 'upbeat'
    },
    {
      id: 'trend_mua1duoc3',
      channelRef: '@fpttelecom_viral',
      title: 'Mua 1 Được 3 — Xem Ngoại Hạng Anh Độc Quyền',
      hookStyle: 'H3_number',
      hook1: 'MUA 1 ĐƯỢC 3',
      hook2: 'Internet - FPT Play - NHA',
      hook3: 'Chỉ từ',
      hook4: '220K / Tháng',
      outroCta: '220K Ngoại hạng Anh',
      creativeFormat: 'auto_mix',
      bgmMode: 'bright'
    },
    {
      id: 'trend_reply_camera',
      channelRef: '@fptcamera_tiktok',
      title: 'Reply Comment: Lắp Mạng Tặng Ngay Camera AI 2 Chiều',
      hookStyle: 'H2_reply',
      hook1: 'Lắp mạng FPT bây giờ',
      hook2: 'có tặng Camera AI không em?',
      hook3: 'Tặng ngay',
      hook4: 'Camera AI 0Đ',
      outroCta: 'Tặng Camera AI miễn phí',
      creativeFormat: 'reply_qna_cards',
      bgmMode: 'fresh'
    },
    {
      id: 'trend_speed_gamer',
      channelRef: '@fpt_wifi6_gaming',
      title: 'Test Tốc Độ Wi-Fi 6 FPT 1.026 Mbps — Cân Mọi Tác Vụ Nặng',
      hookStyle: 'H1_skit',
      hook1: 'WI-FI 6 TỐC ĐỘ X3',
      hook2: 'Băng thông 1Gbps — Chơi Game 0 Lag',
      hook3: 'Chỉ từ',
      hook4: '7.5K / Ngày',
      outroCta: 'Chỉ từ 7.5K / Ngày',
      creativeFormat: 'cyber_hud_tech',
      bgmMode: 'synth'
    }
  ]
};

function ensureRealBrollClips() {
  fs.mkdirSync(BROLL_DIR, { recursive: true });
  const aiCards = [
    'broll_ai_wifi6.png',
    'broll_ai_camera.png',
    'broll_ai_fptplay.png',
    'broll_ai_speedtest.png',
    'broll_ai_3grid.png'
  ];
  const missing = aiCards.some(f => !fs.existsSync(path.join(BROLL_DIR, f)));
  if (missing) {
    try {
      execFileSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(PATHS.root,'scripts/assets/generate_broll_cards.ps1')], { stdio: 'inherit' });
    } catch (_) {}
  }
}

function fetchUrlText(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => { if (data.length < 150000) data += chunk.toString(); });
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    } catch (_) {
      resolve('');
    }
  });
}

async function crawlFptResourcesAndTrends() {
  ensureRealBrollClips();

  // Optional live probe of fpt.vn for latest promo headlines if network is available
  const html = await fetchUrlText('https://fpt.vn/vi/khach-hang-ca-nhan');
  const discoveredHeadlines = [];
  if (html) {
    const titleMatches = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || [];
    for (const m of titleMatches.slice(0, 6)) {
      const clean = m.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (clean && clean.length > 6 && clean.length < 80) discoveredHeadlines.push(clean);
    }
  }

  const kb = {
    ...FPT_KNOWLEDGE_BASE,
    lastUpdated: new Date().toISOString(),
    discoveredHeadlines: discoveredHeadlines.length ? discoveredHeadlines : [
      'Internet Wi-Fi 6 FPT — Băng thông không giới hạn tới 1Gbps',
      'Combo Thể Thao FPT Play — Trực tiếp Ngoại Hạng Anh 4K',
      'FPT Camera AI Cloud — Đàm thoại 2 chiều, phát hiện người thông minh 24/7'
    ]
  };

  fs.writeFileSync(path.join(ASSETS_DIR, 'fpt_knowledge_base.json'), JSON.stringify(kb, null, 2), 'utf8');
  return kb;
}

module.exports = {
  FPT_KNOWLEDGE_BASE,
  ensureRealBrollClips,
  crawlFptResourcesAndTrends
};
