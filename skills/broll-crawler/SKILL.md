---
name: broll-crawler
description: "Tự động cào và tải kho B-Roll video chất lượng cao (1080p/720p) không watermark từ các kho tư liệu mở theo chủ đề: bóng đá Ngoại Hạng Anh, Wi-Fi 6, Camera AI an ninh, cáp quang Internet, truyền hình FPT Play, gaming tốc độ cao. Dùng khi cần bổ sung hoặc cập nhật kho cảnh B-Roll thực tế chuyên nghiệp cho video mà không cần cắt từ video mẫu."
---

# B-Roll Crawler & Auto-Media Fetcher Skill

Skill tự động cào, tải và xử lý video B-Roll độ phân giải cao (1080p/720p), không watermark, không bản quyền từ các nguồn mở uy tín (Mixkit, open stock repositories) để phục vụ dựng video chuyên nghiệp.

## 1. Mục Tiêu & Nguyên Tắc Vàng
1. **Tuyệt đối không cắt video mẫu của người dùng:** Mọi cảnh B-Roll phải được lấy từ kho dữ liệu video mở bản quyền sạch (Creative Commons / Free for Commercial Use).
2. **Chuẩn hóa khung hình:** Video được tải về được tự động scale, crop sang 1080×1920 (hoặc 16:9), 30fps và tạo file thumbnail xem trước tức thì.
3. **Phân loại theo ngữ cảnh kịch bản:**
   - ⚽ `football`: Trận bóng đá đỉnh cao (thay thế cho cảnh Ngoại Hạng Anh & FPT Play).
   - 📶 `technology`: Cáp quang, router, thiết bị Wi-Fi 6, truyền dữ liệu 1 Gbps.
   - 📷 `security`: Camera an ninh, CCTV, smart home AI detection.
   - 📺 `television`: Gia đình xem truyền hình, rạp phim 4K tại nhà.
   - 🎮 `gaming`: Esports, tốc độ phản hồi nhanh, ping thấp 0 lag.

## 2. Cách Sử Dụng Qua Lệnh CLI

### Cào toàn bộ chủ đề:
```bash
node src/broll/broll_crawler.js
```

### Cào một chủ đề cụ thể:
```javascript
const { crawlBrollTopic } = require('./src/broll/broll_crawler');
await crawlBrollTopic('football'); // 'technology' | 'security' | 'television' | 'gaming'
```

## 3. Tích Hợp API Studio
- Endpoint: `POST /api/crawl-brolls`
- Query param: `?topic=all` hoặc `?topic=football`
- Response: Trả về danh sách B-Roll đã cập nhật ngay lập tức vào Studio và Timeline.
