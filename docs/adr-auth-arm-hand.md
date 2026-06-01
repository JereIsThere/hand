# ADR — Auth & arm/hand-Rollenmodell

- **Status:** akzeptiert (Phase 1 umgesetzt)
- **Datum:** 2026-06-01

## Kontext

Die Hand war bisher ein localhost-only Admin-Tool ohne Auth. Sie soll ein
öffentlich erreichbarer **Freundeskreis**-Hub werden (Vorbild „Twitter for
Friends"): Freunde melden sich mit Google an, ein Admin gibt sie frei. Damit
wird die geplante **arm/hand-Aufteilung** real — nicht als zwei Repos, sondern
(vorerst) als **eine App mit rollenbasierten Tools**.

## Entscheidung

- **Auth:** Google-OAuth (OpenID-Connect, Authorization-Code-Flow), hand-gerollt
  in `auth.js` (kein schweres Framework). Session = HMAC-signiertes httpOnly-Cookie.
- **Identität/Rollen in OrientDB**, Klasse `Person`: `email` (unique), `name`,
  `picture`, `role` (`admin` | `friend`), `status` (`pending` | `approved` |
  `rejected`).
- **Approval-Flow:** Login → falls Mail in `ADMIN_EMAILS` → `admin/approved`,
  sonst neu als `friend/pending`. Admin (arm) gibt im **Freunde**-Tool frei.
- **Rollen-Gating:**
  - Privilegierte APIs (OrientDB-Proxy, Tunnel, Submissions, Personen) sind
    **Admin-only** (`requireAdmin`).
  - Tools im Frontend tragen `data-role="admin"`; Freunde sehen sie nicht.
  - „arm" = die Admin-Sicht (alle Tools), „hand" = die Freundes-Sicht (casual
    Tools wie sprecher, kommt als Nächstes).
- **Opt-in:** ohne `GOOGLE_CLIENT_ID/SECRET/SESSION_SECRET` ist Auth **aus** und
  hand läuft wie bisher lokal-offen (Single-Operator = admin). Kein Bruch.

## Begründung

- Eine App mit Rollen ist deutlich einfacher als zwei getrennte Frontends/Repos,
  und der spätere Split bleibt möglich (Rollen sind schon sauber getrennt).
- Hand-gerolltes OAuth hält die Dependencies minimal (nur `dotenv`/`express`);
  Userinfo-Endpoint statt JWT-Verifikation spart eine Krypto-Lib.
- OrientDB ist eh die zentrale Datenebene → Personen gehören dort hin.

## Konsequenzen / offen

- **Public Deploy** (Domain, nginx, HTTPS, Prod-Redirect-URI) ist ein eigener
  Schritt (Phase 4) — bis dahin lokal testbar mit localhost-Redirect.
- Cookie-Sicherheit: `Secure` automatisch wenn `OAUTH_REDIRECT_URI` https ist.
- Späterer echter arm/hand-Repo-Split bleibt eine Option, ist aber nicht nötig.
- Friend-Tools (sprecher) und friend-erlaubte APIs kommen in den nächsten Phasen
  (dann `requireAuth` statt `requireAdmin` für die casual Endpoints).
