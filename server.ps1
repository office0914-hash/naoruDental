$port = 8080
$baseDir = $PSScriptRoot
if (-not $baseDir) {
    $baseDir = (Get-Location).Path
}

# 既に起動している場合は即時検知させて維持
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    [Console]::WriteLine("Server running at http://localhost:$port/ (Already running)")
    [Console]::Out.Flush()
    while ($true) { Start-Sleep -Seconds 3600 }
    exit 0
}

[System.IO.File]::WriteAllText((Join-Path $baseDir "server_status.log"), "STARTING: $(Get-Date)")

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    [System.IO.File]::WriteAllText((Join-Path $baseDir "server_status.log"), "RUNNING: $(Get-Date)")
    [Console]::WriteLine("Server running at http://localhost:$port/ (Root: $baseDir)")
    [Console]::Out.Flush()
    
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $localPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
        if ([string]::IsNullOrEmpty($localPath) -or $localPath -eq '/') {
            $localPath = "main.html"
        }
        
        $filePath = Join-Path $baseDir $localPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".htm"  { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".csv"  { "text/csv; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                ".wasm" { "application/wasm" }
                default { "application/octet-stream" }
            }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    }
} catch {
    [System.IO.File]::WriteAllText((Join-Path $baseDir "server_status.log"), "ERROR: $($_.Exception.ToString())")
    Write-Output "Server running at http://localhost:$port/ (Already running)"
} finally {
    if ($listener -and $listener.IsListening) {
        $listener.Stop()
    }
}
