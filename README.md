# FPT Telecom Video Automation

Studio tạo video dọc từ video/voice gốc: nhận dạng Sub text, khớp highlight và B-roll theo lời nói, render typography màu FPT, phối nhạc/SFX, kiểm tra MP4 và tùy chọn xuất bản nháp CapCut.

## Triển khai web

Bản triển khai Windows VPS có đăng nhập, HTTPS qua Caddy, hàng đợi render/ASR riêng và upload đã kiểm tra. Xem [hướng dẫn cài máy chủ](docs/windows_deployment.md). Máy chủ/tên miền chưa được cung cấp; repository này chưa phải website đang hoạt động.

Sau khi clone phải chạy `git lfs pull` và `npm ci`. Video, model Whisper và runtime lớn được lưu bằng Git LFS; .env và output không đưa lên Git.

## Chạy hệ thống

Máy đã có dependency và Whisper trong dự án. Môi trường đã kiểm chứng: Windows, Node.js 24, PowerShell và trình duyệt Edge.

~~~powershell
cd "C:\Users\ADMIN\Downloads\Tool video tự động\fpt-telecom-video-automation"
npm run doctor
npm start
~~~

Mở **http://localhost:3457**. Có thể chạy **scripts/start_studio.cmd** bằng cách bấm đúp. Server và media không phụ thuộc thư mục làm việc hiện tại.

Không cần chạy lại npm install cho bản đã được chuẩn bị trên máy này. Nếu dựng lại dependency: dùng package-lock.json với npm ci; FFmpeg/FFprobe có thể cần tải binary. Whisper và font được lưu riêng, không bị npm ci quản lý.

## Kiến trúc

~~~text
fpt-telecom-video-automation/
├── src/
│   ├── core/                 Logic dựng video và quy tắc chất lượng
│   ├── web/                  Đăng nhập, upload/range và hàng đợi worker
│   ├── integrations/         Adapter CapCut, căn chỉnh lời nói
│   ├── renderers/            Renderer typography/B-roll bằng PowerShell
│   └── server.js             HTTP API và phục vụ giao diện
├── public/index.html         Studio UI, timeline mặc định thu gọn
├── skills/
│   ├── broll-crawler/        Quy tắc bổ sung stock đúng chủ đề
│   └── reference-editing/    Hướng dẫn phong cách tham chiếu
├── assets/
│   ├── fonts/               Font dùng khi render
│   ├── source-videos/       Video gốc, không phải cache
│   ├── source-audio/        Voice gốc
│   ├── reference-images/    Ảnh nguồn thiết bị/logo
│   ├── references/approved-video/  Video mẫu được duyệt + metadata gốc
│   ├── broll-library/       Clip stock và metadata nguồn
│   ├── broll-user/          B-roll người dùng cung cấp
│   ├── broll-images/        Ảnh tư liệu FPT
│   ├── custom-music/        Nhạc người dùng tải lên
│   ├── audio-sources/       Nguồn âm thanh cho script tạo assets
│   ├── illustrations/       Hình minh họa
│   ├── sfx/                 SFX dùng khi xuất
│   ├── sfx-tech/            Bộ SFX công nghệ
│   └── sfx-user/            SFX người dùng
├── config/                  Đường dẫn, profile, alias tên media cũ
├── scripts/                 Khởi động, doctor và công cụ CLI
├── tests/fixtures/          Transcript/job kiểm thử, không phụ thuộc output
├── runtime/whisper/         Whisper CLI, DLL và model; không phải cache
├── node_modules/            Dependency đã khóa phiên bản
├── docs/                    Lịch sử, manifest di chuyển/xóa, báo cáo kiểm tra
├── var/                     Cache/log/QA, được tạo khi cần
├── output/.gitkeep          Nơi lưu video thành phẩm
├── AGENTS.md                Quy tắc vận hành bắt buộc
├── .env.example             Mẫu cấu hình tùy chọn
├── package.json
├── package-lock.json
└── README.md
~~~

Luồng chính: **media → căn lời nói/cắt khoảng lặng → Sub/highlight/B-roll → typography → FFmpeg phối hình/tiếng → quality gate → MP4/CapCut**.

B-roll bắt đầu và kết thúc theo đoạn lời thoại liên quan, không cố định số giây. Số highlight thay đổi theo nội dung. Video mẫu dùng để đối chiếu, không bị cắt làm B-roll.

## Mã nguồn chính

