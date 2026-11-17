# FPT Telecom Video Automation — Agent Guidelines

All FPT source, configuration, skills and assets live in this directory. Use npm run doctor, npm test and npm run test:ui for verification. Paths are centralized in config/paths.js. Keep original media and approved reference intact; output/ is for new deliverables and var/ is regenerable runtime data.

## 7. BỘ QUY TẮC BẮT BUỘC CHUNG CHO TẤT CẢ CÁC VIDEO TỪ ĐÂY VỀ SAU (UNIVERSAL MANDATORY VIDEO RULES)

> [!IMPORTANT]
> Đây là **QUY ĐỊNH BẮT BUỘC (MANDATORY RULES)** cho TẤT CẢ các video được tạo bởi hệ thống. Mọi luồng dựng video (FPT Studio, CapCut Engine, Remotion Studio, Automation Script) **BẮT BUỘC PHẢI TUÂN THỦ 100%**, không được tự ý thay đổi hoặc nới lỏng.

### 7.1. Tiêu chuẩn Thống nhất về Tọa độ Trục Y & Kích thước Scale
Tất cả các thành phần text overlay trên khung hình chuẩn 1080×1920 (9:16) phải tuân thủ đúng các mốc sau:

| Thành phần Text | Độ cao Trục Y (baseY) | Kích thước Chữ (Scale) | Quy định Dòng Trống |
|---|---|---|---|
| **Cụm Hook Mở Đầu (0.0s – 3.5s)** | **`320px`** | **`130%` (`1.30`)** | Dòng nào không điền chữ **TUYỆT ĐỐI KHÔNG render** (không chữ, không nền, không viền) |
| **Cụm Outro Kết Video (CTA chốt deal)** | **`320px`** (đồng bộ chuẩn Hook) | **`130%` (`1.30`)** | Dòng nào để trống **TUYỆT ĐỐI KHÔNG render** |
| **Text Highlight (Callout xuyên suốt video)** | **`350px`** | **`140%` (`1.40`)** | Xuất hiện cách lề trên an toàn, to rõ, đủ thời gian đọc 1.85s – 2.5s |
| **Phụ đề Chạy (Subtitles)** | **`pos(540, 1580)`** (cách đáy 340px) | Font 48pt, viền 8-11px | Nằm trọn trong Safe Area, cách lề phải ≥190px (tránh nút thả tim/comment) |

### 7.2. Đồng bộ hóa Tuyệt đối (Voice, Subtitle, Text Highlight & SFX Khớp Nhịp 100%)
1. **Trục thời gian Voice là chuẩn quy chiếu duy nhất (Ground Truth):**
   - Giọng nói VJ được bóc băng qua AI Whisper để lấy chính xác mốc xuất hiện của từng từ (`startMs`, `endMs`).
   - Tốc độ giọng nói mặc định: **`1.25x`**.
   - Cắt bỏ hoàn toàn khoảng lặng chết (`gap >= 250ms`) bằng thuật toán AI Jump-Cut để giữ nhịp nói dồn dập, liên tục, không ngắt quãng.
2. **Text Highlight phải khóa đúng mili-giây VJ cất tiếng:**
   - Khi so khớp từ khóa (`matchCustomHighlightsToSubtitles`), hệ thống bắt buộc tìm đúng từ đó trong `words` của câu phụ đề.
   - Text Highlight xuất hiện **CHÍNH XÁC tại thời điểm VJ phát âm từ khóa đó**, không được xuất hiện sớm hơn hoặc trễ hơn.
   - Cụm trước phải biến mất trước khi cụm sau xuất hiện (cách nhau tối thiểu 0.08s - 0.10s), **tuyệt đối không để text đè lên nhau**.
