#Requires -Version 5.1
<#
.SYNOPSIS
  Legt das Windows-Terminal-Fragment fuer "Die Hand - Vault" an.
.DESCRIPTION
  Windows Terminal liest Fragments automatisch aus
  %LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\<app>\*.json
  und zeigt sie als neue Profile im Dropdown.
  Das Vault-Profil oeffnet vault-cli.mjs direkt in einem neuen Terminal-Tab.
#>
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VaultCli    = Join-Path $ProjectRoot 'vault-cli.mjs'
$FragDir     = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\Fragments\hand'
$FragFile    = Join-Path $FragDir 'vault.json'

if (-not (Test-Path $FragDir)) {
  New-Item -ItemType Directory -Force -Path $FragDir | Out-Null
}

# Pfad mit Backslashes (Windows Terminal erwartet das)
$VaultCliWin = $VaultCli.Replace('/', '\')
$NodeExe     = (Get-Command node -ErrorAction SilentlyContinue)?.Source

if (-not $NodeExe) {
  Write-Warning "node.exe nicht gefunden — Fragment wird angelegt, setzt aber node im PATH voraus."
  $NodeExe = 'node'
}

$fragment = @"
{
  "profiles": [
    {
      "guid": "{a4b3c2d1-e5f6-7890-abcd-ef1234567890}",
      "name": "Die Hand · Vault",
      "commandline": "node \"$VaultCliWin\"",
      "startingDirectory": "$($ProjectRoot.Replace('\', '\\'))",
      "icon": "✋",
      "colorScheme": "One Half Dark",
      "font": {
        "face": "Cascadia Code",
        "size": 13
      },
      "tabTitle": "vault",
      "suppressApplicationTitle": true,
      "hidden": false
    }
  ]
}
"@

Set-Content -Path $FragFile -Value $fragment -Encoding utf8
Write-Host "  [ok] Windows-Terminal-Fragment: $FragFile" -ForegroundColor Green
Write-Host "  Windows Terminal neu starten -> 'Die Hand - Vault' im Dropdown." -ForegroundColor Cyan
