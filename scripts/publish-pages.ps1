param(
  [string]$CommitMessage = '',
  [switch]$SkipStamp,
  [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not $SkipStamp) {
  & (Join-Path $PSScriptRoot 'update-release-stamp.ps1')
}

if (-not $SkipVerify) {
  & (Join-Path $PSScriptRoot 'verify-pages.ps1')
}

$gitConfigPath = Join-Path $repoRoot '.git/config'
if (-not (Test-Path -LiteralPath $gitConfigPath)) {
  throw 'This directory is not a git repository.'
}

$gitConfig = Get-Content -LiteralPath $gitConfigPath -Raw
if ($gitConfig -notmatch '\[remote "origin"\]') {
  throw 'Git remote origin is not configured. Add the GitHub repository remote first.'
}

$headRef = Get-Content -LiteralPath (Join-Path $repoRoot '.git/HEAD') -Raw
if ($headRef -notmatch 'refs/heads/main') {
  throw 'Switch to the main branch before publishing.'
}

git add -A
$status = git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  if (-not $CommitMessage) {
    $release = Get-Content -LiteralPath (Join-Path $repoRoot 'release.json') -Raw | ConvertFrom-Json
    $CommitMessage = "Publish GitHub Pages $($release.version)"
  }
  git commit -m $CommitMessage
}

git push origin main
Write-Output 'Pushed main to origin. Confirm GitHub Pages is configured for main / root.'