3. **Sound Effect (SFX) Phải Tinh Tế, Đúng Điểm Nhấn & Chống Lặp Lại (Anti-Repetition):**
   - **Tuyệt đối không chèn SFX tràn lan vào phụ đề thường:** Phụ đề chạy chỉ là hỗ trợ đọc, không chèn âm thanh liên tục gây rối tai và nhức đầu.
   - **Khoảng cách an toàn tối thiểu giữa các SFX:** Tối thiểu **`0.85s – 1.2s`** (không để 2 âm thanh nổ đè lên nhau gây chói gắt).
   - **Chống lặp lại âm thanh liên tiếp:** Nghiêm cấm phát lặp cùng 1 SFX trong vòng 3.5s. Luôn luân phiên đa dạng giữa các nhóm SFX (`ding_correct`, `bell_ring_ding`, `sfx_12`, `flick_camera_flash`, `cash_money`, `sfx_26`, `sfx_04`).
   - Mở màn (0.0s): Bắt buộc chỉ dùng 1 Ting chuông (`bellring`) + 1 Whoosh (`whoosh_1`) lướt mở màn gọn gàng.
   - Chuyển cảnh Jump-cut: Soft whoosh (`sfx_08`) chỉ nổ khi 2 cảnh cách nhau ≥ 2.2s.
   - Text Highlight: Nổ đúng tích tắc chữ nảy lên (`hl.start`) với âm lượng cân đối vừa phải (`vol = 0.36 - 0.40`).
   - Outro CTA chốt deal: Nổ chuông Ting (`bell_ring_ding`) + tiếng tiền về (`cash_register`).

### 7.3. Quy Chuẩn B-Roll Cảnh Thực Tự Động Khớp Theo Từ Khóa Lời Nói VJ (Universal Auto B-Roll Matching Rule)
> [!IMPORTANT]
> **QUY TẮC BẮT BUỘC CHUNG:** Bất cứ khi nào lời nói VJ / phụ đề xuất hiện các từ khóa chủ đề cốt lõi, hệ thống **BẮT BUỘC tự động chèn clip B-Roll cảnh thực chuẩn tương ứng** xen kẽ VJ nói:
> 1. **Ngoại Hạng Anh & Bóng Đá:** Khi VJ nhắc các từ `ngoại hạng`, `premier`, `bóng đá`, `nha`, `c1`, `champions`, `380 trận`, `trận đấu`, `sân cỏ`, `cầu thủ`, `bàn thắng` → **Tự động chèn video trận đấu Ngoại Hạng Anh chuẩn** (`broll_stock_football.mp4` / `broll_nha_official.mp4`) với layout **`top_half`** (nửa trên màn hình hiển thị trực tiếp trận đấu NHA, VJ nói ở nửa dưới).
> 2. **Wi-Fi 6 & Cáp Quang:** Khi VJ nhắc `wifi`, `wi-fi`, `modem`, `mesh`, `internet`, `gbps`, `mbps`, `1 gbps`, `tốc độ`, `băng thông`, `cáp quang` → **Tự động chèn clip Modem Wi-Fi 6** (`broll_stock_wifi6.mp4`) với layout **`pip`** (khung nổi góc trên phải).
> 3. **Camera AI & Giám Sát:** Khi VJ nhắc `camera`, `an ninh`, `giám sát`, `ai`, `nhận diện`, `đàm thoại`, `cctv`, `chống trộm`, `cloud` → **Tự động chèn clip Camera AI** (`broll_stock_camera.mp4`) với layout **`pip`** (khung nổi góc trên phải).
> 4. **FPT Play & Giải Trí Phim:** Khi VJ nhắc `fpt play`, `kho phim`, `truyền hình`, `4k`, `hdr`, `tài khoản`, `kênh`, `phim` → **Tự động chèn clip FPT Play** (`broll_stock_fptplay.mp4`) với layout **`cutaway`** (toàn màn hình).
> 5. **Gaming & Chơi Game:** Khi VJ nhắc `chơi game`, `gaming`, `ping thấp`, `không giật lag`, `độ trễ`, `esport`, `game thủ` → **Tự động chèn clip Gaming** (`broll_stock_gaming.mp4`) với layout **`top_half`**.

