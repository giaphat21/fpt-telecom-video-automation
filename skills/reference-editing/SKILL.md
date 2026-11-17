---
name: hungxuhuong7979-edit-style
description: Skill đóng gói phong cách dựng video ngắn bán hàng (TikTok/Reels/Shorts) theo ADN kênh @hungxuhuong7979 — talking-head nhân viên FPT Telecom, xếp tầng ưu đãi, nhịp nhanh, phụ đề cam viền trắng. Kích hoạt khi người dùng yêu cầu dựng video theo phong cách bắt trend, review/chốt sale gói cước, nhịp nhanh cuốn hút.
---

# SKILL: PHONG CÁCH DỰNG VIDEO CHUẨN @hungxuhuong7979

## 0. NGUỒN DỮ LIỆU & ĐỘ TIN CẬY

| Hạng mục | Phương pháp | Độ tin cậy |
|---|---|---|
| Mẫu phân tích | 3 video gốc (ID 7654415761783475477 – 30.2s; 7660367429083598101 – 67.2s; 7703727640049487125 – 43.4s). File thứ 4 trùng MD5 → loại | — |
| Kịch bản | Dựng lại từ phụ đề burn-in, lấy mẫu 2 fps (Whisper không chạy được do bị chặn tải model) | Cao (phụ đề bám sát lời thoại); có thể thiếu vài từ đệm |
| Nhịp cắt | Frame-diff 30 fps (scdet không bắt được vì cùng bối cảnh) + kiểm tra mắt trên contact sheet | Cao |
| Màu chữ / tọa độ | Lấy mẫu pixel trên frame gốc 576×1024, quy đổi sang 1080×1920 | Cao (màu); ±20px (tọa độ) |
| Font | So khớp bằng mắt | Trung bình — font gốc chưa xác định |
| Âm thanh | EBU R128, silencedetect, HPSS beat tracking | Cao (loudness/tempo); **SFX là suy luận từ điểm pop-in hình, chưa nghe xác minh** |
| Thông số spring chữ | Đề xuất khớp quan sát, không đo được ở 2 fps | Thấp — cần tinh chỉnh |

---

## 1. QUY TẮC VIẾT KỊCH BẢN & CẤU TRÚC HOOK (CHO CREATIVE DIRECTOR AGENT)

### 1.1. Nhân vật & bối cảnh (bắt buộc giữ)
- 1 MC nam, áo polo cam thương hiệu, mic cài áo, nói thẳng vào camera, cử chỉ tay rộng (xòe tay, chỉ tay, đếm ngón).
- Bối cảnh: tường trắng có **logo thương hiệu lớn ở 1/3 trên** + kệ trưng bày sản phẩm phía sau; hoặc phòng họp/văn phòng có TV.
- Sản phẩm thật cầm trên tay (modem, camera, box TV) — đưa sát ống kính khi nhắc tên.

### 1.2. 3 công thức Hook (0s–3s) đã kiểm chứng

| Mã | Công thức | Ví dụ gốc | Cách dựng |
|---|---|---|---|
| H1 – Skit tình huống | Nhân vật phụ hỏi vặn → MC phủ định → tung ưu đãi | "Ôi anh ơi, em bảo anh lắp mạng mà anh lắp cái gì đấy?" → "Không phải đâu em ạ" → "Lắp mạng **được tặng Cam**" | Mở bằng góc rộng thấy cả 2 người, product PNG pop-in cạnh đầu MC ngay giây 0.5 |
| H2 – Reply comment | Sticker "Reply to … comment" chứa câu hỏi của khách → MC đọc điện thoại rồi ngẩng lên trả lời | "Lắp mạng FPT bây giờ có ưu đãi gì không em?" → "Có nhiều anh ạ, nhưng mà phải biết…" | Sticker trắng ở y≈130–200px (khung 1080), giữ 0–2.4s; MC cầm điện thoại |
| H3 – Tiêu đề con số | Tiêu đề lớn cố định đầu khung "MUA 1 ĐƯỢC 3" + dòng phụ liệt kê 3 thứ | "MUA 1 ĐƯỢC 3 / Internet – FPT Play – NHA" → "Chỉ từ 220K/tháng" | Tiêu đề bay vào (xoay + scale) ở 0–0.5s, giữ đến ~4.4s; giá xuất hiện trước giây 3 |