| File | Chức năng |
|---|---|
| src/core/media_profile.js | Probe input, xử lý tỉ lệ/rotation/HDR và upscale Lanczos |
| src/web/http_utils.js | Đăng nhập web, giới hạn payload, upload và byte ranges |
| src/web/task_queue.js | Hàng đợi tiến trình con, giới hạn tải và timeout |
| src/web/task_worker.js | Chạy Whisper/FFmpeg/crawler tách khỏi HTTP |
| src/server.js | API upload, Sub text, highlight, B-roll, render và tải kết quả |
| src/core/video_pipeline.js | Điều phối toàn bộ lượt xuất và CapCut |
| src/core/subtitle_generator.js | Whisper, timestamp từ, tốc độ voice, cắt khoảng lặng |
| src/core/transcript_formatter.js | Chuẩn hóa chính tả/tên sản phẩm, giữ timestamp cục bộ |
| src/core/reference_editor.js | Chọn cụm highlight, đoạn chủ đề B-roll và CTA |
| src/core/highlight_planner.js | Gợi ý/khớp danh sách highlight, tạo biến thể |
| src/core/timeline_rules.js | Giới hạn timeline, tránh chồng chữ/SFX |
| src/core/brand_rules.js | Bảng màu và luân phiên typography |
| src/core/broll_compositor.js | Catalog B-roll, layout, loop nguồn và ghép cảnh |
| src/core/broll_crawler.js | Tải stock có nguồn/điều kiện sử dụng phù hợp |
| src/core/resource_catalog.js | Catalog tư liệu FPT và kiểm tra ảnh dựng sẵn |
| src/core/audio_assets.js | Tạo nhạc/SFX từ nguồn âm thanh đóng gói |
| src/core/render_inputs.js | Xác định nguồn video, chuẩn hóa khoảng cắt và số worker |
| src/core/quality_gate.js | Kiểm tra timeline, thông số và giải mã MP4 |
| src/integrations/subtitle_aligner.js | Adapter căn từ và kịch bản |
| src/integrations/capcut_engine.js | Adapter CLI tạo/đọc bản nháp CapCut |
| src/renderers/render_typography.ps1 | Render Hook/Outro/Highlight |
| src/renderers/render_broll_cards.ps1 | Render thẻ minh họa theo lời nói |
| config/paths.js | Điểm cấu hình đường dẫn dùng chung, nạp .env nếu có |
| config/approved_reference.json | Chuẩn kỹ thuật và nhịp dựng tham chiếu |
| config/media_aliases.json | Tương thích tên media/đường dẫn đã lưu trước khi đổi tên |
| config/speech_environment.yml | Môi trường Python căn chỉnh tùy chọn |

## Scripts và kiểm tra

| Lệnh hoặc file | Chức năng |
|---|---|
| npm run doctor | Cú pháp JS, import, binary, model, font và media alias |
| npm test | Kiểm thử hồi quy/API và nhận dạng Sub text thực |
| npm run test:ui | Server riêng cổng 3468, UI → API → FFmpeg; xuất vào var/qa |
| npm run test:broll | Kiểm tra B-roll dài/nối cảnh bằng pixel và hash audio |
| npm run capcut:list | Đọc danh sách bản nháp CapCut |
| scripts/start_studio.ps1 | Doctor rồi khởi động Studio |
| scripts/generate_brand_assets.ps1 | Sinh hình thương hiệu |
| scripts/generate_broll_cards.ps1 | Sinh bộ thẻ B-roll |
| scripts/generate_tech_sfx.js | Sinh bộ SFX công nghệ |
| scripts/import_capcut_sfx.js <folder> | Nhập SFX từ thư mục được chỉ định |
| scripts/align_audio.py | Bridge căn lời nói Python tùy chọn |
| scripts/capcut_bridge.js | CLI storyboard → CapCut; --help để xem tham số |

Bộ test được giữ lại vì bảo vệ hành vi đang chạy. Các video QA, profile trình duyệt và bản vá một lần được dọn; fixtures nhỏ được giữ riêng để test không lệ thuộc video xuất cũ.

## Cấu hình và dữ liệu

- Mặc định cổng 3457; đổi qua FPT_STUDIO_PORT. Có thể sao chép .env.example thành .env; không ghi đè .env hiện có.
- FPT_OUTPUT_DIR đổi nơi xuất; CAPCUT_DRAFT_DIR chỉ định thư mục CapCut nếu cần.
- Giữ assets, runtime, config và package-lock.json. Không coi model, font, video gốc là cache.
- Mỗi video thành phẩm nằm trong output/<project>/, kèm job.json, thumbnail và quality_report.json.
- Cache nằm ở var/cache; kiểm thử UI nằm ở var/qa, tách khỏi thành phẩm.
- Không xóa media mà bản nháp CapCut đang tham chiếu. Bản nháp CapCut ngoài workspace không thuộc đợt dọn này.
- Một số chủ đề stock chưa được xác nhận sẽ không tự chèn cảnh sai nội dung thay thế.
- Kiểm thử kỹ thuật không bảo đảm ASR/ngữ nghĩa đúng với mọi nguồn âm thanh.

## Tài liệu kiểm toán

- docs/restructuring_plan.md: phạm vi và danh sách dự kiến.
- docs/cleanup_manifest.json: từng file được duyệt dọn.
- docs/migration_manifest.json: ánh xạ nguồn → đích, dung lượng, SHA-256 trước di chuyển.
- docs/path_mapping.json: ánh xạ mã nguồn.
- docs/validation_report.json: kiểm tra đường dẫn/cú pháp.
- docs/render_validation.json: kết quả xuất thật ở cấu trúc mới.
- docs/change_history.md: lịch sử sửa chức năng; mốc/đường dẫn cũ trong lịch sử chỉ là thông tin kiểm toán.

Các dự án Thủy Ngân, kho thư viện tham khảo và công cụ dùng chung còn lại ở workspace được giữ nguyên. FPT có dependency và tài nguyên cần thiết riêng; không cần chạy server cũ.


Kiểm chứng sau tái cấu trúc: 46/46 test đạt; 42 test hồi quy chạy lại sau khi xóa thư mục cũ cũng đạt. Đã xuất MP4 thật từ UI khi server chạy ngoài thư mục dự án. Báo cáo cuối: docs/restructuring_result.json; cây thực tế: docs/project_tree.txt.
