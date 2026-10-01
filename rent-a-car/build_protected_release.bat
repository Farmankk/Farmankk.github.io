@echo off
title Build Protected Release - Car4Rent
cd /d "%~dp0"
echo ===============================================================
echo     CAR4RENT - BUILD ENCRYPTED & PROTECTED CLIENT RELEASE
echo ===============================================================
echo.
echo 1. Copying website files to dist/
echo 2. Removing keygen and private batch tools
echo 3. Obfuscating/Encrypting JavaScript with Anti-Tamper Protection
echo 4. Resetting license state to force client activation
echo.
node build_release.js
echo.
pause
