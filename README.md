# FPT Video Studio

Công cụ dựng video dọc 9:16 cho FPT Telecom: từ video VJ nói tiếng Việt, hệ thống tự nhận dạng lời nói, cắt khoảng lặng, tạo Sub, Highlight, Hook, Outro, B-roll, nhạc và SFX, rồi kiểm tra chất lượng trước khi xuất MP4 1080×1920, 30 fps.

| Tài liệu | Dành cho |
|---|---|
| [Hướng dẫn sử dụng](docs/user-guide/HUONG_DAN_SU_DUNG.md) | Người dựng video |
| [Quy tắc dựng bắt buộc](AGENTS.md) (mục 8) | Mọi người, mọi video |
| [Bảng kiểu chữ thương hiệu](docs/brand/brand_typography.png) | Thiết kế, duyệt nội dung |
| [Cài máy chủ Windows](docs/operations/windows_deployment.md) | Quản trị hệ thống |
| [Nhật ký thay đổi](CHANGELOG.md) | Mọi người |

## Chạy nhanh

Nhấp đúp `scripts/start_studio.cmd`, hoặc:

```powershell
npm ci
npm start
```

Mở http://localhost:3457. Yêu cầu Windows 10/11 64-bit, Node.js 22.16 trở lên. Sau khi clone cần `git lfs pull`. Bản phát hành trong `dist/` đã kèm Node.js, FFmpeg và Whisper, không cần cài thêm.

## Cấu trúc

```text
├── src/
│   ├── server.js            HTTP API và giao diện
│   ├── web/                 Đăng nhập, upload, hàng đợi tiến trình
│   ├── pipeline/            Kế hoạch dựng (edit_plan), bản ghép nền, xuất MP4, cổng chất lượng
│   ├── speech/              Whisper, mốc từ theo sóng âm, chính tả, Sub
│   ├── editing/             Chọn Highlight, mốc thời gian, luân phiên phong cách
│   ├── typography/          Chữ động và quy tắc màu thương hiệu
│   ├── broll/               Kho B-roll, bố cục, né mặt VJ
│   ├── audio/               Bộ điều phối SFX
│   ├── media/               Đọc và chuẩn hóa video nguồn
│   └── integrations/        CapCut
├── public/                  Giao diện Studio; studio/ là timeline và xem trước trực tiếp
├── config/                  Đường dẫn, thư viện SFX, từ điển chính tả, chuẩn tham chiếu
├── assets/
│   ├── brand/               Logo, ảnh sản phẩm
│   ├── fonts/               Font dùng khi dựng
│   ├── sfx-user/            Bộ SFX duy nhất được dùng
│   ├── music-presets/       Nhạc nền có sẵn
│   ├── custom-music/        Nhạc người dùng tải lên
│   ├── broll-library/       B-roll đã xác minh
│   ├── broll-user/          B-roll người dùng cung cấp
│   ├── broll-images/        Ảnh tư liệu FPT
│   ├── source-videos/       Video nguồn
│   ├── source-audio/        Voice nguồn
│   └── references/          Video mẫu đã duyệt (chỉ đối chiếu)
├── scripts/
│   ├── start_studio.cmd     Mở Studio
│   ├── build/               Kiểm tra, đóng gói, bảng kiểu chữ
│   ├── assets/              Dựng tài nguyên hình
│   ├── server/              Cài và chạy máy chủ web
│   └── tools/               CapCut, căn lời nói
├── tests/
│   ├── unit/                Kiểm thử nhanh
│   ├── e2e/                 Dựng thật: FFmpeg, API, giao diện
│   └── fixtures/            Dữ liệu kiểm thử
├── docs/                    user-guide, operations, brand, development
├── skills/                  Kỹ năng nội bộ của dự án
├── runtime/                 Whisper, Caddy
├── output/                  Video thành phẩm (không vào git)
├── var/                     Cache, log, QA (tự tạo lại, không vào git)
└── dist/                    Gói phát hành (không vào git)
```

Luồng xử lý: **media → lời nói và khoảng lặng → Sub, Highlight, B-roll → chữ động → phối hình và tiếng → cổng chất lượng → MP4/CapCut**. `output/<dự án>/` chỉ giữ MP4, ảnh đại diện, `job.json`, `subtitles.ass`, `overlay_config.json` và `quality_report.json`; tệp trung gian tự xóa khi không có nháp CapCut.

## Lệnh

| Lệnh | Tác dụng |
|---|---|
| `npm run doctor` | Kiểm tra cú pháp, thư viện, model, font, đường dẫn |
| `npm test` | Kiểm thử nhanh |
| `npm run verify` | Toàn bộ kiểm tra, gồm UI → API → MP4 |
| `npm run package -- --zip` | Đóng gói bản Windows chạy ngay vào `dist/` |
| `npm run docs:typography` | Vẽ lại bảng kiểu chữ |
| `npm run generate:product-broll` | Dựng lại B-roll từ ảnh sản phẩm |

Biến môi trường: xem `.env.example`. `FPT_OUTPUT_DIR` đổi nơi lưu video, `FPT_STUDIO_PORT` đổi cổng, `FPT_WEB_MODE=1` chạy sau proxy HTTPS có đăng nhập.

## Quy ước

- Không commit `.env`, khóa, log, video thành phẩm. Media và model dùng Git LFS.
- Mọi thay đổi về dựng hình phải giữ `npm run verify` đạt và ghi vào `CHANGELOG.md`.
- Quyền sử dụng nhạc, hình trận đấu và SFX do đơn vị tự xác nhận; gói phát hành kèm `THIRD_PARTY_NOTICES.md`.
