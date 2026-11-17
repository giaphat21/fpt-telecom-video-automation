param(
    [string]$AssetsDir = "$PSScriptRoot\..\assets"
)

Add-Type -AssemblyName System.Drawing
if (!(Test-Path $AssetsDir)) { New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null }
$brollDir = Join-Path $AssetsDir "broll-library"
if (!(Test-Path $brollDir)) { New-Item -ItemType Directory -Path $brollDir -Force | Out-Null }

$fontsDir = Join-Path $PSScriptRoot "..\assets\fonts"
$pfc = New-Object System.Drawing.Text.PrivateFontCollection
foreach ($fn in @("Montserrat-Bold.ttf", "BeVietnamPro-Black.ttf", "Barlow-Black.ttf", "Barlow-Bold.ttf")) {
    $fp = Join-Path $fontsDir $fn
    if (Test-Path $fp) { $pfc.AddFontFile($fp) }
}
function Get-FontFamily($namePart) {
    foreach ($f in $pfc.Families) { if ($f.Name -like "*$namePart*") { return $f } }
    if ($pfc.Families.Count -gt 0) { return $pfc.Families[0] }
    return New-Object System.Drawing.FontFamily("Arial")
}
$ffHead = Get-FontFamily "Montserrat"
$ffBody = Get-FontFamily "Be Vietnam"
$ffBarlow = Get-FontFamily "Barlow"

# FPT Official Palette
$C_BLUE     = "#0066B3"
$C_BLUE_L   = "#1A85D6"
$C_BLUE_D   = "#004073"
$C_ORANGE   = "#F37021"
$C_ORANGE_L = "#FF8533"
$C_GREEN    = "#00A651"
$C_GREEN_L  = "#10B981"
$C_NAVY     = "#0B1F3F"
$C_DARK_BG  = "#060D1A"
$C_WHITE    = "#FFFFFF"
$C_CYAN     = "#00E5FF"

function HexC([string]$hex, [int]$alpha = 255) {
    $h = $hex.TrimStart('#')
    return [System.Drawing.Color]::FromArgb($alpha, [Convert]::ToInt32($h.Substring(0,2),16), [Convert]::ToInt32($h.Substring(2,2),16), [Convert]::ToInt32($h.Substring(4,2),16))
}

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [Math]::Max(2, $r * 2)
    $gp.AddArc($x, $y, $d, $d, 180, 90)
    $gp.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $gp.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $gp.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $gp.CloseFigure()
    return $gp
}

function New-Parallelogram([float]$x, [float]$y, [float]$w, [float]$h, [float]$skew) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pts = @(
        (New-Object System.Drawing.PointF(($x + $skew), $y)),
        (New-Object System.Drawing.PointF(($x + $w + $skew), $y)),
        (New-Object System.Drawing.PointF(($x + $w - $skew), ($y + $h))),
        (New-Object System.Drawing.PointF(($x - $skew), ($y + $h)))
    )
    $gp.AddPolygon([System.Drawing.PointF[]]$pts)
    return $gp
}

function Draw-TriStripe([System.Drawing.Graphics]$g, [float]$centerX, [float]$y, [float]$totalW = 320, [float]$h = 10) {
    $segW = ($totalW - 16) / 3
    $x0 = $centerX - $totalW / 2
    $cols = @($C_BLUE, $C_ORANGE, $C_GREEN)
    for ($i = 0; $i -lt 3; $i++) {
        $p = New-Parallelogram ($x0 + $i * ($segW + 8)) $y $segW $h 5
        $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $cols[$i]))), $p)
    }
}

