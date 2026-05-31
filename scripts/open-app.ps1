#Requires -Version 5.1
<#
.SYNOPSIS
  Wartet bis der Hand-Server lauscht und oeffnet "Die Hand" im App-Fenster.
.DESCRIPTION
  Oeffnet localhost:3737 im chromelosen App-Modus (Edge -> Chrome -> Standardbrowser),
  damit sich die Web-Shell wie eine native Windows-Desktop-App anfuehlt: eigenes
  Fenster, eigener Taskleisten-Eintrag, keine Tabs/Adressleiste.
  Wird von start.cmd im Hintergrund aufgerufen.
#>
$ErrorActionPreference = 'SilentlyContinue'
$url = 'http://localhost:3737'

# Auf den Server warten (statt fixem Sleep) -- bis zu ~12s.
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1 | Out-Null
    break
  } catch {
    Start-Sleep -Milliseconds 400
  }
}

$candidates = @(
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($browser) {
  # --app = chromeloses Fenster (kein Tab, keine Adressleiste)
  Start-Process $browser -ArgumentList "--app=$url", "--window-size=1280,860"
} else {
  # Fallback: Standardbrowser (normaler Tab)
  Start-Process $url
}
