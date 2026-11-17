param(
    [Parameter(Mandatory=$true)]
    [string]$ConfigPath
)

Add-Type -AssemblyName System.Drawing

if (!(Test-Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    exit 1
}

$cfg = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$outDir = $cfg.outDir
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$fontsDir = Join-Path $PSScriptRoot "..\..\assets\fonts"
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

# FPT Official Brand Colors
$C_BLUE     = "#0066B3"
$C_BLUE_L   = "#1A85D6"
$C_ORANGE   = "#F37021"
$C_ORANGE_L = "#FF8533"
$C_GREEN    = "#00A651"
$C_GREEN_L  = "#10B981"
$C_NAVY     = "#0B1F3F"
$C_CYAN     = "#00E5FF"
$C_WHITE    = "#FFFFFF"

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
    for ($i = 6; $i -ge 1; $i--) {
        $shadow = New-RoundedRect (12 - $i) (12 - $i) ($w - 24 + $i * 2) ($h - 24 + $i * 2) (28 + $i)
        $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb((12 * $i), 0, 0, 0))), $shadow)
    }
    $cardPath = New-RoundedRect 14 14 ($w - 28) ($h - 28) 28
    $cardBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(14, 14, ($w - 28), ($h - 28))), (HexC "#0A1428" 248), (HexC "#050B16" 252), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillPath($cardBrush, $cardPath)

    $gridPen = New-Object System.Drawing.Pen((HexC "#1E293B" 70), 1)
    for ($x = 40; $x -lt $w - 30; $x += 44) { $g.DrawLine($gridPen, [float]$x, 20.0, [float]$x, [float]($h - 20)) }
    for ($y = 40; $y -lt $h - 30; $y += 44) { $g.DrawLine($gridPen, 20.0, [float]$y, [float]($w - 20), [float]$y) }

    $glowCol = if ($cornerAccent -eq "orange") { $C_ORANGE } elseif ($cornerAccent -eq "green") { $C_GREEN } else { $C_BLUE }
    for ($r = 280; $r -ge 60; $r -= 20) {
        $a = [int]([Math]::Max(0, (280 - $r) * 0.22))
        $g.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $glowCol $a))), (40 - $r), (120 - $r), ($r * 2), ($r * 2))
    }
    $borderPen = New-Object System.Drawing.Pen((HexC "#38BDF8" 190), 3)
    $g.DrawPath($borderPen, $cardPath)
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

$sfL = New-Object System.Drawing.StringFormat; $sfL.Alignment = [System.Drawing.StringAlignment]::Near; $sfL.LineAlignment = [System.Drawing.StringAlignment]::Center
$sfC = New-Object System.Drawing.StringFormat; $sfC.Alignment = [System.Drawing.StringAlignment]::Center; $sfC.LineAlignment = [System.Drawing.StringAlignment]::Center

