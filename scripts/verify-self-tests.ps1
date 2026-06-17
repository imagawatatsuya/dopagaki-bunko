$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

node (Join-Path $PSScriptRoot 'verify-self-tests.mjs')

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Output 'Self-contained JS tests passed.'
