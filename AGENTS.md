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
   - **Khoảng cách an toàn tối thiểu giữa các SFX:** Tối thiểu **`0.85s`** (riêng cụm Hook được xếp dày hơn theo mục 8.3).
   - **Chống lặp lại âm thanh liên tiếp:** Nghiêm cấm phát lặp cùng 1 SFX trong vòng 3.5s. Chọn theo ý nghĩa câu nói bằng `src/audio/sfx_director.js` (mục 8.4).
   - Mở màn: theo công thức âm thanh của phong cách Hook được chọn (mục 8.3). Có âm ngay khung hình đầu, tối thiểu 2 âm trong 0,5 giây.
   - Chuyển cảnh Jump-cut: whoosh luân phiên, đỉnh âm trúng điểm cắt, chỉ khi 2 cảnh cách nhau ≥ 2.2s.
   - Text Highlight: Nổ đúng tích tắc chữ nảy lên (`hl.start`) với âm lượng cân đối vừa phải (`vol = 0.36 - 0.40`).
   - Outro CTA chốt deal: một tiếng chuông trúng lúc Outro vào + một tiếng tiền về, chọn luân phiên.

### 7.3. Quy Chuẩn B-Roll Cảnh Thực Tự Động Khớp Theo Từ Khóa Lời Nói VJ (Universal Auto B-Roll Matching Rule)
> [!IMPORTANT]
> **QUY TẮC BẮT BUỘC CHUNG:** Bất cứ khi nào lời nói VJ / phụ đề xuất hiện các từ khóa chủ đề cốt lõi, hệ thống **BẮT BUỘC tự động chèn clip B-Roll cảnh thực chuẩn tương ứng** xen kẽ VJ nói:
> 1. **Ngoại Hạng Anh & Bóng Đá:** Khi VJ nhắc các từ `ngoại hạng`, `premier`, `bóng đá`, `nha`, `c1`, `champions`, `380 trận`, `trận đấu`, `sân cỏ`, `cầu thủ`, `bàn thắng` → **Tự động chèn video trận đấu Ngoại Hạng Anh chuẩn** (`assets/broll-user/premier_league.mp4`) với layout **`top_half`** (nửa trên màn hình hiển thị trực tiếp trận đấu NHA, VJ nói ở nửa dưới).
> 2. **Wi-Fi 6 & Cáp Quang:** Khi VJ nhắc `wifi`, `wi-fi`, `modem`, `mesh`, `internet`, `gbps`, `mbps`, `1 gbps`, `tốc độ`, `băng thông`, `cáp quang` → **Tự động chèn clip Modem Wi-Fi 6** (`broll_product_wifi6.mp4`) với layout **`pip`** (khung chính giữa, mục 8.2).
> 3. **Camera AI & Giám Sát:** Khi VJ nhắc `camera`, `an ninh`, `giám sát`, `ai`, `nhận diện`, `đàm thoại`, `cctv`, `chống trộm`, `cloud` → **Tự động chèn clip Camera AI** (`broll_product_camera.mp4`) với layout **`pip`** (khung chính giữa, mục 8.2).
> 4. **FPT Play & Giải Trí Phim:** Khi VJ nhắc `fpt play`, `kho phim`, `truyền hình`, `4k`, `hdr`, `tài khoản`, `kênh`, `phim` → **Tự động chèn clip FPT Play** (người dùng gán `stock_fptplay`; chưa có clip thì cảnh báo, không thay bằng cảnh khác) với layout **`cutaway`** (toàn màn hình).
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
   - **Khung chính giữa (`pip`):** B-roll `720x406` căn giữa (`x=180, y=610`), tự dời xuống khi sẽ che mặt VJ. Không đặt ở góc phải.
2. **Typography:** dùng bộ 24 kiểu FPT Telecom ở mục 8.1. Các màu vàng neon, tím than, cyan neon trước đây đã bỏ.

### 7.5. B-Roll Crawler Skill & Tuyệt Đối Không Cắt Video Mẫu
- **Tuyệt đối không cắt cảnh/frame từ video mẫu người dùng tải lên:** Mọi cảnh B-Roll mẫu cắt thô đã được xóa sạch.
- **Nguồn B-Roll chuẩn:** Hệ thống sử dụng Skill `broll-crawler` để tự động cào và tải kho B-Roll HD 1080p/720p bản quyền mở (Creative Commons / Free for Commercial Use không watermark) từ các kho stock chuyên nghiệp cho các chủ đề viễn thông FPT.

---



