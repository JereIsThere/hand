<!-- NOW: M3 -->

## Backlog
> Unpriorisierte Ideen ohne aktuellen Milestone.

- [ ] casual-User-Seite (Submissions einreichen ohne Admin)
- [ ] Schlüsselbund — Key-Rotation-Tab: Alter pro Key, Ein-Klick-Rotation für eigene Tokens, geführter Flow für Provider-Keys, Grace-Window (docs/feature-schluesselbund.md)

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
- [x] Milestone Sort-Order: future → current → done
- [x] Milestone Description aus > Zeile parsen + anzeigen

## M3: Tab-Umbau + Admin-Migration
> Neue Tabs (Zettel, Tafel, Screens, Funkner) + Admin-Tabs zu gehirn-admin migrieren.

- [x] GEHIRN_API_KEY verkabelt (compose) + gehirnHeaders() in sprecher.js für Video/Proxy (ADR 0016)
- [ ] Zettel-Tab — lineierter Schreibmodus (ADR 0006)
- [ ] Tafel-Tab — SVG-Paint + PPTX-Style (ADR 0006)
- [ ] Screens-Tab — Smart-Home-Display-Verwaltung + Quick-Capture (ADR 0013)
- [ ] Funkner-Tab — Claude-Code-inspiriertes Terminal-UI, Placeholder (ADR 0002)
- [ ] OrientDB-Admin → gehirn-admin (nach Fertigstellung)
- [ ] SSH-Tunnel → gehirn-admin
- [ ] Submissions → gehirn-admin

## M4: auge-app Desktop Launcher
> Electron-Shell aus hand/electron/ extrahieren, Launcher für alle Module (ADR 0011).

- [ ] Electron-Wrapper aus hand/electron/ nach auge-framework/auge-app/ extrahieren
- [ ] Launcher-Modus: Service-Status via GET /deploy/status, Start/Stop
- [ ] App-Modi: hand (3737) · gehirn-admin (3738) · auge (3010) — per BrowserWindow-URL
- [ ] Auth-Onboarding: GEHIRN_ADMIN_SECRET → OS-Keychain (safeStorage)
- [ ] speicher-Tab: Galerie + Upload
- [ ] Android: Capacitor wraps statisches Bundle (ADR 0005)
