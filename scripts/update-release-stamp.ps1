param(
  [string]$Version = (Get-Date -Format 'yyyyMMddHHmmss')
)

$ErrorActionPreference = 'Stop'

function Update-FileContent {
  param(
    [string]$Path,
    [scriptblock]$Transform
  )

  $original = Get-Content -LiteralPath $Path -Raw
  $updated = & $Transform $original
  if ($updated -ne $original) {
    Set-Content -LiteralPath $Path -Value $updated -NoNewline
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot

Update-FileContent -Path (Join-Path $repoRoot 'index.html') -Transform {
  param($content)
  $content = [regex]::Replace($content, '(?<=(href|src)=["'']\./[^"'']+\.(css|js))(\?v=[^"'']*)?(?=["''])', "?v=$Version")
  $content
}

$srcFiles = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'src') -Filter *.js -File
foreach ($file in $srcFiles) {
  Update-FileContent -Path $file.FullName -Transform {
    param($content)
    [regex]::Replace($content, '(?<=(from\s+["'']\./[^"'']+\.js))(\?v=[^"'']*)?(?=["''])', "?v=$Version")
  }
}

$releaseObject = [ordered]@{
  version = $Version
  publishedAt = (Get-Date).ToUniversalTime().ToString('o')
  notes = 'github-pages release'
}
$releaseJson = $releaseObject | ConvertTo-Json
Set-Content -LiteralPath (Join-Path $repoRoot 'release.json') -Value $releaseJson -NoNewline

Write-Output "Stamped release version: $Version"
