@echo off
title MovieBox Studio Launcher
cd /d "%~dp0"

:: Check if port 3456 is already listening; if not, start Node server in background
netstat -ano | findstr ":3456" | findstr "LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        start "MovieBox Studio Backend" /min "C:\Program Files\nodejs\node.exe" "%~dp0server.js"
    ) else (
        start "MovieBox Studio Backend" /min node "%~dp0server.js"
    )
    for /l %%i in (1,1,10) do (
        netstat -ano | findstr ":3456" | findstr "LISTENING" >nul 2>&1
        if not errorlevel 1 goto :ready
        timeout /t 1 /nobreak >nul
    )
)

:ready
:: Open in standalone frameless Desktop App mode via Chrome or Edge
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3456 --window-size=1440,900 --autoplay-policy=no-user-gesture-required
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3456 --window-size=1440,900 --autoplay-policy=no-user-gesture-required
) else (
    start http://localhost:3456
)
exit
