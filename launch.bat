@echo off
title MyAudioBox — Live Drum Machine
cd /d "%~dp0"

echo.
echo  ================================
echo   MYAUDIOBOX — Live Drum Machine
echo  ================================
echo.
echo  Ouverture dans le browser...
echo.

start "" "web\index.html"

echo  L'app est ouverte dans ton browser.
echo  Tu peux fermer cette fenetre.
echo.
timeout /t 3 /nobreak >nul
