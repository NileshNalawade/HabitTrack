Add-Type -AssemblyName System.Drawing

function Create-Icon($path, $size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 15, 23))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
    
    $innerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 19, 29, 46))
    $g.FillEllipse($innerBrush, [int]($size * 0.1), [int]($size * 0.1), [int]($size * 0.8), [int]($size * 0.8))
    
    $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
    $font = New-Object System.Drawing.Font("Arial", [float]($size * 0.35), [System.Drawing.FontStyle]::Bold)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString("⚡", $font, $accentBrush, $rect, $format)
    
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$iconDir = "c:\Users\nilesh.nalawade\Desktop\New folder\icons"
Create-Icon (Join-Path $iconDir "icon-192.png") 192
Create-Icon (Join-Path $iconDir "icon-512.png") 512
Write-Output "PNG icons created successfully"

