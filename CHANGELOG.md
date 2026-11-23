# Nhật ký thay đổi

## Phiên bản 1.7.0 — 23/11/2026

- Bộ B-roll đồ họa động mới, vẽ bằng code theo màu FPT: modem Wi-Fi 6, FPT Play trên TV, sóng 4G/5G, tường chặn sóng, Mesh phủ sóng cả nhà, tốc độ cao, giật lag. Tự chèn khi lời nói nhắc chủ đề.
- 8 kiểu chữ cho câu nói về vấn đề ("bị bức tường ngăn", "sóng yếu", "giật lag"): vấp tường, sóng yếu, giật lag, gạch bỏ, băng cảnh báo, nứt vỡ, mất Wi-Fi, tụt dốc. Tự nhận câu tiêu cực; câu "không còn giật lag" không tính.
- Hook/Outro cao cấp hơn: lóe sáng, chữ khối nổi, tia sáng quét từng dòng, hạt bung khi chữ đáp. Thêm 4 kiểu: neon phát sáng, chữ khối 3D, mở đôi, tia sáng quét (tổng 22).
- Chia dòng chữ không còn tách "bức / tường" và các cụm từ trong từ điển.

## Phiên bản 1.6.1 — 23/11/2026

- Highlight video dài: cắt theo từng ý, hiện đúng từ đầu và mất ngay sau từ cuối; trước đây cắt giữa cụm và giữ 1,9 giây. Dòng người dùng gõ khác lời nói chút ít vẫn khớp được mốc.
- Nghe các clip liền mạch theo thứ tự: đúng chữ hơn hẳn; thêm hàng trăm cụm từ không tách dòng. Nhận ra lời kêu gọi "bình luận", "nhắn tin" để đặt Outro; Sub không mất khi Outro không có câu đó.
- Bấm xuất luôn xuất. Bỏ bảng lưu ý; thêm nút tự đổi kiểu chữ bị lặp.
- Thêm/xóa hiệu ứng hình: 8 loại, dời, kéo, cắt, chép được.
- Tải lên song song 4 tệp, có tiến độ, giữ thứ tự, không tải lại clip đã có.
- Timeline video dài mượt và dễ đọc: mở ở cỡ đọc được, theo kim khi phát, chỉ vẽ phần nhìn thấy.
- Xuất lỗi không còn để lại tệp tạm.

## Phiên bản 1.5.0 — 23/11/2026

- Timeline: mọi khối kéo được hai đầu, dời, cắt, sao chép/dán/nhân đôi bằng phím như trình dựng thông thường. Hook, Outro kéo cả đầu lẫn đuôi; thêm tiêu đề; nhạc nền và SFX cắt, thu ngắn, chép được; hiệu ứng đổi được độ dài; kéo clip để đổi thứ tự.
- Thêm 10 kiểu Hook/Outro có chuyển động mới (tổng 18) và 14 kiểu Sub để chọn.
- Logo FPT Telecom chuẩn trong assets/brand và giao diện.
- Studio báo khi máy chủ đang chạy bản cũ và tự cập nhật được (từ bản này trở đi).
- Bấm vào timeline rồi dùng phím tắt ngay cả khi trước đó đang gõ trong ô chữ.

## Phiên bản 1.4.1 — 23/11/2026

- Kéo được thời lượng Hook trên timeline; Highlight sát nhau không làm Hook chớp lại giữa chừng.
- Khung xem trước đứng yên khi cuộn trang lúc mở timeline. Ô tải lên không còn kẹt chữ "Đang tải lên".

## Phiên bản 1.4.0 — 22/11/2026

