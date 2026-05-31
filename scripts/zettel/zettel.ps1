#Requires -Version 5.1
<#
.SYNOPSIS
  Zettel -- eine einzige always-on-top Sticky-Note fuer Windows.
.DESCRIPTION
  WPF-Fenster, randlos aber resizable, immer im Vordergrund. Text und
  Fenstergeometrie werden in %APPDATA%\Zettel\ persistiert. Es gibt nur
  EINE Instanz (Mutex) -- ein zweiter Start fokussiert die bestehende.

  Bewusst ASCII-only damit es unter Windows PowerShell 5.1 ohne UTF-8-BOM
  zuverlaessig parst.
.NOTES
  Start ueber start-zettel.cmd (versteckt die Konsole).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# --- Single-Instance via Mutex ----------------------------------------
$mutexName = 'Global\JereIsThere.Zettel.SingleInstance'
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
if (-not $createdNew) {
  # Schon offen -- vorhandenes Fenster nach vorne holen.
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
}
"@
  $h = [Win32]::FindWindow($null, 'Zettel')
  if ($h -ne [IntPtr]::Zero) {
    [Win32]::ShowWindow($h, 9) | Out-Null   # SW_RESTORE
    [Win32]::SetForegroundWindow($h) | Out-Null
  }
  return
}

# --- Persistenz-Pfade --------------------------------------------------
$dataDir   = Join-Path $env:APPDATA 'Zettel'
$notePath  = Join-Path $dataDir 'note.txt'
$geomPath  = Join-Path $dataDir 'window.json'
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }

$noteText = ''
if (Test-Path $notePath) {
  $noteText = [System.IO.File]::ReadAllText($notePath, [System.Text.Encoding]::UTF8)
}

$geom = $null
if (Test-Path $geomPath) {
  try { $geom = Get-Content -Raw $geomPath | ConvertFrom-Json } catch { $geom = $null }
}

# --- WPF ---------------------------------------------------------------
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