- **Đồng bộ nhịp & Chống đè lấn:**
  * B-Roll xuất hiện chính xác mili-giây VJ cất tiếng nói từ khóa (khóa theo word timestamps của Whisper).
  * Thời lượng mỗi cảnh theo trọn đoạn lời nói liên quan; không giới hạn 3.2s – 3.8s (xác nhận mới nhất ở mục 7.7).
  * Không chồng B-roll. Khi hai chủ đề nối sát nhau, chuyển đúng mốc lời nói, không ép khoảng nghỉ 1.5s.
  * Vùng an toàn: Không chèn trong khoảng Hook mở đầu (`0.0s – 3.5s`) và Outro kết thúc video.
  * Người dùng vẫn có toàn quyền tùy chỉnh, di chuyển, co kéo thời lượng hoặc đổi layout ngay trên Track 1B của Timeline Studio.

### 7.4. Quy Chuẩn B-Roll Cut-Away Chân Thật & Hệ Thống Typo Animation FPT Telecom Mới
1. **B-Roll Cut-Away Engine (Xen Kẽ VJ Thay Vì Đè Lên Mặt):**
   - **Cut-Away (`cutaway`):** Cắt hẳn sang video cảnh thực (Bóng đá NHA, App FPT Play, Thiết bị FPT) toàn màn hình 1080×1920 với cross-fade mượt mà 0.25s ở đầu và đuôi, giữ trọn vẹn Voice VJ.
   - **Top-Half Split (`top_half`):** B-roll chiếm 40% nửa trên màn hình (`1080x780` tại `y=0`), VJ vẫn nói ở nửa dưới (`y=780-1920`). Dùng cho cảnh trận đấu Ngoại Hạng Anh có bảng tỉ số LIVE và logo giải đấu.
   - **Picture-in-Picture (`pip`):** B-roll khung nổi ở góc trên phải (`460x260` tại `x=596, y=180`), phù hợp giới thiệu thiết bị Modem Wi-Fi 6 hoặc Camera AI.
2. **Bộ 6 Typo Animation FPT Telecom Mới Đẳng Cấp:**
   - **`fpt_football_match` (Bóng Đá Ngoại Hạng Anh & FPT Play):** Tag trên màu Tím Than NHA `#38003C` viền Vàng Neon `#FFE600` (`⚽ ● LIVE NGOẠI HẠNG ANH`) + Tiêu đề 3D Vàng Kim FPT viền Cam viền Trắng sâu.
   - **`fpt_speed_hud` (Cyber HUD Speedtest 1.026 Mbps):** Khung HUD công nghệ Cyan Neon `#00E5FF` viền Navy `#0B1F3F` + Tag `⚡ SPEEDTEST 1.026 Mbps | PING 2ms`.
   - **`fpt_camera_smart` (Camera AI CCTV 99.8%):** Bounding Box nhận diện AI Xanh Lá FPT `#00A651` + Tag cảnh báo `[● REC] AI HUMAN DETECT 99.8%`.
   - **`fpt_voucher_3d` (Vé Vàng Ưu Đãi 0Đ):** Thẻ vé vàng dập nổi `#FFE600` viền Cam FPT `#F37021` kèm ngôi sao lấp lánh Sparkle Star.
   - **`fpt_neon_glass` (Kính Neon Frosted Glass):** Nền kính mờ với dải viền chạy 3 màu chuẩn FPT (Cam - Xanh Dương - Xanh Lá).
   - **`fpt_split_kicker` (Cú Đấm Kép Dual-Tone):** Tầng 1 Navy `#0B1F3F` viền Trắng + Tầng 2 Cam FPT Skew 3D nảy mạnh về phía trước.

