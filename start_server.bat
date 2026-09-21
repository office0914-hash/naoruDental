@echo off
chcp 65001 > nul
title なおる歯科 ローカルWebサーバー (ポート 8080)
echo ===================================================
echo   なおる歯科 予約システム - ローカルWebサーバー
echo   アクセスURL: http://localhost:8080
echo ===================================================
echo サーバーを起動しています...
powershell -ExecutionPolicy Bypass -Command "& '%~dp0server.ps1'"
pause