**Quy tắc chung của hook:** nêu ưu đãi hoặc giá **trước giây thứ 3–4**; không giới thiệu bản thân; không chào hỏi.

### 1.3. Văn phong & nhịp thoại
- **Tốc độ nói đo được:** ~6.4 âm tiết/giây (~384 âm tiết/phút) — rất nhanh, gần như không có nhịp nghỉ (không có khoảng lặng ≥0.25s ở ngưỡng -45dB trong cả 3 video).
- **Từ đệm/khẩu ngữ đặc trưng:** "nhá", "mọi người nhá", "mọi người ơi", "anh ạ/em ạ", "ấy", "thì", "mà".
- **Cụm từ đẩy cảm xúc:** "cực kỳ ngon", "cực kỳ hời", "Trời ơi quá nhiều quà tặng", "cái đáng tiền nhất", "thoải mái mà không lo bị giật lag".
- **Cụm chuyển tầng ưu đãi (bắt buộc dùng ≥2 lần/video):** "Chưa hết mọi người nhá", "Đặc biệt…", "Còn thêm nữa mọi người nhé", "Ưu đãi thứ 2 nhé", "Thứ nhất / Thứ 2 / Thứ 3 là…", "Tóm lại bây giờ như này nhá".
- **Cách nói giá:** luôn "chỉ từ / chỉ có + [giá]/tháng"; nhắc lại giá chính ≥2 lần (lần cuối ở phần tóm tắt trước CTA).
- **Cấu trúc so sánh tăng:** "giá vẫn giữ nguyên nhưng tốc độ tăng X3", "từ 300 Mbps đến 1.000 Mbps".

### 1.4. Cấu trúc phân bổ thời lượng ("Bậc thang ưu đãi")

| Block | Video 30s (v1) | Video 43s (v3) | Video 67s (v2) | Nội dung |
|---|---|---|---|---|
| Hook | 0–4s | 0–4.4s | 0–2.4s | H1/H2/H3 |
| Ưu đãi 1 + giá gốc | 4–12.5s | 4.4–14.5s | 2.4–16.5s | Giá thấp nhất + thiết bị miễn phí (Modem WiFi 6) + bằng chứng (speedtest) |
| Ưu đãi 2 (combo/nội dung) | 12.5–17s | 14.5–36.5s | 16.5–44s | Combo + truyền hình, World Cup / Ngoại hạng Anh, số kênh, phim, kênh thiếu nhi |
| Ưu đãi 3 (leo thang) | 17.5–25s | (gộp vào trên) | 44–60s | "Chưa hết…": tăng tốc X3 / upsell box / tặng thêm tháng |
| Cao trào | 25.5–27s | 36.5–41.5s | — | "Trời ơi quá nhiều quà" + confetti, hoặc "Tóm lại…" + nhắc giá |
| CTA | 27–30s | 41.5–43.4s | 60–67s | "Đăng ký ngay" + móc quay thưởng (xe điện) / "Nhanh tay" |

Tỷ lệ chuẩn: **Hook 10% → Ưu đãi xếp tầng 70–75% → Cao trào 7% → CTA 8–10%.**

### 1.5. CTA
- Text "Đăng ký ngay" / "Đăng ký ngay!" ở **1/3 trên khung**, cam viền trắng, nghiêng nhẹ.
- Lời thoại: "Đăng ký ngay để có cơ hội được trúng [quà lớn] mọi người nhá" hoặc "Nhanh tay…".
- Hình: MC chỉ 2 tay vào camera / giơ nắm đấm; confetti phủ khung; hình quà (xe điện PNG) pop-in cạnh MC.

---

## 2. THÔNG SỐ KỸ THUẬT TIMELINE & CẮT CẢNH (CHO VIDEO EDITOR AGENT)

- **Độ phân giải & Tỷ lệ:** 1080×1920 (9:16), 30fps. (Bản tải về gốc 576×1024, 30fps.)
- **Thời lượng mục tiêu:** 30–45s (tối đa 70s).

### 2.1. Tần suất cắt cảnh (đo bằng frame-diff)

