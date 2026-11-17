param(
    [Parameter(Mandatory=$true)]
    [string]$ConfigPath
)

# FPT Telecom Brand Typography Renderer
# Palette: Blue #0066B3 | Orange #F37021 | Green #00A651 | Navy #0B1F3F | White

Add-Type -AssemblyName System.Drawing

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

$C_BLUE   = "#0066B3"
$C_BLUE_D = "#004A85"
$C_ORANGE = "#F37021"
$C_ORANGE_L = "#FF8A3D"
$C_GREEN  = "#00A651"
$C_GREEN_L = "#2CC46F"
$C_NAVY   = "#0B1F3F"
$C_WHITE  = "#FFFFFF"
$C_YELLOW = "#FFE600"

function HexC([string]$hex, [int]$alpha = 255) {
    if ([string]::IsNullOrWhiteSpace($hex)) { return [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255) }
    $h = $hex.TrimStart('#')
    if ($h.Length -lt 6) { return [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255) }
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

$cx = 540.0
$MAX_W = 800.0

# Builds a text path centered at cx, auto-fitted to the safe width. Returns @(path, bounds)
function Get-FitPath([string]$text, [System.Drawing.FontFamily]$family, [float]$emSize, [float]$topY, [float]$maxW = 800.0, [float]$targetCx = 540.0) {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Near
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddString($text, $family, [int][System.Drawing.FontStyle]::Bold, $emSize, (New-Object System.Drawing.PointF($targetCx, $topY)), $sf)
    $b = $gp.GetBounds()
    if ($b.Width -gt $maxW) {
        $em2 = [float]([Math]::Max(24.0, $emSize * ($maxW / $b.Width)))
        $gp.Dispose()
        $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gp.AddString($text, $family, [int][System.Drawing.FontStyle]::Bold, $em2, (New-Object System.Drawing.PointF($targetCx, $topY)), $sf)
        $b = $gp.GetBounds()
    }
    return @($gp, $b)
}

function Draw-Shadow([System.Drawing.Graphics]$g, [System.Drawing.Drawing2D.GraphicsPath]$path, [int]$dx = 6, [int]$dy = 9, [int]$alpha = 90) {
    $m = New-Object System.Drawing.Drawing2D.Matrix
    $m.Translate($dx, $dy)
    $sp = $path.Clone()
    $sp.Transform($m)
    $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, 0, 0, 0))), $sp)
}

# Outlined headline text (fill + stroke + soft shadow)
function Draw-OutlineText([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.FontFamily]$family, [float]$em, [float]$topY, [string]$fillHex, [string]$strokeHex, [float]$strokeW, [float]$angle = 0, [float]$targetCx = 540.0, [float]$targetMaxW = 800.0) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    $r = Get-FitPath $text $family $em $topY ($targetMaxW - $strokeW * 2) $targetCx
    $gp = $r[0]; $b = $r[1]
    $state = $g.Save()
    if ([Math]::Abs($angle) -gt 0.01) {
        $rcx = $b.X + $b.Width / 2; $rcy = $b.Y + $b.Height / 2
        $g.TranslateTransform($rcx, $rcy); $g.RotateTransform($angle); $g.TranslateTransform(-$rcx, -$rcy)
    }
    $penS = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(85, 0, 0, 0), ([float]($strokeW + 4)))
    $penS.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $m = New-Object System.Drawing.Drawing2D.Matrix; $m.Translate(4, 7)
    $gs = $gp.Clone(); $gs.Transform($m); $g.DrawPath($penS, $gs)
    if ($strokeW -gt 0.5) {
        $pen = New-Object System.Drawing.Pen((HexC $strokeHex), $strokeW)
        $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $g.DrawPath($pen, $gp)
    }
    $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $fillHex))), $gp)
    $g.Restore($state)
    return $b
}

# Text sitting inside a solid shape (skewed slab or rounded pill)
function Draw-BlockText([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.FontFamily]$family, [float]$em, [float]$topY, [string]$bgHex, [string]$textHex, [string]$shape = "slab", [float]$padX = 34, [float]$padY = 16, [string]$borderHex = "", [float]$targetCx = 540.0, [float]$targetMaxW = 800.0) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    $r = Get-FitPath $text $family $em $topY ($targetMaxW - $padX * 2 - 30) $targetCx
    $gp = $r[0]; $b = $r[1]
    $bx = $b.X - $padX; $by = $b.Y - $padY; $bw = $b.Width + $padX * 2; $bh = $b.Height + $padY * 2
    if ($shape -eq "pill") {
        $box = New-RoundedRect $bx $by $bw $bh ([Math]::Min(34, $bh / 2))
    } else {
        $box = New-Parallelogram $bx $by $bw $bh 16
    }
    Draw-Shadow $g $box 6 10 85
    $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $bgHex))), $box)
    if ($borderHex) { $g.DrawPath((New-Object System.Drawing.Pen((HexC $borderHex), 5)), $box) }
    $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $textHex))), $gp)
    return (New-Object System.Drawing.RectangleF($bx, $by, $bw, $bh))
}

# Signature FPT tri-color slanted stripe (blue | orange | green)
function Draw-TriStripe([System.Drawing.Graphics]$g, [float]$centerX, [float]$y, [float]$totalW = 300, [float]$h = 14) {
    $segW = ($totalW - 20) / 3
    $x0 = $centerX - $totalW / 2
    $cols = @($C_BLUE, $C_ORANGE, $C_GREEN)
    for ($i = 0; $i -lt 3; $i++) {
        $p = New-Parallelogram ($x0 + $i * ($segW + 10)) $y $segW $h 6
        $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $cols[$i]))), $p)
    }
}

