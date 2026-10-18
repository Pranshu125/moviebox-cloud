@echo off
setlocal enabledelayedexpansion
title MovieBox Studio - Deploy to Vercel (Cloud PWA)

echo ======================================================================
echo   MovieBox Studio - Cloud PWA Vercel Deployment Assistant
echo   Run your Home Theater & Cloud Streaming Studio 24/7 on your phone
echo   anytime, anywhere without keeping your PC or cmd running!
echo ======================================================================
echo.

cd /d "%~dp0"

echo [1/3] Synchronizing latest Liquid Glass & Claymorphism public assets...
"C:\Program Files\nodejs\node.exe" scripts\sync-public.js
if %errorlevel% neq 0 (
  echo [!] Failed to synchronize public assets. Please check Node.js installation.
  pause
  exit /b 1
)
echo [OK] Static assets and PWA icons synchronized into .\public
echo.

echo [2/3] Checking Deployment Method Options:
echo.
echo   Option A: Deploy instantly via Vercel CLI (terminal)
echo   Option B: Deploy via GitHub (Recommended for automatic 24/7 cloud hosting)
echo.

set /p DEPLOY_CHOICE="Select deployment option (A or B, default A): "
if /i "%DEPLOY_CHOICE%"=="B" goto GITHUB_GUIDE

echo.
echo [3/3] Launching Vercel deployment via npx...
echo.
echo Note: If this is your first time deploying to Vercel, it will ask you
echo to log in with your GitHub, GitLab, or email account in your browser.
echo Press Enter on all prompts to use the pre-configured defaults.
echo.

call npx vercel --prod
if %errorlevel% equ 0 (
  echo.
  echo ======================================================================
  echo   SUCCESS! MovieBox Studio is now live on Vercel!
  echo   Open the provided URL on your iPhone, iPad, Android, or Smart TV.
  echo   Tap 'Add to Home Screen' or 'Install App' to run it as a native app!
  echo ======================================================================
) else (
  echo.
  echo [Notice] Vercel CLI deployment encountered an exit code.
  echo You can also deploy via GitHub in 1 click!
  goto GITHUB_GUIDE
)
pause
exit /b 0

:GITHUB_GUIDE
echo.
echo ======================================================================
echo   RECOMMENDED METHOD: 1-Click Deploy via GitHub
echo ======================================================================
echo.
echo 1. Go to https://github.com/new and create a new repository
echo    (e.g., "moviebox-cloud").
echo.
echo 2. Run these 4 commands in cmd:
echo      git init
echo      git add .
echo      git commit -m "Initial MovieBox Liquid Glass PWA release"
echo      git branch -M main
echo      git remote add origin https://github.com/YOUR_USERNAME/moviebox-cloud.git
echo      git push -u origin main
echo.
echo 3. Go to https://vercel.com/new and click "Import" next to your repo.
echo.
echo 4. Click "Deploy" (no custom configuration needed, vercel.json is preset).
echo.
echo 5. You will receive a permanent HTTPS link (e.g. https://moviebox-studio.vercel.app)
echo    Open it on your phone, tap "Install App" or "Add to Home Screen",
echo    and enjoy streaming anytime, anywhere without opening cmd!
echo ======================================================================
echo.
pause
exit /b 0
