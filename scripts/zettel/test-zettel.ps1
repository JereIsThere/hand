#Requires -Version 5.1
<#
.SYNOPSIS
  Smoke-Test fuer Zettel: ASCII-only, Parse, XAML-Load, Persistenz-Roundtrip.
  Exit-Code 0 = alles gruen, sonst Anzahl der Fehler.
#>
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$fail = 0
function Ok($m)   { Write-Host "  [ok] $m" -ForegroundColor Green }
function Bad($m)  { Write-Host "  [XX] $m" -ForegroundColor Red; $script:fail++ }

# 1) ASCII-only (PS 5.1 ohne BOM liest sonst falsch)
foreach ($f in @('zettel.ps1','install-zettel.ps1','start-zettel.cmd','test-zettel.ps1')) {
  $p = Join-Path $dir $f
  $bytes = [System.IO.File]::ReadAllBytes($p)
  $nonAscii = ($bytes | Where-Object { $_ -gt 127 }).Count
  if ($nonAscii -eq 0) { Ok "$f ist ASCII-only" } else { Bad "$f hat $nonAscii Nicht-ASCII-Bytes" }
}

# 2) Parse-Check der ps1-Dateien
foreach ($f in @('zettel.ps1','install-zettel.ps1')) {
  $p = Join-Path $dir $f
  try { [scriptblock]::Create((Get-Content -Raw $p)) | Out-Null; Ok "$f parst" }
  catch { Bad "$f Parse-Fehler: $($_.Exception.Message)" }
}

# 3) XAML-Load + Persistenz-Roundtrip via Test-Hook (in eigener PS-Instanz,
#    damit Mutex/WPF die aktuelle Session nicht stoeren)
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("zettel_test_" + [guid]::NewGuid())
$env:APPDATA_BACKUP = $env:APPDATA
try {
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -Command {
    param($script, $fakeAppData)
    $env:APPDATA = $fakeAppData
    $env:ZETTEL_TEST = '1'
    New-Item -ItemType Directory -Force -Path $fakeAppData | Out-Null
    & $script
  } -args (Join-Path $dir 'zettel.ps1'), $tmp 2>&1
  if ($out -match 'ZETTEL_TEST ok') {
    Ok "XAML-Load + Persistenz-Roundtrip"
    $noteFile = Join-Path $tmp 'Zettel\note.txt'
    if (Test-Path $noteFile) { Ok "note.txt geschrieben" } else { Bad "note.txt fehlt" }
  } else {
    Bad "Test-Hook fehlgeschlagen: $out"
  }
} finally {
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

Write-Host ""
if ($fail -eq 0) { Write-Host "  Alle Checks gruen." -ForegroundColor Green }
else { Write-Host "  $fail Fehler." -ForegroundColor Red }
exit $fail
