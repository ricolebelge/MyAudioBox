@echo off
title MyAudioBox — Make Release
cd /d "%~dp0"

set VERSION=v1.0
set RELEASE_NAME=MyAudioBox-%VERSION%
set BUILD_DIR=%~dp0build\%RELEASE_NAME%
set OUTPUT_ZIP=%~dp0%RELEASE_NAME%.zip

echo.
echo  ================================
echo   MYAUDIOBOX — Make Release
echo   Building %RELEASE_NAME%...
echo  ================================
echo.

REM — Nettoyage build précédent
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
if exist "%OUTPUT_ZIP%" del "%OUTPUT_ZIP%"

REM — Création structure
echo [1/5] Creation de la structure...
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
echo [2/5] Copie des fichiers web...
xcopy /e /i /q "web" "%BUILD_DIR%\web"

REM — Copie samples si présents
echo [3/5] Copie des samples...
if exist "samples\" xcopy /e /i /q "samples" "%BUILD_DIR%\samples"

REM — Copie patterns si présents
echo [4/5] Copie des patterns...
if exist "patterns\" xcopy /e /i /q "patterns" "%BUILD_DIR%\patterns"

REM — Copie fichiers racine
copy "launch.bat" "%BUILD_DIR%\launch.bat" >nul
copy "README-lmotor.md" "%BUILD_DIR%\README.md" >nul

REM — Création ZIP
echo [5/5] Creation du ZIP...
powershell -Command "Compress-Archive -Path '%BUILD_DIR%' -DestinationPath '%OUTPUT_ZIP%' -Force"

REM — Nettoyage
rmdir /s /q "%~dp0build"

echo.
if exist "%OUTPUT_ZIP%" (
  echo  ================================
  echo   OK : %RELEASE_NAME%.zip cree !
  echo   Envoie ce fichier a Lmotor.
  echo  ================================
  echo.
  explorer /select,"%OUTPUT_ZIP%"
) else (
  echo  ERREUR : le ZIP n a pas ete cree.
)
echo.
pause
