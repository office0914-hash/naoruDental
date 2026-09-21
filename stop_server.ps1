# stop_server.ps1 - なおる歯科 サーバー停止スクリプト
$ErrorActionPreference = "SilentlyContinue"

$connections = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        if ($procId -gt 0) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Output "STOPPED"
} else {
    Write-Output "NOT_RUNNING"
}
