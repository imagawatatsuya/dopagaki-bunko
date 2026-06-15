$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
  'index.html',
  '404.html',
  'manifest.webmanifest',
  'release.json',
  'styles/base.css',
  'src/main.js'
)

$failures = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    $failures.Add("Missing required file: $relativePath")
  }
}

$indexHtml = Get-Content -LiteralPath (Join-Path $repoRoot 'index.html') -Raw
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'manifest.webmanifest') -Raw
$headRef = Get-Content -LiteralPath (Join-Path $repoRoot '.git/HEAD') -Raw
$gitConfigPath = Join-Path $repoRoot '.git/config'
$gitConfig = if (Test-Path -LiteralPath $gitConfigPath) { Get-Content -LiteralPath $gitConfigPath -Raw } else { '' }

if ($indexHtml -match 'https?://') {
  $failures.Add('index.html contains an absolute http/https asset reference.')
}

if ($indexHtml -notmatch 'data-release-version="[^"]+"') {
  $failures.Add('index.html is missing the stamped fallback release version.')
}

if ($indexHtml -notmatch '<link id="app-stylesheet" rel="stylesheet" href="\./styles/base\.css\?v=') {
  $failures.Add('index.html is missing the stamped stylesheet reference.')
}

if ($indexHtml -notmatch 'fetch\(`\./release\.json\?ts=\$\{Date\.now\(\)\}`') {
  $failures.Add('index.html is missing the release.json bootstrap fetch.')
}

if ($indexHtml -notmatch 'await import\(assetUrl\(''\./src/main\.js'', version\)\);') {
  $failures.Add('index.html is missing the dynamic main.js bootstrap import.')
}

if ($manifest -notmatch '"start_url"\s*:\s*"\./"') {
  $failures.Add('manifest.webmanifest start_url should be ./ for GitHub Pages root publishing.')
}

if ($manifest -notmatch '"scope"\s*:\s*"\./"') {
  $failures.Add('manifest.webmanifest scope should be ./.')
}

if ($headRef -notmatch 'refs/heads/main') {
  $failures.Add('The current branch is not main.')
}

if ($gitConfig -notmatch '\[remote "origin"\]') {
  $failures.Add('Git remote origin is not configured.')
}

if ($failures.Count -gt 0) {
  Write-Error ($failures -join [Environment]::NewLine)
}

Write-Output 'Pages verification passed.'