## 7.6. Quy tắc bắt buộc FPT Studio: chất lượng và đa dạng typography
- Mọi lượt xuất phải chuẩn hóa đường dẫn và khoảng cắt clip trên server; không dùng thời lượng ước lượng của giao diện để cắt video. Mở/đóng timeline không được sửa hay bỏ các đoạn jump-cut hoặc mốc lời nói.
- Typography dùng bảng màu FPT: cam #F37021, xanh dương #0066B3, xanh lá #00A651, navy #0B1F3F và trắng. Áp dụng bộ chọn chung src/typography/brand_rules.js ở bước xuất cuối, kể cả khi client gửi cùng một kiểu cho tất cả cụm.
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
- (Cập nhật 22/11/2026: khi khác với mục 8 thì mục 8 có hiệu lực.)
- Chuẩn hình 1080×1920, 30 fps; Hook/Outro y320 scale1.3; Highlight y350 scale1.4. Giữ bảng màu FPT và luân phiên typography. Âm lượng tham chiếu: voice1.32, BGM0.18 khi có voice, Highlight SFX0.38; không khóa toàn bộ video vào một bản nhạc nếu người dùng chọn nhạc khác.
- profile: config/approved_reference.json; planner: src/editing/reference_editor.js; kiểm tra bắt buộc: src/pipeline/quality_gate.js.
- Mỗi lượt xuất ghi quality_report.json. Chỉ báo thành công sau khi timeline không chồng/lệch mốc theo các kiểm tra đã định nghĩa và MP4 giải mã đủ, đúng định dạng, có âm thanh, hình/tiếng không lệch độ dài. Nội dung ASR/ngữ nghĩa vẫn cần đối chiếu khi nguồn âm thanh không rõ; bộ kiểm tra không được tự nhận là bảo đảm không thể có mọi loại lỗi.

- Outro tự động bắt đầu theo từ CTA thực tế, không cắt mất vài giây cuối của một chủ đề chỉ vì tỷ lệ thời lượng. Không có CTA thì không dành sẵn một khoảng Outro trống. Outro người dùng nhập thủ công vẫn được giữ.
- Hai B-roll nối sát lời nói chuyển trực tiếp tại ranh giới, không fade qua VJ gây lóe hình. Fade vào/ra chỉ nằm trong khoảng của cảnh độc lập.

## 7.8. Web deployment và chất lượng đầu ra
- Xuất MP4 H.264 1080×1920, 30 fps, yuv420p, CRF 17/preset fast, resize Lanczos; kiểm decode và âm thanh trước khi báo thành công. Không gọi upscale là khôi phục chi tiết bị mất.
- Nhận các container video thông dụng mà FFmpeg giải mã được; kiểm metadata trước khi render, chuẩn hóa xoay/HDR. Video ngang/vuông giữ nguyên bố cục trên nền mờ. Media hỏng hoặc không có lời nói phải báo lỗi rõ ràng.
- Chạy web bằng FPT_WEB_MODE=1 sau HTTPS proxy, bật mật khẩu hash, giới hạn upload và đường dẫn media; không khởi chạy Explorer/CapCut trên server. FFmpeg/Whisper chạy trong worker để UI luôn phản hồi.
- GitHub repo công khai (người dùng chuyển Public 23/11/2026). Không commit token, .env, cache, log hoặc video output; binary/model/video gốc dùng Git LFS.

# 8. BỘ QUY TẮC PHÁT HÀNH CHUNG (áp dụng cho MỌI video, hiệu lực cao nhất)

> Xác nhận của người dùng ngày 22/11/2026, cập nhật 23/11/2026. Khi mâu thuẫn với mục 7, mục 8 thắng. Mọi điều có dấu ✔ được máy tự kiểm trong `src/pipeline/quality_gate.js` hoặc `tests/`. **Bấm xuất là quyết định của người dùng: kết quả kiểm tra được ghi vào `quality_report.json`, không chặn xuất.** Chỉ dừng khi không thể dựng (không có lời nói, thiếu tệp, MP4 hỏng). Phần tự động vẫn phải tạo ra kế hoạch đạt mọi kiểm tra.