- Timeline mới: hiển thị đúng kế hoạch dựng (video, B-roll, tiêu đề, Highlight, Sub, hiệu ứng, từng SFX, sóng âm, nhạc); kéo thả, hít, cắt, hoàn tác, chọn 24 kiểu chữ và 8 kiểu Hook bằng hình, đổi phong cách một chạm.
- Xem trước trực tiếp trong trình duyệt bằng chính lõi chữ động của bản xuất, có Sub, B-roll, SFX, nhạc.
- Nhận dạng lời nói gộp clip ngắn (58 giây → 16 giây với 4 clip), bắt đầu ngay khi chọn video. Dựng video 42 giây → khoảng 18 giây, giữ CRF 17/preset fast; chỉ còn một lượt mã hóa sau bản ghép nền.
- Luân phiên 24 kiểu chữ theo 6 video gần nhất; sửa lỗi giao diện web luôn gửi lại cùng một bộ kiểu.
- Chính tả, dấu, viết hoa theo từ điển config/lexicon.json; cảnh báo từ nghi sai.
- Cân âm lượng giọng mọi nguồn về mức video chuẩn (đo được -10,6 LUFS trên các nguồn khác nhau, trước là -7,6 đến -10,5).
- Ngắt dòng Sub không tách cụm từ và địa danh; mở lại Studio sau khi cập nhật sẽ tự thay bản cũ đang chạy nền khi bản đó rảnh.
- Video chuẩn là FPT_Combo_WiFi6_Chuan (AGENTS.md 8.0).

## Phiên bản 1.3.0 — 22/11/2026

- Video chuẩn mới (assets/references/standard-video, AGENTS.md 8.0). Sub trở lại màu của video chuẩn: từ khóa vàng, viền cam; thay cho 1.2.1.
- Lượt dựng thử có lịch sử phong cách riêng, không chiếm lượt luân phiên của video thật.

## Phiên bản 1.2.1 — 22/11/2026

- Sub: bỏ chữ vàng; từ khóa chữ trắng viền xanh dương FPT, chữ thường viền cam FPT chuẩn. Màu ngoài bảng màu FPT làm dừng xuất video.

## Phiên bản 1.2.0 — 22/11/2026

- Sắp xếp lại mã theo mảng: pipeline, speech, editing, typography, broll, audio, media, integrations, web. Kiểm thử tách unit và e2e; script tách build, assets, server, tools; tài liệu tách user-guide, operations, brand, development.
- Tài nguyên: logo và ảnh sản phẩm vào assets/brand, nhạc có sẵn vào assets/music-presets. Bỏ SFX cũ, hình dựng cũ, clip trùng hoặc sai chủ đề, model Whisper base.
- Bỏ bản sao 20 kho GitHub không dùng, báo cáo một lần, mã chết và bí danh đường dẫn tuyệt đối.
- output/ chỉ giữ thành phẩm; tệp trung gian tự xóa khi không có nháp CapCut. Báo cáo kiểm tra ghi vào var/qa.

## Phiên bản 1.1.0 — 22/11/2026

- Whisper large-v3-turbo + DTW + dò điểm bật âm: mốc từ cũ lệch tới 0,6 giây so với sóng âm, nay trùng âm tiết. Không dùng VAD của Whisper (đã đo: mất lời). Đoạn chưa nhận dạng được nghe lại lần hai, giữ trong video và cảnh báo.
- Cắt lặng trên sóng âm, không cắt cụt tiếng; chừa đuôi để đoạn tối dần không đè CTA. Lưu đệm nhận dạng.
- SFX: đo điểm nổ từng tệp (bellring trước đây nổ ở 3,7s dù đặt ở 0s), cân âm lượng, dùng cả 56 SFX công nghệ, tối đa 2 lần mỗi tệp.
- 24 kiểu Highlight và 8 phong cách Hook/Outro đúng màu FPT; luân phiên giữa các video; công thức SFX riêng cho từng Hook.
- B-roll sản phẩm ở chính giữa, tự né mặt VJ.
- Outro bắt theo lời kêu gọi cuối, không che cả phần tư cuối video dài.
- Cổng chất lượng chặn: Sub lệch, Highlight không có trong lời nói, SFX không gắn hình, lặp âm/kiểu chữ quá mức, hình đen giữa video.
- Gỡ Remotion, React, google-tts, msedge-tts vì không dùng; không còn yêu cầu giấy phép Remotion cho doanh nghiệp.
- Đóng gói: npm run package tạo bản portable kèm Node, SHA256SUMS và THIRD_PARTY_NOTICES.