function Draw-CardBase([System.Drawing.Graphics]$g, [float]$w, [float]$h, [string]$cornerAccent = "blue") {
    # 1. Outer Soft Glow Shadow
    for ($i = 6; $i -ge 1; $i--) {
        $shadow = New-RoundedRect (12 - $i) (12 - $i) ($w - 24 + $i * 2) ($h - 24 + $i * 2) (28 + $i)
        $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb((12 * $i), 0, 0, 0))), $shadow)
    }

    # 2. Glassmorphic Card Surface
    $cardPath = New-RoundedRect 14 14 ($w - 28) ($h - 28) 28
    $cardBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(14, 14, ($w - 28), ($h - 28))), (HexC "#0A1428" 248), (HexC "#050B16" 252), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillPath($cardBrush, $cardPath)

    # 3. High-Tech Hex / Cyber Grid Background Lines
    $gridPen = New-Object System.Drawing.Pen((HexC "#1E293B" 70), 1)
    for ($x = 40; $x -lt $w - 30; $x += 44) {
        $g.DrawLine($gridPen, [float]$x, 20.0, [float]$x, [float]($h - 20))
    }
    for ($y = 40; $y -lt $h - 30; $y += 44) {
        $g.DrawLine($gridPen, 20.0, [float]$y, [float]($w - 20), [float]$y)
    }

    # 4. Subtle Radial Gradient Glow on Left (Accent)
    $glowCol = if ($cornerAccent -eq "orange") { $C_ORANGE } elseif ($cornerAccent -eq "green") { $C_GREEN } else { $C_BLUE }
    for ($r = 280; $r -ge 60; $r -= 20) {
        $a = [int]([Math]::Max(0, (280 - $r) * 0.22))
        $g.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $glowCol $a))), (40 - $r), (120 - $r), ($r * 2), ($r * 2))
    }

    # 5. Dual Brand Border (FPT Blue & Orange Gradient stroke)
    $borderPen = New-Object System.Drawing.Pen((HexC "#38BDF8" 190), 3)
    $g.DrawPath($borderPen, $cardPath)

    # 6. Top Header Brand Bar (FPT Tri-Color Accent)
    Draw-TriStripe $g ($w / 2) 24 240 8
}

function Create-Canvas([int]$w = 960, [int]$h = 520) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)
    return @($bmp, $g)
}

# ==============================================================================
# CARD 1: WI-FI 6 ULTRA SPEED ILLUSTRATION B-ROLL (broll_ai_wifi6.png)
# ==============================================================================
Write-Output "Generating Card 1: Wi-Fi 6 Ultra Mesh..."
$c1 = Create-Canvas 960 520; $bmp1 = $c1[0]; $g1 = $c1[1]
Draw-CardBase $g1 960 520 "blue"

# Left Illustration: Modern Wi-Fi 6 High-Tech Router & Wave Beams
# Router base
$rtPath = New-RoundedRect 100 240 260 170 20
$rtBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(100, 240, 260, 170)), (HexC "#FFFFFF"), (HexC "#CBD5E1"), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$g1.FillPath($rtBrush, $rtPath)
$g1.DrawPath((New-Object System.Drawing.Pen((HexC $C_BLUE), 4)), $rtPath)

# Router Front Panel & FPT Logo Accent
$panel = New-RoundedRect 120 310 220 75 12
$g1.FillPath((New-Object System.Drawing.SolidBrush((HexC "#0B1F3F"))), $panel)
# Status LEDs
$g1.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $C_GREEN_L))), 140, 335, 14, 14)
$g1.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $C_GREEN_L))), 165, 335, 14, 14)
$g1.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $C_CYAN))), 190, 335, 14, 14)
$g1.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $C_ORANGE))), 215, 335, 14, 14)

# 4 High-Gain Antennas
$antPen = New-Object System.Drawing.Pen((HexC "#FFFFFF"), 10)
$antPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$antPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g1.DrawLine($antPen, 130.0, 240.0, 95.0, 120.0)
$g1.DrawLine($antPen, 180.0, 240.0, 170.0, 105.0)
$g1.DrawLine($antPen, 280.0, 240.0, 290.0, 105.0)
$g1.DrawLine($antPen, 330.0, 240.0, 365.0, 120.0)

# Luminous Wi-Fi 6 Holographic Wave Beams radiating upwards
$wavePenCyan = New-Object System.Drawing.Pen((HexC $C_CYAN 180), 6)
$wavePenCyan.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$wavePenCyan.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$wavePenOrg = New-Object System.Drawing.Pen((HexC $C_ORANGE 210), 6)
$wavePenOrg.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$wavePenOrg.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$g1.DrawArc($wavePenCyan, (New-Object System.Drawing.RectangleF(130, 80, 200, 200)), 205, 130)
$g1.DrawArc($wavePenOrg,  (New-Object System.Drawing.RectangleF(100, 45, 260, 260)), 210, 120)
$g1.DrawArc($wavePenCyan, (New-Object System.Drawing.RectangleF(70, 10, 320, 320)), 215, 110)