| Video | Thời lượng | Số điểm đổi hình | TB/cảnh | Trung vị | Min–Max |
|---|---|---|---|---|---|
| v1 | 30.2s | 13 | 2.15s | 1.39s | 0.1–6.9s |
| v2 | 67.2s | 24 | 2.69s | 2.14s | 0.2–7.4s |
| v3 | 43.4s | 25 | 1.67s | 0.54s* | 0.2–6.7s |

\*v3 có cụm overlay dồn dập 20.8–24.1s kéo trung vị xuống.

**Quy tắc áp dụng:** đổi khung hình / chèn overlay mỗi **1.5–2.7s (mục tiêu 2.2s)**; không giữ 1 khung trơn quá **7s**; ở đoạn liệt kê tính năng → dồn nhịp 0.3–0.5s/visual.

### 2.2. Kiểu "cắt" chủ đạo: Jump-cut đổi cỡ cảnh (không đổi bối cảnh)
Cùng 1 góc máy cố định, đổi cỡ cảnh luân phiên tại điểm ngắt câu:

| Cỡ cảnh | Scale (so với khung gốc rộng) | Dùng khi |
|---|---|---|
| Rộng (trung cảnh ngang hông, thấy logo + kệ) | 100% | Mở block mới, liệt kê |
| Cận vừa (ngang ngực) | 125–135% | Nói giá, giải thích |
| Cận sát (đầu–vai) | 150–170% | Câu cảm thán, nhấn "cực kỳ hời", "Trời ơi" |

### 2.3. Motion & hiệu ứng khung hình
- **Punch-in tức thời** (hard cut đổi scale) — hiệu ứng chính.
- **Zoom blur / whip** 3–5 frame tại chuyển block (quan sát v2 tại ~4.0s: khung nhòe chuyển động).
- **Desaturate flash (đen trắng)** ~0.5–1s ngay trước câu cao trào (v1 25.5–26.3s), rồi bật màu lại cùng confetti.
- **Product PNG cut-out**: tách nền, đặt ở 1/3 trên cạnh đầu MC, pop-in scale 0→110%→100%; có thể xếp 2–3 sản phẩm.
- **Icon động**: sóng WiFi xanh lá vẽ dần từng vạch (v3 6.5–9.5s).
- **Confetti/particle overlay** toàn khung ở các câu "tặng", "quà", CTA.
- **Ảnh MC nhân bản** (3 pose PNG ở nền) khi liệt kê "lướt web / chơi game / làm tác vụ nặng".

### 2.4. B-roll / Overlay
- **Tỷ lệ thời lượng có overlay:** ~50–60% (ước lượng thị giác trên frame 2 fps).
- **Kiểu chèn chính: "Top-band"** — B-roll chiếm 1/3–1/2 trên khung (screen record giao diện FPT Play, speedtest, trận bóng, banner chương trình), MC vẫn ở nửa dưới. Không cắt hẳn sang full-screen B-roll.
- **Speedtest**: cho đồng hồ chạy số tăng dần (313 → 1.069 Mbps) — đặt trong khung tròn hoặc band trên.
- **Banner chương trình** (poster chiến dịch) phủ nửa trên 1.5–2s.

### 2.5. Chuyển cảnh (Transitions)

| Loại | Tần suất | Thời lượng |
|---|---|---|
| Hard cut (đổi cỡ cảnh) | ~80% | 0 frame |
| Zoom-blur/whip | Tại chuyển block lớn | 3–5 frame |
| Desaturate → màu | 1 lần/video, trước cao trào | 15–25 frame |
| Pop-in overlay | Mỗi lần nhắc sản phẩm/giá | 5–8 frame vào |

---

## 3. CẤU HÌNH PHỤ ĐỀ ĐỘNG & SAFE ZONE (CHO REMOTION / SATORI)

### 3.1. Font Family (xấp xỉ, font gốc chưa xác định)

| Lớp chữ | Font đề xuất (hỗ trợ tiếng Việt) | Weight |
|---|---|---|
| Phụ đề chạy | `Nunito` (bo tròn, đậm) | 900 |
| Tiêu đề / giá / CTA | `Montserrat` | 800–900 |

### 3.2. Bảng màu (lấy mẫu pixel)

