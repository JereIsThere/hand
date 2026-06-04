# Release-Prozess — Die Hand

## Versionsschema

```
MAJOR.MINOR.PATCH[-beta.N]
```

| Teil | Wann erhöhen |
|------|-------------|
| `MAJOR` | Brechende Änderungen an Datenstruktur, Auth-Flow oder öffentlicher API |
| `MINOR` | Neue Features, neue Tools, größere UX-Überarbeitungen |
| `PATCH` | Bugfixes, kleine Tweaks, Dependency-Updates ohne neue Features |
| `-beta.N` | Jeder Pre-Release-Build auf dem `dev`-Channel; N fortlaufend |

---

## Branches

| Branch | Zweck |
|--------|-------|
| `main` | Produktionsstand — nur Merges aus fertigen Feature-Branches |
| `feat/*` | Feature-Entwicklung; PR → main wenn fertig |
| `fix/*` | Bugfix-Branches; PR → main |
| `docs/*` | Reine Dokumentations-Änderungen |

---

## Ablauf: Minor- oder Major-Release

### 1 — Feature-Branches mergen

```bash
gh pr merge <nr> --squash   # oder --merge
```

Alle Features die in den Release sollen müssen in `main` sein.

### 2 — CHANGELOG.md aktualisieren

`[Unreleased]`-Block in finalen Versions-Header umbenennen:

```md
## [1.2.0] — 2026-XX-XX
```

Neuen leeren `[Unreleased]`-Block oben anlegen.

### 3 — Version bumpen

```bash
npm version minor    # → 1.2.0, erstellt git tag v1.2.0
# oder
npm version patch    # → 1.1.1
npm version major    # → 2.0.0
```

`npm version` aktualisiert `package.json`, committed und taggt automatisch.

### 4 — Beta-Zyklus (optional, empfohlen bei Minor+)

```bash
npm version prerelease --preid=beta   # → 1.2.0-beta.1
git push && git push --tags
npm run dist:publish                  # baut + pusht auf GitHub Releases als Pre-Release
```

Im **Über-Tool** der Desktop-App: Channel auf `beta` stellen → Auto-Update zieht den Pre-Release.  
Fehler finden → `npm version prerelease` → `npm run dist:publish` → testen → repeat.

### 5 — Stable Release

```bash
npm version minor    # setzt auf 1.2.0 (entfernt beta-Suffix)
git push && git push --tags
npm run dist:publish
```

`electron-builder` baut `Die Hand Setup X.Y.Z.exe` + `latest.yml` und pusht beides als GitHub-Release.  
Alle Instanzen ab v0.9.0 ziehen das Update automatisch.

### 6 — GitHub Release Notes

Release-Titel: `Die Hand vX.Y.Z — [Schlagwort]`

Release-Body: den passenden Block aus `CHANGELOG.md` einfügen.

---

## Ablauf: Patch-Release

Patch-Releases können ohne Beta-Zyklus direkt stable landen:

```bash
# Fix in feat/fix-* entwickeln, PR → main mergen
npm version patch          # → 1.1.1
git push && git push --tags
npm run dist:publish
```

---

## Aktueller Stand

| Version | Status | Inhalt |
|---------|--------|--------|
| `v1.1.0` | ✅ Stable | sprecher Multi-Provider, Freunde-Routing |
| `v1.2.0` | 🔨 In Entwicklung | Versionsnummer dynamisch, Update-Toast, sprecher UX |

### Geplante PRs für v1.2.0

| PR | Beschreibung |
|----|-------------|
| [#35](https://github.com/JereIsThere/hand/pull/35) | Dynamische Versionsnummer + Windows-style Update-Notification |
| [#36](https://github.com/JereIsThere/hand/pull/36) | sprecher UX-Politur (inline-Titel, Confirm, System-Prompt, No-Keys-Banner) |

**Reihenfolge:** #35 zuerst (kein Spread-Risiko), dann #36, dann `npm version minor` + `dist:publish`.

---

## Kommandos auf einen Blick

```bash
# Beta bauen und pushen
npm version prerelease --preid=beta
git push && git push --tags
npm run dist:publish

# Stable Minor-Release
npm version minor
git push && git push --tags
npm run dist:publish

# Stable Patch
npm version patch
git push && git push --tags
npm run dist:publish

# Nur lokal testen (kein Publish)
npm run dist
# → dist/Die Hand Setup X.Y.Z.exe
```

---

## Checklist vor jedem Release

- [ ] Alle geplanten PRs gemergt
- [ ] `CHANGELOG.md` aktualisiert (`[Unreleased]` → `[X.Y.Z] — DATUM`)
- [ ] `npm version` ausgeführt (bumpt `package.json` + git tag)
- [ ] Beta-Zyklus abgeschlossen (bei Minor/Major)
- [ ] `npm run dist:publish` erfolgreich
- [ ] GitHub Release Notes aus CHANGELOG eingefügt
- [ ] Auto-Update in installierter Instanz verifiziert (zieht `latest.yml`)