# Router Label Badge
$rtBadge = New-RoundedRect 135 255 190 38 10
$g1.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_ORANGE))), $rtBadge)
$sfC = New-Object System.Drawing.StringFormat; $sfC.Alignment = [System.Drawing.StringAlignment]::Center; $sfC.LineAlignment = [System.Drawing.StringAlignment]::Center
$gpTxt = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpTxt.AddString("FPT WI-FI 6", $ffHead, [int][System.Drawing.FontStyle]::Bold, 20, (New-Object System.Drawing.PointF(230, 274)), $sfC)
$g1.FillPath([System.Drawing.Brushes]::White, $gpTxt)

# Right Side Content: High-Tech Specs & Value Proposition
$sfL = New-Object System.Drawing.StringFormat; $sfL.Alignment = [System.Drawing.StringAlignment]::Near; $sfL.LineAlignment = [System.Drawing.StringAlignment]::Center

# Kicker Pill
$kPill = New-RoundedRect 430 50 310 40 20
$g1.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_BLUE))), $kPill)
$g1.DrawPath((New-Object System.Drawing.Pen((HexC "#60A5FA"), 2)), $kPill)
$gpk = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpk.AddString("CHUẨN WI-FI 6 MỚI NHẤT", $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(445, 70)), $sfL)
$g1.FillPath([System.Drawing.Brushes]::White, $gpk)

# Big Headline: BĂNG THÔNG 1 Gbps
$gpH = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpH.AddString("TỐC ĐỘ 1 Gbps", $ffHead, [int][System.Drawing.FontStyle]::Bold, 50, (New-Object System.Drawing.PointF(430, 130)), $sfL)
$g1.FillPath([System.Drawing.Brushes]::White, $gpH)

# Feature Badges
$features1 = @(
    "✔ Độ trễ cực thấp < 5ms — Chơi Game 0 Lag",
    "✔ Mesh phủ sóng xuyên tường toàn bộ ngôi nhà",
    "✔ Kết nối cùng lúc 30+ thiết bị mượt mà",
    "✔ Miễn phí trang bị Modem Wi-Fi 6 chính hãng"
)
$fy = 195
foreach ($feat in $features1) {
    $fBox = New-RoundedRect 430 $fy 480 48 12
    $g1.FillPath((New-Object System.Drawing.SolidBrush((HexC "#0F203C" 200))), $fBox)
    $g1.DrawPath((New-Object System.Drawing.Pen((HexC "#1E3A8A"), 1.5)), $fBox)
    
    $gpf = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpf.AddString($feat, $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(446, ($fy + 24))), $sfL)
    $g1.FillPath((New-Object System.Drawing.SolidBrush((HexC "#F1F5F9"))), $gpf)
    $fy += 60
}

# Footer tri-stripe
Draw-TriStripe $g1 670 470 340 10

$bmp1.Save((Join-Path $AssetsDir "broll_ai_wifi6.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp1.Save((Join-Path $brollDir "broll_ai_wifi6.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g1.Dispose(); $bmp1.Dispose()

# ==============================================================================
# CARD 2: CAMERA AI CLOUD SECURITY B-ROLL (broll_ai_camera.png)
# ==============================================================================
Write-Output "Generating Card 2: Camera AI Cloud..."
$c2 = Create-Canvas 960 520; $bmp2 = $c2[0]; $g2 = $c2[1]
Draw-CardBase $g2 960 520 "orange"

# Left Illustration: Futuristic Smart Surveillance Camera with AI HUD Viewfinder
$viewBox = New-RoundedRect 80 75 300 370 20
$g2.FillPath((New-Object System.Drawing.SolidBrush((HexC "#020617" 230))), $viewBox)
$g2.DrawPath((New-Object System.Drawing.Pen((HexC $C_ORANGE), 3)), $viewBox)

# Viewfinder Corner Brackets
$bracketPen = New-Object System.Drawing.Pen((HexC $C_CYAN), 4)
$g2.DrawLine($bracketPen, 95.0, 115.0, 95.0, 90.0);  $g2.DrawLine($bracketPen, 95.0, 90.0, 120.0, 90.0)
$g2.DrawLine($bracketPen, 365.0, 115.0, 365.0, 90.0); $g2.DrawLine($bracketPen, 365.0, 90.0, 340.0, 90.0)
$g2.DrawLine($bracketPen, 95.0, 405.0, 95.0, 430.0);  $g2.DrawLine($bracketPen, 95.0, 430.0, 120.0, 430.0)
$g2.DrawLine($bracketPen, 365.0, 405.0, 365.0, 430.0); $g2.DrawLine($bracketPen, 365.0, 430.0, 340.0, 430.0)

# Camera Body
$camDome = New-RoundedRect 150 170 160 170 80
$g2.FillPath((New-Object System.Drawing.SolidBrush((HexC "#FFFFFF"))), $camDome)
$g2.DrawPath((New-Object System.Drawing.Pen((HexC "#94A3B8"), 3)), $camDome)

# Lens Outer & Core
$g2.FillEllipse((New-Object System.Drawing.SolidBrush((HexC "#0F172A"))), 180, 205, 100, 100)
$g2.FillEllipse((New-Object System.Drawing.SolidBrush((HexC "#1E293B"))), 195, 220, 70, 70)
$g2.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $C_CYAN))), 215, 240, 30, 30)