foreach ($card in $cfg.cards) {
    $c = Create-Canvas 960 520; $bmp = $c[0]; $g = $c[1]
    $type = $card.type
    $kicker = if ($card.kicker) { $card.kicker } else { "FPT TELECOM" }
    $title = if ($card.title) { $card.title } else { "CÔNG NGHỆ VƯỢT TRỘI" }
    $features = if ($card.features -and $card.features.Count -gt 0) { $card.features } else { @("✔ Tốc độ cao", "✔ Bảo mật tuyệt đối", "✔ Hỗ trợ 24/7") }
    $accent = if ($card.accent) { $card.accent } else { "blue" }

    Draw-CardBase $g 960 520 $accent

    # Real Photo B-Roll Directory
    $brollAssetsDir = Join-Path (Split-Path -Parent $PSScriptRoot) "assets\broll-images"

    function Draw-BrollPhoto([System.Drawing.Graphics]$gr, [string]$fileName, [float]$ix = 65, [float]$iy = 75, [float]$iw = 330, [float]$ih = 370, [string]$badgeText = "") {
        $p = Join-Path $brollAssetsDir $fileName
        if (Test-Path $p) {
            $img = [System.Drawing.Image]::FromFile($p)
            $clipPath = New-RoundedRect $ix $iy $iw $ih 18
            $oldClip = $gr.Clip
            $gr.SetClip($clipPath, [System.Drawing.Drawing2D.CombineMode]::Replace)

            $imgAspect = $img.Width / [float]$img.Height
            $targetAspect = $iw / $ih
            $srcRect = New-Object System.Drawing.RectangleF(0, 0, $img.Width, $img.Height)
            if ($imgAspect -gt $targetAspect) {
                $cropW = $img.Height * $targetAspect
                $srcRect.X = ($img.Width - $cropW) / 2
                $srcRect.Width = $cropW
            } else {
                $cropH = $img.Width / $targetAspect
                $srcRect.Y = ($img.Height - $cropH) / 2
                $srcRect.Height = $cropH
            }
            $destRect = New-Object System.Drawing.RectangleF($ix, $iy, $iw, $ih)
            $gr.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
            $gr.Clip = $oldClip
            $img.Dispose()

            # Viền phát sáng 3D
            $pen = New-Object System.Drawing.Pen((HexC "#38BDF8"), 4)
            $gr.DrawPath($pen, $clipPath)

            # Badge nhãn ảnh thật FPT ở góc dưới
            if ($badgeText) {
                $bBox = New-RoundedRect ($ix + 12) ($iy + $ih - 46) ($iw - 24) 34 8
                $gr.FillPath((New-Object System.Drawing.SolidBrush((HexC "#0B1F3F" 220))), $bBox)
                $gr.DrawPath((New-Object System.Drawing.Pen((HexC "#F37021"), 2)), $bBox)
                $gpb = New-Object System.Drawing.Drawing2D.GraphicsPath
                $gpb.AddString($badgeText, $ffHead, [int][System.Drawing.FontStyle]::Bold, 15, (New-Object System.Drawing.PointF(($ix + $iw / 2), ($iy + $ih - 29))), $sfC)
                $gr.FillPath([System.Drawing.Brushes]::White, $gpb)
            }
            return $true
        }
        return $false
    }

    # Left Illustration according to topic (Ưu tiên ảnh B-roll thực tế)
    if ($type -eq "wifi6") {
        $hasPhoto = Draw-BrollPhoto $g "fpt_wifi6_modem_giga_vvip.jpg" 65 75 330 370 "MODEM WI-FI 6 FPT THỰC TẾ"
        if (!$hasPhoto) {
            # 3D Router with Wave Beams Fallback
            $rtPath = New-RoundedRect 100 240 260 170 20
            $rtBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(100, 240, 260, 170)), (HexC "#FFFFFF"), (HexC "#CBD5E1"), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
            $g.FillPath($rtBrush, $rtPath)
            $g.DrawPath((New-Object System.Drawing.Pen((HexC $C_BLUE), 4)), $rtPath)
            $rtBadge = New-RoundedRect 135 255 190 38 10
            $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_ORANGE))), $rtBadge)
            $gpTxt = New-Object System.Drawing.Drawing2D.GraphicsPath
            $gpTxt.AddString("FPT WI-FI 6", $ffHead, [int][System.Drawing.FontStyle]::Bold, 20, (New-Object System.Drawing.PointF(230, 274)), $sfC)
            $g.FillPath([System.Drawing.Brushes]::White, $gpTxt)
        }
    }
    elseif ($type -eq "camera") {
        $hasPhoto = Draw-BrollPhoto $g "fpt_wifi6_camera_ai_poster.png" 65 75 330 370 "CAMERA AI CHÍNH HÃNG 0Đ"
        if (!$hasPhoto) {
            # Fallback
            $camDome = New-RoundedRect 150 170 160 170 80
            $g.FillPath((New-Object System.Drawing.SolidBrush((HexC "#FFFFFF"))), $camDome)
        }
    }
    elseif ($type -eq "fptplay") {
        $hasPhoto = Draw-BrollPhoto $g "fpt_giga_sky_meta_pricing.jpg" 65 75 330 370 "FPT PLAY NGOẠI HẠNG ANH & C1"
        if (!$hasPhoto) {
            $tvBox = New-RoundedRect 80 110 310 240 16
            $g.FillPath((New-Object System.Drawing.SolidBrush((HexC "#0B132B"))), $tvBox)
        }
    }
    else {
        # Speedtest / Băng thông
        $hasPhoto = Draw-BrollPhoto $g "fpt_speedtest_lux800_phone.jpg" 65 75 330 370 "SPEEDTEST THẬT 1.026 Mbps"
        if (!$hasPhoto) {
            $dialCenter = New-Object System.Drawing.PointF(230, 240)
            $gpSpd = New-Object System.Drawing.Drawing2D.GraphicsPath
            $gpSpd.AddString("1.026,92", $ffHead, [int][System.Drawing.FontStyle]::Bold, 46, (New-Object System.Drawing.PointF($dialCenter.X, ($dialCenter.Y - 15))), $sfC)
            $g.FillPath([System.Drawing.Brushes]::White, $gpSpd)
        }
    }

    # Right Side Content: Spoken Kicker, Title & Spoken Features
    $kPill = New-RoundedRect 430 50 340 40 20
    $pillCol = if ($accent -eq "orange") { $C_ORANGE } elseif ($accent -eq "green") { $C_GREEN } else { $C_BLUE }
    $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $pillCol))), $kPill)
    $g.DrawPath((New-Object System.Drawing.Pen((HexC "#93C5FD"), 1.8)), $kPill)

    $gpk = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gpk.AddString($kicker.ToUpper(), $ffBody, [int][System.Drawing.FontStyle]::Bold, 16, (New-Object System.Drawing.PointF(448, 70)), $sfL)
    $g.FillPath([System.Drawing.Brushes]::White, $gpk)

    # Big Headline: Spoken Title
    $gpH = New-Object System.Drawing.Drawing2D.GraphicsPath
    $headSize = if ($title.Length -gt 28) { 28 } elseif ($title.Length -gt 20) { 32 } else { 38 }
    $titleRect = New-Object System.Drawing.RectangleF 430, 98, 500, 85
    $sfHead = New-Object System.Drawing.StringFormat
    $sfHead.Alignment = [System.Drawing.StringAlignment]::Near
    $sfHead.LineAlignment = [System.Drawing.StringAlignment]::Center
    $gpH.AddString($title, $ffHead, [int][System.Drawing.FontStyle]::Bold, $headSize, $titleRect, $sfHead)
    $titleColor = if ($accent -eq "orange") { "#FFE600" } else { "#FFFFFF" }
    $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $titleColor))), $gpH)

    # Feature List
    $fy = 195
    foreach ($feat in $features) {
        if ($fy -gt 410) { break }
        $fBox = New-RoundedRect 430 $fy 480 48 12
        $boxBg = if ($accent -eq "orange") { "#2A1408" } elseif ($accent -eq "green") { "#062816" } else { "#0F203C" }
        $boxBrd = if ($accent -eq "orange") { "#EA580C" } elseif ($accent -eq "green") { "#16A34A" } else { "#1E3A8A" }
        $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $boxBg 200))), $fBox)
        $g.DrawPath((New-Object System.Drawing.Pen((HexC $boxBrd), 1.5)), $fBox)

        $gpf = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gpf.AddString($feat, $ffBody, [int][System.Drawing.FontStyle]::Bold, 17, (New-Object System.Drawing.PointF(446, ($fy + 24))), $sfL)
        $g.FillPath((New-Object System.Drawing.SolidBrush((HexC "#F1F5F9"))), $gpf)
        $fy += 60
    }

    Draw-TriStripe $g 670 470 340 10

    $outPath = Join-Path $outDir $card.file
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "Rendered voice-driven B-roll card: $($card.file)"
}
