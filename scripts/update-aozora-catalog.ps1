param(
  [string]$ZipPath = '',
  [switch]$Write,
  [switch]$StatusOnly,
  [string]$FetchedAt = '',
  [string]$OutPath = '',
  [string]$SourceUrl = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$arguments = @((Join-Path $PSScriptRoot 'update-aozora-catalog.mjs'))

if ($StatusOnly) {
  $arguments += '--status-only'
}

if ($ZipPath) {
  $arguments += '--zip'
  $arguments += $ZipPath
}

if ($Write) {
  $arguments += '--write'
}

if ($FetchedAt) {
  $arguments += '--fetched-at'
  $arguments += $FetchedAt
}

if ($OutPath) {
  $arguments += '--out'
  $arguments += $OutPath
}

if ($SourceUrl) {
  $arguments += '--source-url'
  $arguments += $SourceUrl
}

node @arguments

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
