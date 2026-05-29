#Requires -Version 5.1
<#
.SYNOPSIS
  Entfernt orientdb-admin Verknüpfungen (Startmenü + Desktop).
  Lässt node_modules und .env in Ruhe — Code wird nicht angefasst.
#>
$ErrorActionPreference = 'Stop'

$ShortcutName = 'OrientDB Admin.lnk'
$paths = @(
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs' | ForEach-Object { Join-Path $_ $ShortcutName }),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) $ShortcutName)
)

$removed = 0
foreach ($p in $paths) {
  if (Test-Path $p) {
    Remove-Item $p -Force
    Write-Host "  ✓ entfernt: $p" -ForegroundColor Green
    $removed++
  }
}

if ($removed -eq 0) {
  Write-Host "  → keine Verknüpfungen gefunden." -ForegroundColor Yellow
} else {
  Write-Host ""
  Write-Host "  $removed Verknüpfung(en) entfernt. Repo und Dependencies bleiben unverändert." -ForegroundColor Cyan
}
