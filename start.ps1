$ErrorActionPreference = 'Stop'
Write-Host '正在啟動 AI 辦公室，按 Ctrl+C 停止。' -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot 'server.js')
exit $LASTEXITCODE
