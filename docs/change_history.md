# FPT Studio — bản nâng cấp dựng theo lời nói

Ngày cập nhật: 17/11/2026.

## Dùng ngay

1. Mở Studio tại http://localhost:3457 (hoặc chạy START_FPT_APP.bat).
2. Chọn video, bấm **Tạo Sub text**.
3. Trong **Biến tấu cách dựng theo lời nói**, chọn **Cân bằng**, **Dồn nhịp** hoặc **Gọn** rồi bấm **Tạo bản phối mới**.
4. Kiểm tra highlight và Track B-roll. Mỗi lần tạo chủ động thay bản phối của hai track này; bạn vẫn sửa được vị trí, thời lượng và layout.
5. Xuất video. Danh sách B-roll rỗng được giữ nguyên; renderer không tự khôi phục những cảnh bạn đã xóa.

Bản phối chọn typo, motion và SFX theo nội dung đã nói, có seed để cùng dữ liệu tạo lại cùng kết quả. Đây là bộ phối bằng quy tắc ngữ nghĩa, chưa phải mô hình tự học phong cách từ video tham chiếu. Nguồn phong cách sử dụng là tài liệu SKILL_HUNGXUHUONG7979.md sẵn có; kênh TikTok không mở được trong phiên làm việc.

## Những lỗi đã xử lý

- Khớp cụm nhiều từ qua word timestamps và cả qua hai câu phụ đề liền nhau; không kéo B-roll về đầu câu.
- Đơn vị rõ ràng: start/end tính bằng giây; startMs/endMs bằng mili-giây. Mốc trên 100 giây không bị đổi thành mili-giây.
- B-roll tự động dài 3,2–3,8 giây, cách nhau tối thiểu 1,5 giây, tránh Hook 0–3,5 giây và Outro.
- Một chủ đề có thể xuất hiện lại ở phần sau; không bị khóa chỉ một lần cho cả video.
- Tôn trọng trạng thái tắt, bỏ hết chủ đề và timeline rỗng. User-upload không bị bộ lọc chủ đề stock loại nhầm.
- end đã sửa trên timeline thắng duration cũ. Thiếu media hoặc compose lỗi thì báo lỗi, không âm thầm xuất thiếu cảnh.
- TOP_HALF canh phần dưới theo điểm tập trung VJ, giữ đúng tỷ lệ và đưa mặt lên trên phụ đề; thanh Canh khung VJ cho phép điều chỉnh theo footage (mặc định 0,55); PiP đúng 460×260 tại (596,180).
- Compose được video không có audio. Khi có audio, bước ghép B-roll giữ nguyên stream gốc.
- Highlight tự sinh không đệm câu quảng cáo ngoài lời nói. Không dời mốc từ khóa để giải quyết va chạm.
- Bản phối sáng tạo tránh highlight che vùng B-roll bằng cách rút đuôi đủ thời gian đọc hoặc bỏ cue xung đột.
- SFX được xét ưu tiên theo thời gian và đường dẫn file thực, chống lặp trong 3,5 giây; highlight ưu tiên hơn whoosh chuyển cảnh. Ngoại lệ chồng hai âm chỉ dành cho opener.
- Slide/drop dùng thời gian tương đối từ lúc highlight xuất hiện. Lề phụ đề tăng lên 190px mỗi bên.
- Lưu renderedHighlights, renderedSfx và B-roll thực tế vào job.json để dễ chẩn đoán.
- Thêm exportCapcut:false phục vụ render kiểm chứng, không tạo draft thử trong CapCut.

## Nguồn B-roll

Ba clip cũ không phù hợp đã được giữ lại nhưng loại khỏi tự động chọn:
- Wi-Fi 6: người đeo kính trước màn hình mã, không phải modem.
- Camera AI: người gọi điện, không phải camera giám sát.
- FPT Play: màn hình nhiễu, không phải giao diện FPT Play.

