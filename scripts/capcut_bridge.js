const PATHS=require('../config/paths.js');
const fs = require('fs');
const path = require('path');
const engine = require('../src/integrations/capcut_engine');

/**
 * CapCut Automation Bridge Script
 * -------------------------------------------------------------
 * Reads AI-generated storyboard JSON, coordinates with media assets,
 * creates and populates tracks directly in CapCut Desktop drafts.
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--script' || arg === '-s') {
      options.script = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      options.name = args[++i];
    } else if (arg === '--ratio' || arg === '-r') {
      options.ratio = args[++i];
    } else if (arg === '--fps') {
      options.fps = Number(args[++i]);
    } else if (arg === '--list' || arg === '-l') {
      options.list = true;
    } else if (arg === '--info') {
      options.info = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`
🎬 CapCut Automation Bridge Script

Sử dụng:
  node scripts/capcut-bridge.js --script <file_kich_ban.json> [tùy chọn]
  node scripts/capcut-bridge.js --list
  node scripts/capcut-bridge.js --info <ten_draft_hoac_id>

Tùy chọn:
  -s, --script <path>   Đường dẫn tới file kịch bản JSON do AI sinh ra
  -n, --name <title>    Tên dự án CapCut (ghi đè title trong JSON)
  -r, --ratio <ratio>   Tỉ lệ khung hình: 9:16 (mặc định), 16:9, 1:1
  --fps <number>        Tốc độ khung hình (mặc định: 30)
  -l, --list            Liệt kê tất cả các bản nháp CapCut đang có trên máy
  --info <draft>        Xem chi tiết timeline một bản nháp CapCut
  -h, --help            Hiển thị trợ giúp này
  `);
}

async function main() {
  const options = parseArgs();

  if (options.help || (Object.keys(options).length === 0 && !options.script)) {
    printHelp();
    return;
  }

  // 1. List drafts
  if (options.list) {
    console.log(`\n🔍 Đang quét thư mục CapCut Drafts: ${engine.getCapCutDraftsDir()}`);
    const drafts = engine.listDrafts();
    if (drafts.length === 0) {
      console.log('Chưa có bản nháp nào được tạo.');
      return;
    }
    console.log(`Tìm thấy ${drafts.length} bản nháp:`);
    console.table(drafts.map(d => ({
      'Tên dự án': d.draft_name,
      'Thời lượng (s)': d.duration_sec,
      'Tỉ lệ': d.ratio,
      'Số Track': d.tracks_count,
      'Thư mục': d.folder
    })));
    return;
  }

  // 2. Draft info
  if (options.info) {
    try {
      const draftDir = engine.resolveDraftPath(options.info);
      const content = JSON.parse(fs.readFileSync(path.join(draftDir, 'draft_content.json'), 'utf8'));
      const meta = JSON.parse(fs.readFileSync(path.join(draftDir, 'draft_meta_info.json'), 'utf8'));
      console.log(`\n📌 THÔNG TIN DỰ ÁN: ${meta.draft_name}`);
      console.log(`- ID: ${meta.draft_id}`);
      console.log(`- Đường dẫn: ${draftDir}`);
      console.log(`- Thời lượng: ${(content.duration / 1000000).toFixed(2)}s | FPS: ${content.fps} | Canvas: ${content.canvas_config.ratio} (${content.canvas_config.width}x${content.canvas_config.height})`);
      console.log(`- Số track: ${content.tracks.length}`);
      content.tracks.forEach((t, idx) => {
        console.log(`  [Track ${idx + 1}] Loại: ${t.type.padEnd(6)} | Tên: ${t.name || '(mặc định)'} | ${t.segments.length} clips`);
      });
    } catch (err) {
      console.error(`❌ Lỗi: ${err.message}`);
    }
    return;
  }

  // 3. Compile script to CapCut draft
  if (options.script) {
    const scriptPath = path.resolve(options.script);
    if (!fs.existsSync(scriptPath)) {
      console.error(`❌ Không tìm thấy file kịch bản: ${scriptPath}`);
      process.exit(1);
    }

    console.log(`\n🚀 Đang đọc kịch bản AI: ${scriptPath}`);
    let storyboard;
    try {
      storyboard = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
    } catch (e) {
      console.error(`❌ Lỗi định dạng JSON kịch bản: ${e.message}`);
      process.exit(1);
    }

    if (options.name) storyboard.title = options.name;
    if (options.ratio) storyboard.ratio = options.ratio;
    if (options.fps) storyboard.fps = options.fps;

    console.log(`🎬 Bắt đầu tạo Project CapCut: "${storyboard.title || 'AutoVideo'}" (Tỉ lệ: ${storyboard.ratio || '9:16'})`);

    const result = engine.compileStoryboard(storyboard, {
      ratio: storyboard.ratio,
      fps: storyboard.fps
    });

    console.log(`\n✅ HOÀN TẤT ĐỒNG BỘ VÀO CAPCUT DESKTOP!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📁 Thư mục Draft : ${result.draft_dir}`);
    console.log(`⏱️ Tổng thời lượng: ${result.total_duration_sec}s`);
    console.log(`🎞️ Số phân cảnh  : ${result.scenes_processed}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`💡 Bây giờ bạn chỉ cần mở ứng dụng CapCut Desktop lên,`);
    console.log(`   bản nháp "${result.draft_name}" sẽ hiển thị ngay trên màn hình chính!`);
    return;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
  });
}

module.exports = {
  buildCapCutProjectFromScript: engine.compileStoryboard,
  engine
};
