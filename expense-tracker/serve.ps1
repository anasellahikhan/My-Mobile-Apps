# ============================================================
#  Serve the app so PWA features work
# ============================================================
#
#  WHY THIS IS NEEDED
#  ------------------
#  Double-clicking index.html opens it as file:///D:/...
#  Browsers refuse to register a service worker on file://
#  for security reasons, so offline support and "install to
#  home screen" are both silently disabled.
#
#  http://localhost is treated as a secure origin, so serving
#  the folder - even with this tiny built-in server - turns
#  every PWA feature on.
#
#  Usage:
#      powershell -ExecutionPolicy Bypass -File .\serve.ps1
#
#  Stop it with Ctrl+C.
# ============================================================

$port = 8000

Write-Host ""
Write-Host "Expense Tracker - local server" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# Find this PC's address on the local network, for phone testing
$lan = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and
                       $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress

Write-Host "On this PC:" -ForegroundColor Green
Write-Host "    http://localhost:$port" -ForegroundColor White
Write-Host ""

if ($lan) {
    Write-Host "On your phone (same wifi):" -ForegroundColor Green
    Write-Host "    http://${lan}:$port" -ForegroundColor White
    Write-Host ""
    Write-Host "    Note: the app WORKS on your phone this way, but" -ForegroundColor DarkGray
    Write-Host "    offline mode and install do NOT - those need" -ForegroundColor DarkGray
    Write-Host "    https, which step 4 sets up." -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

Start-Process "http://localhost:$port"

python -m http.server $port