## Phiên bản 1.1.1 — 22/11/2026

- SFX: chỉ dùng bộ người dùng gửi (assets/sfx-user, 27 tệp). Phân loại lại theo âm thanh đo được vì nhiều tên cũ sai (sfx_24 "tiền xu" là chuỗi 8 tiếng tích; sfx_05 "chime" là chuỗi click; sfx_01 "click" là tiếng gió). Tách thành 40 take bằng mốc trong tệp, không sửa tệp gốc.
- Công thức SFX của 8 Hook, chuyển cảnh, Highlight, Outro chuyển sang bộ này. Danh sách trong Studio và nháp CapCut cũng dùng đúng đoạn đã cắt.
- Gói phát hành không còn chứa assets/sfx và assets/sfx-tech.

## Phiên bản 1.1.2 — 22/11/2026

- Người dùng xác nhận 11 âm thanh chuông/tiền/flash thuộc bộ của mình: đã thêm vào assets/sfx-user (38 tệp, 52 take), thêm nhóm chuông và tiền.
- bellring, bellring_2, cash_money có cùng một tiếng nổ trầm ở cuối tệp, to hơn âm chính; chỉ dùng phần chuông/tiền thật.

---

# Lịch sử trước 1.1

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
node --test tests/unit/creative_broll.test.js tests/unit/api_creative.test.js
node tests/e2e/render_broll_smoke.js
node tests/e2e/render_pipeline_smoke.js
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

Kiểm thử bổ sung: tests/unit/subtext.test.js và tests/e2e/ui_subtext_smoke.js.

Nếu tab đang mở phiên bản cũ, tải lại trang và chọn video trước khi bấm Tạo Sub text. Kết quả kiểm thử trên 1.mp4 chưa xác nhận nguyên nhân của mọi video riêng mà người dùng có thể đang gặp lỗi.

## Cập nhật số lượng Text Highlight

Gợi ý từ Sub lấy cụm từ có mốc lời nói thực tế. Mỗi dòng là một highlight; dấu phẩy trong dòng không tách thành yêu cầu khác. Danh sách người dùng chọn được giữ đủ khi tạo và khi render. Cụm sát nhau được rút ngắn, giữ nguyên mốc bắt đầu và khoảng cách giữa hai cụm; không âm thầm loại bớt. Highlight được chọn có ưu tiên hiển thị so với Hook/Outro trong thời gian trùng nhau.

Cụm không khớp lời nói trả lỗi kèm dòng cần sửa, giữ nguyên danh sách hiện tại. Sau cập nhật, Ctrl+F5 và bấm Gợi ý từ khóa từ Sub lại trước khi tạo highlight.

Kiểm chứng: 26 kiểm thử hồi quy/API/count đạt; 15 job đã lưu có tổng 154 gợi ý tạo đủ 154 highlight. Edge headless kiểm tra 12 gợi ý → 12 highlight, không lỗi JavaScript. Bản render output/QA_HighlightCount/QA_HighlightCount.mp4 lưu đủ 12 highlight và giải mã toàn bộ không lỗi. Các kiểm thử mới: tests/unit/highlight_count.test.js, tests/e2e/ui_highlight_count_smoke.js, tests/e2e/render_highlight_count_smoke.js. Bản sao trước sửa: .codex-backups/highlight-count-1794928320465.

## Sửa lỗi chạy và typography bắt buộc — 17/11/2026

Đã sửa lỗi srcPath undefined: server tự xác định file từ fileRef và kiểm tra khoảng cắt. Timeline giữ mọi đoạn jump-cut, tính đúng thời lượng theo tốc độ 1.25x, không gửi thời lượng ước lượng khi xuất. Giới hạn mã hóa đồng thời 2 clip. UI khóa vùng chỉnh sửa khi render và đồng bộ Sub/Highlight/B-roll trả về sau khi hoàn tất.

