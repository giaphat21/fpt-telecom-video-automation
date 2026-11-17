param(
    [string]$AssetsDir = "$PSScriptRoot\..\assets"
)

Add-Type -AssemblyName System.Drawing
if (!(Test-Path $AssetsDir)) { New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null }

function Parse-Hex([string]$hex, [int]$alpha = 255) {
    $h = $hex.TrimStart('#')
    return [System.Drawing.Color]::FromArgb($alpha, [Convert]::ToInt32($h.Substring(0,2),16), [Convert]::ToInt32($h.Substring(2,2),16), [Convert]::ToInt32($h.Substring(4,2),16))
}

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $gp.AddArc($x, $y, $d, $d, 180, 90)
    $gp.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $gp.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $gp.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $gp.CloseFigure()
    return $gp
}

$fontsDir = Join-Path $PSScriptRoot "..\assets\fonts"
$pfc = New-Object System.Drawing.Text.PrivateFontCollection
if (Test-Path "$fontsDir\BeVietnamPro-Black.ttf") { $pfc.AddFontFile("$fontsDir\BeVietnamPro-Black.ttf") }
$ff = if ($pfc.Families.Count -gt 0) { $pfc.Families[0] } else { New-Object System.Drawing.FontFamily("Arial") }
$ffArial = New-Object System.Drawing.FontFamily("Arial")
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

# 1. Green WiFi Signal Arcs (wifi_arcs_green.png - 300x300, matching v3_wifi_arcs.jpg!)
$bmp = New-Object System.Drawing.Bitmap(300, 300, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$penGreen = New-Object System.Drawing.Pen((Parse-Hex "#00B14F"), 22)
$penGreen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penGreen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

foreach ($r in @(70, 125, 180)) {
    $rect = New-Object System.Drawing.RectangleF((220 - $r), (210 - $r), ($r * 2), ($r * 2))
    $g.DrawArc($penGreen, $rect, 175, 95)
}
$g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex "#65D654"))), 185, 175, 52, 52)
$bmp.Save("$AssetsDir\wifi_arcs_green.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# 2. Circular Speedtest Gauge (speedtest_gauge.png - 680x680, matching v3_speedtest.jpg 1-to-1!)
$bmp = New-Object System.Drawing.Bitmap(680, 680, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

# Soft radial dark circle
for ($rad = 330; $rad -ge 250; $rad -= 8) {
    $alpha = [int]([Math]::Min(235, (335 - $rad) * 2.8))
    $g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex "#141926" $alpha))), (340 - $rad), (340 - $rad), ($rad * 2), ($rad * 2))
}
$g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex "#161B28" 242))), 70, 70, 540, 540)

# Speedtest Cyan-to-Mint-Green Arc (145 deg to 395 deg = 250 deg sweep)
$arcRect = New-Object System.Drawing.RectangleF(125, 125, 430, 430)
$arcBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($arcRect, (Parse-Hex "#22D3EE"), (Parse-Hex "#4ADE80"), [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
$arcPen = New-Object System.Drawing.Pen($arcBrush, 36)
$g.DrawArc($arcPen, $arcRect, 140, 245)

# Scale numbers inside gauge
$ticks = @(
    @{ txt="0";    x=215; y=425 },
    @{ txt="5";    x=175; y=335 },
    @{ txt="10";   x=185; y=245 },
    @{ txt="50";   x=245; y=175 },
    @{ txt="100";  x=340; y=150 },
    @{ txt="250";  x=435; y=175 },
    @{ txt="500";  x=495; y=245 },
    @{ txt="750";  x=505; y=335 },
    @{ txt="1000"; x=465; y=425 }
)
foreach ($tk in $ticks) {
    $gpT = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpT.AddString($tk.txt, $ffArial, [int][System.Drawing.FontStyle]::Bold, 22, (New-Object System.Drawing.PointF($tk.x, $tk.y)), $sf)
    $g.FillPath([System.Drawing.Brushes]::White, $gpT)
}

# Glowing needle pointing toward 902.68 Mbps (~35 deg down-right)
$needlePts = @(
    (New-Object System.Drawing.PointF(330, 305)),
    (New-Object System.Drawing.PointF(475, 385)),
    (New-Object System.Drawing.PointF(465, 402)),
    (New-Object System.Drawing.PointF(318, 325))
)
$g.FillPolygon((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 255, 255, 255))), $needlePts)

