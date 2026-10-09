@echo off
rem Spusti Stocks Analyzer. Prohlizec se otevre sam, jakmile server nabehne.
cd /d "%~dp0"

rem Balik pro jinou platformu nema node.exe (macOS a Linux maji runtime\node),
rem nebo ma node.exe pro jiny procesor. Bez teto kontroly skonci obskurni
rem hlaskou "is not recognized as an internal or external command".
if not exist "%~dp0runtime\node.exe" goto spatny_balik
"%~dp0runtime\node.exe" -v >nul 2>&1 || goto spatny_balik

"%~dp0runtime\node.exe" "%~dp0tools\start.mjs"
if errorlevel 1 (
  echo.
  echo Neco se pokazilo. Okno zustava otevrene, at je videt chyba.
  pause
)
exit /b

:spatny_balik
echo.
echo Tenhle balik neni pro Windows na tomhle pocitaci.
echo Pro Windows je potreba soubor, ktery konci na  -win-x64.zip
echo (na pocitacich s procesorem ARM  -win-arm64.zip).
echo Pro jakou platformu je tento balik, je napsane v souboru verze.json ("target").
echo.
pause
exit /b 1
