@echo off
cd /d "%~dp0"
echo Lancement MyAudioBox...
start "MyAudioBox Server" venv\Scripts\python.exe server.py
timeout /t 2 /nobreak >nul
start "MyAudioBox Bot" venv\Scripts\python.exe bot.py
echo Ouverture du browser...
timeout /t 2 /nobreak >nul
start http://localhost:8000
echo MyAudioBox est prêt.