# Live Status Indicator
$g2.FillEllipse((New-Object System.Drawing.SolidBrush((HexC "#EF4444"))), 105, 110, 16, 16)
$gplv = New-Object System.Drawing.Drawing2D.GraphicsPath
$gplv.AddString("● LIVE CLOUD", $ffBody, [int][System.Drawing.FontStyle]::Bold, 15, (New-Object System.Drawing.PointF(130, 118)), $sfL)
$g2.FillPath((New-Object System.Drawing.SolidBrush((HexC "#EF4444"))), $gplv)

# AI Face Detection Box
$aiBox = New-RoundedRect 160 345 140 40 8
$g2.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_GREEN 210))), $aiBox)
$gpAi = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpAi.AddString("AI HUMAN 99%", $ffHead, [int][System.Drawing.FontStyle]::Bold, 15, (New-Object System.Drawing.PointF(230, 365)), $sfC)
$g2.FillPath([System.Drawing.Brushes]::White, $gpAi)

# Right Side Content: Camera Features
$kPill2 = New-RoundedRect 430 50 340 40 20
$g2.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_ORANGE))), $kPill2)
$g2.DrawPath((New-Object System.Drawing.Pen((HexC "#FFB078"), 2)), $kPill2)
$gpk2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpk2.AddString("BẢO VỆ GIA ĐÌNH TOÀN DIỆN", $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(445, 70)), $sfL)
$g2.FillPath([System.Drawing.Brushes]::White, $gpk2)

# Headline: FPT CAMERA AI 0Đ
$gpH2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpH2.AddString("TẶNG CAMERA AI 0Đ", $ffHead, [int][System.Drawing.FontStyle]::Bold, 48, (New-Object System.Drawing.PointF(430, 130)), $sfL)
$g2.FillPath((New-Object System.Drawing.SolidBrush((HexC "#FFE600"))), $gpH2)

$features2 = @(
    "✔ Nhận diện người AI chuẩn xác — Báo động tức thì",
    "✔ Đàm thoại 2 chiều to rõ như gọi điện thoại",
    "✔ Lưu trữ Cloud FPT tại Việt Nam — Bảo mật tuyệt đối",
    "✔ Góc nhìn siêu rộng 107° Full HD 1080p sắc nét"
)
$fy2 = 195
foreach ($feat in $features2) {
    $fBox = New-RoundedRect 430 $fy2 480 48 12
    $g2.FillPath((New-Object System.Drawing.SolidBrush((HexC "#2A1408" 200))), $fBox)
    $g2.DrawPath((New-Object System.Drawing.Pen((HexC "#EA580C"), 1.5)), $fBox)
    
    $gpf = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpf.AddString($feat, $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(446, ($fy2 + 24))), $sfL)
    $g2.FillPath((New-Object System.Drawing.SolidBrush((HexC "#F1F5F9"))), $gpf)
    $fy2 += 60
}

Draw-TriStripe $g2 670 470 340 10

