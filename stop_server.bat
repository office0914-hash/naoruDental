@echo off
chcp 65001 > nul
title なおる歯科 - サーバー停止
echo ===================================================
echo   なおる歯科 予約システム - サーバー停止
echo ===================================================
echo.
echo ポート8080のサーバーを停止しています...

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_server.ps1"

echo.
echo 停止処理が完了しました。
timeout /t 2 > nul