Clip Ngoại Hạng Anh do người dùng cung cấp tại assets/broll-user/premier_league.mp4 tiếp tục được dùng. Clip gaming đã được thay bằng cảnh chơi game, có metadata trang nguồn và giấy phép:

https://mixkit.co/free-stock-video/three-friends-having-fun-playing-video-games-42672/

Crawler xác minh nhãn giấy phép riêng của item; không suy diễn quyền sử dụng chỉ từ đường dẫn #videoFree. Mixkit có cả Free License và Restricted License:
https://mixkit.co/license/

Crawler giữ tỷ lệ nguồn, chỉ crop lúc render theo layout. Không cắt video mẫu để làm B-roll. Khi không tìm được clip đúng nội dung và giấy phép, API trả lỗi từng chủ đề và giữ nguyên kho.

Để bổ sung đúng sản phẩm: mở **Nguồn B-roll theo chủ đề**, chọn Wi-Fi 6 / Camera AI / FPT Play, tải clip tương ứng rồi bấm **Quét lại** hoặc **Tạo bản phối mới**. Mỗi clip được gán trong assets/broll-user/assignments.json. Catalog và renderer cùng đọc mapping này.

Nguồn stock được ghi vào assets/broll-library/sources.json. Bản nguồn tải về nằm trong .staging; các phiên bản media trước đó nằm trong .previous. Xác minh bằng metadata không thay thế duyệt hình ảnh của mọi khung trong clip.

## Kiểm chứng

Chạy từ thư mục Tool video tự động:

```powershell
node --test tests/creative_broll.test.js tests/api_creative.test.js
node tests/render_broll_smoke.js
node tests/render_pipeline_smoke.js
```

- 25 kiểm thử hồi quy/API/Sub text đã đạt, có đối chiếu 12 job đã lưu.
- Kiểm tra pixel ba layout, trước/trong/sau cảnh; kiểm tra thời lượng và end thắng duration.
- Audio bước compose có SHA-256 giống stream gốc.
- Bản render đầy đủ từ footage 1.mp4–4.mp4: output/QA_FPT_Creative/QA_FPT_Creative.mp4, khoảng 14,94 giây. Bản QA tắt nhạc nền và không tạo CapCut draft.
- Thông tin kiểm tra compositor: output/qa_creative_broll/verification.json.

## Giới hạn cần biết

- Cần word timestamps để tạo cue tự động chính xác. Không có thì trả chẩn đoán, không bịa mốc.
- Timestamp lưu đến mili-giây; video 30 fps chỉ hiển thị theo khung khoảng 33,3 ms. Chất lượng khớp lời vẫn phụ thuộc kết quả ASR.
- Job cũ có lỗi chính tả nhận dạng giọng nói có thể đưa lỗi đó lên chữ. Bản QA sử dụng transcript đã có; không chạy lại Whisper.
- Runtime trình duyệt tích hợp gặp lỗi; đã dùng Edge headless riêng để kiểm tra nút Tạo Sub text, hiển thị 3 câu từ 1.mp4, không có alert hoặc lỗi JavaScript. Ảnh và kết quả nằm trong output/qa_subtext_browser/.
- Chưa kiểm chứng lại toàn bộ đường xuất native draft CapCut hoặc tất cả nguồn video khác nhau.
- Thư mục không có Git. Bản sao mã nguồn trước sửa nằm trong .codex-backups/creative-broll-1794918954500 và .codex-backups/source-validation-1794926611861.

## Cập nhật Sub text

Đã đổi tên thao tác “Bóc Băng Lời Nói VJ” thành “Tạo Sub text”. Sửa nhánh voice riêng và trimSilence:false vốn nhận dạng được lời nói nhưng không thêm kết quả vào danh sách. Video không có lời nói nhận diện được giờ trả lỗi rõ ràng, không báo thành công với danh sách trống. Đã kiểm thử 3 nhánh nhận dạng thật và trường hợp video không tiếng.

Kiểm thử bổ sung: tests/subtext.test.js và tests/ui_subtext_smoke.js.