## 8.0. Video chuẩn được người dùng chốt (22/11/2026)
- Video chuẩn: `assets/references/standard-video/standard.mp4`, SHA-256 `b75a16e356f8d8f75c907c4e2ff84ff93c28edba695c3d6cb028329a87e2083b`; số liệu: `plan.json` cùng thư mục và `config/approved_reference.json` → `standard`.
- **Giữ nguyên cách làm:** nhịp, chuyển động, cách đặt và trộn SFX, bố cục. Hook nhiều tầng y320 có chữ ngay đầu, mặc định 3,5 giây (người dùng kéo được cả hai đầu trên timeline, tới B-roll đầu tiên); Highlight y350 đúng từ; bóng đá ở nửa trên; minh họa sản phẩm ở chính giữa, trên đầu VJ; Sub y1580; Outro trúng lời CTA; tối dần sau lời cuối.
- **Chỉ đổi theo từng video:** nội dung Sub, Highlight, Hook, Outro và B-roll theo lời nói.
- ✔ **Luân phiên triệt để:** Hook và Outro (22 kiểu) chọn kiểu lâu chưa dùng nhất; 24 kiểu Highlight xoay hết bộ trước khi lặp, có tính 6 video gần nhất; chuyển động không lặp liền nhau; SFX tránh 2 video gần nhất. Kiểu do trình duyệt gửi kèm không phải lựa chọn: chỉ `styleFrom: "user"` mới được giữ.
- ✔ SFX chỉ lấy từ `assets/sfx-user` (8.4). Chỉ dùng video chuẩn để đối chiếu, không cắt lấy cảnh. Lượt dựng thử (xuất vào `var/`) không chiếm lượt luân phiên của video thật.

## 8.1. Typography thương hiệu FPT Telecom
- ✔ Chỉ dùng cam `#F37021`, xanh dương `#0066B3`, xanh lá `#00A651`, navy `#0B1F3F`, trắng và sắc độ của chúng. Không vàng neon, tím, cyan neon, đỏ.
- ✔ Sub có 14 kiểu trong `src/typography/subtitle_style.js`, người dùng chọn cho cả video hoặc từng câu. Mặc định là kiểu của video chuẩn (8.0): chữ trắng, từ khóa vàng `#FFFF00` to hơn 20%, viền cam `#FC6601`; đây là ngoại lệ duy nhất của bảng màu. 13 kiểu còn lại chỉ dùng màu FPT. Hook, Highlight, Outro không dùng vàng.
- ✔ Bộ 24 kiểu trong `src/typography/kinetic_overlay.js`: 16 kiểu nền và 8 kiểu chủ đề mạng (`fpt_logo_blocks`, `fpt_fiber_line`, `fpt_signal_bars`, `fpt_wifi_wave`, `fpt_router_led`, `fpt_data_stream`, `fpt_speed_gauge`, `fpt_connect_nodes`).
- ✔ Thêm 8 kiểu cho câu nói về vấn đề ("bị bức tường ngăn", "sóng yếu", "giật lag"): vấp tường, sóng yếu, giật lag, gạch bỏ, băng cảnh báo, nứt vỡ, mất Wi-Fi, tụt dốc (`NEGATIVE_STYLES`). Nhận câu tiêu cực bằng `src/editing/tone.js`; câu báo đã hết vấn đề ("không còn giật lag", "phủ sóng xuyên tường") không tính. Câu tiêu cực dùng bộ này trước, câu khác không bao giờ dùng. Màu: sắc độ navy, chữ trắng, cảnh báo cam. SFX nặng hơn (cơ khí, va đập).
- ✔ Chia dòng không tách cụm từ trong `config/lexicon.json` ("bức tường", "tín hiệu"…); trình duyệt và bản xuất chia giống nhau.
- ✔ Luân phiên cả kiểu Highlight giữa các video; xuất lại cùng dự án giữ nguyên.
- ✔ Không lặp kiểu trong 2 Highlight gần nhất; ưu tiên kiểu chưa dùng; kiểu theo chủ đề không đặt lên nội dung khác.
- ✔ Chữ chỉ gồm lời nói hoặc nội dung người dùng nhập. Không tự thêm nhãn, giá, thông số. Dòng trống không vẽ.
- ✔ Chữ không chồng dòng, không tràn khung, không tách cụm từ ghép hay số với đơn vị.

