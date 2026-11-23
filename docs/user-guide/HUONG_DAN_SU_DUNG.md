# FPT Video Studio — Hướng dẫn sử dụng

## Mở chương trình

Giải nén gói, nhấp đúp **Mo-FPT-Studio.cmd**. Trình duyệt mở `http://127.0.0.1:3457`. Gói đã kèm Node.js, FFmpeg và Whisper; không cần cài thêm. Đặt gói ở đường dẫn ngắn, ví dụ `C:\FPT-Video-Studio`.

## Làm một video

1. Chọn hoặc tải lên video VJ (áo cam FPT, tiếng rõ, ít nhạc nền).
2. Bấm **Tạo Sub text**. Máy bắt đầu nghe ngay khi chọn video nên thường trả kết quả rất nhanh. Sub, Highlight, Hook, Outro, B-roll, hiệu ứng, SFX và nhạc hiện đủ trên timeline; khung xem trước phát trực tiếp như bản xuất.
3. Mở **Timeline** để chỉnh nếu cần, rồi bấm **Tạo video**. Muốn nhanh nhất, bấm thẳng **Tạo video** sau khi chọn clip.
4. Bấm xuất là xuất, không bị chặn. Nhật ký kiểm tra nằm ở `quality_report.json` cạnh video. Nếu có "có âm thanh nhưng không nhận dạng được lời nói", hãy nghe lại đoạn đó.
5. Xem lại nội dung, giá và ưu đãi trước khi đăng.

Thời gian trên máy 16 luồng, video 13 giây từ 4 clip: nhận dạng lần đầu khoảng 16 giây, xem trước 5 giây, xuất khoảng 18 giây. Lần sau cùng clip: nhận dạng dưới 1 giây.

## Timeline

| Việc | Cách làm |
|---|---|
| Xem | Space phát/dừng; kéo trên thước để tua; ←/→ từng khung hình |
| Dời, đổi độ dài | Kéo khối, kéo hai đầu khối (Hook, Outro, nhạc, SFX, hiệu ứng cũng kéo được). Bật **Hít** để bám lời nói và mép cảnh |
| Phóng to | Ctrl + lăn chuột |
| Sửa chữ | Chọn khối Sub, Highlight, Hook hoặc Outro rồi gõ |
| Đổi kiểu chữ | Chọn Highlight/Hook/Outro, bấm một trong các hình mẫu (24 kiểu Highlight, 8 kiểu cho câu nói về vấn đề, 22 kiểu Hook/Outro) |
| SFX | Chọn khối SFX: đổi âm, âm lượng, tắt, dời; **+ SFX** để thêm |
| Cắt clip | Kéo hai đầu clip hoặc phím S; chữ, B-roll, SFX phía sau tự dời |
| Hiệu ứng hình | **+ Hiệu ứng** thêm tại kim (zoom, đẩy máy, rung, chớp, mờ…); chọn rồi Delete để xóa, kể cả zoom cảnh và tối dần |
| Kiểu chữ bị lặp | Bấm **Tự đổi … kiểu chữ bị lặp** (nút chỉ hiện khi có) |
| Bộ kiểu khác cho cùng nội dung | **Đổi phong cách** |
| Sao chép, cắt, dán, nhân đôi | Ctrl+C, Ctrl+X, Ctrl+V (dán tại kim), Ctrl+D |
| Cắt đôi | S hoặc Ctrl+B; Q/W bỏ phần bên trái/phải kim |
| Kiểu Sub | Chọn ở **Kiểu Sub** cạnh nút Tạo Sub text, hoặc bấm vào một câu Sub để chọn cho cả video/chỉ câu đó |
| Thêm tiêu đề | **+ Tiêu đề**, hoặc chép Hook/Outro rồi dán |
| Đổi thứ tự cảnh | Kéo clip ở lớp Video; chữ và B-roll đi theo |
| Hoàn tác | Ctrl+Z, Ctrl+Y |

Chấm trắng trên khối: đã sửa tay. Gạch chân đỏ ở Sub: nghi sai chính tả. Từ, tên riêng hay dùng thêm vào `config/lexicon.json`.

## Muốn chỉnh

| Cần | Cách làm |
|---|---|
| Đổi Hook/Outro | Nhập chữ trong Studio. Dòng trống không hiện. |
| Đổi phong cách Hook | Chọn khối Hook trên timeline rồi chọn kiểu, hoặc **Đổi phong cách**. Để yên thì mỗi video tự dùng kiểu lâu chưa dùng nhất. |
| Highlight riêng | Nhập mỗi dòng một cụm đúng với lời nói. |
| SFX riêng | Thả tệp mp3/wav vào `assets/sfx-user`, mở lại Studio. Hệ thống tự phân loại; muốn chỉnh tay thì sửa `config/sfx_library.json`. |
| B-roll đúng sản phẩm | Có sẵn đồ họa động cho Wi-Fi 6, FPT Play, 4G/5G, tường chặn sóng, Mesh, tốc độ, giật lag; tự chèn theo lời nói. Muốn dùng clip thật thì tải lên và gán vào chủ đề Wi-Fi 6, Camera, FPT Play, Bóng đá hoặc Gaming. |
| Đổi bố cục B-roll | Toàn màn hình, chia màn hình hoặc khung chính giữa trên timeline. |

Bảng kiểu chữ: `docs/brand/brand_typography.png`. Quy tắc dựng: `AGENTS.md`, mục 8.

## Khi video không xuất

Chỉ dừng khi không thể dựng được: clip không có lời nói, thiếu tệp, hoặc media hỏng.

| Thông báo | Xử lý |
|---|---|
| Không có lời nói nhận diện được | Clip câm hoặc chỉ có nhạc; chọn clip khác. |
| Hai cụm trùng hoặc quá sát | Gộp hoặc bỏ bớt một Highlight. |

## Dành cho người quản trị

| Lệnh | Tác dụng |
|---|---|
| `npm run verify` | Kiểm tra toàn bộ: môi trường, test, B-roll, UI → API → MP4 |
| `npm run package -- --zip` | Đóng gói phát hành vào `dist/` |
| `npm run docs:typography` | Vẽ lại bảng kiểu chữ |

Cài máy chủ web: `docs/operations/windows_deployment.md`.
