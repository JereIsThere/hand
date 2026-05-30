#Requires -Version 5.1
<#
.SYNOPSIS
  Entfernt orientdb-admin Verknuepfungen (Startmenue + Desktop).
  Laesst node_modules und .env in Ruhe -- Code wird nicht angefasst.
#>
$ErrorActionPreference = 'Stop'

$ShortcutName = 'OrientDB Admin.lnk'
$paths = @(
  (Join-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') $ShortcutName),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) $ShortcutName)
)

$removed = 0
foreach ($p in $paths) {
  if (Test-Path $p) {
    Remove-Item $p -Force
    Write-Host "  [ok] entfernt: $p" -ForegroundColor Green
    $removed++
  }
}

if ($removed -eq 0) {
  Write-Host "  [--] keine Verknuepfungen gefunden." -ForegroundColor Yellow
} else {
  Write-Host ""
  Write-Host "  $removed Verknuepfung(en) entfernt. Repo und Dependencies bleiben unveraendert." -ForegroundColor Cyan
}