function Draw-CheckBadge([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$d, [string]$circleHex, [string]$tickHex) {
    $g.FillEllipse((New-Object System.Drawing.SolidBrush((HexC $circleHex))), $x, $y, $d, $d)
    $pen = New-Object System.Drawing.Pen((HexC $tickHex), [float]($d * 0.13))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pts = @(
        (New-Object System.Drawing.PointF(($x + $d * 0.27), ($y + $d * 0.52))),
        (New-Object System.Drawing.PointF(($x + $d * 0.44), ($y + $d * 0.68))),
        (New-Object System.Drawing.PointF(($x + $d * 0.74), ($y + $d * 0.34)))
    )
    $g.DrawLines($pen, [System.Drawing.PointF[]]$pts)
}

# 4-pointed radiant sparkle star (✨) for eye-catching commercial polish
function Draw-SparkleStar([System.Drawing.Graphics]$g, [float]$cx, [float]$cy, [float]$r, [string]$colorHex = "#FFFFFF") {
    $inner = $r * 0.22
    $pts = @(
        (New-Object System.Drawing.PointF($cx, ($cy - $r))),
        (New-Object System.Drawing.PointF(($cx + $inner), ($cy - $inner))),
        (New-Object System.Drawing.PointF(($cx + $r), $cy)),
        (New-Object System.Drawing.PointF(($cx + $inner), ($cy + $inner))),
        (New-Object System.Drawing.PointF($cx, ($cy + $r))),
        (New-Object System.Drawing.PointF(($cx - $inner), ($cy + $inner))),
        (New-Object System.Drawing.PointF(($cx - $r), $cy)),
        (New-Object System.Drawing.PointF(($cx - $inner), ($cy - $inner)))
    )
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddClosedCurve([System.Drawing.PointF[]]$pts, 0.1)

    $penGlow = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 235, 120), 4)
    $g.DrawPath($penGlow, $gp)
    $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $colorHex))), $gp)
    $g.FillEllipse([System.Drawing.Brushes]::White, ($cx - $inner * 0.7), ($cy - $inner * 0.7), ($inner * 1.4), ($inner * 1.4))
}

function New-Canvas {
    $bmp = New-Object System.Drawing.Bitmap(1080, 1920, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)
    return @($bmp, $g)
}

function Save-Canvas($c, [string]$name) {
    $c[0].Save("$outDir\$name", [System.Drawing.Imaging.ImageFormat]::Png)
    $c[1].Dispose(); $c[0].Dispose()
}

function Split-TwoLines([string]$txt) {
    $clean = ($txt -replace "`n", " ").Trim()
    $words = $clean -split "\s+"
    if ($words.Count -le 2) { return @("", $clean) }
    $mid = [Math]::Floor($words.Count / 2)
    return @(($words[0..($mid-1)] -join " "), ($words[$mid..($words.Count-1)] -join " "))
}

# ---------------------------------------------------------------
# 1. INTRO HOOK (brand version - Dàn to phần trên chính giữa kèm minh họa thiết bị chính xác)
# ---------------------------------------------------------------
$assetsDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\assets"))
$hookStyle = if ($cfg.hook.style) { $cfg.hook.style } else { "H3_number" }

function Draw-IllustrativeBadge([System.Drawing.Graphics]$g, [float]$topY) {
    # 1. Logo FPT Telecom chính hãng (Góc trên trái)
    $logoPath = Join-Path $assetsDir "fpt_logo.png"
    if (Test-Path $logoPath) {
        $logo = [System.Drawing.Image]::FromFile($logoPath)
        $g.DrawImage($logo, 60, 58, 190, 64)
        $logo.Dispose()
    }

    # 2. Minh họa thiết bị chính xác (Góc trên phải): Modem Wi-Fi 6 hoặc Camera AI
    $devImgPath = Join-Path $assetsDir "fpt_modem_wifi6.png"
    $devLabel = "MODEM WI-FI 6"
    if ($cfg.hook.line1 -like "*Camera*" -or $cfg.hook.line2 -like "*Camera*") {
        $camPath = Join-Path $assetsDir "fpt_wifi6_camera.png"
        if (Test-Path $camPath) { $devImgPath = $camPath; $devLabel = "CAMERA AI" }
    }
    if (Test-Path $devImgPath) {
        $dev = [System.Drawing.Image]::FromFile($devImgPath)
        $bx = 825; $by = 50; $bw = 195; $bh = 138
        $medallion = New-RoundedRect $bx $by $bw $bh 20
        Draw-Shadow $g $medallion 4 8 95
        $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 11, 31, 63))), $medallion)
        $g.DrawPath((New-Object System.Drawing.Pen((HexC $C_BLUE), 4)), $medallion)
        $g.DrawImage($dev, ($bx + 25), ($by + 8), 145, 96)
        
        # Tag tên thiết bị chính hãng bên dưới ảnh
        $lblBox = New-RoundedRect ($bx + 12) ($by + $bh - 25) ($bw - 24) 22 8
        $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_ORANGE))), $lblBox)
        $sfC = New-Object System.Drawing.StringFormat; $sfC.Alignment = [System.Drawing.StringAlignment]::Center
        $gpL = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gpL.AddString($devLabel, $ffBody, [int][System.Drawing.FontStyle]::Bold, 13, (New-Object System.Drawing.PointF(($bx + $bw / 2), ($by + $bh - 22))), $sfC)
        $g.FillPath([System.Drawing.Brushes]::White, $gpL)
        $dev.Dispose()
    }
}