## 8.2. B-roll sinh động, đặt chính giữa
- ✔ Khung minh họa sản phẩm (Camera AI, modem…) đặt **chính giữa** theo chiều ngang, dưới Highlight và trên Sub; tự dời khi sẽ che mặt VJ, đo lại ở từng cảnh trong lúc B-roll hiện. Không đặt góc phải.
- ✔ Bộ B-roll đồ họa động vẽ bằng code (`scripts/assets/generate_motion_graphics.js`, 10 giây, 1280×720, chỉ màu FPT): modem Wi-Fi 6, FPT Play trên TV (logo FPT Play người dùng gửi), sóng 4G/5G, tường chặn sóng, Mesh phủ sóng cả nhà, tốc độ cao, giật lag. Chỉ có tên sản phẩm, không vẽ giá, tốc độ hay số liệu. Lời nói nhắc chủ đề nào thì tự chèn clip đó ở khung chính giữa; người dùng gán clip thật thì clip thật được ưu tiên. FPT Play dùng khung giữa khi phát đồ họa, toàn màn hình khi người dùng gán clip.
- ✔ B-roll giữ khi lời nói còn nhắc chủ đề (câu gọi tên và câu nói tiếp trong 2,4 giây); nhắc lại thì hiện lại, không treo suốt video dài.
- Mọi B-roll có chuyển động vào, đẩy máy nhẹ trong cảnh và chuyển động ra; cảnh chia đôi kết thúc bằng cắt thẳng.
- ✔ Bắt đầu/kết thúc theo đoạn lời nói liên quan, không chồng nhau, không lấn Hook/Outro.
- Chỉ dùng nguồn đúng chủ đề: clip người dùng gán → stock đã xác minh → clip dựng từ ảnh sản phẩm FPT. Thiếu nguồn thì cảnh báo, không thay bằng cảnh sai.

## 8.3. Hook mở đầu sáng tạo
- ✔ 22 phong cách Hook/Outro trong `HOOKS` của `src/typography/kinetic_core.js` (dải nghiêng, khối logo, chữ lớn viền, thẻ kính, ruy băng, tín hiệu, vé, sợi quang, gõ chữ, đóng dấu, thẻ đung đưa, mở rèm, nhiễu sóng, nhảy sóng, khung góc, xoay vào, lao tới, ba khối nối mạng, neon phát sáng, chữ khối 3D, mở đôi, tia sáng quét), mỗi kiểu có bố cục, chuyển động và công thức SFX riêng.
- ✔ Hook/Outro cao cấp hơn Highlight: lóe sáng khi vào, quầng tối nhẹ sau chữ cho dễ đọc, chữ viền có khối nổi navy, tia sáng quét qua từng dòng, hạt màu FPT bung ra khi mỗi dòng đáp, sao lấp lánh khi đã đứng yên.
- ✔ Luân phiên giữa các video: luôn chọn kiểu lâu chưa dùng nhất (`src/editing/style_history.js`). Xuất lại cùng dự án giữ nguyên kiểu; có thể chỉ định `hookStyle`.
- ✔ Hook có chữ ngay khung hình đầu, y320, scale 1.3. Outro dùng phong cách khác Hook.
- ✔ Mỗi dòng Hook vào hình đều có âm thanh; dòng nào được VJ nói tới thì nhấn lại.

## 8.4. Âm thanh khớp hình
- ✔ Điểm nổ nghe được của SFX phải trùng hình/chữ: dùng mốc đo `from/lead` trong `sfx_director.js`, không phát từ đầu tệp. SFX không gắn với sự kiện nào thì không được xuất.
- ✔ Âm lượng các tệp được cân bằng; không lặp trong 3,5 giây; tránh lặp nhóm liên tiếp; ưu tiên âm thanh khác 2 video gần nhất.
- ✔ **Chỉ dùng bộ SFX người dùng gửi trong `assets/sfx-user`** (38 tệp, 52 take trong `config/sfx_library.json`). Các bộ SFX cũ đã gỡ khỏi dự án, không thêm lại.
- Phân loại theo âm thanh đo được (lướt, trầm, dâng, click, chuỗi, tín hiệu, cơ khí, chuông, tiền), không theo tên cũ. Tệp mới thả vào `assets/sfx-user` được dùng ngay, có thể tinh chỉnh trong `config/sfx_library.json`.
- ✔ Mỗi take tối đa 2 lần, mỗi tệp tối đa 4 lần một video; cùng tệp cách nhau ít nhất 3,5 giây.