Bốn kiểu mới: Editorial Stack, Offset Echo, Bracket Focus và Ribbon Cut, dùng màu FPT. Tổng 16 kiểu. engine/brand_rules.js bắt buộc luân phiên: không trùng trong hai highlight gần nhất, ưu tiên kiểu chưa dùng. Renderer không còn ép mọi cụm giá về price_burst. Quy tắc được ghi trong AGENTS.md mục 7.6.

Sub text: chuẩn hóa tên sản phẩm, sửa các lỗi được quan sát trong clip thật, giữ mốc từ không bị sửa bằng căn chỉnh cục bộ. Bỏ confidence 0.99 giả và bỏ giá mẫu trong prompt ASR. Bổ sung ngắt cụm tránh tách “tiện lợi”, “xem bóng đá”, “Ngoại hạng Anh”. Không thể bảo đảm ASR đúng mọi âm thanh; từ điển không thay thế đối chiếu lời nói khi ghi âm không rõ. Nguồn B-roll Wi-Fi 6/Camera/FPT Play chưa đạt vẫn bị loại, không thay bằng cảnh sai chủ đề; video kiểm thử tự dùng clip bóng đá được cung cấp.

Kiểm chứng cuối: 34 test hồi quy/API/Sub text đạt; hai luồng UI → API → FFmpeg (tạo Sub/Highlight trước, hoặc chọn video rồi bấm Tạo video trực tiếp) đều xuất 14.8 giây, 12 Sub, 12 Highlight với 12 kiểu, 1 B-roll, 11 SFX. Kiểm tra toàn bộ MP4 giải mã không lỗi. Bộ 16 typography render PNG thành công, không ảnh trùng. QA không tạo CapCut draft.

Artifacts: output/QA_FPT_Direct/QA_FPT_Direct.mp4; output/qa_direct_render_browser/result.json; output/qa_typography_catalog/new-styles.png. Các test mới: tests/unit/mandatory_rules.test.js, tests/e2e/ui_render_mandatory_smoke.js, tests/e2e/ui_render_direct_smoke.js. Backup: .codex-backups/mandatory-engine-1794932021709.


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

## Nâng cấp độ chính xác và chuyển động — 22/11/2026

- Ghép cảnh: src/pipeline/clip_assembler.js ghép trên lưới 30 fps, âm thanh PCM. Trước đây mỗi cảnh cắt cộng dồn khoảng 24 ms lệch giữa Sub/Highlight và hình/tiếng.
- Nhận dạng: src/speech/speech_activity.js bỏ từ vượt độ dài tệp, từ nằm trong khoảng lặng, câu Whisper tự bịa; cắt khoảng lặng theo âm thanh thực thay vì chỉ theo mốc từ nối liền của Whisper.
- Chữ động: src/typography/kinetic_overlay.js thay render_typography.ps1; neo theo tâm chữ, đo khung chữ thật, từng từ nhấn theo mốc nói, không tự thêm nhãn. Một track alpha duy nhất thay cho từng lớp PNG.
- Highlight dài chia theo câu Sub, bỏ từ đệm, giữ tối thiểu khoảng đọc; kiểu chữ theo chủ đề.
- Sub: từ khóa có dấu được tô, biểu tượng đúng chủ đề, chặn ký tự điều khiển ASS, đúng mốc 60 giây.
- B-roll: vào/ra, khung PiP bo góc, đẩy máy nhẹ; Wi-Fi 6/Camera dùng clip chuyển động dựng từ ảnh sản phẩm FPT khi chưa có stock đúng.
- Nhạc: thật sự đo âm lượng để chọn đoạn sôi động (trước đây luôn lấy giây 12). CapCut: dùng cảnh đã cắt, không chồng voice.
- Cài đặt: thêm react-dom để npm ci chạy được trên máy mới; thêm @napi-rs/canvas.
- Kiểm thử: tests/unit/quality_upgrade.test.js (11 bài).