function Draw-HookLayer([System.Drawing.Graphics]$g, [int]$layer) {
    $l1 = if ($cfg.hook.line1) { $cfg.hook.line1.Trim() } else { "" }
    $l2 = if ($cfg.hook.line2) { $cfg.hook.line2.Trim() } else { "" }
    $l3 = if ($cfg.hook.line3) { $cfg.hook.line3.Trim() } else { "" }
    $l4 = if ($cfg.hook.line4) { $cfg.hook.line4.Trim() } else { "" }

    $lineCount = 0
    if ($l1) { $lineCount++ }
    if ($l2) { $lineCount++ }
    if ($l3) { $lineCount++ }
    if ($l4) { $lineCount++ }
    if ($lineCount -eq 0) { return }

    # Cho phép người dùng can thiệp trực tiếp vị trí Y và kích thước Scale của Hook (Mặc định 320px / 130%):
    $baseHookY = if ($cfg.hook.y -and [float]$cfg.hook.y -gt 50.0) { [float]$cfg.hook.y } else { 320.0 }
    $hookScale = if ($cfg.hook.scale -and [float]$cfg.hook.scale -gt 0.4) { [float]$cfg.hook.scale } else { 1.30 }

    # Cố định nằm gọn trong Safe Zone:
    $gap = 68.0 * $hookScale
    $y1 = $baseHookY
    $y2 = $baseHookY + $gap
    $y3 = $baseHookY + $gap * 1.95
    $y4 = $baseHookY + $gap * 2.85
    if ($lineCount -eq 3) {
        $gap = 76.0 * $hookScale
        $y1 = $baseHookY
        $y2 = $baseHookY + $gap
        $y3 = $baseHookY + $gap * 1.95
    } elseif ($lineCount -le 2) {
        $gap = 90.0 * $hookScale
        $y1 = $baseHookY + 20.0
        $y2 = $baseHookY + 20.0 + $gap
    }

    $baseF1 = if ($lineCount -ge 4) { 60.0 } else { 66.0 }
    $baseF2 = if ($lineCount -ge 4) { 40.0 } else { 44.0 }
    $baseF3 = if ($lineCount -ge 4) { 34.0 } else { 36.0 }
    $baseF4 = if ($lineCount -ge 4) { 34.0 } else { 36.0 }

    $fontSize1 = [float]([Math]::Round($baseF1 * $hookScale))
    $fontSize2 = [float]([Math]::Round($baseF2 * $hookScale))
    $fontSize3 = [float]([Math]::Round($baseF3 * $hookScale))
    $fontSize4 = [float]([Math]::Round($baseF4 * $hookScale))
    $maxW1 = [float](680.0 * [Math]::Min(1.20, $hookScale))
    $maxW2 = [float](660.0 * [Math]::Min(1.20, $hookScale))
    $maxW3 = [float](660.0 * [Math]::Min(1.20, $hookScale))
    $maxW4 = [float](640.0 * [Math]::Min(1.20, $hookScale))

    switch ($layer) {
        1 {
            if (!$l1) { return }
            # Dòng 1: Khối vát Cam FPT (#FC6601) viền Trắng dày 6px & đổ bóng 3D
            $headline = $l1.ToUpper()
            $b = Draw-BlockText $g $headline $ffHead $fontSize1 $y1 $C_ORANGE $C_WHITE "slab" (32 * $hookScale) (14 * $hookScale) $C_WHITE $cx $maxW1
            if ($b) {
                Draw-TriStripe $g $cx ($b.Y + $b.Height + 8) ([Math]::Min(500, $b.Width * 0.82)) 10
                Draw-SparkleStar $g ($b.X - 4) ($b.Y - 2) (20 * $hookScale) $C_YELLOW
                Draw-SparkleStar $g ($b.X + $b.Width + 4) ($b.Y + 4) (22 * $hookScale) $C_WHITE
            }
        }
        2 {
            if (!$l2) { return }
            # Dòng 2: Khối vát Xanh Dương FPT (#0066B3) hoặc Pill Xanh Lá nếu chỉ có 2 dòng
            if ($lineCount -eq 2) {
                $b2 = Draw-BlockText $g ($l2.ToUpper()) $ffBody $fontSize1 $y2 $C_GREEN $C_WHITE "pill" (30 * $hookScale) (10 * $hookScale) $C_WHITE $cx $maxW2
                if ($b2) {
                    Draw-SparkleStar $g ($b2.X - 4) ($b2.Y + $b2.Height / 2) (14 * $hookScale) $C_WHITE
                    Draw-SparkleStar $g ($b2.X + $b2.Width + 6) ($b2.Y + $b2.Height / 2) (16 * $hookScale) $C_YELLOW
                }
            } else {
                $b2 = Draw-BlockText $g ($l2.ToUpper()) $ffHead $fontSize2 $y2 $C_BLUE $C_WHITE "slab" (28 * $hookScale) (10 * $hookScale) $C_WHITE $cx $maxW2
                if ($b2) {
                    Draw-SparkleStar $g ($b2.X + $b2.Width + 6) ($b2.Y + $b2.Height / 2) (14 * $hookScale) $C_YELLOW
                }
            }
        }
        3 {
            if (!$l3) { return }
            # Dòng 3: Rounded Green Pill Badge (#00A651) viền Trắng
            $b3 = Draw-BlockText $g $l3 $ffBody $fontSize3 $y3 $C_GREEN $C_WHITE "pill" (28 * $hookScale) (8 * $hookScale) $C_WHITE $cx $maxW3
            if ($b3) {
                Draw-SparkleStar $g ($b3.X - 4) ($b3.Y + $b3.Height / 2) (14 * $hookScale) $C_WHITE
            }
        }
        4 {
            if (!$l4) { return }
            # Dòng 4: Tag Vàng Kim / Cam FPT (#FFE600)
            $b4 = Draw-BlockText $g $l4 $ffHead $fontSize4 $y4 $C_YELLOW "#0B1F3F" "pill" (30 * $hookScale) (10 * $hookScale) $C_WHITE $cx $maxW4
            if ($b4) {
                Draw-SparkleStar $g ($b4.X + $b4.Width + 6) ($b4.Y + $b4.Height / 2) (14 * $hookScale) $C_YELLOW
            }
        }
    }
}