### 7.5. B-Roll Crawler Skill & Tuyệt Đối Không Cắt Video Mẫu
- **Tuyệt đối không cắt cảnh/frame từ video mẫu người dùng tải lên:** Mọi cảnh B-Roll mẫu cắt thô đã được xóa sạch.
- **Nguồn B-Roll chuẩn:** Hệ thống sử dụng Skill `broll-crawler` để tự động cào và tải kho B-Roll HD 1080p/720p bản quyền mở (Creative Commons / Free for Commercial Use không watermark) từ các kho stock chuyên nghiệp cho các chủ đề viễn thông FPT.

---



## 7.6. Quy tắc bắt buộc FPT Studio: chất lượng và đa dạng typography
- Mọi lượt xuất phải chuẩn hóa đường dẫn và khoảng cắt clip trên server; không dùng thời lượng ước lượng của giao diện để cắt video. Mở/đóng timeline không được sửa hay bỏ các đoạn jump-cut hoặc mốc lời nói.
- Typography dùng bảng màu FPT: cam #F37021, xanh dương #0066B3, xanh lá #00A651, navy #0B1F3F và trắng. Áp dụng bộ chọn chung src/core/brand_rules.js ở bước xuất cuối, kể cả khi client gửi cùng một kiểu cho tất cả cụm.
- Không lặp kiểu chữ trong hai highlight gần nhất. Ưu tiên kiểu chưa dùng; với ít nhất 4 highlight phải có ít nhất 4 kiểu. Luân phiên pop, trượt trái, trượt phải và drop. Không ép mọi cụm giá về một kiểu price_burst.
- Bổ sung 4 kiểu: fpt_editorial_stack, fpt_offset_echo, fpt_bracket_focus, fpt_ribbon_cut. Không thêm thông số/ưu đãi vào nội dung chữ ngoài lời nói hoặc văn bản người dùng.
- Sub text phải đi qua bước sửa chính tả và chuẩn hóa tên sản phẩm FPT. Sửa cục bộ và giữ mốc từ không đổi; không dàn lại toàn câu theo tỷ lệ số từ. Không gán độ tin cậy giả. Nếu không nhận dạng được lời nói thì báo lỗi, không âm thầm xuất bản thiếu Sub text.
- Tạo video trực tiếp phải tự tạo Sub text, Highlight và chọn B-roll từ nguồn đúng chủ đề sẵn có. Không dùng video sai nội dung thay thế. Không cắt video mẫu lấy B-roll. Giữ vùng Hook/Outro thực tế, không chồng B-roll và giữ quyền chỉnh timeline.
- SFX mở đầu, chuyển cảnh đủ khoảng cách, highlight và CTA phải được điều phối trong engine; áp dụng chống đè âm, chống lặp đã quy định. Không rải SFX vào từng câu phụ đề.
- Các đầu mục UI dùng cam FPT. B-roll và thông số cố định vẫn chạy nền; timeline mặc định thu gọn.
- Kiểm thử phát hành phải đi qua UI → API → FFmpeg với dữ liệu người dùng thực tế; không tự vá srcPath hoặc thời lượng trong test để che lỗi đầu vào.

## 7.7. Mẫu được người dùng duyệt: nhịp theo lời nói, không cố định số cảnh
Video chuẩn: assets/references/approved-video/reference.mp4.
SHA-256: 7aaff1859d430bbc111c6e70150f0c7cedffe0a452d6932c966262963c306493.
Video mẫu dài 14.8s, 6 Highlight phần thân, B-roll bóng đá 5.1–7.0s, 9 điểm SFX. Đây chỉ là số đo của mẫu, KHÔNG phải chỉ tiêu bắt buộc cho video khác.