# Warmes Haftnotiz-Gelb, passend zur "codex"-Aesthetik von Die Hand.
[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Zettel"
        Width="280" Height="300"
        MinWidth="160" MinHeight="120"
        WindowStyle="None"
        ResizeMode="CanResizeWithGrip"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="True"
        WindowStartupLocation="CenterScreen">
  <Border Background="#F7E9A0" CornerRadius="6" BorderBrush="#E0CE78" BorderThickness="1">
    <Border.Effect>
      <DropShadowEffect BlurRadius="14" ShadowDepth="3" Opacity="0.35" Color="#5A4A1F"/>
    </Border.Effect>
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
      </Grid.RowDefinitions>

      <!-- Titel-Leiste: Drag-Griff + Pin + Schliessen -->
      <Grid Grid.Row="0" Name="TitleBar" Background="#F0DE82">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <TextBlock Grid.Column="0" Text="zettel" Margin="10,5,0,5"
                   FontFamily="Consolas" FontSize="11" Foreground="#8A6D2B"
                   VerticalAlignment="Center"/>
        <Button Grid.Column="1" Name="PinBtn" Content="pin" Width="34" Height="22"
                Margin="0,3,2,3" FontSize="10" FontFamily="Consolas"
                Background="Transparent" BorderThickness="0" Foreground="#8A6D2B"
                ToolTip="Always-on-top umschalten" Cursor="Hand"/>
        <Button Grid.Column="2" Name="CloseBtn" Content="x" Width="26" Height="22"
                Margin="0,3,5,3" FontSize="12" FontFamily="Consolas"
                Background="Transparent" BorderThickness="0" Foreground="#8A6D2B"
                ToolTip="Schliessen (Text bleibt gespeichert)" Cursor="Hand"/>
      </Grid>

      <!-- Notiz-Text -->
      <TextBox Grid.Row="1" Name="Note"
               Margin="8,6,8,14"
               Background="Transparent" BorderThickness="0"
               Foreground="#3A2F1F" CaretBrush="#3A2F1F"
               FontFamily="Segoe UI" FontSize="14"
               TextWrapping="Wrap" AcceptsReturn="True" AcceptsTab="True"
               VerticalScrollBarVisibility="Auto"
               VerticalContentAlignment="Top"/>
    </Grid>
  </Border>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$win = [Windows.Markup.XamlReader]::Load($reader)

$note     = $win.FindName('Note')
$titleBar = $win.FindName('TitleBar')
$closeBtn = $win.FindName('CloseBtn')
$pinBtn   = $win.FindName('PinBtn')

$note.Text = $noteText

# Fenstergeometrie wiederherstellen (falls vorhanden + on-screen)
if ($geom -and $geom.width -and $geom.height) {
  $win.Width  = [double]$geom.width
  $win.Height = [double]$geom.height
  if ($geom.left -ne $null -and $geom.top -ne $null) {
    $win.WindowStartupLocation = 'Manual'
    $win.Left = [double]$geom.left
    $win.Top  = [double]$geom.top
  }
}

# --- Verhalten ---------------------------------------------------------
# Drag: Klick auf die Titel-Leiste verschiebt das Fenster.
$titleBar.Add_MouseLeftButtonDown({ $win.DragMove() })

# Pin-Toggle
$pinBtn.Add_Click({
  $win.Topmost = -not $win.Topmost
  $pinBtn.Content = if ($win.Topmost) { 'pin' } else { 'unpin' }
  $pinBtn.Foreground = if ($win.Topmost) {
    [Windows.Media.BrushConverter]::new().ConvertFrom('#8A6D2B')
  } else {
    [Windows.Media.BrushConverter]::new().ConvertFrom('#B0A074')
  }
})

function Save-Note {
  try { [System.IO.File]::WriteAllText($notePath, $note.Text, [System.Text.UTF8Encoding]::new($false)) } catch {}
}

function Save-Geom {
  try {
    $g = @{
      left   = [int]$win.Left
      top    = [int]$win.Top
      width  = [int]$win.Width
      height = [int]$win.Height
    }
    ($g | ConvertTo-Json -Compress) | Set-Content -Path $geomPath -Encoding UTF8
  } catch {}
}

# Autosave: 800ms nach der letzten Tastatureingabe
$debounce = New-Object System.Windows.Threading.DispatcherTimer
$debounce.Interval = [TimeSpan]::FromMilliseconds(800)
$debounce.Add_Tick({ $debounce.Stop(); Save-Note })
$note.Add_TextChanged({ $debounce.Stop(); $debounce.Start() })

$closeBtn.Add_Click({ $win.Close() })

# Esc fokussiert nichts Boeses; Strg+S speichert sofort.
$win.Add_KeyDown({
  param($s, $e)
  if ($e.Key -eq 'S' -and ([System.Windows.Input.Keyboard]::Modifiers -band 'Control')) {
    Save-Note; $e.Handled = $true
  }
})

# Beim Schliessen final speichern + Mutex freigeben
$win.Add_Closing({
  Save-Note
  Save-Geom
})

$win.Add_ContentRendered({ $note.Focus() | Out-Null })

# --- Test-Hook ---------------------------------------------------------
# Bei gesetztem $env:ZETTEL_TEST wird das Fenster gebaut + die Persistenz
# einmal durchgespielt, aber nicht angezeigt. Fuer headless Smoke-Tests.
if ($env:ZETTEL_TEST) {
  if (-not $win)  { throw 'Window konnte nicht aus XAML geladen werden' }
  if (-not $note) { throw 'Note-TextBox nicht gefunden' }
  Save-Note
  Save-Geom
  if (-not (Test-Path $notePath)) { throw 'Save-Note hat keine Datei geschrieben' }
  Write-Host 'ZETTEL_TEST ok'
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
  return
}

# --- Anzeigen ----------------------------------------------------------
[void]$win.ShowDialog()

# Cleanup
try { $mutex.ReleaseMutex() } catch {}
$mutex.Dispose()
