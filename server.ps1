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
        
        # CORS ヘッダー
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "*")
        
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }
        
        $localPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
        
        # 1. データベース API エンドポイント (/api/db)
        if ($localPath -eq 'api/db') {
            $dbFilePath = Join-Path $baseDir "naoru_dental.db"
            $backupPath = Join-Path $baseDir "naoru_dental.db.bak"
            
            if ($request.HttpMethod -eq "GET") {
                if (Test-Path $dbFilePath -PathType Leaf) {
                    $dbBytes = [System.IO.File]::ReadAllBytes($dbFilePath)
                    $response.ContentType = "application/octet-stream"
                    $response.ContentLength64 = $dbBytes.Length
                    $response.OutputStream.Write($dbBytes, 0, $dbBytes.Length)
                } else {
                    $response.StatusCode = 404
                    $msgBytes = [System.Text.Encoding]::UTF8.GetBytes("No Database Found")
                    $response.OutputStream.Write($msgBytes, 0, $msgBytes.Length)
                }
            } elseif ($request.HttpMethod -eq "POST") {
                try {
                    $memoryStream = New-Object System.IO.MemoryStream
                    $request.InputStream.CopyTo($memoryStream)
                    $postBytes = $memoryStream.ToArray()
                    $memoryStream.Close()
                    
                    if ($postBytes.Length -gt 0) {
                        # 既存DBがあればバックアップ作成
                        if (Test-Path $dbFilePath) {
                            Copy-Item -Path $dbFilePath -Destination $backupPath -Force
                        }
                        [System.IO.File]::WriteAllBytes($dbFilePath, $postBytes)
                        $response.StatusCode = 200
                        $msgBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"ok","size":' + $postBytes.Length + '}')
                        $response.ContentType = "application/json; charset=utf-8"
                        $response.OutputStream.Write($msgBytes, 0, $msgBytes.Length)
                    } else {
                        $response.StatusCode = 400
                        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Empty payload"}')
                        $response.ContentType = "application/json; charset=utf-8"
                        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                    }
                } catch {
                    $response.StatusCode = 500
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"' + $_.Exception.Message + '"}')
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
            }
            $response.Close()
            continue
        }

        # 2. 静的ファイル配信
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
