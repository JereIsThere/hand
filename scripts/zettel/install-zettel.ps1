#Requires -Version 5.1
<#
.SYNOPSIS
  Legt eine Startmenue-Verknuepfung fuer Zettel an (idempotent).
.DESCRIPTION
  Die Verknuepfung zeigt auf start-zettel.cmd, sodass die Sticky-Note
  ohne Konsolenfenster startet. Mit -Desktop zusaetzlich auf den Desktop.
  ASCII-only fuer PowerShell 5.1 ohne BOM.
.EXAMPLE
  .\install-zettel.ps1
.EXAMPLE
  .\install-zettel.ps1 -Desktop
#>
[CmdletBinding()]
param([switch]$Desktop)

$ErrorActionPreference = 'Stop'

$ScriptDir    = $PSScriptRoot
$Launcher     = Join-Path $ScriptDir 'start-zettel.cmd'
$ShortcutName = 'Zettel.lnk'
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

if (-not (Test-Path $Launcher)) { throw "start-zettel.cmd nicht gefunden neben install-zettel.ps1" }

function New-ZettelShortcut {
  param([string]$TargetDir)
  if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null }
  $lnk = Join-Path $TargetDir $ShortcutName
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($lnk)
  $s.TargetPath       = $Launcher
  $s.WorkingDirectory = $ScriptDir
  # Notiz-Icon aus shell32.dll
  $s.IconLocation     = "$env:SystemRoot\System32\shell32.dll,70"
  $s.Description      = 'Zettel -- always-on-top Sticky-Note'
  $s.WindowStyle      = 7  # minimiert (Launcher-Konsole bleibt unsichtbar)
  $s.Save()
  Write-Host "  [ok] Verknuepfung: $lnk" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Zettel -> Windows-Installer" -ForegroundColor Cyan
New-ZettelShortcut -TargetDir $StartMenuDir
if ($Desktop) { New-ZettelShortcut -TargetDir ([Environment]::GetFolderPath('Desktop')) }
Write-Host "  Fertig. Win-Taste druecken und 'Zettel' tippen." -ForegroundColor Cyan
Write-Host ""
