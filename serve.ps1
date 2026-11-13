$root = $PSScriptRoot
$listener = $null
foreach ($port in 5810..5850) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$port/")
  try { $l.Start(); $listener = $l; break } catch { $l.Close() }
}
if (-not $listener) { Write-Host "No free port found between 5810 and 5850."; exit 1 }
Write-Host "Mindgraft running at http://localhost:$port/  (Ctrl+C to stop)"
if (-not $env:NO_OPEN) { Start-Process "http://localhost:$port/" }

$types = @{ '.html'='text/html'; '.js'='text/javascript'; '.png'='image/png'; '.mp3'='audio/mpeg'; '.ogg'='audio/ogg'; '.wav'='audio/wav'; '.json'='application/json'; '.css'='text/css' }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $res = $ctx.Response
    try {
      if ($path -eq '/manifest.json') {
        function List($dir, $filter) {
          $p = Join-Path $root $dir
          if (-not (Test-Path $p)) { return @() }
          return @(Get-ChildItem $p -File | Where-Object { $_.Name -match $filter } | Sort-Object Name | ForEach-Object { $_.Name })
        }
        $manifest = @{ textures = @(List 'textures' '\.png$'); sounds = @(List 'sounds' '\.(mp3|ogg|wav)$') }
        $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $manifest -Compress))
        $res.ContentType = 'application/json'
        try { [IO.File]::WriteAllBytes((Join-Path $root 'manifest.json'), $bytes) } catch { }
      } else {
        if ($path -eq '/') { $path = '/index.html' }
        $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
        if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) { $res.StatusCode = 404; $bytes = [byte[]]@() }
        else {
          $bytes = [IO.File]::ReadAllBytes($file)
          $ext = [IO.Path]::GetExtension($file).ToLower()
          $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
        }
      }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch { }
    $res.Close()
  }
} finally { $listener.Stop() }
