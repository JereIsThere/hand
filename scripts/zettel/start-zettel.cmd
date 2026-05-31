@echo off
:: Zettel launcher -- startet die Sticky-Note ohne sichtbare Konsole.
start "" /B powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0zettel.ps1"
