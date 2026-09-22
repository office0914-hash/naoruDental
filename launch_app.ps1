# launch_app.ps1 - Naoru Dental Launcher (Bulletproof WMI Process Launch)
$ErrorActionPreference = "SilentlyContinue"

$baseDir = $PSScriptRoot
if (-not $baseDir) {
    $baseDir = (Get-Location).Path
}

$url = "http://localhost:8080/main.html"

# 1. Check if server is already running (HTTP 200)
$isRunning = $false
try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($res.StatusCode -eq 200) {
        $isRunning = $true
    }
} catch {
    $isRunning = $false
}

# 2. If not running, start server as an independent background process via WMI
if (-not $isRunning) {
    $cmd = "powershell.exe -NoExit -WindowStyle Hidden -ExecutionPolicy Bypass -File .\server.ps1"
    ([wmiclass]"win32_process").Create($cmd, $baseDir, $null) | Out-Null

    # Wait for server to respond (up to 5 seconds)
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($res.StatusCode -eq 200) {
                $isRunning = $true
                break
            }
        } catch {
            # waiting...
        }
    }
}

# 3. Launch Google Chrome in App Mode (Dedicated window without URL bar or tabs)
$chromePath = Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath) -and ${env:ProgramFiles(x86)}) {
    $chromePath = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
    $chromePath = Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe"
}

if (Test-Path $chromePath) {
    Start-Process -FilePath $chromePath -ArgumentList "--app=$url"
} else {
    $edgePath = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
    if (-not (Test-Path $edgePath)) {
        $edgePath = Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
    }
    if (-not (Test-Path $edgePath)) {
        $edgePath = Join-Path $env:LocalAppData "Microsoft\Edge\Application\msedge.exe"
    }
    if (Test-Path $edgePath) {
        Start-Process -FilePath $edgePath -ArgumentList "--app=$url"
    } else {
        Start-Process $url
    }
}
