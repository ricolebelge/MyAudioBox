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
echo  Ouverture dans le browser...
echo.

start "" "web\index.html"

echo  L'app est ouverte.
echo  Tu peux fermer cette fenetre.
echo.
timeout /t 3 /nobreak >nul
