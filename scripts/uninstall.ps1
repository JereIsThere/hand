#Requires -Version 5.1
<#
.SYNOPSIS
  Entfernt Die Hand Verknuepfungen (Startmenue + Desktop).
  Laesst node_modules und .env in Ruhe -- Code wird nicht angefasst.
  Raeumt auch den alten 'OrientDB Admin'-Namen mit auf.
#>
$ErrorActionPreference = 'Stop'

# aktueller Name + alter Legacy-Name (vor Umbenennung in "Die Hand")
$ShortcutNames = @('Die Hand.lnk', 'OrientDB Admin.lnk')
$dirs = @(
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
  ([Environment]::GetFolderPath('Desktop'))
)
$paths = foreach ($d in $dirs) { foreach ($n in $ShortcutNames) { Join-Path $d $n } }

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