$cAll = New-Canvas
for ($li = 1; $li -le 4; $li++) {
    $cL = New-Canvas
    Draw-HookLayer $cL[1] $li
    Save-Canvas $cL "hook_line$li.png"
    Draw-HookLayer $cAll[1] $li
}
Save-Canvas $cAll "intro_hook.png"

# ---------------------------------------------------------------
# 2. PRODUCT ILLUSTRATIONS & LOGOS (Camera AI, Modem Wi-Fi 6, NHA)
# ---------------------------------------------------------------
function Draw-ProductIllustration([System.Drawing.Graphics]$g, [string]$imagePath, [float]$targetX, [float]$targetY, [float]$targetW, [float]$targetH, [bool]$isLogo = $false) {
    if (![System.IO.File]::Exists($imagePath)) { return }
    try {
        $img = [System.Drawing.Image]::FromFile($imagePath)
        
        if ($isLogo) {
            # Logo dạng transparent PNG (như Ngoại Hạng Anh): vẽ trên nền pill trắng thanh lịch
            $pillW = $targetW + 36
            $pillH = $targetH + 20
            $gp = New-RoundedRect ($targetX - 18) ($targetY - 10) $pillW $pillH 20
            
            # Đổ bóng nhẹ
            $shadowGp = New-RoundedRect ($targetX - 14) ($targetY - 6) $pillW $pillH 20
            $g.FillPath((New-Object System.Drawing.SolidBrush((HexC "#000000" 70))), $shadowGp)
            $shadowGp.Dispose()

            # Nền trắng viền tím NHA / viền trắng
            $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_WHITE))), $gp)
            $g.DrawPath((New-Object System.Drawing.Pen((HexC "#38003C"), 4)), $gp)
            $gp.Dispose()

            # Vẽ Logo Premier League bên trong
            $g.DrawImage($img, [float]$targetX, [float]$targetY, [float]$targetW, [float]$targetH)
        } else {
            # Ảnh sản phẩm (Camera AI / Modem Wi-Fi 6): Khung bo tròn trắng viền Cam/Xanh FPT nổi bật
            $cardW = $targetW
            $cardH = $targetH
            $r = 24
            
            # Đổ bóng 3D
            $shadowGp = New-RoundedRect ($targetX + 6) ($targetY + 8) $cardW $cardH $r
            $g.FillPath((New-Object System.Drawing.SolidBrush((HexC "#000000" 85))), $shadowGp)
            $shadowGp.Dispose()

            # Nền card trắng viền FPT Orange
            $gp = New-RoundedRect $targetX $targetY $cardW $cardH $r
            $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_WHITE))), $gp)
            $g.DrawPath((New-Object System.Drawing.Pen((HexC $C_ORANGE), 5)), $gp)
            
            # Vẽ ảnh sản phẩm lọt trong card bo góc
            $state = $g.Save()
            $clipGp = New-RoundedRect ($targetX + 6) ($targetY + 6) ($cardW - 12) ($cardH - 12) ($r - 4)
            $g.SetClip($clipGp)
            $g.DrawImage($img, [float]($targetX + 6), [float]($targetY + 6), [float]($cardW - 12), [float]($cardH - 12))
            $clipGp.Dispose()
            $g.Restore($state)

            # Sparkle star nhỏ ở góc card
            Draw-SparkleStar $g ($targetX + $cardW - 6) ($targetY - 6) 20 $C_YELLOW
            $gp.Dispose()
        }
        $img.Dispose()
    } catch {
        # ignore error
    }
}

