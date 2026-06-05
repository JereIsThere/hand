# Die Hand — für Claude

Tool-Management-Shell und Admin-Tool für das Auge-Ökosystem. Express.js-Backend,
Vanilla-JS-Frontend. Lauscht auf Port 3737.

**Klammer-Repo:** Dieses Repo ist ein Submodule von [JereIsThere/auge-framework](https://github.com/JereIsThere/auge-framework), dem Umbrella-Repo (docker-compose, ADRs, Runbooks). Architektur-Entscheidungen und Submission-Pipeline-Runbook dort.

---

## Was die Hand tut

| Tool (Tab in der UI) | Funktion |
|----------------------|----------|
| **OrientDB** | Schema-Browser, Records-Tabelle, Editor (typisiert + Raw-JSON), Klassen-Wizard, SQL/Gremlin-Konsole |
| **SSH-Tunnel** | Tunnel-Manager: managed (aus `.env`) + unmanaged (aus UI) |
| **Auge-Submissions** | Themen-Vorschläge für auge listen, genehmigen (→ n8n-Build-Webhook) oder ablehnen |
| **Projects / Funkner** | Externe Seiten per iframe eingebettet (lazy, mit X-Frame-Fallback) |

Daneben: **Zettel** (`scripts/zettel/`) — eigenständige Windows-Sticky-Note (WPF/PowerShell), nicht Teil der Web-Shell.

---

## Dateistruktur

```
hand/
├── server.js                 Express-Server (OrientDB-Proxy, TunnelManager, Submissions)
├── Dockerfile                Container für auge-framework docker-compose
├── .env.example
├── package.json
├── public/
│   ├── index.html            Sidebar-Shell mit Tool-Sections
│   ├── styles.css
│   ├── app/main.js           Shell-Init + Tool-Switching
│   ├── tools/
│   │   ├── tunnels.js        SSH-Tunnel-Tab
│   │   └── submissions.js    Auge-Submissions-Tab
│   ├── features/             OrientDB-Feature-Slices
│   │   ├── schema.js
│   │   ├── records.js
│   │   ├── editor.js
│   │   ├── query.js
│   │   └── class-wizard.js
│   └── shared/
│       ├── api.js            OrientDB fetch-Wrapper
│       └── ui.js             DOM-Helper, toast
└── scripts/
    ├── install.ps1           Windows-Startmenü-Verknüpfung
    ├── start.cmd
    ├── uninstall.ps1
    └── zettel/               Eigenständige WPF-Sticky-Note (Windows)
```

---

## Setup

```bash
git clone https://github.com/JereIsThere/hand.git
cd hand
npm install
cp .env.example .env
# .env editieren: ORIENTDB_PASS, ORIENTDB_DB, ggf. SSH_HOST, N8N_BUILD_WEBHOOK
npm start
# → http://localhost:3737
```

### Via auge-framework docker-compose (empfohlen für Vollstack)

```bash
# im auge-framework-Root:
cp .env.example .env && docker compose up -d --build
# hand läuft auf http://localhost:3737
# OrientDB auf http://localhost:2480, n8n auf http://localhost:5678
```

---

## Wichtige Env-Vars

```
ORIENTDB_URL=http://localhost:2480    # im compose: http://orientdb:2480
ORIENTDB_USER=root
ORIENTDB_PASS=...                     # Pflicht
ORIENTDB_DB=auge
PORT=3737

N8N_BUILD_WEBHOOK=...                 # POST-URL für Submission-Approve-Event
                                      # leer → Status nur auf approved, kein Build

SSH_HOST=                             # opt. managed SSH-Tunnel (OrientDB-Forwarding)
SSH_USER=deploy
SSH_PORT=22
SSH_LOCAL_PORT=2480
SSH_REMOTE_HOST=localhost
SSH_REMOTE_PORT=2480
```

---

## API-Referenz

### OrientDB-Proxy

| Methode | Pfad | Was |
|---------|------|-----|
| GET | `/api/info` | Connection-Test + DB-Info |
| GET | `/api/classes` | Klassen + Properties |
| GET | `/api/records?class=` | SELECT FROM Klasse, paged |
| GET | `/api/count?class=` | count(*) |
| GET | `/api/record/:rid` | Einzelner Record |
| POST | `/api/record` | Neuer Record (Body = Doc mit @class) |
| PUT | `/api/record/:rid` | Update |
| DELETE | `/api/record/:rid` | Löschen |
| POST | `/api/query` | `{ command, language }` ausführen |

### Tunnels

| Methode | Pfad | Was |
|---------|------|-----|
| GET | `/api/tunnels` | Alle Tunnel inkl. Status |
| POST | `/api/tunnels` | Neuer Tunnel (persistiert in tunnels.json) |
| PUT | `/api/tunnels/:id` | Update (nur unmanaged, nur wenn gestoppt) |
| DELETE | `/api/tunnels/:id` | Entfernen (nur unmanaged) |
| POST | `/api/tunnels/:id/start` | ssh-Prozess spawnen, Port-Probe |
| POST | `/api/tunnels/:id/stop` | ssh-Prozess killen |
| GET | `/api/tunnels/:id/log` | Tail stdout/stderr (letzte 80 Zeilen) |

### Submissions (Auge-Themen-Pipeline)

| Methode | Pfad | Was |
|---------|------|-----|
| GET | `/api/submissions?status=` | Listen (pending/approved/rejected/built) |
| POST | `/api/submissions` | Neuer Vorschlag `{ slug, titel, kategorie?, beschreibung?, vorgeschlagenVon? }` → `pending` |
| POST | `/api/submissions/:rid/approve` | Genehmigen → `approved`, triggert `N8N_BUILD_WEBHOOK` |
| POST | `/api/submissions/:rid/reject` | Ablehnen `{ grund? }` → `rejected` |

Das `Submission`-Schema wird beim Server-Boot idempotent in OrientDB angelegt.

---

## Architektur-Notizen

### Submissions-Flow (Hand als Glied)

```
User (Hand-UI)
  POST /api/submissions
    → OrientDB Submission-Vertex (status: pending)

Admin (Hand-UI) — genehmigt
  POST /api/submissions/:rid/approve
    → OrientDB status: approved
    → POST N8N_BUILD_WEBHOOK { event: 'submission.approved', submission }
      → n8n baut Skelett-PR auf auge
```

Vollständiges Runbook: [auge-framework/docs/submission-pipeline.md](https://github.com/JereIsThere/auge-framework/blob/main/docs/submission-pipeline.md)

### SSH-Tunnel-Manager

- **managed**: aus `.env` (`SSH_HOST` gesetzt) — startet automatisch beim Server-Boot.
- **unmanaged**: über UI angelegt, persistiert in `tunnels.json` (gitignored).
- Bei Tunnel-Tod im Betrieb: UI zeigt `error`, manuell im Tab neu starten.
- `BatchMode=yes` — SSH-Key-Auth Pflicht, kein Passwort-Prompt.

---

## Sicherheitshinweise

- Hand lauscht auf `localhost`, **keine eigene Auth-Schicht**. Nicht öffentlich exposen.
- `DELETE`/`PUT` auf Records sind sofort und ohne Undo.
- `tunnels.json` enthält Hostnames + User — bewusst gitignored, lokal lesbar.

---

## Vision / offene Punkte

- **Casual-User-Seite:** Eine read-only Variante der Shell für normale User, um Themen-Requests für auge einzureichen. Geplant, noch nicht gebaut.
- **`buildRef` zurückschreiben:** n8n-Workflow trägt die PR-URL noch nicht in den Submission-Vertex zurück (Status bleibt `approved` statt `built`).
- **Weitere Tools:** Postgres, n8n-Trigger, Log-Viewer als zusätzliche Sidebar-Items.
