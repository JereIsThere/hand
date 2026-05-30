#Requires -Version 5.1
<#
.SYNOPSIS
  Installiert orientdb-admin als Startmenue-Eintrag (idempotent).
.DESCRIPTION
  Prueft Node.js, laeuft `npm install` wenn noetig, legt .env aus .env.example an
  falls noch keine existiert, und legt eine Startmenue-Verknuepfung an, die auf
  scripts/start.cmd zeigt. Mit -Desktop kommt zusaetzlich eine Desktop-Verknuepfung.

  Hinweis: dieses Script ist absichtlich ASCII-only damit es auch unter
  Windows PowerShell 5.1 ohne UTF-8-BOM zuverlaessig parst.
.EXAMPLE
  .\scripts\install.ps1
.EXAMPLE
  .\scripts\install.ps1 -Desktop
#>
[CmdletBinding()]
param(
  [switch]$Desktop
)

$ErrorActionPreference = 'Stop'

$ProjectRoot   = Split-Path -Parent $PSScriptRoot
$StartScript   = Join-Path $ProjectRoot 'scripts\start.cmd'
$ShortcutName  = 'OrientDB Admin.lnk'
$StartMenuDir  = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

Write-Host ""
Write-Host "  orientdb-admin -> Windows-Installer" -ForegroundColor Cyan
Write-Host "      Projektpfad: $ProjectRoot"
Write-Host ""

# --- Node-Check --------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js nicht gefunden. Installiere Node >= 18 von https://nodejs.org/ und versuche es nochmal."
}
$nodeVersion = (& node --version).TrimStart('v')
if ([version]$nodeVersion -lt [version]'18.0.0') {
  Write-Warning "Node $nodeVersion ist aelter als 18. Server bootet vermutlich nicht. Empfohlen: Node >= 18."
} else {
  Write-Host "  [ok] Node $nodeVersion" -ForegroundColor Green
}

# --- npm install (falls noetig) ---------------------------------------
$NodeModules = Join-Path $ProjectRoot 'node_modules'
if (-not (Test-Path $NodeModules)) {
  Write-Host "  [..] npm install laeuft..." -ForegroundColor Yellow
  Push-Location $ProjectRoot
  try {
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install fehlgeschlagen (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
  Write-Host "  [ok] Dependencies installiert" -ForegroundColor Green
} else {
  Write-Host "  [ok] node_modules vorhanden" -ForegroundColor Green
}

# --- .env (falls fehlt) ------------------------------------------------
$EnvPath = Join-Path $ProjectRoot '.env'
$EnvExample = Join-Path $ProjectRoot '.env.example'
if (-not (Test-Path $EnvPath)) {
  Copy-Item $EnvExample $EnvPath
  Write-Host "  [!]  .env neu aus .env.example angelegt -- bitte ORIENTDB_PASS, ORIENTDB_DB und ggf. SSH_HOST anpassen" -ForegroundColor Yellow
} else {
  Write-Host "  [ok] .env existiert" -ForegroundColor Green
}

# --- Shortcut(s) -------------------------------------------------------
function New-AdminShortcut {
  param([string]$TargetDir)

  if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null }
  $lnk = Join-Path $TargetDir $ShortcutName

  $WshShell = New-Object -ComObject WScript.Shell
  $Shortcut = $WshShell.CreateShortcut($lnk)
  $Shortcut.TargetPath       = $StartScript
  $Shortcut.WorkingDirectory = $ProjectRoot
  # Datenbank-Icon aus shell32.dll (Windows-Bordmittel)
  $Shortcut.IconLocation     = "$env:SystemRoot\System32\shell32.dll,13"
  $Shortcut.Description      = 'OrientDB Admin -- Schema, Records, Editor, Query'
  $Shortcut.WindowStyle      = 1  # normal
  $Shortcut.Save()
  Write-Host "  [ok] Verknuepfung: $lnk" -ForegroundColor Green
}

New-AdminShortcut -TargetDir $StartMenuDir
if ($Desktop) {
  New-AdminShortcut -TargetDir ([Environment]::GetFolderPath('Desktop'))
}

Write-Host ""
Write-Host "  Fertig. Im Startmenue nach 'OrientDB Admin' suchen oder Win-Taste druecken und tippen." -ForegroundColor Cyan
Write-Host ""
