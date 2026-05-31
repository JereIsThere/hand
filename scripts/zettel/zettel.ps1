#Requires -Version 5.1
<#
.SYNOPSIS
  Zettel -- eine einzige always-on-top Sticky-Note fuer Windows.
.DESCRIPTION
  WPF-Fenster, randlos aber von allen Seiten + Ecken resizable, immer im
  Vordergrund. Markdown-Toggle (Edit <-> gerenderte Vorschau). Text und
  Fenstergeometrie werden in %APPDATA%\Zettel\ persistiert. Nur EINE
  Instanz (Mutex) -- ein zweiter Start fokussiert die bestehende.

  Bewusst ASCII-only damit es unter Windows PowerShell 5.1 ohne UTF-8-BOM
  zuverlaessig parst. Nicht-ASCII Anzeigezeichen werden via [char]0xXXXX
  zur Laufzeit erzeugt.
.NOTES
  Start ueber start-zettel.cmd (versteckt die Konsole).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# --- Single-Instance via Mutex ----------------------------------------
# Im Test-Modus eigener Mutex-Name, damit eine echte laufende Instanz
# den headless Smoke-Test nicht blockiert.
$mutexName = 'Global\JereIsThere.Zettel.SingleInstance'
if ($env:ZETTEL_TEST) { $mutexName += '.' + [guid]::NewGuid().ToString('N') }

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
if (-not $createdNew) {
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
$dataDir  = Join-Path $env:APPDATA 'Zettel'
$notePath = Join-Path $dataDir 'note.txt'
$geomPath = Join-Path $dataDir 'window.json'
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

# Resize-Hook fuer randlose Fenster: WM_NCHITTEST liefert die Border-Zonen,
# damit Windows von allen Kanten + Ecken Groessenaenderung zulaesst.
Add-Type -ReferencedAssemblies WindowsBase, PresentationCore -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Interop;
public class ZettelResize {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  const int WM_NCHITTEST = 0x0084;
  const int HTLEFT=10, HTRIGHT=11, HTTOP=12, HTTOPLEFT=13, HTTOPRIGHT=14,
            HTBOTTOM=15, HTBOTTOMLEFT=16, HTBOTTOMRIGHT=17;
  int border;
  public ZettelResize(int b) { border = b; }
  public void Attach(IntPtr handle) {
    HwndSource src = HwndSource.FromHwnd(handle);
    if (src != null) src.AddHook(new HwndSourceHook(Hook));
  }
  IntPtr Hook(IntPtr hwnd, int msg, IntPtr w, IntPtr l, ref bool handled) {
    if (msg == WM_NCHITTEST) {
      long lp = l.ToInt64();
      int x = (short)(lp & 0xFFFF);
      int y = (short)((lp >> 16) & 0xFFFF);
      RECT r;
      if (!GetWindowRect(hwnd, out r)) return IntPtr.Zero;
      bool left = x < r.Left + border, right = x >= r.Right - border;
      bool top = y < r.Top + border, bottom = y >= r.Bottom - border;
      int ht = 0;
      if      (top && left)     ht = HTTOPLEFT;
      else if (top && right)    ht = HTTOPRIGHT;
      else if (bottom && left)  ht = HTBOTTOMLEFT;
      else if (bottom && right) ht = HTBOTTOMRIGHT;
      else if (left)            ht = HTLEFT;
      else if (right)           ht = HTRIGHT;
      else if (top)             ht = HTTOP;
      else if (bottom)          ht = HTBOTTOM;
      if (ht != 0) { handled = true; return new IntPtr(ht); }
    }
    return IntPtr.Zero;
  }
}
"@

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
    <Grid Margin="4">
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
      </Grid.RowDefinitions>

      <Grid Grid.Row="0" Name="TitleBar" Background="#F0DE82">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <TextBlock Grid.Column="0" Text="zettel" Margin="10,5,0,5"
                   FontFamily="Consolas" FontSize="11" Foreground="#8A6D2B"
                   VerticalAlignment="Center"/>
        <Button Grid.Column="1" Name="MdBtn" Content="md" Width="38" Height="22"
                Margin="0,3,2,3" FontSize="10" FontFamily="Consolas"
                Background="Transparent" BorderThickness="0" Foreground="#8A6D2B"
                ToolTip="Markdown-Vorschau umschalten" Cursor="Hand"/>
        <Button Grid.Column="2" Name="PinBtn" Content="pin" Width="38" Height="22"
                Margin="0,3,2,3" FontSize="10" FontFamily="Consolas"
                Background="Transparent" BorderThickness="0" Foreground="#8A6D2B"
                ToolTip="Always-on-top umschalten" Cursor="Hand"/>
        <Button Grid.Column="3" Name="CloseBtn" Content="x" Width="26" Height="22"
                Margin="0,3,5,3" FontSize="12" FontFamily="Consolas"
                Background="Transparent" BorderThickness="0" Foreground="#8A6D2B"
                ToolTip="Schliessen (Text bleibt gespeichert)" Cursor="Hand"/>
      </Grid>

      <Grid Grid.Row="1">
        <TextBox Name="Note"
                 Margin="6,6,6,14"
                 Background="Transparent" BorderThickness="0"
                 Foreground="#3A2F1F" CaretBrush="#3A2F1F"
                 FontFamily="Segoe UI" FontSize="14"
                 TextWrapping="Wrap" AcceptsReturn="True" AcceptsTab="True"
                 VerticalScrollBarVisibility="Auto"
                 VerticalContentAlignment="Top"/>
        <FlowDocumentScrollViewer Name="Preview"
                 Margin="2,4,2,14" Visibility="Collapsed"
                 IsToolBarVisible="False" Background="Transparent"
                 VerticalScrollBarVisibility="Auto"/>
      </Grid>
    </Grid>
  </Border>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$win = [Windows.Markup.XamlReader]::Load($reader)

$note     = $win.FindName('Note')
$preview  = $win.FindName('Preview')
$titleBar = $win.FindName('TitleBar')
$closeBtn = $win.FindName('CloseBtn')
$pinBtn   = $win.FindName('PinBtn')
$mdBtn    = $win.FindName('MdBtn')

$note.Text = $noteText

if ($geom -and $geom.width -and $geom.height) {
  $win.Width  = [double]$geom.width
  $win.Height = [double]$geom.height
  if ($geom.left -ne $null -and $geom.top -ne $null) {
    $win.WindowStartupLocation = 'Manual'
    $win.Left = [double]$geom.left
    $win.Top  = [double]$geom.top
  }
}

# --- Helpers -----------------------------------------------------------
$brushConv = New-Object System.Windows.Media.BrushConverter
function New-Brush([string]$hex) { $brushConv.ConvertFromString($hex) }
function New-Run([string]$text)  { New-Object System.Windows.Documents.Run($text) }

# Inline-Markdown (**bold**, *italic*, `code`) in einen Paragraph fuellen.
function Add-Inlines($para, [string]$text) {
  $rx = [regex]'(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|([^*`]+)'
  foreach ($m in $rx.Matches($text)) {
    if ($m.Groups[2].Success) {
      $r = New-Run $m.Groups[2].Value; $r.FontWeight = 'Bold'
    } elseif ($m.Groups[4].Success) {
      $r = New-Run $m.Groups[4].Value; $r.FontStyle = 'Italic'
    } elseif ($m.Groups[6].Success) {
      $r = New-Run $m.Groups[6].Value; $r.FontFamily = 'Consolas'; $r.Background = New-Brush '#EADFA8'
    } else {
      $r = New-Run $m.Groups[7].Value
    }
    $para.Inlines.Add($r)
  }
}

# Markdown-Text -> FlowDocument. Unterstuetzt: # ## ### Headings,
# - / * Bullets, ``` Codebloecke, Inline bold/italic/code, Absaetze.
function Build-Preview {
  $doc = New-Object System.Windows.Documents.FlowDocument
  $doc.FontFamily = New-Object System.Windows.Media.FontFamily('Segoe UI')
  $doc.FontSize   = 14
  $doc.Foreground = New-Brush '#3A2F1F'
  $doc.PagePadding = New-Object System.Windows.Thickness(6)
  $bullet = [char]0x2022

  $lines = $note.Text -split "`r?`n"
  $inCode = $false
  $codeLines = New-Object System.Collections.Generic.List[string]

  function Flush-Code($document, $buf) {
    if ($buf.Count -eq 0) { return }
    $p = New-Object System.Windows.Documents.Paragraph
    $p.FontFamily = New-Object System.Windows.Media.FontFamily('Consolas')
    $p.FontSize = 12
    $p.Background = (New-Brush '#EADFA8')
    $p.Padding = New-Object System.Windows.Thickness(6)
    $p.Inlines.Add((New-Run ([string]::Join([Environment]::NewLine, $buf))))
    $document.Blocks.Add($p)
  }

  foreach ($line in $lines) {
    if ($line -match '^\s*```') {
      if ($inCode) { Flush-Code $doc $codeLines; $codeLines.Clear(); $inCode = $false }
      else { $inCode = $true }
      continue
    }
    if ($inCode) { $codeLines.Add($line); continue }

    if ($line -match '^(#{1,3})\s+(.*)$') {
      $level = $matches[1].Length
      $p = New-Object System.Windows.Documents.Paragraph
      $p.FontWeight = 'Bold'
      $p.FontSize = @(20, 17, 15)[$level - 1]
      $p.Margin = New-Object System.Windows.Thickness(0, 6, 0, 2)
      Add-Inlines $p $matches[2]
      $doc.Blocks.Add($p)
      continue
    }
    if ($line -match '^\s*[-*]\s+(.*)$') {
      $p = New-Object System.Windows.Documents.Paragraph
      $p.Margin = New-Object System.Windows.Thickness(10, 0, 0, 0)
      $p.Inlines.Add((New-Run ("$bullet ")))
      Add-Inlines $p $matches[1]
      $doc.Blocks.Add($p)
      continue
    }
    if ($line.Trim() -eq '') { continue }

    $p = New-Object System.Windows.Documents.Paragraph
    $p.Margin = New-Object System.Windows.Thickness(0, 0, 0, 4)
    Add-Inlines $p $line
    $doc.Blocks.Add($p)
  }
  if ($inCode) { Flush-Code $doc $codeLines }

  $preview.Document = $doc
}

# --- Verhalten ---------------------------------------------------------
$titleBar.Add_MouseLeftButtonDown({ $win.DragMove() })

$pinBtn.Add_Click({
  $win.Topmost = -not $win.Topmost
  $pinBtn.Content = if ($win.Topmost) { 'pin' } else { 'unpin' }
})

$script:previewing = $false
$mdBtn.Add_Click({
  $script:previewing = -not $script:previewing
  if ($script:previewing) {
    Build-Preview
    $note.Visibility = 'Collapsed'
    $preview.Visibility = 'Visible'
    $mdBtn.Content = 'edit'
  } else {
    $preview.Visibility = 'Collapsed'
    $note.Visibility = 'Visible'
    $mdBtn.Content = 'md'
    $note.Focus() | Out-Null
  }
})

function Save-Note {
  try { [System.IO.File]::WriteAllText($notePath, $note.Text, [System.Text.UTF8Encoding]::new($false)) } catch {}
}
function Save-Geom {
  try {
    $g = @{ left = [int]$win.Left; top = [int]$win.Top; width = [int]$win.Width; height = [int]$win.Height }
    ($g | ConvertTo-Json -Compress) | Set-Content -Path $geomPath -Encoding UTF8
  } catch {}
}

$debounce = New-Object System.Windows.Threading.DispatcherTimer
$debounce.Interval = [TimeSpan]::FromMilliseconds(800)
$debounce.Add_Tick({ $debounce.Stop(); Save-Note })
$note.Add_TextChanged({ $debounce.Stop(); $debounce.Start() })

$closeBtn.Add_Click({ $win.Close() })

$win.Add_KeyDown({
  param($s, $e)
  if ($e.Key -eq 'S' -and ([System.Windows.Input.Keyboard]::Modifiers -band 'Control')) {
    Save-Note; $e.Handled = $true
  }
})

$win.Add_Closing({ Save-Note; Save-Geom })
$win.Add_ContentRendered({ $note.Focus() | Out-Null })

# Resize-Hook anhaengen sobald das HWND existiert.
$win.Add_SourceInitialized({
  $helper = New-Object System.Windows.Interop.WindowInteropHelper($win)
  $script:resizer = New-Object ZettelResize(8)
  $script:resizer.Attach($helper.Handle)
})

# --- Test-Hook ---------------------------------------------------------
if ($env:ZETTEL_TEST) {
  if (-not $win)     { throw 'Window konnte nicht aus XAML geladen werden' }
  if (-not $note)    { throw 'Note-TextBox nicht gefunden' }
  if (-not $preview) { throw 'Preview-Viewer nicht gefunden' }
  $note.Text = "# Titel`n`nText mit **bold** und *italic* und ``code``.`n`n- Punkt eins`n- Punkt zwei"
  Build-Preview
  if (-not $preview.Document -or $preview.Document.Blocks.Count -lt 3) {
    throw 'Build-Preview hat keine sinnvolle FlowDocument-Struktur erzeugt'
  }
  Save-Note; Save-Geom
  if (-not (Test-Path $notePath)) { throw 'Save-Note hat keine Datei geschrieben' }
  if (-not ('ZettelResize' -as [type])) { throw 'ZettelResize-Typ nicht kompiliert' }
  Write-Host 'ZETTEL_TEST ok'
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
  return
}

# --- Anzeigen ----------------------------------------------------------
[void]$win.ShowDialog()

try { $mutex.ReleaseMutex() } catch {}
$mutex.Dispose()