| Vai trò | Hex | CSS/Satori |
|---|---|---|
| Chữ chính (cam thương hiệu) | `#FC6601` (dao động `#F26610`–`#FD6702`) | `color:#FC6601` |
| Viền chữ chính | `#FFFFFF` | `WebkitTextStroke:'6px #FFFFFF'; paintOrder:'stroke fill'` (phụ đề), `10px` (tiêu đề) |
| Tiêu đề lớn (biến thể cam sáng) | `#FD7F00` | viền trắng 10px |
| Dòng phụ tiêu đề / chữ highlight phụ | `#EFFF00` (vàng chanh) | `WebkitTextStroke:'5px #000000'` |
| Hộp giá (pill) | nền `#FFFFFF`, chữ `#FC6601` | `borderRadius:24px; padding:'8px 28px'; boxShadow:'0 4px 12px rgba(0,0,0,0.18)'` |
| Bóng đổ chung | — | `textShadow:'0 3px 6px rgba(0,0,0,0.25)'` |

### 3.3. Bố cục & tọa độ (quy đổi 1080×1920)

| Lớp | Tâm Y | Cỡ chữ | Ngắt dòng |
|---|---|---|---|
| Phụ đề chạy | 1150–1310px (60–68% chiều cao) | 46–52px | 1 dòng, 2–6 từ/cụm, ngắt theo nhịp nói |
| Từ khóa/giá phóng to | 1180–1260px | 72–96px | 1–2 dòng (dòng 1 "chỉ từ" nhỏ, dòng 2 giá trong pill) |
| Tiêu đề hook | 340–430px | 80–96px | Dòng chính + dòng phụ vàng 44px |
| CTA "Đăng ký ngay" | 440–520px | 72–84px | 1 dòng, xoay -4° |
| Sticker reply comment | 130–330px | 30px | Hộp trắng bo góc, avatar tròn trái |

- Bọc trong `<Balancer>`; căn giữa ngang.
- **Safe Zone khóa cứng:** Top 120px, Bottom 350px, Right 120px, Left 60px → vùng chữ hợp lệ x∈[60,960], y∈[120,1570]. Mọi lớp trên đều nằm trong vùng này.
- Phụ đề chạy **không** dùng highlight từng từ (karaoke); thay vào đó từ khóa quan trọng được tách thành lớp riêng phóng to (giá, "Modem Wi-Fi 6", "180 Kênh", "Ngoại hạng Anh", "Tốc độ").

### 3.4. Hiệu ứng chữ (Animation Preset — đề xuất, cần tinh chỉnh)

| Lớp | Vào | Ra |
|---|---|---|
| Phụ đề chạy | Hard-in (xuất hiện ngay theo cụm), không animate | Hard-out |
| Từ khóa/giá | `spring({damping:12, stiffness:180, mass:0.6})` scale 0.4→1, overshoot ~1.1 | Fade 4 frame |
| Tiêu đề hook | scale 1.6→1 + rotate -8°→0° + blur 8px→0, 8–10 frame | Giữ đến hết hook |
| CTA | spring như từ khóa + lắc nhẹ rotate ±3° lặp chu kỳ 20 frame | — |

---

## 4. THIẾT KẾ ÂM THANH & SFX CUE

### 4.1. Số đo gốc

| Video | Integrated loudness | LRA | BGM tempo (ước lượng) | Mức nền (BGM) dưới giọng |
|---|---|---|---|---|
| v1 | -16.0 LUFS | 2.0 LU | ~136 BPM | ~15 dB |
| v2 | -9.1 LUFS | 2.0 LU | ~129 BPM | ~17 dB |
| v3 | -10.5 LUFS | 3.0 LU | ~118 BPM | ~15 dB |

→ Âm thanh bị nén rất mạnh (LRA 2–3 LU), giọng luôn "dày", không có khoảng lặng.

### 4.2. Cấu hình áp dụng
- **Voiceover (Track 2):** quay giọng thật trực tiếp (mic cài áo). Chuẩn hóa peak -3dB, compressor ratio 4:1, mục tiêu master **-10 đến -12 LUFS**, LRA ≤3. Nếu dùng TTS: tốc độ **1.10–1.15x** để đạt ~6–6.5 âm tiết/giây. Cắt bỏ mọi khoảng nghỉ >0.2s giữa câu.
- **Nhạc nền (Track 3):** nhạc điện tử/pop sôi động không lời, **118–136 BPM**, nằm thấp hơn giọng **15–17 dB** (≈ -18dB so với peak voice), chạy liên tục từ frame 0 đến hết, không duck theo câu.

