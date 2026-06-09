<!-- NOW: M2 -->

## Backlog
> Unpriorisierte Ideen ohne aktuellen Milestone.

- [ ] casual-User-Seite (Submissions einreichen ohne Admin)
- [ ] auge-app Electron-Shell extrahieren (ADR 0005)

## M1: Core-Tabs
> Grundtabs, Electron-Shell, Auth, Atlas Cloud Integration, Auto-Deploy.

- [x] Sprecher — Chat mit Modell-Dropdown, Text/Bild/Video-Modes
- [x] Atlas Cloud Image-Modelle (ATLAS-flux-2-pro, imagen-4, ideogram-v3, z-image-turbo, seedream-5)
- [x] Vault — Snippets via OrientDB
- [x] Friends-Tab
- [x] Submissions-Tab (Admin)
- [x] SSH-Tunnel-Tab (Admin)
- [x] OrientDB-Admin-Tab
- [x] Über-Tab (Version, Update-Channel)
- [x] Electron-Wrapper (Desktop-App)
- [x] Auth-Schicht (Admin / User)
- [x] Auto-Deploy via notify-framework.yml

## M2: Roadmaps-Tab
> Roadmap-Ansicht mit GitHub-backed Milestones und OrientDB-extern.

- [x] OrientDB-Backend (Projects/Milestones/Tasks CRUD)
- [x] Sidebar-Button + Section
- [x] GitHub-backed View (roadmap.REPO.md lesen + Toggle)
- [x] Kategorie-Toggle auge-framework / extern
- [x] Collapse/Expand per Panel (localStorage)
- [x] Milestone-Layout vertikal (Zeitstrahl, done/now/future States)

## M3: Tab-Umbau + Admin-Migration
> Neue Tabs, Terminal-Placeholder, Admin-Tabs zu gehirn-admin migrieren.

- [ ] Funkner-Tab: Claude-Code-inspiriertes Terminal-UI (Placeholder)
- [ ] Screens-Tab (geplant, ADR 0013)
- [ ] Tafel-Tab (geplant, ADR 0006)
- [ ] OrientDB-Admin → gehirn-admin (nach Fertigstellung)
- [ ] SSH-Tunnel → gehirn-admin
- [ ] Submissions → gehirn-admin
