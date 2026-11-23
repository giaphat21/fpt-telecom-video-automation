# Triển khai Windows VPS

Bản này phục vụ web qua HTTPS, xử lý video trên máy chủ Windows. GitHub lưu source/assets/runtime bằng Git LFS; GitHub Pages không chạy được Node.js, Whisper và FFmpeg. Chưa có VPS hoặc tên miền được cấu hình trong phiên chuẩn bị này.

## Cấu hình đề xuất

- Windows Server 2022/2025 **Desktop Experience**, x64, CPU có AVX2.
- Khởi đầu: **4 vCPU, RAM 16 GB, SSD 128–150 GB**; một tác vụ render/ASR tại một thời điểm, tối đa 4 tác vụ chờ.
- Nếu render dài/thường xuyên: 8 vCPU, RAM 32 GB. Chưa cần GPU vì pipeline hiện dùng Whisper CPU và x264.
- Lựa chọn cụ thể: **Azure Standard_D4s_v5 (4 vCPU, 16 GiB)**, region gần người dùng (ưu tiên Singapore nếu có SKU). Đây là khuyến nghị kỹ thuật cho workload này, chưa phải benchmark trên VPS.
- Chi phí phụ thuộc region, Windows license, SSD, băng thông và số giờ chạy. Kiểm tra calculator của nhà cung cấp trước khi thuê; không có dịch vụ trả phí nào được tạo tự động.

Nguồn: [Azure Dsv5](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dsv5-series), [Windows VM pricing](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/windows/), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage).

## Cài đặt

1. Cài Git for Windows có Git LFS và Node.js 24 LTS toàn hệ thống trên VPS. Dùng đường dẫn ngắn như C:\apps. Tạo DNS A cho tên miền về IP VPS; mở TCP 80/443 ở firewall cloud. Giới hạn RDP theo IP quản trị.
2. Clone repository (công khai, cần Git LFS: `git lfs install` trước khi clone). Không đưa access token vào URL, script hoặc file cấu hình.

~~~powershell
git clone https://github.com/giaphat21/fpt-telecom-video-automation.git C:\apps\fpt-telecom-video-automation
cd C:\apps\fpt-telecom-video-automation
git lfs pull
npm ci
npm run doctor
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/server/configure_web.ps1 -Domain video.your-domain.com -AdminUser admin
~~~

Script hỏi mật khẩu web (tối thiểu 16 ký tự), chỉ lưu salted scrypt hash trong .env. File .env cũ được sao lưu; các cấu hình khác được giữ. Đây là tài khoản quản trị Studio riêng của bạn, không dùng mật khẩu GitHub.

3. Mở PowerShell **Run as Administrator** trên VPS:

~~~powershell
cd C:\apps\fpt-telecom-video-automation
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/server/install_windows_server.ps1
~~~

Script kiểm dependency, Git LFS, binary/font và Caddy; cài hai Scheduled Tasks chạy bằng Local Service:
- **FPT Video Studio**: Node API, nghe 127.0.0.1:3457; xử lý render/ASR trong tiến trình con.
- **FPT Video HTTPS**: Caddy tự cấp/gia hạn HTTPS và proxy tới Node.
- Tự khởi động sau reboot, tự chạy lại khi tiến trình lỗi. Node không mở trực tiếp ra Internet. Chế độ web không khởi chạy CapCut/Explorer trên VPS.

Caddy 2.11.9 được đóng gói trong runtime/caddy, đối chiếu SHA-256 của archive từ release chính thức; xem config/caddy_release.json và runtime/caddy/LICENSE. Mẫu proxy ở config/Caddyfile.example; cấu hình thực nằm trong var/deploy/Caddyfile.
Tài liệu nền: [Caddy trên Windows](https://caddyserver.com/docs/running), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Nghiệm thu sau triển khai

- Mở https://video.your-domain.com, xác nhận chứng chỉ HTTPS hợp lệ và yêu cầu đăng nhập.
- Tải video có lời nói, tạo Sub text, tạo highlight, xuất MP4 và tải về. Kiểm tra báo cáo quality_report.json cùng thư mục video.
- Tua video trực tiếp trên web (HTTP Range đã hỗ trợ). Thử truy cập trong cửa sổ riêng tư: không đăng nhập phải bị từ chối.
- Reboot VPS, kiểm tra hai task đã chạy lại.
- Kiểm tra var/logs/app.log và var/logs/proxy.log nếu lỗi.
- Có thể chạy npm test (có kiểm Whisper thực), npm run test:ui nếu Edge đã cài, npm run test:broll.
- Các script và Caddy config đã được kiểm tra trên máy Windows hiện tại; **chưa nghiệm thu dịch vụ/DNS/HTTPS thật trên VPS chưa được cấp**.

## Vận hành và dữ liệu

- Upload tối đa mặc định 2 GiB/tệp; FPT_MAX_UPLOAD_MB trong .env. JSON API tối đa 2 MiB.
- Định dạng video nhận: MP4, MOV, MKV, WebM, AVI, M4V, 3GP, MTS, M2TS khi codec FFmpeg hỗ trợ. Không nhận file lỗi hay codec không đọc được.
- Video không có lời nói cần thêm voice trước khi tạo Sub text. Không tự tạo phụ đề giả khi ASR không nhận ra lời.
- MP4 luôn chuẩn FPT 1080×1920, 30 fps, H.264 CRF 17, AAC stereo 48 kHz. Video ngang/vuông giữ đủ ảnh trên nền mờ; HDR PQ/HLG chuyển SDR. Chất lượng nguồn thấp không thể được khôi phục thành chi tiết 1080p thật chỉ bằng upscale.
- Chỉ báo render thành công sau preflight timeline và giải mã MP4 hoàn chỉnh. ASR vẫn cần người dùng xem lại khi giọng/âm thanh không rõ.
- Backup .env, assets/ (có file upload), output/, var/caddy/ (TLS state) sang nơi riêng. Chúng không được Git tự backup sau mỗi lần upload.
- Hàng đợi ở RAM: tác vụ đang chạy/chờ bị ngắt khi restart; MP4 đã hoàn tất vẫn ở output/. Hãy đợi render xong trước khi cập nhật, rồi gửi lại tác vụ bị ngắt.
- Cập nhật: dừng hai task khi không render, git pull --ff-only, git lfs pull, npm ci, npm run doctor, rồi chạy lại hai task. Không dùng git clean -fdx trên máy production.
- Không commit .env, khóa, log, cache, upload phát sinh hay output. Dữ liệu gốc được đóng gói ban đầu bằng LFS, secret luôn nằm ngoài Git.