### 4.3. Danh sách SFX (SUY LUẬN từ điểm pop-in hình — cần nghe xác minh trước khi khóa)

| SFX | Vị trí chèn |
|---|---|
| Pop / bubble | Mỗi lần product PNG hoặc từ khóa phóng to xuất hiện |
| Whoosh ngắn | Zoom-blur/whip giữa các block |
| Cash register / "ting" | Lúc hiện giá trong pill |
| Party popper / confetti | Câu "tặng", "quà", cao trào, CTA |
| Rewind/record-scratch hoặc "đơ" | Khung đen trắng trước cao trào |
| Riser ngắn (0.5–1s) | Ngay trước "Chưa hết…/Đặc biệt…/Thứ 3 là…" |

Âm lượng SFX: -12 đến -8 dB, không lấn giọng.

---

## 5. CẤU HÌNH JSON MẪU CHO CAPCUT MCP & REMOTION

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "style_id": "hungxuhuong7979-edit-style",
  "version": "1.0.0",
  "canvas": { "width": 1080, "height": 1920, "fps": 30, "target_duration_s": [30, 45], "max_duration_s": 70 },
  "safe_zone": { "top": 120, "bottom": 350, "left": 60, "right": 120 },
  "script": {
    "hook_types": ["skit_objection", "reply_comment", "number_headline"],
    "hook_max_s": 4.4,
    "price_reveal_before_s": 4.0,
    "structure_ratio": { "hook": 0.10, "offer_ladder": 0.73, "climax": 0.07, "cta": 0.10 },
    "speech_rate_syllables_per_s": 6.4,
    "max_pause_s": 0.2,
    "escalation_phrases": ["Chưa hết mọi người nhá", "Đặc biệt", "Còn thêm nữa mọi người nhé", "Thứ nhất", "Thứ 2", "Thứ 3 là cái đáng tiền nhất", "Tóm lại bây giờ như này nhá"],
    "fillers": ["nhá", "mọi người nhá", "mọi người ơi", "anh ạ", "ấy"],
    "price_mentions_min": 2,
    "cta": { "text": "Đăng ký ngay", "voice": "Đăng ký ngay để có cơ hội được trúng {grand_prize} mọi người nhá" }
  },
  "timeline": {
    "cut_interval_s": { "target": 2.2, "min": 0.3, "max_static": 7.0 },
    "shot_sizes": [
      { "name": "wide", "scale": 1.0 },
      { "name": "medium", "scale": 1.3 },
      { "name": "close", "scale": 1.6 }
    ],
    "shot_size_rule": "alternate_on_sentence_break",
    "transitions": [
      { "type": "hard_cut", "share": 0.8, "frames": 0 },
      { "type": "zoom_blur", "frames": 4, "on": "block_change" },
      { "type": "desaturate_flash", "frames": 20, "count": 1, "on": "before_climax" }
    ],
    "overlay_coverage": 0.55,
    "overlay_types": [
      { "type": "product_png", "anchor": "upper_third_beside_head", "anim": "pop_spring" },
      { "type": "top_band_broll", "height_ratio": 0.45, "sources": ["app_screen_record", "speedtest", "sports_footage", "campaign_banner"] },
      { "type": "confetti_fullframe", "on": ["gift", "climax", "cta"] },
      { "type": "animated_icon", "example": "wifi_arcs_green" }
    ]
  },
  "captions": {
    "running": {
      "font_family": "Nunito", "font_weight": 900, "font_size": 50,
      "color": "#FC6601", "stroke": { "width": 6, "color": "#FFFFFF" },
      "text_shadow": "0 3px 6px rgba(0,0,0,0.25)",
      "center_y": 1180, "max_words": 6, "min_words": 2, "lines": 1,
      "animation": "hard_in", "karaoke": false, "balancer": true
    },
    "keyword": {
      "font_family": "Montserrat", "font_weight": 900, "font_size": 88,
      "color": "#FC6601", "stroke": { "width": 8, "color": "#FFFFFF" },
      "center_y": 1220,
      "animation": { "type": "spring", "damping": 12, "stiffness": 180, "mass": 0.6, "from_scale": 0.4 }
    },
    "price_pill": {
      "font_family": "Montserrat", "font_weight": 900, "font_size": 64,
      "color": "#FC6601", "bg": "#FFFFFF", "border_radius": 24, "padding": [8, 28],
      "box_shadow": "0 4px 12px rgba(0,0,0,0.18)", "prefix_line": "chỉ từ", "center_y": 1240
    },
    "headline": {
      "font_family": "Montserrat", "font_weight": 900, "font_size": 90,
      "color": "#FD7F00", "stroke": { "width": 10, "color": "#FFFFFF" },
      "sub": { "font_size": 44, "color": "#EFFF00", "stroke": { "width": 5, "color": "#000000" } },
      "center_y": 380,
      "animation": { "from_scale": 1.6, "from_rotate_deg": -8, "from_blur_px": 8, "frames": 9 }
    },
    "cta": {
      "font_family": "Montserrat", "font_weight": 900, "font_size": 78,
      "color": "#FC6601", "stroke": { "width": 8, "color": "#FFFFFF" },
      "center_y": 480, "rotate_deg": -4,
      "animation": { "type": "spring", "damping": 12, "stiffness": 180, "mass": 0.6, "wiggle_deg": 3, "wiggle_period_frames": 20 }
    },
    "reply_sticker": { "enabled_for_hook": "reply_comment", "y_range": [130, 330], "font_size": 30, "bg": "#FFFFFF" }
  },
  "audio": {
    "master_lufs": -11, "max_lra": 3,
    "voice": { "track": 2, "peak_db": -3, "compressor_ratio": 4, "tts_speed": [1.10, 1.15] },
    "bgm": { "track": 3, "genre": "upbeat electronic pop, no vocals", "bpm": [118, 136], "level_below_voice_db": 16, "duck": false },
    "sfx_verified": false,
    "sfx": [
      { "name": "pop", "on": ["product_png_in", "keyword_in"], "gain_db": -10 },
      { "name": "whoosh_short", "on": ["zoom_blur"], "gain_db": -10 },
      { "name": "cash_ting", "on": ["price_pill_in"], "gain_db": -8 },
      { "name": "party_popper", "on": ["confetti_fullframe"], "gain_db": -9 },
      { "name": "record_scratch", "on": ["desaturate_flash"], "gain_db": -10 },
      { "name": "riser_short", "on": ["escalation_phrase"], "duration_s": 0.8, "gain_db": -12 }
    ]
  },
  "qa_brand_guard": {
    "must": ["price_on_screen_before_4s", "price_repeated_>=2", "escalation_phrase_>=2", "cta_text_upper_third", "no_static_shot_over_7s", "all_text_inside_safe_zone", "hook_y_320_scale_130", "outro_y_320_scale_130", "highlight_y_350_scale_140", "voice_highlight_sfx_100_synced"],
    "must_not": ["self_introduction_in_hook", "pause_over_0.2s", "fullscreen_broll_replacing_host", "auto_inject_unwanted_broll", "render_empty_text_lines"]
  }
}
```

---

## 5. QUY TẮC BẮT BUỘC CHUNG TỪ NAY VỀ SAU (MANDATORY UNIVERSAL RULES)
1. **Thông số tọa độ Y & Scale chuẩn:**
   - Hook Mở đầu: Y = **320px**, Scale = **130%** (1.30). Dòng trống không điền gì tuyệt đối không render.
   - Outro CTA Kết video: Y = **320px**, Scale = **130%** (1.30). Dòng trống tuyệt đối không render.
   - Text Highlight: Y = **350px**, Scale = **140%** (1.40).
   - Safe Zone phụ đề: `pos(540, 1580)` (cách đáy 340-380px), không dính nút bên phải.
2. **Đồng bộ hóa 100%:**
   - Giọng VJ (1.25x) bóc bằng Whisper, cắt khoảng lặng >= 250ms giữ nhịp nói liên tục.
   - Text Highlight xuất hiện chuẩn xác từng mili-giây (`startMs`) theo từ VJ nói trong phụ đề.
   - SFX nổ đúng mili-giây text nảy lên (`hl.start`).
3. **B-Roll & Ảnh minh họa:**
   - Mặc định rỗng `[]`, tuyệt đối không tự ý thêm nếu người dùng không bấm thêm trên Timeline.

