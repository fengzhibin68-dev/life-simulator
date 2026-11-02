@echo off
rem 人生模拟器 · 一键启动
rem 双击本文件即可：起本地服务器并打开浏览器，Ctrl+C 或关窗口即停止。
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" %*
if errorlevel 1 pause
