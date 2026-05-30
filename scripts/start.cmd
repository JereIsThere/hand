@echo off
:: orientdb-admin launcher (Windows)
:: doppelklickbar -- startet den Server und oeffnet den Browser.

title orientdb admin
cd /d "%~dp0\.."

:: Browser nach kurzem Delay oeffnen, damit Express sicher lauscht
start "" /B powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3737'"

node server.js

echo.
echo ---
echo Server beendet. Fenster bleibt offen damit du eventuelle Fehler sehen kannst.
pause