## 8.5. Sub và Highlight đúng lời nói
- Nhận dạng bằng Whisper `large-v3-turbo`; mốc từ lấy từ DTW rồi dò về điểm bật âm (`src/speech/word_timing.js`). Không dùng mốc segment mặc định: có thể lệch 0,6 giây. Không bật VAD của Whisper: đã đo thấy mất lời.
- ✔ Chỉ cắt trong khoảng lặng thật ≥ 250ms đo trên sóng âm; không cắt cụt tiếng nói.
- ✔ Sub lệch lời nói quá 0,12s, hai Sub chồng nhau, hoặc Highlight không có trong lời nói: ghi vào `quality_report.json`.
- ✔ Các clip được nghe liền mạch theo thứ tự câu chuyện (bỏ khoảng lặng) để giữ ngữ cảnh; mốc từ trả về đúng clip. Đã đo lại trên tiếng sau khi ghép: lệch trung vị 10 ms, 90% dưới 41 ms.
- ✔ Sub và Highlight cắt câu bằng `src/speech/phrase_segmenter.js`: theo chỗ ngừng, dấu câu, từ nối; không tách cụm từ. Video nói tự do: mỗi ý một Highlight, hiện đúng từ đầu và mất ngay sau từ cuối của ý đó, không giữ lại sang câu sau. Kịch bản ưu đãi ngắn giữ cách cắt theo cụm ưu đãi.
- Đoạn có âm thanh ≥ 2s mà không nhận dạng được phải được nghe lại bằng máy lần hai; vẫn trống thì cảnh báo người dùng.
- Đoạn tối dần cuối video chỉ nằm sau lời nói cuối cùng.

- ✔ **Chính tả và viết hoa** (`src/speech/text_quality.js`, từ điển `config/lexicon.json`): mỗi câu Sub viết hoa chữ đầu; tên sản phẩm, giải đấu, địa danh viết đúng; dấu thanh một kiểu ("thỏa", "hòa"); cụm quen thuộc sai dấu được sửa; âm tiết không phải tiếng Việt được báo trên timeline và trong báo cáo. Chữ người dùng tự gõ chỉ chỉnh khoảng trắng và vị trí dấu.

## 8.6. Timeline là bản dựng
- ✔ Timeline và bản xuất dùng chung một kế hoạch (`src/pipeline/edit_plan.js`). Mọi chữ, hiệu ứng, B-roll, SFX, nhạc có trong video đều có khối trên timeline; không ước lượng. Bài kiểm: `tests/e2e/ui_timeline_smoke.js`.
- ✔ Mọi khối có tay kéo hai đầu, dời, cắt (S, Ctrl+B), bỏ trái/phải kim (Q/W), sao chép, cắt, dán, nhân đôi (Ctrl+C/X/V/D), xóa và hoàn tác: video, B-roll, Hook, Outro, tiêu đề thêm, Highlight, Sub, SFX, nhạc; hiệu ứng kéo được độ dài. SFX người dùng đặt không đẩy SFX khác.
- ✔ Xem trước trực tiếp dùng chính lõi chữ động của bản xuất (`src/typography/kinetic_core.js` chạy cả trong trình duyệt). Không viết bộ vẽ thứ hai.
- ✔ Sửa một mục không được đổi mục khác; SFX đi theo chữ của nó; cắt clip thì chữ, B-roll, SFX phía sau dời theo. Highlight giữ khoảng cách 0,08 giây, B-roll không lấn Hook/Outro ngay khi kéo.
- Không hiện bảng lưu ý trên timeline. Kiểu chữ bị lặp: có nút **Tự đổi kiểu chữ bị lặp**. Từ nghi sai chính tả chỉ gạch chân trên khối Sub.
- ✔ Hiệu ứng hình thêm, dời, kéo, cắt, chép, xóa được (`src/pipeline/picture_fx.js`: zoom nhấn, đẩy máy, thu máy, rung, lắc, chớp sáng, chớp tối, mờ); hiệu ứng mặc định xóa được và thêm lại được. Chữ và Sub không bị hiệu ứng làm rung.
- ✔ Video dài: chỉ vẽ phần đang nhìn, chỉ dựng chữ gần kim; kéo, cuộn, phóng, tua, phát dưới 40 ms/khung ở 66 giây, 210 khối (`tests/e2e/ui_long_smoke.js`).
- Tốc độ: kế hoạch dưới 0,3 giây, kéo thả và xem trước trên 50 khung/giây. Bản ghép nền và lời nhận dạng được dùng lại, không dựng lại khi chưa đổi.

## 8.7. Trước khi phát hành
- Chạy `npm run verify` (doctor, test, B-roll, UI → API → MP4). Đạt hết mới đóng gói bằng `npm run package`.
- Tải lên 4 tệp cùng lúc, không chờ nhận dạng lời nói; clip đã có trong kho được nhận ra và dùng lại.
- Mỗi video có `quality_report.json`; người phụ trách vẫn xem lại nội dung, giá và quyền sử dụng nhạc/hình trước khi đăng.
