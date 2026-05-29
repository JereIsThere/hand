# orientdb-admin 🜲

Schlankes Admin-Tool für OrientDB — Schema browsen, Records anschauen/editieren/löschen, SQL- und Gremlin-Queries laufen lassen.

Gedacht für den Workflow: **SSH-Tunnel zur Prod-Maschine → lokal im Browser öffnen**. Credentials liegen in `.env` und gehen nie ins Frontend.

## Setup

```bash
cd orientdb-admin
npm install
cp .env.example .env
# .env editieren: ORIENTDB_PASS, ORIENTDB_DB anpassen
npm start
```

Aufruf: <http://localhost:3737>

## SSH-Tunnel zur Prod-OrientDB

```bash
ssh -L 2480:localhost:2480 deploy@<prod-host>
```

Solange der Tunnel offen ist, zeigt `ORIENTDB_URL=http://localhost:2480` auf die Prod-DB.

## Features

- **Schema** — alle V/E-Klassen mit Properties und Indexes, aufklappbar. `+ Neue Klasse` öffnet einen 4-Step-Wizard (Basics → Properties → Erst-Datensätze → SQL-Vorschau), der die Statements sequenziell ausführt und bei Fehlern abbricht.
- **Records** — pro Klasse, Paging via Skip/Limit. Zeile anklicken öffnet den Editor.
- **Editor (Drawer)** — typisierte Felder oder roher JSON-Modus, Save/Delete.
- **Query** — SQL (default) oder Gremlin, Ergebnis als Tabelle oder JSON. <kbd>Ctrl·↵</kbd> führt aus.

## Endpoints (Proxy)

| Methode | Pfad                  | Was                                   |
|---------|-----------------------|---------------------------------------|
| GET     | `/api/info`           | Connection-Test + DB-Info             |
| GET     | `/api/classes`        | Alle Klassen mit Properties           |
| GET     | `/api/records?class=` | Records einer Klasse (Skip/Limit)     |
| GET     | `/api/count?class=`   | `count(*)` einer Klasse               |
| GET     | `/api/record/:rid`    | Einzelnen Record holen (RID o. `#`)   |
| PUT     | `/api/record/:rid`    | Record updaten (Body = Doc)           |
| DELETE  | `/api/record/:rid`    | Record löschen                        |
| POST    | `/api/query`          | `{ command, language }` ausführen     |

## Struktur

```
orientdb-admin/
├── server.js              ← Express-Proxy, Basic-Auth, .env
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app/main.js        ← bootstrap, tabs
│   ├── features/
│   │   ├── schema.js      ← Schema browser
│   │   ├── records.js     ← Tabellenansicht
│   │   ├── editor.js      ← Drawer-Editor
│   │   └── query.js       ← Konsole
│   └── shared/
│       ├── api.js         ← fetch-Wrapper
│       └── ui.js          ← DOM-Helper, toast, formatCell
└── .env.example
```

## Warnungen

- Das Tool lauscht auf `localhost` und nutzt **keine** eigene Auth-Schicht. Nicht öffentlich exposen.
- `DELETE`/`PUT` machen, was sie sagen — kein Undo. Vor dem Editieren `/api/info` checken.