$bmp2.Save((Join-Path $AssetsDir "broll_ai_camera.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp2.Save((Join-Path $brollDir "broll_ai_camera.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g2.Dispose(); $bmp2.Dispose()

# ==============================================================================
# CARD 3: FPT PLAY 4K & SPORTS ARENA B-ROLL (broll_ai_fptplay.png)
# ==============================================================================
Write-Output "Generating Card 3: FPT Play 4K & Sports..."
$c3 = Create-Canvas 960 520; $bmp3 = $c3[0]; $g3 = $c3[1]
Draw-CardBase $g3 960 520 "green"

# Left Illustration: High-End 4K Cinema Curved Screen & Golden Trophy
$tvBox = New-RoundedRect 80 110 310 240 16
$g3.FillPath((New-Object System.Drawing.SolidBrush((HexC "#0B132B"))), $tvBox)
$g3.DrawPath((New-Object System.Drawing.Pen((HexC "#38BDF8"), 3)), $tvBox)

# Curved Stand
$g3.FillRectangle((New-Object System.Drawing.SolidBrush((HexC "#94A3B8"))), 215, 350, 40, 45)
$standBase = New-RoundedRect 170 395 130 16 8
$g3.FillPath((New-Object System.Drawing.SolidBrush((HexC "#64748B"))), $standBase)

# Screen Glow & Golden Trophy Icon
$g3.FillEllipse((New-Object System.Drawing.SolidBrush((HexC "#EAB308" 220))), 200, 150, 70, 70)
$gpPlay = New-Object System.Drawing.Drawing2D.GraphicsPath
$pts = @(
    (New-Object System.Drawing.PointF(225, 165)),
    (New-Object System.Drawing.PointF(255, 185)),
    (New-Object System.Drawing.PointF(225, 205))
)
$gpPlay.AddPolygon([System.Drawing.PointF[]]$pts)
$g3.FillPath([System.Drawing.Brushes]::White, $gpPlay)

# 4K Ultra HD Badge
$b4k = New-RoundedRect 145 250 180 40 10
$g3.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_ORANGE))), $b4k)
$gp4k = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp4k.AddString("4K ULTRA HD", $ffHead, [int][System.Drawing.FontStyle]::Bold, 20, (New-Object System.Drawing.PointF(235, 270)), $sfC)
$g3.FillPath([System.Drawing.Brushes]::White, $gp4k)

# Right Side Content: FPT Play Offerings
$kPill3 = New-RoundedRect 430 50 350 40 20
$g3.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_GREEN))), $kPill3)
$g3.DrawPath((New-Object System.Drawing.Pen((HexC "#4ADE80"), 2)), $kPill3)
$gpk3 = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpk3.AddString("GIẢI TRÍ ĐỈNH CAO KHÔNG GIỚI HẠN", $ffBody, [int][System.Drawing.FontStyle]::Bold, 16, (New-Object System.Drawing.PointF(445, 70)), $sfL)
$g3.FillPath([System.Drawing.Brushes]::White, $gpk3)

$gpH3 = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpH3.AddString("TRUYỀN HÌNH FPT PLAY", $ffHead, [int][System.Drawing.FontStyle]::Bold, 44, (New-Object System.Drawing.PointF(430, 130)), $sfL)
$g3.FillPath([System.Drawing.Brushes]::White, $gpH3)

$features3 = @(
    "✔ Độc quyền Ngoại Hạng Anh & UEFA Champions League",
    "✔ Gần 200 kênh truyền hình HD/4K trong và ngoài nước",
    "✔ Kho phim điện ảnh bom tấn Hollywood, Hàn Quốc, Anime",
    "✔ Xem đồng thời trên 3 đến 5 thiết bị không phụ phí"
)
$fy3 = 195
foreach ($feat in $features3) {
    $fBox = New-RoundedRect 430 $fy3 480 48 12
    $g3.FillPath((New-Object System.Drawing.SolidBrush((HexC "#062816" 200))), $fBox)
    $g3.DrawPath((New-Object System.Drawing.Pen((HexC "#16A34A"), 1.5)), $fBox)
    
    $gpf = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpf.AddString($feat, $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(446, ($fy3 + 24))), $sfL)
    $g3.FillPath((New-Object System.Drawing.SolidBrush((HexC "#F1F5F9"))), $gpf)
    $fy3 += 60
}

Draw-TriStripe $g3 670 470 340 10

