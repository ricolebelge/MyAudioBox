@echo off
title MyAudioBox - Live Drum Machine
cd /d "%~dp0"

echo.
echo  ============================================
echo.
echo    M Y A U D I O B O X
echo    Live Drum Machine
echo.
echo    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
echo    ^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|^|
echo    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
echo    [A][B][C][D][E][F][G][H]
echo    VOL  PCH  PAN  FLT  SND
echo.
echo  ============================================
echo.
echo  [1/3] Lancement du serveur HTTP...
start "MyAudioBox Server" venv\Scripts\python.exe server.py
timeout /t 2 /nobreak >nul

echo  [2/3] Lancement du bot Telegram...
start "MyAudioBox Bot" venv\Scripts\python.exe bot.py
timeout /t 2 /nobreak >nul

echo  [3/3] Ouverture du browser...
start http://localhost:8000

echo.
echo  MyAudioBox est pret.
echo  Ctrl+C dans les fenetres Python pour arreter.
echo.
timeout /t 3 /nobreak >nul
