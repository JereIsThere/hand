# Feature-Idee: Schlüsselbund — Key-Rotation-Tab

**Status:** Idee / Backlog
**Datum:** 2026-07-02
**Kontext:** ADR 0016 (Service-Auth), PR #52 (Capture-Endpoint)

---

## Motivation

hand verwaltet inzwischen einen ganzen Zoo an Keys (SETUP_KEYS: KI-Provider,
GitHub-PAT, OAuth, SSH; dazu Service-Tokens wie GEHIRN_API_KEY und
CAPTURE_API_KEY). Das eigentliche Problem ist selten das Rotieren selbst,
sondern dass niemand weiß, *wie alt* welcher Key ist und *wo überall* er
konsumiert wird. Ein Schlüsselbund-Tab macht das sichtbar und dampft die
Rotation auf einen Klick bzw. einen geführten 30-Sekunden-Flow ein.

Die Bauteile existieren schon: Vault (verschlüsselte Ablage + `loadIntoEnv()`),
`setup-config.js` als zentrale Key-Registry mit Metadaten, `/api/setup-status`.
Der Schlüsselbund ist die logische dritte Stufe.

## Konzept

### 1. Übersicht mit Alter

Pro Key aus der Registry: gesetzt/fehlt (gibt es schon), **zuletzt rotiert**,
Ampel-Badge ab z.B. 90 Tagen. Rotationsdatum lebt als Metadatum am
Vault-Secret (bzw. eigene kleine Klasse für .env-only-Keys).

### 2. Rotate-Button — zwei Klassen von Keys

| Klasse | Beispiele | Flow |
|---|---|---|
| **auto** (selbst ausgestellt) | CAPTURE_API_KEY, GEHIRN_API_KEY, SESSION_SECRET, VAULT_KEY | hand generiert (32 Bytes Hex), schreibt in Vault, fertig — echter Ein-Klick |
| **guided** (Fremd-Anbieter) | ANTHROPIC_API_KEY, GROK_API_KEY, OPENAI_API_KEY, GITHUB_TOKEN | Anbieter haben i.d.R. keine Rotate-API. Stattdessen: Console-Link öffnen → neuen Key einpasten → hand macht billigen Verify-Call gegen den Service → Vault + Rotationsdatum |

Registry-Erweiterung dafür (drei Felder pro Key):
`rotatable: 'auto' | 'guided'`, `consoleUrl`, `verify` (Service-spezifischer
Test-Call, z.B. `GET /models` bei Anthropic).

### 3. Grace-Window für Keys mit mehreren Konsumenten

CAPTURE_API_KEY hat nach der auge-app-Integration zwei Parteien (hand-Server +
App auf dem Handy). Harte Rotation ⇒ die App synct ins Leere, bis sie den
neuen Key hat. Muster: Server akzeptiert übergangsweise **alt und neu**
(`CAPTURE_API_KEY` + `CAPTURE_API_KEY_PREVIOUS`), Key in Ruhe in der App
tauschen, dann alten löschen. Der timing-safe Bearer-Check in `capture.js`
muss dafür nur gegen zwei Kandidaten statt einen prüfen. Gleiches Muster
gilt für GEHIRN_API_KEY (drei Konsumenten, ADR 0016).

## Nebeneffekt der bestehenden Architektur

Weil der Vault beim Boot per `loadIntoEnv()` lädt und neuere Module ihre Keys
lazy aus `process.env` lesen (capture.js macht das schon so), greift eine
Rotation im Vault ohne Config-Gefummel — bei lazy gelesenen Keys sogar ohne
Neustart.

## Scope-Schätzung

Überschaubares Paket: Registry-Felder in `setup-config.js` + neues Modul
`rotation.js` (Admin-only Endpoints: Liste mit Alter, rotate, verify) +
kleiner Tab im Frontend. Sinnvoller Startpunkt: nach Merge von PR #52,
dann Grace-Window im Capture-Check gleich mitnehmen.