$bmp3.Save((Join-Path $AssetsDir "broll_ai_fptplay.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp3.Save((Join-Path $brollDir "broll_ai_fptplay.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g3.Dispose(); $bmp3.Dispose()

# ==============================================================================
# CARD 4: ULTRA GIGABIT SPEEDTEST B-ROLL (broll_ai_speedtest.png)
# ==============================================================================
Write-Output "Generating Card 4: Ultra Speedtest 1026 Mbps..."
$c4 = Create-Canvas 960 520; $bmp4 = $c4[0]; $g4 = $c4[1]
Draw-CardBase $g4 960 520 "blue"

# Left Illustration: High-Tech Cyber Speedometer Dial
$dialCenter = New-Object System.Drawing.PointF(230, 240)
# Dark radial backing
for ($r = 170; $r -ge 100; $r -= 10) {
    $g4.FillEllipse((New-Object System.Drawing.SolidBrush((HexC "#0B172A" (160 + (170 - $r))))), ($dialCenter.X - $r), ($dialCenter.Y - $r), ($r * 2), ($r * 2))
}

# Glowing Gradient Arc (Cyan to FPT Orange)
$arcR = New-Object System.Drawing.RectangleF(($dialCenter.X - 140), ($dialCenter.Y - 140), 280, 280)
$arcPen = New-Object System.Drawing.Pen((HexC $C_CYAN), 22)
$arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g4.DrawArc($arcPen, $arcR, 140, 160)

$arcPenOrg = New-Object System.Drawing.Pen((HexC $C_ORANGE), 22)
$arcPenOrg.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arcPenOrg.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g4.DrawArc($arcPenOrg, $arcR, 300, 100)

# Giant Readout: 1,026.92
$gpSpd = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpSpd.AddString("1.026,92", $ffHead, [int][System.Drawing.FontStyle]::Bold, 46, (New-Object System.Drawing.PointF($dialCenter.X, ($dialCenter.Y - 15))), $sfC)
$g4.FillPath([System.Drawing.Brushes]::White, $gpSpd)

$gpSubS = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpSubS.AddString("Mbps (Download)", $ffBody, [int][System.Drawing.FontStyle]::Bold, 18, (New-Object System.Drawing.PointF($dialCenter.X, ($dialCenter.Y + 45))), $sfC)
$g4.FillPath((New-Object System.Drawing.SolidBrush((HexC "#38BDF8"))), $gpSubS)

# Right Side Content: Ping & Gigabit Performance
$kPill4 = New-RoundedRect 430 50 330 40 20
$g4.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_BLUE))), $kPill4)
$g4.DrawPath((New-Object System.Drawing.Pen((HexC "#38BDF8"), 2)), $kPill4)
$gpk4 = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpk4.AddString("THỰC TẾ ĐO TẠI NHÀ KHÁCH HÀNG", $ffBody, [int][System.Drawing.FontStyle]::Bold, 16, (New-Object System.Drawing.PointF(445, 70)), $sfL)
$g4.FillPath([System.Drawing.Brushes]::White, $gpk4)

$gpH4 = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpH4.AddString("BĂNG THÔNG VƯỢT TRỘI", $ffHead, [int][System.Drawing.FontStyle]::Bold, 44, (New-Object System.Drawing.PointF(430, 130)), $sfL)
$g4.FillPath((New-Object System.Drawing.SolidBrush((HexC "#FFB078"))), $gpH4)

$features4 = @(
    "⚡ Ping cực thấp: 2ms — Mượt mà không giật lag",
    "🚀 Download: 1.026,92 Mbps — Tải file 50GB trong vài giây",
    "📤 Upload: 1.018,45 Mbps — Livestream 4K mượt mà",
    "🛡️ Công nghệ Wi-Fi 6 thế hệ mới bảo mật WPA3"
)
$fy4 = 195
foreach ($feat in $features4) {
    $fBox = New-RoundedRect 430 $fy4 480 48 12
    $g4.FillPath((New-Object System.Drawing.SolidBrush((HexC "#0A1B38" 200))), $fBox)
    $g4.DrawPath((New-Object System.Drawing.Pen((HexC "#1D4ED8"), 1.5)), $fBox)
    
    $gpf = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpf.AddString($feat, $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(446, ($fy4 + 24))), $sfL)
    $g4.FillPath((New-Object System.Drawing.SolidBrush((HexC "#F1F5F9"))), $gpf)
    $fy4 += 60
}

Draw-TriStripe $g4 670 470 340 10