Nếu tab đang mở phiên bản cũ, tải lại trang và chọn video trước khi bấm Tạo Sub text. Kết quả kiểm thử trên 1.mp4 chưa xác nhận nguyên nhân của mọi video riêng mà người dùng có thể đang gặp lỗi.

## Cập nhật số lượng Text Highlight

Gợi ý từ Sub lấy cụm từ có mốc lời nói thực tế. Mỗi dòng là một highlight; dấu phẩy trong dòng không tách thành yêu cầu khác. Danh sách người dùng chọn được giữ đủ khi tạo và khi render. Cụm sát nhau được rút ngắn, giữ nguyên mốc bắt đầu và khoảng cách giữa hai cụm; không âm thầm loại bớt. Highlight được chọn có ưu tiên hiển thị so với Hook/Outro trong thời gian trùng nhau.

Cụm không khớp lời nói trả lỗi kèm dòng cần sửa, giữ nguyên danh sách hiện tại. Sau cập nhật, Ctrl+F5 và bấm Gợi ý từ khóa từ Sub lại trước khi tạo highlight.

Kiểm chứng: 26 kiểm thử hồi quy/API/count đạt; 15 job đã lưu có tổng 154 gợi ý tạo đủ 154 highlight. Edge headless kiểm tra 12 gợi ý → 12 highlight, không lỗi JavaScript. Bản render output/QA_HighlightCount/QA_HighlightCount.mp4 lưu đủ 12 highlight và giải mã toàn bộ không lỗi. Các kiểm thử mới: tests/highlight_count.test.js, tests/ui_highlight_count_smoke.js, tests/render_highlight_count_smoke.js. Bản sao trước sửa: .codex-backups/highlight-count-1794928320465.

## Sửa lỗi chạy và typography bắt buộc — 17/11/2026

Đã sửa lỗi srcPath undefined: server tự xác định file từ fileRef và kiểm tra khoảng cắt. Timeline giữ mọi đoạn jump-cut, tính đúng thời lượng theo tốc độ 1.25x, không gửi thời lượng ước lượng khi xuất. Giới hạn mã hóa đồng thời 2 clip. UI khóa vùng chỉnh sửa khi render và đồng bộ Sub/Highlight/B-roll trả về sau khi hoàn tất.

Bốn kiểu mới: Editorial Stack, Offset Echo, Bracket Focus và Ribbon Cut, dùng màu FPT. Tổng 16 kiểu. engine/brand_rules.js bắt buộc luân phiên: không trùng trong hai highlight gần nhất, ưu tiên kiểu chưa dùng. Renderer không còn ép mọi cụm giá về price_burst. Quy tắc được ghi trong AGENTS.md mục 7.6.

Sub text: chuẩn hóa tên sản phẩm, sửa các lỗi được quan sát trong clip thật, giữ mốc từ không bị sửa bằng căn chỉnh cục bộ. Bỏ confidence 0.99 giả và bỏ giá mẫu trong prompt ASR. Bổ sung ngắt cụm tránh tách “tiện lợi”, “xem bóng đá”, “Ngoại hạng Anh”. Không thể bảo đảm ASR đúng mọi âm thanh; từ điển không thay thế đối chiếu lời nói khi ghi âm không rõ. Nguồn B-roll Wi-Fi 6/Camera/FPT Play chưa đạt vẫn bị loại, không thay bằng cảnh sai chủ đề; video kiểm thử tự dùng clip bóng đá được cung cấp.

Kiểm chứng cuối: 34 test hồi quy/API/Sub text đạt; hai luồng UI → API → FFmpeg (tạo Sub/Highlight trước, hoặc chọn video rồi bấm Tạo video trực tiếp) đều xuất 14.8 giây, 12 Sub, 12 Highlight với 12 kiểu, 1 B-roll, 11 SFX. Kiểm tra toàn bộ MP4 giải mã không lỗi. Bộ 16 typography render PNG thành công, không ảnh trùng. QA không tạo CapCut draft.

