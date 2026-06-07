# Die Hand — für Claude

Persönliches Cockpit. Express.js-Backend, Vanilla-JS-Frontend, Electron-Wrapper.
Port 3737 (Web) · Electron-App (Desktop).

**Klammer-Repo:** Submodule von [JereIsThere/auge-framework](https://github.com/JereIsThere/auge-framework) — docker-compose, ADRs, Runbooks dort.

---

## Tabs (UI-Struktur)

| Tab | Status | Funktion |
|-----|--------|----------|
| **Sprecher** | bleibt | Chat mit Mode-Selector 📝🖼️🎬 + Modell-Dropdown via gehirn-API |
| **Funkner** | umbau `[impl-ready]` | Wird Claude-Code-inspiriertes Terminal-Fenster (Placeholder, keine Logik) |
| **Projekte** | bleibt | Roadmap-Cockpit, dann2-Integration per iframe |
| **Vault** | bleibt | Persönlicher Vault (Notizen, Snippets) via OrientDB |
| **Friends** | bleibt | Kontakte / Presence |
| **Über** | bleibt | App-Info, Update-Channel, Version |
| ~~OrientDB~~ | zieht zu gehirn-admin | Schema, Records, Query — nach Fertigstellung von gehirn-admin |
| ~~SSH-Tunnel~~ | zieht zu gehirn-admin | Tunnel-Manager — nach Fertigstellung von gehirn-admin |
| ~~Submissions~~ | zieht zu gehirn-admin | Auge-Themen-Pipeline — nach Fertigstellung von gehirn-admin |

> **Übergangsphase:** OrientDB, SSH-Tunnel und Submissions bleiben in hand
> bis gehirn-admin fertig ist. Dann werden sie dort weitergebaut und hier entfernt.

### Funkner-Tab (Umbau-Spec)

Aktuell: iframe-Embed auf `https://funkner.jeremias-groehl.de`.

Ziel: **Claude-Code-inspiriertes Terminal-Fenster** — visueller Placeholder ohne Logik.
- Dunkles Terminal-Look (analog Claude Code CLI)
- Eingabezeile unten mit Prompt-Symbol (`⚡ >`)
- Keine echte CLI-Anbindung — Output statisch / fake-animiert
- Sieht aus wie ein Agent-Interface, ist aber ein Design-Stub für spätere funkner-Integration
- Implementierung: impl-cli-Session, `public/tools/funkner.js` + Styles in `styles.css`

---

## Electron-Wrapper (bereits vorhanden)

```
electron/
  main.mjs      Hauptprozess: startet Express in-process, öffnet BrowserWindow
  preload.mjs   IPC-Bridge (contextBridge, sicher)
  splash.html   Splash-Screen beim Start
```

- `electron-updater` mit `autoUpdater` — Update-Kanal: `latest` (Prod) / `beta` (Dev)
- Dev-Client: `app.name = "Die Hand Dev"` via `electron-builder.dev.json`
- `.env` wird aus `userData/` geladen (gepackt) oder Projekt-Root (Dev)
- Single-Instance-Lock: zweite Instanz fokussiert das bestehende Fenster

**Electron starten (Dev):**
```bash
npm run electron        # oder: npx electron .
```

**Build:**
```bash
npm run build           # → dist/
```

> **Hinweis:** Der Electron-Wrapper ist Vorlage für `auge-framework/auge-app/`.
> Das Ziel ist, die Shell (main.mjs, preload.mjs, updater) in einen gemeinsamen
> Ordner zu extrahieren, den hand und gehirn-admin beide nutzen.
> ADR: [auge-framework/docs/adr/0005-auge-app.md](https://github.com/JereIsThere/auge-framework/blob/main/docs/adr/0005-auge-app.md)

---

## Dateistruktur

```
hand/
├── server.js               Express-Server (OrientDB-Proxy, TunnelManager, Submissions, Vault)
├── sprecher.js             Sprecher-Backend (KI-Calls via gehirn-API)
├── vault.js                Vault-Backend (OrientDB-Snippets)
├── auth.js                 Auth-Schicht (optional)
├── Dockerfile              Container für compose-Stack
├── electron/               Desktop-Wrapper (→ oben)
├── public/
│   ├── index.html          Sidebar-Shell
│   ├── styles.css
│   ├── app/                Shell-Init, Tool-Switching, Auth
│   ├── tools/
│   │   ├── sprecher.js     Sprecher-Tab
│   │   ├── funkner.js      Funkner-Tab (Placeholder → Claude-Code-UI)
│   │   ├── tunnels.js      SSH-Tunnel-Tab (→ gehirn-admin)
│   │   ├── submissions.js  Submissions-Tab (→ gehirn-admin)
│   │   ├── vault-ui.js     Vault-Tab
│   │   ├── friends.js      Friends-Tab
│   │   ├── embed.js        Iframe-Embed-Wrapper (Projekte)
│   │   └── ueber.js        Über-Tab (Version, Update-Channel)
│   ├── features/           OrientDB-Feature-Slices (→ gehirn-admin)
│   │   ├── schema.js
│   │   ├── records.js
│   │   ├── editor.js
│   │   ├── query.js
│   │   └── class-wizard.js
│   └── shared/
│       ├── api.js          OrientDB fetch-Wrapper
│       └── ui.js           DOM-Helper, toast
└── scripts/
    └── zettel/             Eigenständige WPF-Sticky-Note (Windows)
```

---

## Setup

```bash
git clone https://github.com/JereIsThere/hand.git
cd hand
npm install
cp .env.example .env     # ORIENTDB_PASS, GEHIRN_URL etc. setzen
npm start                # → http://localhost:3737
```

Via auge-framework compose (empfohlen für Vollstack):
```bash
docker compose up -d --build
```

---

## Wichtige Env-Vars

```
PORT=3737
ORIENTDB_URL=http://localhost:2480    # compose: http://orientdb:2480
ORIENTDB_USER=root
ORIENTDB_PASS=...                     # Pflicht
ORIENTDB_DB=auge

GEHIRN_URL=http://localhost:4000      # für Sprecher-Tab

N8N_BUILD_WEBHOOK=...                 # Submissions-Approve → n8n-Build
                                      # leer → kein Build, nur approved

SSH_HOST=                             # opt. managed Tunnel
SSH_USER=deploy
SSH_PORT=22
SSH_LOCAL_PORT=2480
SSH_REMOTE_HOST=localhost
SSH_REMOTE_PORT=2480
```

---

## API-Referenz (verbleibend in hand)

### Sprecher

| Methode | Pfad | Was |
|---------|------|-----|
| POST | `/api/sprecher/chat` | Proxy zu gehirn `/gen/text` mit SSE-Streaming |
| POST | `/api/sprecher/image` | Proxy zu gehirn `/gen/image` — wählt Modell per Dropdown |
| GET | `/api/sprecher/models` | Proxy zu gehirn `/models` (text + image, alle Provider) |

**Image-Modelle im Sprecher-Dropdown** — kommen aus gehirn `/models`, automatisch
verfügbar wenn der jeweilige Key gesetzt ist:

| Modell | Anbieter | Tier |
|--------|----------|------|
| grok-2-image-1212 | xAI | normal |
| flux-2-pro | Atlas Cloud | normal |
| imagen-4-ultra | Atlas Cloud | normal |
| ideogram-v3 | Atlas Cloud | normal |
| z-image-turbo | Atlas Cloud | cheap |
| seedream-5 | Atlas Cloud | normal |

Atlas Cloud Key: `ATLASCLOUD_API_KEY` in `.env` (→ gehirn/CLAUDE.md für API-Details).

### Vault

| Methode | Pfad | Was |
|---------|------|-----|
| GET | `/api/vault` | Alle Einträge |
| POST | `/api/vault` | Neuer Eintrag |
| DELETE | `/api/vault/:id` | Löschen |

### OrientDB-Proxy / Tunnels / Submissions

→ Bis zur Fertigstellung von gehirn-admin hier. Vollständige API-Doku:
in der bisherigen Doku erhalten, nach Migration in gehirn/CLAUDE.md.

---

## Architektur-Notizen

### Submissions-Flow (bleibt bis gehirn-admin fertig)

```
User → POST /api/submissions → OrientDB (pending)
Admin → POST /api/submissions/:rid/approve → OrientDB (approved) + N8N_BUILD_WEBHOOK
```

Runbook: [auge-framework/docs/submission-pipeline.md](https://github.com/JereIsThere/auge-framework/blob/main/docs/submission-pipeline.md)

---

## Sicherheitshinweise

- Hand lauscht auf `localhost` — **keine eigene Auth-Schicht für Admin-Tabs**. Nicht öffentlich exposen.
- `DELETE`/`PUT` auf Records: sofort, kein Undo.
- `tunnels.json` gitignored (enthält Hostnames).

---

## Offene Punkte

- `[impl-ready]` Funkner-Tab → Claude-Code-Placeholder UI (s. Spec oben)
- `[impl-ready]` OrientDB/SSH/Submissions → nach gehirn-admin migrieren, hier entfernen
- `[implementieren]` `buildRef` zurückschreiben (n8n-PR-URL in Submission-Vertex)
- `[implementieren]` Casual-User-Seite (Themen einreichen ohne Admin-Zugang)
- `[ausarbeiten]` auge-app: Electron-Shell aus hand extrahieren → ADR 0005