$bmp4.Save((Join-Path $AssetsDir "broll_ai_speedtest.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp4.Save((Join-Path $brollDir "broll_ai_speedtest.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g4.Dispose(); $bmp4.Dispose()

# ==============================================================================
# CARD 5: 3-GRID MULTI-TASK ECOSYSTEM B-ROLL (broll_ai_3grid.png)
# ==============================================================================
Write-Output "Generating Card 5: 3-Grid Multi-Task Ecosystem..."
$c5 = Create-Canvas 960 520; $bmp5 = $c5[0]; $g5 = $c5[1]
Draw-CardBase $g5 960 520 "blue"

# Header Title
$gpH5 = New-Object System.Drawing.Drawing2D.GraphicsPath
$gpH5.AddString("HỆ SINH THÁI INTERNET FPT ĐA NHIỆM", $ffHead, [int][System.Drawing.FontStyle]::Bold, 32, (New-Object System.Drawing.PointF(480, 56)), $sfC)
$g5.FillPath([System.Drawing.Brushes]::White, $gpH5)

# 3 Distinct Columns
$colsData = @(
    @{
        title = "🎮 GAMING 0 LAG";
        badge = "Ping 2ms";
        color = $C_BLUE;
        desc1 = "Chơi game eSports";
        desc2 = "Đường truyền ưu tiên";
        x = 50
    },
    @{
        title = "📺 XEM PHIM 4K";
        badge = "Không Buffer";
        color = $C_ORANGE;
        desc1 = "Phim 4K & Bóng Đá";
        desc2 = "Load ngay tức thì";
        x = 350
    },
    @{
        title = "💻 HỌP ONLINE";
        badge = "Đa Thiết Bị";
        color = $C_GREEN;
        desc1 = "Làm việc & Học tập";
        desc2 = "Cân 30+ người dùng";
        x = 650
    }
)

foreach ($cd in $colsData) {
    $colBox = New-RoundedRect $cd.x 100 260 350 20
    $g5.FillPath((New-Object System.Drawing.SolidBrush((HexC "#081326" 220))), $colBox)
    $g5.DrawPath((New-Object System.Drawing.Pen((HexC $cd.color), 3)), $colBox)
    
    # Header of Column
    $colHdr = New-RoundedRect ($cd.x + 10) 115 240 54 14
    $g5.FillPath((New-Object System.Drawing.SolidBrush((HexC $cd.color))), $colHdr)
    $gpt = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpt.AddString($cd.title, $ffHead, [int][System.Drawing.FontStyle]::Bold, 20, (New-Object System.Drawing.PointF(($cd.x + 130), 142)), $sfC)
    $g5.FillPath([System.Drawing.Brushes]::White, $gpt)
    
    # Badge
    $bgPill = New-RoundedRect ($cd.x + 50) 195 160 38 12
    $g5.FillPath((New-Object System.Drawing.SolidBrush((HexC "#1E293B"))), $bgPill)
    $g5.DrawPath((New-Object System.Drawing.Pen((HexC "#38BDF8"), 1.5)), $bgPill)
    $gpb = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpb.AddString($cd.badge, $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(($cd.x + 130), 214)), $sfC)
    $g5.FillPath((New-Object System.Drawing.SolidBrush((HexC "#38BDF8"))), $gpb)
    
    # Sublines
    $gps1 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gps1.AddString($cd.desc1, $ffBody, [int][System.Drawing.FontStyle]::Bold, 18, (New-Object System.Drawing.PointF(($cd.x + 130), 280)), $sfC)
    $g5.FillPath([System.Drawing.Brushes]::White, $gps1)
    
    $gps2 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gps2.AddString($cd.desc2, $ffBody, [int][System.Drawing.FontStyle]::Regular, 16, (New-Object System.Drawing.PointF(($cd.x + 130), 325)), $sfC)
    $g5.FillPath((New-Object System.Drawing.SolidBrush((HexC "#94A3B8"))), $gps2)
    
    # Bottom Status Check
    $gps3 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gps3.AddString("✔ TỐC ĐỘ GIGABIT", $ffHead, [int][System.Drawing.FontStyle]::Bold, 15, (New-Object System.Drawing.PointF(($cd.x + 130), 395)), $sfC)
    $g5.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_GREEN_L))), $gps3)
}

Draw-TriStripe $g5 480 480 340 10

$bmp5.Save((Join-Path $AssetsDir "broll_ai_3grid.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp5.Save((Join-Path $brollDir "broll_ai_3grid.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g5.Dispose(); $bmp5.Dispose()

Write-Output "ALL 5 AI TECH B-ROLL CARDS GENERATED SUCCESSFULLY!"