# ---------------------------------------------------------------
# 3. KEYWORD HIGHLIGHT STYLES (FPT 3D Brand System Chuẩn Ảnh Mẫu)
# ---------------------------------------------------------------
function Draw-HighlightStyle([System.Drawing.Graphics]$g, [string]$style, [string]$text, [float]$baseY, [float]$targetCx = 540.0, [float]$targetMaxW = 800.0, [float]$scale = 1.0) {
    $pair = Split-TwoLines $text
    $l1 = $pair[0]; $l2 = $pair[1]
    
    # 3D Tilt perspective state
    $state = $g.Save()
    $angle = if ($text.Length % 2 -eq 0) { -1.8 } else { 1.8 }
    $g.TranslateTransform($targetCx, $baseY + 60 * $scale)
    $g.RotateTransform($angle)
    $g.TranslateTransform(-$targetCx, -($baseY + 60 * $scale))

    switch ($style) {

        "fpt_editorial_stack" {
            $b = Draw-OutlineText $g $l1 $ffHead (90 * $scale) $baseY $C_ORANGE $C_WHITE (9 * $scale) 0 $targetCx $targetMaxW
            if ($l2) { [void](Draw-BlockText $g $l2 $ffBody (48 * $scale) ($baseY + 90 * $scale) $C_NAVY $C_WHITE "slab" (24 * $scale) (10 * $scale) $C_GREEN $targetCx $targetMaxW) }
            Draw-TriStripe $g $targetCx ($baseY + 164 * $scale) (220 * $scale) (7 * $scale)
        }
        "fpt_offset_echo" {
            $full = ($text -replace "`n", " ").Trim()
            [void](Draw-OutlineText $g $full $ffHead (76 * $scale) ($baseY + 16 * $scale) $C_BLUE $C_BLUE (5 * $scale) 0 ($targetCx + 10 * $scale) ($targetMaxW - 32))
            [void](Draw-OutlineText $g $full $ffHead (76 * $scale) ($baseY + 8 * $scale) $C_GREEN $C_GREEN (5 * $scale) 0 ($targetCx + 5 * $scale) ($targetMaxW - 32))
            [void](Draw-OutlineText $g $full $ffHead (76 * $scale) $baseY $C_WHITE $C_ORANGE (5 * $scale) 0 $targetCx ($targetMaxW - 32))
        }
        "fpt_bracket_focus" {
            $b = Draw-BlockText $g $l1 $ffHead (66 * $scale) $baseY $C_BLUE $C_WHITE "pill" (24 * $scale) (8 * $scale) "" $targetCx ($targetMaxW - 80)
            if ($l2) { [void](Draw-OutlineText $g $l2 $ffBody (58 * $scale) ($baseY + 72 * $scale) $C_WHITE $C_NAVY (8 * $scale) 0 $targetCx ($targetMaxW - 80)) }
            $pen = New-Object System.Drawing.Pen((HexC $C_ORANGE), [float](5 * $scale))
            $left = $targetCx - ($targetMaxW / 2) + 8
            $right = $targetCx + ($targetMaxW / 2) - 8
            $top = $baseY - 8
            $bottom = $baseY + (148 * $scale)
            $arm = 24 * $scale
            foreach ($xx in @($left, $right)) {
                $dir = if ($xx -eq $left) { 1 } else { -1 }
                $g.DrawLine($pen,[float]$xx,[float]$top,[float]($xx + $dir * $arm),[float]$top)
                $g.DrawLine($pen,[float]$xx,[float]$top,[float]$xx,[float]($top + $arm))
                $g.DrawLine($pen,[float]$xx,[float]$bottom,[float]($xx + $dir * $arm),[float]$bottom)
                $g.DrawLine($pen,[float]$xx,[float]$bottom,[float]$xx,[float]($bottom - $arm))
            }
            $pen.Dispose()
        }
        "fpt_ribbon_cut" {
            [void](Draw-BlockText $g $l1 $ffHead (64 * $scale) $baseY $C_ORANGE $C_WHITE "slab" (26 * $scale) (12 * $scale) $C_NAVY ($targetCx - 20) ($targetMaxW - 60))
            if ($l2) { [void](Draw-BlockText $g $l2 $ffBody (58 * $scale) ($baseY + 76 * $scale) $C_BLUE $C_WHITE "slab" (28 * $scale) (12 * $scale) $C_GREEN ($targetCx + 20) ($targetMaxW - 60)) }
        }

        "fpt_price_burst" {
            # Chuẩn ảnh mẫu: Blue pill ở trên + GIANT HIGHLIGHT TEXT giá Cam FPT viền Trắng to ở dưới (như 7.5K/NGÀY)
            $top = if ($l1) { $l1 } else { "ƯU ĐÃI TRỌN GÓI" }
            $bot = if ($l2) { $l2 } else { $text }
            [void](Draw-BlockText $g $top $ffBody (48 * $scale) $baseY $C_BLUE $C_WHITE "pill" (32 * $scale) (12 * $scale) $C_WHITE $targetCx $targetMaxW)
            [void](Draw-OutlineText $g $bot $ffHead (118 * $scale) ($baseY + 52 * $scale) $C_ORANGE $C_WHITE (18 * $scale) -1.5 $targetCx $targetMaxW)
        }
        "fpt_tricolor_slab" {
            # Skewed slab Cam/Navy viền Trắng kèm dải 3 màu FPT (như ĐĂNG KÝ NGAY!)
            if ($l1) { [void](Draw-BlockText $g $l1 $ffBody (46 * $scale) $baseY $C_BLUE $C_WHITE "slab" (30 * $scale) (12 * $scale) $C_WHITE $targetCx $targetMaxW) }
            $b = Draw-BlockText $g $l2 $ffHead (82 * $scale) ($baseY + 52 * $scale) $C_ORANGE $C_WHITE "slab" (38 * $scale) (18 * $scale) $C_WHITE $targetCx $targetMaxW
            if ($b) { Draw-TriStripe $g $targetCx ($b.Y + $b.Height + 10 * $scale) ([Math]::Min(560, $b.Width * 0.80)) (14 * $scale) }
        }
        "fpt_orange_block" {
            # Skewed Orange block với viền Trắng dày nổi bật - 2 dòng khít sát tạo cụm typo liền mạch
            if ($l1) { [void](Draw-BlockText $g $l1 $ffBody (46 * $scale) $baseY $C_BLUE $C_WHITE "pill" (30 * $scale) (12 * $scale) $C_WHITE $targetCx $targetMaxW) }
            [void](Draw-BlockText $g $l2 $ffHead (82 * $scale) ($baseY + 50 * $scale) $C_ORANGE $C_WHITE "slab" (38 * $scale) (18 * $scale) $C_WHITE $targetCx $targetMaxW)
        }
        "fpt_blue_pill" {
            # Rounded Blue Capsule với viền Trắng sắc nét
            $full = ($text -replace "`n", " ").Trim()
            [void](Draw-BlockText $g $full $ffHead (72 * $scale) ($baseY + 18 * $scale) $C_BLUE $C_WHITE "pill" (52 * $scale) (18 * $scale) $C_WHITE $targetCx $targetMaxW)
        }
        "fpt_stack_outline" {
            # Chữ viền Trắng nổi bật trên nền Cam FPT
            if ($l1) { [void](Draw-OutlineText $g $l1 $ffBody (60 * $scale) $baseY $C_WHITE $C_BLUE (12 * $scale) 0 $targetCx $targetMaxW) }
            $b = Draw-OutlineText $g $l2 $ffHead (96 * $scale) ($baseY + 54 * $scale) $C_ORANGE $C_WHITE (18 * $scale) 0 $targetCx $targetMaxW
            if ($b) {
                $u = New-Parallelogram ($targetCx - [Math]::Min(260, $b.Width * 0.35)) ($b.Y + $b.Height + 12 * $scale) ([Math]::Min(520, $b.Width * 0.7)) (14 * $scale) (6 * $scale)
                $g.FillPath((New-Object System.Drawing.SolidBrush((HexC $C_GREEN))), $u)
            }
        }
        "fpt_green_badge" {
            # Green rounded card với huy hiệu checkmark xác nhận (như TẶNG THÊM 1 THÁNG CƯỚC)
            $full = ($text -replace "`n", " ").Trim()
            $b = Draw-BlockText $g $full $ffHead (68 * $scale) ($baseY + 18 * $scale) $C_GREEN $C_WHITE "pill" (42 * $scale) (18 * $scale) $C_WHITE $targetCx $targetMaxW
            if ($b) {
                $d = 76 * $scale
                Draw-CheckBadge $g ($b.X - $d * 0.45) ($b.Y - $d * 0.45) $d $C_WHITE $C_GREEN
            }
        }
        "fpt_football_match" {
            # ⚽ Phong cách Ngoại Hạng Anh & FPT Play Độc Quyền (Tím than Premier League + Vàng Neon + Trắng 3D)
            $topTag = if ($l1) { $l1 } else { "BÓNG ĐÁ" }
            $botTxt = if ($l2) { $l2 } else { $text }
            [void](Draw-BlockText $g $topTag $ffBody (46 * $scale) $baseY "#38003C" $C_YELLOW "pill" (34 * $scale) (12 * $scale) $C_YELLOW $targetCx $targetMaxW)
            $b = Draw-OutlineText $g $botTxt $ffHead (112 * $scale) ($baseY + 52 * $scale) $C_YELLOW $C_ORANGE (16 * $scale) -1.2 $targetCx $targetMaxW
            if ($b) {
                Draw-SparkleStar $g ($b.X - 6) ($b.Y + $b.Height / 2) (22 * $scale) $C_YELLOW
                Draw-SparkleStar $g ($b.X + $b.Width + 6) ($b.Y + $b.Height / 2) (24 * $scale) $C_WHITE
                Draw-TriStripe $g $targetCx ($b.Y + $b.Height + 10 * $scale) ([Math]::Min(520, $b.Width * 0.8)) (12 * $scale)
            }
        }
        "fpt_speed_hud" {
            # ⚡ Phong cách Cyber HUD Siêu Tốc Wi-Fi 6 (Cyan Neon #00E5FF + Navy)
            $topTag = if ($l1) { $l1 } else { "TỐC ĐỘ KẾT NỐI" }
            $botTxt = if ($l2) { $l2 } else { $text }
            [void](Draw-BlockText $g $topTag $ffBody (44 * $scale) $baseY $C_NAVY "#00E5FF" "slab" (30 * $scale) (10 * $scale) "#00E5FF" $targetCx $targetMaxW)
            $b = Draw-OutlineText $g $botTxt $ffHead (106 * $scale) ($baseY + 50 * $scale) $C_WHITE "#00E5FF" (16 * $scale) 0 $targetCx $targetMaxW
            if ($b) {
                $hudLine = New-Parallelogram ($targetCx - [Math]::Min(280, $b.Width * 0.45)) ($b.Y + $b.Height + 10 * $scale) ([Math]::Min(560, $b.Width * 0.9)) (12 * $scale) (8 * $scale)
                $g.FillPath((New-Object System.Drawing.SolidBrush((HexC "#00E5FF"))), $hudLine)
                Draw-SparkleStar $g ($b.X + $b.Width + 4) ($b.Y + 6) (20 * $scale) "#00E5FF"
            }
        }
        "fpt_camera_smart" {
            # 📷 Phong cách Camera AI CCTV An Ninh Thông Minh (Xanh Lá FPT + Red Alert + White)
            $topTag = if ($l1) { $l1 } else { "CAMERA AI" }
            $botTxt = if ($l2) { $l2 } else { $text }
            [void](Draw-BlockText $g $topTag $ffBody (44 * $scale) $baseY "#7F1D1D" $C_WHITE "pill" (32 * $scale) (10 * $scale) "#EF4444" $targetCx $targetMaxW)
            $b = Draw-BlockText $g $botTxt $ffHead (84 * $scale) ($baseY + 50 * $scale) $C_GREEN $C_WHITE "slab" (36 * $scale) (16 * $scale) $C_WHITE $targetCx $targetMaxW
            if ($b) {
                $d = 72 * $scale
                Draw-CheckBadge $g ($b.X - $d * 0.4) ($b.Y - $d * 0.4) $d $C_WHITE $C_GREEN
            }
        }
        "fpt_voucher_3d" {
            # 🎫 Phong cách Vé Vàng Giảm Giá 3D (Gold #FFE600 + Cam FPT)
            $topTag = if ($l1) { $l1 } else { "ƯU ĐÃI" }
            $botTxt = if ($l2) { $l2 } else { $text }
            [void](Draw-BlockText $g $topTag $ffBody (46 * $scale) $baseY $C_NAVY $C_YELLOW "pill" (32 * $scale) (12 * $scale) $C_YELLOW $targetCx $targetMaxW)
            $b = Draw-BlockText $g $botTxt $ffHead (88 * $scale) ($baseY + 52 * $scale) $C_YELLOW $C_NAVY "slab" (40 * $scale) (18 * $scale) $C_ORANGE $targetCx $targetMaxW
            if ($b) {
                Draw-SparkleStar $g ($b.X - 4) ($b.Y - 2) (24 * $scale) $C_YELLOW
                Draw-SparkleStar $g ($b.X + $b.Width + 4) ($b.Y + 2) (26 * $scale) $C_WHITE
            }
        }
        "fpt_neon_glass" {
            # 💎 Phong cách Kính Mờ Frosted Glass viền Gradient 3 màu FPT
            $topTag = if ($l1) { $l1 } else { "CÔNG NGHỆ" }
            $botTxt = if ($l2) { $l2 } else { $text }
            [void](Draw-BlockText $g $topTag $ffBody (46 * $scale) $baseY $C_BLUE $C_WHITE "pill" (30 * $scale) (12 * $scale) $C_WHITE $targetCx $targetMaxW)
            $b = Draw-OutlineText $g $botTxt $ffHead (100 * $scale) ($baseY + 52 * $scale) $C_WHITE $C_ORANGE (16 * $scale) -1.0 $targetCx $targetMaxW
            if ($b) {
                Draw-TriStripe $g $targetCx ($b.Y + $b.Height + 10 * $scale) ([Math]::Min(560, $b.Width * 0.85)) (14 * $scale)
            }
        }
        "fpt_split_kicker" {
            # 🥊 Cú Đấm Kép Dual-Tone Giật Tít (Tầng 1 Navy + Tầng 2 Cam FPT Skew 3D)
            $topTag = if ($l1) { $l1 } else { "ĐIỂM NHẤN" }
            $botTxt = if ($l2) { $l2 } else { $text }
            [void](Draw-BlockText $g $topTag $ffBody (48 * $scale) $baseY $C_NAVY $C_WHITE "pill" (34 * $scale) (12 * $scale) $C_WHITE $targetCx $targetMaxW)
            [void](Draw-BlockText $g $botTxt $ffHead (86 * $scale) ($baseY + 52 * $scale) $C_ORANGE $C_WHITE "slab" (42 * $scale) (18 * $scale) $C_WHITE $targetCx $targetMaxW)
        }
        default {
            [void](Draw-OutlineText $g (($text -replace "`n", " ").Trim()) $ffHead (86 * $scale) ($baseY + 18 * $scale) $C_ORANGE $C_WHITE (18 * $scale) 0 $targetCx $targetMaxW)
        }
    }
    $g.Restore($state)
}

