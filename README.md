# hand ✋

Tool-Management-Shell. Sidebar links, ein Tool pro Tab.

Aktuelle Tools:

- **OrientDB** — Schema-Browser, Records-Tabelle, Editor (typisiert + Raw-JSON), Klassen-Wizard, SQL/Gremlin-Konsole. (war früher als eigenständiges `orientdb-admin` unterwegs, wurde in `hand` reingezogen)
- **SSH-Tunnel** — Tunnel-Manager. Der für OrientDB ist aus `.env` als „managed" vorkonfiguriert (auto-startet beim Server-Boot). Weitere Tunnel kommen über die UI dazu (persistiert in `tunnels.json`).

## Setup

```bash
git clone https://github.com/JereIsThere/hand.git
cd hand
npm install
cp .env.example .env
# .env editieren: ORIENTDB_PASS, ORIENTDB_DB und ggf. SSH_HOST=<prod-host>
npm start
```

Aufruf: <http://localhost:3737>

## Windows-Integration

```powershell
.\scripts\install.ps1            # legt "OrientDB Admin" (TODO: umbenennen zu "hand") im Startmenü an
.\scripts\install.ps1 -Desktop   # zusätzlich Desktop-Verknüpfung
.\scripts\uninstall.ps1          # entfernt die Verknüpfungen
```

## SSH-Tunnel

**Empfohlen: automatisch.** Setz in `.env`:

```
SSH_HOST=<prod-host>
SSH_USER=deploy
SSH_LOCAL_PORT=2480
SSH_REMOTE_PORT=2480
```

Der Server öffnet beim Start `ssh -N -L 2480:localhost:2480 deploy@<host>`. `BatchMode=yes` heißt: SSH-Key Pflicht (kein Passwort-Prompt). Wenn der Tunnel im Betrieb stirbt, markiert die UI ihn als `error` — du kannst ihn im SSH-Tunnel-Tab neu starten, ohne den Server neu starten zu müssen.

Weitere Tunnel anlegen: SSH-Tunnel-Tab → `+ Tunnel` → Felder ausfüllen → `speichern`. Liegen unter `tunnels.json` (gitignored).

## API

### OrientDB

| Methode | Pfad                  | Was                                   |
|---------|-----------------------|---------------------------------------|
| GET     | `/api/info`           | Connection-Test + DB-Info             |
| GET     | `/api/classes`        | Klassen + Properties                  |
| GET     | `/api/records?class=` | SELECT FROM Klasse, paged             |
| GET     | `/api/count?class=`   | count(*)                              |
| GET     | `/api/record/:rid`    | Einzelner Record                      |
| POST    | `/api/record`         | Neuer Record (Body = Doc mit @class)  |
| PUT     | `/api/record/:rid`    | Update                                |
| DELETE  | `/api/record/:rid`    | Löschen                               |
| POST    | `/api/query`          | `{ command, language }` ausführen     |

### Tunnels

| Methode | Pfad                          | Was                                          |
|---------|-------------------------------|----------------------------------------------|
| GET     | `/api/tunnels`                | Alle Tunnel inkl. Status                     |
| POST    | `/api/tunnels`                | Neuer Tunnel (persistiert in tunnels.json)   |
| PUT     | `/api/tunnels/:id`            | Tunnel-Definition aktualisieren (nur unmanaged, nur wenn gestoppt) |
| DELETE  | `/api/tunnels/:id`            | Tunnel entfernen (nur unmanaged)             |
| POST    | `/api/tunnels/:id/start`      | ssh-Prozess spawnen, Port-Probe abwarten     |
| POST    | `/api/tunnels/:id/stop`       | ssh-Prozess killen                           |
| GET     | `/api/tunnels/:id/log`        | tail des stdout/stderr (letzte 80 Zeilen)    |

## Struktur

```
hand/
├── server.js
│   ├── OrientDB-Proxy (Basic-Auth aus .env)
│   └── TunnelManager (managed via .env + unmanaged via tunnels.json)
├── scripts/
│   ├── start.cmd        — Windows-Launcher
│   ├── install.ps1      — Startmenü-Verknüpfung
│   └── uninstall.ps1
├── public/
│   ├── index.html       — Sidebar-Shell mit Tool-Sections
│   ├── styles.css
│   ├── app/main.js      — Shell + Tool-Switching
│   ├── tools/
│   │   └── tunnels.js   — SSH-Tunnel-Tab
│   ├── features/        — OrientDB-Feature-Slices
│   │   ├── schema.js
│   │   ├── records.js
│   │   ├── editor.js
│   │   ├── query.js
│   │   └── class-wizard.js
│   └── shared/
│       ├── api.js       — OrientDB fetch-Wrapper
│       └── ui.js        — DOM-Helper, toast
└── .env.example
```

## Warnungen

- Tool lauscht auf `localhost`, keine eigene Auth-Schicht. Nicht öffentlich exposen.
- `DELETE`/`PUT` machen ohne Undo was sie sagen.
- `tunnels.json` enthält Hostnames + User. Bewusst gitignored, aber lokal lesbar.

## Vision

Mittelfristig wird `hand` der Träger für mehr als nur Admin-Tooling:

- **Auge-Submissions:** Eine User-Variante (read-only Shell) lässt Leute Themen-Requests für [auge](https://github.com/JereIsThere/auge) submitten. Die Admin-Hand (also dieses Repo) genehmigt; in n8n laufen dann die Build-Workflows.
- Weitere Tools (Postgres, n8n-Trigger, Log-Viewer, …) kommen als zusätzliche Sidebar-Items.