# Big "902,68" Mbps readout
$gpSpd = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpSpd.AddString("902,68", $ffArial, [int][System.Drawing.FontStyle]::Regular, 76, (New-Object System.Drawing.PointF(340, 425)), $sf)
$g.FillPath([System.Drawing.Brushes]::White, $gpSpd)

$gpMbps = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpMbps.AddString("Mbps  |  FPT Telecom", $ffArial, [int][System.Drawing.FontStyle]::Bold, 24, (New-Object System.Drawing.PointF(340, 495)), $sf)
$g.FillPath((New-Object System.Drawing.SolidBrush((Parse-Hex "#38BDF8"))), $gpMbps)

$bmp.Save("$AssetsDir\speedtest_gauge.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# 3. Tall White FPT WiFi 6 Tower Router (fpt_modem_wifi6.png - 360x500, matching v3_wifi_arcs.jpg!)
$bmp = New-Object System.Drawing.Bitmap(360, 500, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$sh = New-RoundedRect 48 28 270 435 34
$g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95,0,0,0))), $sh)
$body = New-RoundedRect 38 18 270 435 34
$bGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(38,18,270,435)), (Parse-Hex "#FFFFFF"), (Parse-Hex "#E2E8F0"), [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
$g.FillPath($bGrad, $body)
$g.DrawPath((New-Object System.Drawing.Pen((Parse-Hex "#CBD5E1"), 4)), $body)

$ventBrush = New-Object System.Drawing.SolidBrush((Parse-Hex "#475569"))
for ($ry = 55; $ry -le 155; $ry += 13) {
    for ($rx = 110; $rx -le 275; $rx += 11) {
        $g.FillEllipse($ventBrush, $rx, $ry, 5, 8)
    }
}
for ($ry = 315; $ry -le 410; $ry += 13) {
    for ($rx = 110; $rx -le 275; $rx += 11) {
        $g.FillEllipse($ventBrush, $rx, $ry, 5, 8)
    }
}
$gpFpt = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpFpt.AddString("FPT", $ffArial, [int][System.Drawing.FontStyle]::Italic, 24, (New-Object System.Drawing.PointF(76, 85)), $sf)
$g.FillPath((New-Object System.Drawing.SolidBrush((Parse-Hex "#64748B"))), $gpFpt)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((Parse-Hex "#22C55E"))), 65, 235, 18, 5)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((Parse-Hex "#64748B"))), 178, 220, 36, 36)

$bmp.Save("$AssetsDir\fpt_modem_wifi6.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# Keep fpt_wifi6_camera.png, fpt_dual_camera.png, fpt_logo.png, confetti_overlay.png, broll_frame_3grid.png
$panels = @(
    @{ x=10;  w=276; label="LƯỚT WEB MƯỢT"; color="#0066B3" },
    @{ x=302; w=276; label="CHƠI GAME 0 LAG"; color="#FC6601" },
    @{ x=594; w=276; label="TÁC VỤ NẶNG";   color="#00A651" }
)
$bmp = New-Object System.Drawing.Bitmap(880, 400, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
foreach ($p in $panels) {
    $borderPath = New-RoundedRect $p.x 8 $p.w 380 16
    $g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::White, 6)), $borderPath)
    $tagPath = New-RoundedRect ($p.x + 12) 326 ($p.w - 24) 50 14
    $g.FillPath((New-Object System.Drawing.SolidBrush((Parse-Hex $p.color 245))), $tagPath)
    $g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::White, 3)), $tagPath)
    $gpLbl = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpLbl.AddString($p.label, $ff, [int][System.Drawing.FontStyle]::Bold, 20, (New-Object System.Drawing.RectangleF(($p.x + 12), 326, ($p.w - 24), 50)), $sf)
    $g.FillPath([System.Drawing.Brushes]::White, $gpLbl)
}
$bmp.Save("$AssetsDir\broll_frame_3grid.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# 5. Camera AI Security HUD B-Roll Card (broll_camera_hud.png - 860x380)
$bmp = New-Object System.Drawing.Bitmap(860, 380, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

# Dark glass HUD card with FPT Orange & Green border
$hudShadow = New-RoundedRect 18 18 824 344 26
$g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120,0,0,0))), $hudShadow)
$hudCard = New-RoundedRect 10 10 824 344 26
$hudGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(10,10,824,344)), (Parse-Hex "#0F172A" 240), (Parse-Hex "#1E293B" 240), [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
$g.FillPath($hudGrad, $hudCard)
$g.DrawPath((New-Object System.Drawing.Pen((Parse-Hex "#22C55E"), 5)), $hudCard)

# Top Header Pill: "AI CAMERA FPT — ĐÀM THOẠI 2 CHIỀU FULL HD"
$hdrPill = New-RoundedRect 34 28 776 56 16
$g.FillPath((New-Object System.Drawing.SolidBrush((Parse-Hex "#FC6601" 250))), $hdrPill)
$g.FillEllipse([System.Drawing.Brushes]::White, 54, 44, 24, 24)
$gpHdr = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpHdr.AddString("CAMERA AI FPT  |  ĐÀM THOẠI 2 CHIỀU FULL HD", $ff, [int][System.Drawing.FontStyle]::Bold, 25, (New-Object System.Drawing.RectangleF(74, 28, 720, 56)), $sf)
$g.FillPath([System.Drawing.Brushes]::White, $gpHdr)

# Left Camera Dome Cutout inside HUD
$g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex "#22C55E" 45))), 48, 100, 220, 220)
$g.DrawEllipse((New-Object System.Drawing.Pen((Parse-Hex "#4ADE80"), 3)), 48, 100, 220, 220)
$g.FillEllipse([System.Drawing.Brushes]::White, 88, 118, 140, 140)
$g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex "#0F172A"))), 118, 142, 80, 80)
$g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex "#38BDF8"))), 146, 168, 24, 24)
$camBase = New-RoundedRect 96 242 124 54 18
$g.FillPath([System.Drawing.Brushes]::White, $camBase)