foreach ($h in $cfg.highlights) {
    $c = New-Canvas; $g = $c[1]
    if ($h.file -eq "hl_outro.png") {
        # Cụm Outro FPT Telecom vị trí và kích cỡ chữ Y HỆT text hook
        $outL1 = if ($cfg.outro.line1) { $cfg.outro.line1.Trim() } else { "" }
        $outL2 = if ($cfg.outro.line2) { $cfg.outro.line2.Trim() } else { "" }
        $outL3 = if ($cfg.outro.line3) { $cfg.outro.line3.Trim() } else { "" }

        $outCount = 0
        if ($outL1) { $outCount++ }
        if ($outL2) { $outCount++ }
        if ($outL3) { $outCount++ }

        if ($outCount -gt 0) {
            # Kế thừa chính xác vị trí Y và kích thước Scale của Hook (Mặc định 320px / 130%):
            $baseOutroY = if ($cfg.outro.y -and [float]$cfg.outro.y -gt 50.0) { [float]$cfg.outro.y } elseif ($cfg.hook.y -and [float]$cfg.hook.y -gt 50.0) { [float]$cfg.hook.y } else { 320.0 }
            $outroScale = if ($cfg.outro.scale -and [float]$cfg.outro.scale -gt 0.4) { [float]$cfg.outro.scale } elseif ($cfg.hook.scale -and [float]$cfg.hook.scale -gt 0.4) { [float]$cfg.hook.scale } else { 1.30 }

            $gap = 76.0 * $outroScale
            $y1 = $baseOutroY
            $y2 = $baseOutroY + $gap
            $y3 = $baseOutroY + $gap * 1.95

            $baseF1 = if ($outCount -ge 3) { 60.0 } else { 66.0 }
            $baseF2 = if ($outCount -ge 3) { 40.0 } else { 44.0 }
            $baseF3 = if ($outCount -ge 3) { 34.0 } else { 36.0 }

            $fontSize1 = [float]([Math]::Round($baseF1 * $outroScale))
            $fontSize2 = [float]([Math]::Round($baseF2 * $outroScale))
            $fontSize3 = [float]([Math]::Round($baseF3 * $outroScale))
            $maxW = [float](680.0 * [Math]::Min(1.20, $outroScale))

            # Dòng 1: Khối vát Cam FPT 3D viền Trắng (chỉ vẽ khi có text)
            if ($outL1) {
                $state = $g.Save()
                $g.TranslateTransform($cx, $y1 + 40 * $outroScale); $g.RotateTransform(-2.0); $g.TranslateTransform(-$cx, -($y1 + 40 * $outroScale))
                $b1 = Draw-BlockText $g ($outL1.ToUpper()) $ffHead $fontSize1 $y1 $C_ORANGE $C_WHITE "slab" (32 * $outroScale) (14 * $outroScale) $C_WHITE $cx $maxW
                $g.Restore($state)
                if ($b1) {
                    Draw-TriStripe $g $cx ($b1.Y + $b1.Height + 8 * $outroScale) ([Math]::Min(500, $b1.Width * 0.82)) 10
                    Draw-SparkleStar $g ($b1.X - 4) ($b1.Y - 2) (20 * $outroScale) $C_YELLOW
                    Draw-SparkleStar $g ($b1.X + $b1.Width + 4) ($b1.Y + 4) (22 * $outroScale) $C_WHITE
                }
            }

            # Dòng 2: Thanh Pill Xanh Lá FPT viền Trắng (chỉ vẽ khi có text)
            if ($outL2) {
                $b2 = Draw-BlockText $g $outL2 $ffBody $fontSize2 $y2 $C_GREEN $C_WHITE "pill" (28 * $outroScale) (10 * $outroScale) $C_WHITE $cx $maxW
                if ($b2) {
                    Draw-SparkleStar $g ($b2.X - 4) ($b2.Y + $b2.Height / 2) (14 * $outroScale) $C_WHITE
                    Draw-SparkleStar $g ($b2.X + $b2.Width + 6) ($b2.Y + $b2.Height / 2) (16 * $outroScale) $C_YELLOW
                }
            }

            # Dòng 3: Tag Vàng Kim / Cam FPT (chỉ vẽ khi có text)
            if ($outL3) {
                $b3 = Draw-BlockText $g $outL3 $ffHead $fontSize3 $y3 $C_YELLOW "#0B1F3F" "pill" (30 * $outroScale) (10 * $outroScale) $C_WHITE $cx $maxW
                if ($b3) {
                    Draw-SparkleStar $g ($b3.X + $b3.Width + 6) ($b3.Y + $b3.Height / 2) (14 * $outroScale) $C_YELLOW
                }
            }
        }
    } else {
        $style = if ($h.typo) { $h.typo } else { "fpt_tricolor_slab" }
        $assetsDir = "$PSScriptRoot\..\assets"
        $hLower = $h.text.ToLower()

        # Chỉ hiển thị ảnh minh họa đi kèm nếu người dùng yêu cầu rõ ràng ($h.broll hoặc $h.showIllustration)
        $hasIllust = $false
        $imgP = ""
        $isLogo = $false
        $allowIllust = ($h.showIllustration -eq $true) -or ($h.broll -and "$($h.broll)" -ne "null" -and "$($h.broll)" -ne "none")
        if ($allowIllust) {
            if ($hLower -match "(?i)(camera|an\s*ninh|giám\s*sát)") {
                $imgP = "$assetsDir\illustrations\camera_ai.jpg"
                $hasIllust = (Test-Path $imgP)
                $isLogo = $false
            } elseif ($hLower -match "(?i)(wifi|wi-fi|modem)") {
                $imgP = "$assetsDir\illustrations\wifi6_modem.jpg"
                $hasIllust = (Test-Path $imgP)
                $isLogo = $false
            } elseif ($hLower -match "(?i)(ngoại\s*hạng|nha|premier|bóng\s*đá)") {
                $imgP = "$assetsDir\illustrations\premier_league.png"
                $hasIllust = (Test-Path $imgP)
                $isLogo = $true
            }
        }

        # Can thiệp vị trí Y và kích thước Scale của từng Text Highlight:
        $hScale = if ($h.scale -and [float]$h.scale -gt 0.4) { [float]$h.scale } else { 1.0 }
        $baseY = if ($h.y -and [float]$h.y -gt 50.0) { [float]$h.y } else { 220.0 }

        if ($hasIllust) {
            # Khi CÓ ảnh minh họa:
            # - Tự động co giãn theo hScale, neo góc phải sát lề an toàn 910px
            $cardW = [float](205.0 * $hScale)
            $cardH = [float](205.0 * $hScale)
            $targetCardX = [float](910.0 - $cardW)
            if ($isLogo) {
                $pillW = [float](215.0 * $hScale)
                $pillH = [float](110.0 * $hScale)
                Draw-ProductIllustration $g $imgP (910.0 - $pillW) ($baseY - 15.0) $pillW $pillH $true
            } else {
                Draw-ProductIllustration $g $imgP $targetCardX ($baseY - 45.0) $cardW $cardH $false
            }
            # Text highlight tự động co hẹp và điều chỉnh tâm để không bao giờ đè ảnh
            $targetMaxW = [float]([Math]::Max(420.0, ($targetCardX - 20.0 - 100.0)))
            $targetCx = [float]((100.0 + ($targetCardX - 20.0)) / 2)
            Draw-HighlightStyle $g $style $h.text $baseY $targetCx $targetMaxW $hScale
        } else {
            # Khi KHÔNG CÓ ảnh minh họa:
            $targetMaxW = [float](760.0 * [Math]::Min(1.20, $hScale))
            Draw-HighlightStyle $g $style $h.text $baseY 540.0 $targetMaxW $hScale
        }
    }
    Save-Canvas $c $h.file
}

Write-Output "Rendered FPT brand overlays successfully."