Theo xác nhận mới nhất của người dùng, quy tắc này ưu tiên hơn các giới hạn thời lượng/khoảng cách cố định ở mục trước:
- Số Highlight tăng giảm theo lời nói, có thể 10, 15 hoặc nhiều hơn. Chọn cụm có nghĩa, ghép được qua ranh giới câu Sub; không tự nhấn mọi câu Hook/Outro. Giữ đa dạng typography và không chồng chữ. Danh sách người dùng nhập N cụm vẫn phải tạo đủ N cụm hợp lệ.
- B-roll bắt đầu ở từ đầu của đoạn lời nói liên quan, kết thúc ở từ cuối của đoạn đó. Không ép về 1.9s, 2.2s hay 3.2–3.8s. Đoạn chủ đề kéo dài thì B-roll kéo dài; nguồn clip ngắn được loop trong đúng khoảng lời nói.
- Không áp khoảng nghỉ B-roll cố định khiến bỏ/lệch đoạn nói. Hai chủ đề sát nhau chuyển tại mốc đổi chủ đề, không chồng hình. Nhận diện chủ đề tiếp theo kể cả khi thiếu clip để không kéo cảnh trước sang chủ đề khác.
- speechStart/speechEnd được lưu trong mỗi cảnh tự động và được kiểm tra lại trước khi xuất. Mốc lưu tới mili-giây; hiển thị trên video 30 fps theo khung hình.
- Video mẫu chỉ dùng phân tích và kiểm thử; không cắt lấy B-roll từ video mẫu.
- Hook/Outro theo lời nói hoặc nội dung người dùng nhập. Không điền giá, quà tặng, hay tính năng của video mẫu vào các video khác. Dòng trống giữ trống.
- Chuẩn hình 1080×1920, 30 fps; Hook/Outro y320 scale1.3; Highlight y350 scale1.4. Giữ bảng màu FPT và luân phiên typography. Âm lượng tham chiếu: voice1.32, BGM0.18 khi có voice, Highlight SFX0.38; không khóa toàn bộ video vào một bản nhạc nếu người dùng chọn nhạc khác.
- profile: config/approved_reference.json; planner: src/core/reference_editor.js; kiểm tra bắt buộc: src/core/quality_gate.js.
- Mỗi lượt xuất ghi quality_report.json. Chỉ báo thành công sau khi timeline không chồng/lệch mốc theo các kiểm tra đã định nghĩa và MP4 giải mã đủ, đúng định dạng, có âm thanh, hình/tiếng không lệch độ dài. Nội dung ASR/ngữ nghĩa vẫn cần đối chiếu khi nguồn âm thanh không rõ; bộ kiểm tra không được tự nhận là bảo đảm không thể có mọi loại lỗi.

- Outro tự động bắt đầu theo từ CTA thực tế, không cắt mất vài giây cuối của một chủ đề chỉ vì tỷ lệ thời lượng. Không có CTA thì không dành sẵn một khoảng Outro trống. Outro người dùng nhập thủ công vẫn được giữ.
- Hai B-roll nối sát lời nói chuyển trực tiếp tại ranh giới, không fade qua VJ gây lóe hình. Fade vào/ra chỉ nằm trong khoảng của cảnh độc lập.

## 7.8. Web deployment và chất lượng đầu ra
- Xuất MP4 H.264 1080×1920, 30 fps, yuv420p, CRF 17/preset fast, resize Lanczos; kiểm decode và âm thanh trước khi báo thành công. Không gọi upscale là khôi phục chi tiết bị mất.
- Nhận các container video thông dụng mà FFmpeg giải mã được; kiểm metadata trước khi render, chuẩn hóa xoay/HDR. Video ngang/vuông giữ nguyên bố cục trên nền mờ. Media hỏng hoặc không có lời nói phải báo lỗi rõ ràng.
- Chạy web bằng FPT_WEB_MODE=1 sau HTTPS proxy, bật mật khẩu hash, giới hạn upload và đường dẫn media; không khởi chạy Explorer/CapCut trên server. FFmpeg/Whisper chạy trong worker để UI luôn phản hồi.
- GitHub repo giữ private. Không commit token, .env, cache, log hoặc video output; binary/model/video gốc dùng Git LFS.