# Right Feature Bullets
$feats = @(
    @{ y=114; txt="Xoay 360° — Quan sát sắc nét Ngày & Đêm"; col="#EFFF00" },
    @{ y=184; txt="Đàm thoại 2 chiều trực tiếp qua điện thoại"; col="#FFFFFF" },
    @{ y=254; txt="AI phát hiện người — Cảnh báo tức thì 24/7"; col="#4ADE80" }
)
$sfLeft = New-Object System.Drawing.StringFormat
$sfLeft.Alignment = [System.Drawing.StringAlignment]::Near
$sfLeft.LineAlignment = [System.Drawing.StringAlignment]::Center
foreach ($ft in $feats) {
    $bPill = New-RoundedRect 292 $ft.y 516 54 14
    $g.FillPath((New-Object System.Drawing.SolidBrush((Parse-Hex "#09101F" 210))), $bPill)
    $g.DrawPath((New-Object System.Drawing.Pen((Parse-Hex "#334155"), 2)), $bPill)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex $ft.col))), 310, ($ft.y + 17), 20, 20)
    $gpFt = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpFt.AddString($ft.txt, $ff, [int][System.Drawing.FontStyle]::Bold, 21, (New-Object System.Drawing.RectangleF(342, $ft.y, 456, 54)), $sfLeft)
    $g.FillPath((New-Object System.Drawing.SolidBrush((Parse-Hex $ft.col))), $gpFt)
}

$bmp.Save("$AssetsDir\broll_camera_hud.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# 6. Sleek FPT Tech Frame for Real Video B-Rolls (broll_video_frame.png - 860x484)
$bmp = New-Object System.Drawing.Bitmap(860, 484, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$outerPath = New-RoundedRect 6 6 848 472 22
$g.DrawPath((New-Object System.Drawing.Pen((Parse-Hex "#FC6601"), 8)), $outerPath)
$innerPath = New-RoundedRect 12 12 836 460 18
$g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)), $innerPath)

# Top-Left FPT Tech Live Pill
$livePill = New-RoundedRect 24 24 225 38 12
$g.FillPath((New-Object System.Drawing.SolidBrush((Parse-Hex "#0066B3" 235))), $livePill)
$g.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::White, 2)), $livePill)
$g.FillEllipse((New-Object System.Drawing.SolidBrush((Parse-Hex "#4ADE80"))), 36, 36, 14, 14)
$gpLv = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpLv.AddString("FPT TELECOM 4K", $ff, [int][System.Drawing.FontStyle]::Bold, 16, (New-Object System.Drawing.RectangleF(54, 24, 190, 38)), $sf)
$g.FillPath([System.Drawing.Brushes]::White, $gpLv)

$bmp.Save("$AssetsDir\broll_video_frame.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

Write-Output "Generated all SKILL_HUNGXUHUONG7979 visual assets successfully."
