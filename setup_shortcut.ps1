# setup_shortcut.ps1 - Naoru Dental Shortcut Creator
$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = (Get-Location).Path
}

# Unicode char points to guarantee 100% encoding safety on any Windows environment
$shortcutFileName = "$([char]0x306A)$([char]0x304A)$([char]0x308B)$([char]0x6B6F)$([char]0x79D1) $([char]0x4E88)$([char]0x7D04)$([char]0x30B7)$([char]0x30B9)$([char]0x30C6)$([char]0x30E0).lnk"
$shortcutDesc = "$([char]0x306A)$([char]0x304A)$([char]0x308B)$([char]0x6B6F)$([char]0x79D1) $([char]0x4E88)$([char]0x7D04)$([char]0x7BA1)$([char]0x7406)$([char]0x30B7)$([char]0x30B9)$([char]0x30C6)$([char]0x30E0)"

$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop $shortcutFileName

# Remove old/broken shortcuts if exists
Get-ChildItem -Path $desktop -Filter "*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.FullName -ne $shortcutPath -and ($_.Name -like "*なおる*" -or $_.Name -like "*Naoru*")) {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

$shortcut = $ws.CreateShortcut($shortcutPath)
# PowerShellを非表示ウィンドウで起動し、launch_app.ps1を実行
$psExe = Join-Path ${env:SystemRoot} "System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.TargetPath = $psExe
$shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File .\launch_app.ps1"
$shortcut.WorkingDirectory = $scriptDir
$shortcut.WindowStyle = 7 # 7 = Minimized (最小化で起動し画面をチラつかせない)
$shortcut.Description = $shortcutDesc

$chromePath = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chromePath) -and ${env:ProgramFiles(x86)}) {
    $chromePath = Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
}
if (-not (Test-Path $chromePath)) {
    $chromePath = Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe'
}

if (Test-Path $chromePath) {
    $shortcut.IconLocation = "$chromePath,0"
} else {
    $edgePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
    if (-not (Test-Path $edgePath)) {
        $edgePath = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'
    }
    if (-not (Test-Path $edgePath)) {
        $edgePath = Join-Path $env:LocalAppData 'Microsoft\Edge\Application\msedge.exe'
    }
    if (Test-Path $edgePath) {
        $shortcut.IconLocation = "$edgePath,0"
    } else {
        $shortcut.IconLocation = "shell32.dll,13"
    }
}

$shortcut.Save()

Write-Output "SUCCESS_SHORTCUT_CREATED: $shortcutPath"
