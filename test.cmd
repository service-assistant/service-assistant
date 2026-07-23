@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-all-windows.ps1"
exit /b %ERRORLEVEL%
