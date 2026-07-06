# Changelog — Die Hand

Alle nennenswerten Änderungen werden hier dokumentiert.  
Format: [Semantic Versioning](https://semver.org/lang/de/) — `MAJOR.MINOR.PATCH`.  
Betas laufen als `X.Y.Z-beta.N` im `dev`-Update-Channel.

---

## [Unreleased]

> Noch keine Änderungen.

---

## [1.2.0] — 2026-07-06

### Hinzugefügt
- **Capture-API** — `POST /api/capture` für Roh-Einträge aus der Auge-App; `GET /api/capture` mit `since`-Cursor, `GET /api/capture/search` mit semantischer Suche (Embedding via gehirn, Fallback LIKE)
- **Roadmaps-Tab** — Projektkarten mit Milestones + Tasks (#44); vertikales Milestone-Timeline-Layout (#46); GitHub-backed View: `roadmap.REPO.md` read + Checkbox-Toggle (#45); Milestone-Sortierung + Descriptions (#49)
- **Roadmap-Integration ADRs** — Au (Knowledge-Pipeline M1-M2), Zettel+Tafel M3, auge-app Launcher M4 (#50)
- **Capure-Auth** — `GEHIRN_API_KEY` Wiring + `gehirnHeaders()` Helper (ADR 0016, #51)
- **Dynamische Versionsnummer** — `GET /api/version` liest aus `package.json`; Sidebar-Label folgt automatisch jedem `npm version`-Bump
- **Update-Notification** — Windows-style Toast (rechts unten, slide-in):
  - Electron: IPC-Events von `electron-updater` (`available → downloading → ready`)
  - Dev (`npm start`): `GET /api/updates/check` → GitHub-Releases-API, manuell per Rechtsklick
  - Rechtsklick auf Badge (Electron): Channel-Wechsel `latest ↔ beta`
- **sprecher: Atlas Cloud Image-Modelle** — Flux, Imagen, Ideogram, Seedream, Z-Image im Mode-Selector
- **sprecher: No-Keys-State** — sauberes Feedback statt unsichtbarer leerer Dropdowns; Setup-CTA direkt in der Topbar
- **sprecher: Inline-Titelbearbeitung** — kein `prompt()` mehr; Klick öffnet `<input>` in-place
- **sprecher: Custom Confirm** — Session löschen: 2-Klick-Pattern statt `confirm()`
- **sprecher: System-Prompt-Panel** — ⚙-Button in Topbar, debounced autosave, per Session persistiert
- **Setup-Wizard: OpenAI + Gemini Keys** — `OPENAI_API_KEY` + `GEMINI_API_KEY` konfigurierbar
- **Dev-Client** — `Die Hand Dev` als separater Electron-Build (anderer Name, eigenes Icon, eigener Channel)

### Geändert
- sprecher Textarea: auto-resize auch auf `input`-Event (war nur `keydown`)
- sprecher Platzhalter: `/image [prompt]`-Hinweis entfernt (Mode-Selector macht ihn obsolet)
- submission-Build direkt in hand, n8n-Workflow abgelöst
- CI: `notify-framework`-Workflow bei main-Push (#8)

### Behoben
- Roadmaps: private Repos (gehirn, funkner) wurden nicht geladen (#47)
- `ATLAS-` Prefix für Atlas Cloud Model-IDs korrigiert
- Dev-Installer wird jetzt mitgebaut und hochgeladen

---

## [1.1.0] — 2026-06-03

### Hinzugefügt
- **Multi-Provider KI direkt in hand** — Claude (Text + Vision), Grok (Text), Grok-Image (Bildgenerierung); Keys aus Vault/Setup; Modell-Auswahl + Modus (Text/Bild/Video) im Chat
- **Freunde können sprecher nutzen** — Routing-Bug behoben (war Admin-only)

### Geändert
- n8n-Webhooks entfernt — KI-API-Calls direkt in `sprecher.js`

### Behoben
- Kritischer Syntaxfehler in sprecher, der den Chat-Tab komplett lahmlegte

### Betas
| Tag | Was |
|-----|-----|
| `v1.1.0-beta.4` | Erster funktionierender Multimodell-sprecher |
| `v1.1.0-beta.5` | Freunde-Routing-Fix |
| `v1.1.0-beta.7` | Stabilisierung vor Release |

---

## [1.0.0] — 2026-06-02

Erster stabiler Major-Release.

### Betas
| Tag | Was |
|-----|-----|
| `v1.0.0-beta.1` | Erste vollständige Feature-Basis |
| `v1.0.0-beta.3` | Auth + Rollen-Fixes |

---

## [0.9.3] — 2026-06-02

Patch-Serie nach v0.9.0.

---

## [0.9.2] — 2026-06-02

Patch.

---

## [0.9.1] — 2026-06-02

Patch.

---

## [0.9.0] — 2026-06-02

### Hinzugefügt
- **Splash-Screen** — Ladeanimation beim Electron-Start mit Status-Text; kein schwarzes Fenster mehr
- **Update-Channel-Toggle** — im Über-Tool (Desktop): `latest` (stabil) ↔ `beta` (Pre-Releases)
- **Auto-Update via nsis-web** — Diff-basiert, schneller; `latest.yml` im Release → Update-Mechanismus aktiv

### Geändert
- DevTools per F12 / Ctrl+Shift+I in der Desktop-App; öffnen sich automatisch bei Lade-Fehlern

---

## [0.8.2] — 2026-06-02

### Behoben
- Gepackte App zeigte schwarzes Fenster — `electron-builder`-`files`-Whitelist hatte Server-Module und `node_modules` nicht gepackt; `server.js` crashte beim Import

---

## [0.8.1] — 2026-06-02

### Behoben
- Desktop-App startete nicht (`SyntaxError: Named export 'autoUpdater' not found`) — `electron-updater` ist CommonJS, jetzt korrekt als Default-Import

---

## [0.8.0] — 2026-06-02

### Hinzugefügt
- **Invite-Links** — Freunde per Link einladen
- **Profil-Menü** — Avatar, Name, Rolle, Abmelden; Popup wie bei Claude
- **Roadmap / Über** — eigene Sektion in der Sidebar
- **Auto-Update** — `electron-updater` grundlegend integriert

---

## [0.7.0] — 2026-06-01

Erster öffentlicher Release.

### Hinzugefügt
- **sprecher** — Chat-Tool (damals noch n8n-Webhook-basiert)
- **Vault** — AES-256-GCM verschlüsselter Secret-Speicher in OrientDB
- **AI Shell** — Haiku-basierte Shell-Log-Analyse
