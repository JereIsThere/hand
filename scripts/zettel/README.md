# Zettel 📝

Eine einzige always-on-top Sticky-Note für Windows. Kein Multi-Note — es gibt genau **einen** Zettel. WPF via PowerShell, keine Installation nötig.

## Starten

```powershell
.\start-zettel.cmd
```

Oder Verknüpfung ins Startmenü legen:

```powershell
.\install-zettel.ps1            # Startmenü
.\install-zettel.ps1 -Desktop   # zusätzlich Desktop
```

Danach: Win-Taste → „Zettel" tippen → Enter.

## Bedienung

- **Verschieben:** an der gelben Titel-Leiste ziehen (Fenster ist randlos).
- **Größe:** unten rechts am Griff ziehen.
- **`pin`:** schaltet always-on-top um (Standard: an).
- **`x`:** schließt — der Text bleibt gespeichert.
- **Strg+S:** speichert sofort (sonst Autosave 800 ms nach der letzten Eingabe).

## Persistenz

Alles landet in `%APPDATA%\Zettel\`:

- `note.txt` — der Notiztext (UTF-8)
- `window.json` — Position + Größe

## Single Instance

Ein zweiter Start öffnet keinen zweiten Zettel, sondern holt den
bestehenden nach vorne (Mutex `Global\JereIsThere.Zettel.SingleInstance`).

## Test

```powershell
.\test-zettel.ps1
```

Prüft ASCII-only (PS-5.1-Kompatibilität), Parsing, XAML-Load und einen
Persistenz-Roundtrip — alles headless, ohne dass ein Fenster aufgeht.