Artifacts: output/QA_FPT_Direct/QA_FPT_Direct.mp4; output/qa_direct_render_browser/result.json; output/qa_typography_catalog/new-styles.png. Các test mới: tests/mandatory_rules.test.js, tests/ui_render_mandatory_smoke.js, tests/ui_render_direct_smoke.js. Backup: .codex-backups/mandatory-engine-1794932021709.


## Video mẫu được duyệt — quy tắc theo lời nói, 18/11/2026

Mẫu gốc và cấu hình được lưu tại references/FPT_Video_1794933728383/. SHA-256 trùng D:/FPT_Video_1794933728383.mp4. Mẫu dùng để đối chiếu chất lượng; không cắt làm B-roll. 6 highlight và 1,9 giây B-roll chỉ là số đo của video đó.

Bộ quy tắc chung nằm ở config/approved_reference.json và engine/reference_editor.js:
- Không khóa số highlight hoặc số giây B-roll. Video dài hơn có thể có 10–15+ highlight. Typography vẫn đa dạng và theo màu FPT.
- B-roll lấy đầu/cuối phần lời nói liên quan qua word timestamps, đổi chủ đề trong cùng một câu cũng tách được. Chủ đề thiếu nguồn vẫn kết thúc cảnh trước, không kéo bóng đá sang lời giới thiệu Camera.
- Không ép khoảng nghỉ giữa hai chủ đề nối sát nhau. Compositor loop nguồn ngắn đủ thời lượng; hai cảnh kề nhau cắt tại ranh giới để không lóe VJ; fade của cảnh riêng nằm trong cửa sổ lời nói.
- Outro tự động đi theo CTA thực tế. Không có CTA thì không chừa sẵn một đoạn Outro khiến B-roll bị cắt sớm. Nội dung tiêu đề và giá lấy từ lời nói hoặc người dùng, không chép nội dung của mẫu.
- Nhánh API/gợi ý/creative/render và hàm B-roll cũ đều dùng planner chung. Sửa lỗi chuẩn hóa “đàm thoại 2 chiều” qua nhiều dòng Sub gây gợi ý tạo thiếu highlight. Không đổi timestamp của từ không sửa.
- Chỉnh B-roll thủ công được đánh dấu timingSource=manual; cảnh tự động lưu speechStart/speechEnd. Giao diện vẫn thu gọn, không thêm thông số.

engine/quality_gate.js kiểm tra timeline, đa dạng chữ, chồng chữ/cảnh, sai mốc B-roll, mật độ SFX, định dạng 1080×1920/30fps, audio stereo 48kHz, độ dài hình/tiếng và giải mã toàn MP4. Mỗi video có quality_report.json; chỉ báo hoàn tất sau khi đạt. Kiểm tra kỹ thuật không thay thế đối chiếu ngữ nghĩa ASR khi âm thanh khó nghe.

Xác minh: 42 kiểm thử hồi quy/API đạt. UI → API → FFmpeg tạo lại thành công video từ 1.mp4–4.mp4: 14,8 giây, 12 Sub, 6 highlight/6 kiểu, 1 B-roll, 9 SFX, không lỗi JavaScript. Đây là kết quả của dữ liệu đó, không phải hạn mức. QA không tạo CapCut draft.
Bài render riêng kiểm tra bằng pixel: nguồn 0,6 giây chạy đến hết cảnh 4–14,2 giây (10,2 giây); cảnh kế tiếp bắt đầu đúng frame 14,2 giây; hết B-roll tại 16,5 giây. Hash audio trước/sau không đổi.
Artifacts: output/QA_FPT_Direct/quality_report.json; output/qa_direct_render_browser/result.json; output/qa_speech_broll/verification.json.
Tests: approved_reference.test.js; render_speech_broll_smoke.js; ui_render_direct_smoke.js.
Backup: .codex-backups/approved-reference-1794934450377 và .codex-backups/speech-boundaries-1794935268078.
