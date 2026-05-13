@echo off
title MyAudioBox — Make Release
cd /d "%~dp0"

set VERSION=v1.0
set RELEASE_NAME=MyAudioBox-%VERSION%
set BUILD_DIR=%~dp0build\%RELEASE_NAME%
set OUTPUT_ZIP=%~dp0%RELEASE_NAME%.zip
set SAMPLES_808=%~dp0samples\musicradar-808-samples\musicradar-808-samples\Hits

echo.
echo  ================================
echo   MYAUDIOBOX — Make Release
echo   Building %RELEASE_NAME%...
echo  ================================
echo.

REM — Nettoyage build precedent
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
if exist "%OUTPUT_ZIP%" del "%OUTPUT_ZIP%"

REM — Creation structure
echo [1/6] Creation de la structure...
mkdir "%BUILD_DIR%"
mkdir "%BUILD_DIR%\samples\kick"
mkdir "%BUILD_DIR%\samples\snare"
mkdir "%BUILD_DIR%\samples\hihat"
mkdir "%BUILD_DIR%\samples\openhat"
mkdir "%BUILD_DIR%\samples\clap"
mkdir "%BUILD_DIR%\samples\tom"
mkdir "%BUILD_DIR%\samples\perc"
mkdir "%BUILD_DIR%\samples\fx"
mkdir "%BUILD_DIR%\patterns"

REM — Copie web/
echo [2/6] Copie des fichiers web...
xcopy /e /i /q "web" "%BUILD_DIR%\web"

REM — Copie 1 sample par categorie (808)
echo [3/6] Copie des samples...
copy "%SAMPLES_808%\Bass Drum [BD]\E808_BD[short]-01.wav"   "%BUILD_DIR%\samples\kick\E808_BD-01.wav"      >nul
copy "%SAMPLES_808%\Snare Drum [SD]\E808_SD-01.wav"          "%BUILD_DIR%\samples\snare\E808_SD-01.wav"     >nul
copy "%SAMPLES_808%\Closed Hi Hat [CH]\E808_CH-01.wav"       "%BUILD_DIR%\samples\hihat\E808_CH-01.wav"     >nul
copy "%SAMPLES_808%\Open Hi Hat [OH]\E808_OH-01.wav"         "%BUILD_DIR%\samples\openhat\E808_OH-01.wav"   >nul
copy "%SAMPLES_808%\Clap [CP]\E808_CP-01.wav"                "%BUILD_DIR%\samples\clap\E808_CP-01.wav"      >nul
copy "%SAMPLES_808%\Tom Toms [LT-MT-HT]\E808_HT-01.wav"     "%BUILD_DIR%\samples\tom\E808_HT-01.wav"       >nul
copy "%SAMPLES_808%\Maracas [MA]\E808_MA-01.wav"             "%BUILD_DIR%\samples\perc\E808_MA-01.wav"      >nul
copy "%SAMPLES_808%\Cymbal [CY]\E808_CY-01.wav"              "%BUILD_DIR%\samples\fx\E808_CY-01.wav"        >nul

REM — Copie patterns si presents
echo [4/6] Copie des patterns...
if exist "patterns\" xcopy /e /i /q "patterns" "%BUILD_DIR%\patterns"

REM — Copie fichiers racine
echo [5/6] Copie des fichiers racine...
copy "launch.bat"      "%BUILD_DIR%\launch.bat"      >nul
copy "README-fr.html"  "%BUILD_DIR%\README-fr.html"  >nul
copy "README-en.html"  "%BUILD_DIR%\README-en.html"  >nul

REM — Creation ZIP
echo [6/6] Creation du ZIP...
powershell -Command "Compress-Archive -Path '%BUILD_DIR%' -DestinationPath '%OUTPUT_ZIP%' -Force"

REM — Nettoyage
rmdir /s /q "%~dp0build"

echo.
if exist "%OUTPUT_ZIP%" (
  echo  ================================
  echo   OK : %RELEASE_NAME%.zip cree !
  echo  ================================
  echo.
  explorer /select,"%OUTPUT_ZIP%"
) else (
  echo  ERREUR : le ZIP n a pas ete cree.
)
echo.
pause
