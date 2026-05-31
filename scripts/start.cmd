@echo off
:: Die Hand -- Launcher (Windows).
:: Doppelklickbar: startet den Server und oeffnet die App im App-Fenster.

title Die Hand
cd /d "%~dp0\.."

:: App im chromelosen Fenster oeffnen (wartet im Hintergrund auf den Server)
start "" /B powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-app.ps1"

node server.js

echo.
echo ---
echo Server beendet. Fenster bleibt offen damit du eventuelle Fehler sehen kannst.
pause
