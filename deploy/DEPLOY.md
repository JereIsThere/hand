# Die Hand — Server-Deploy (deploy-User)

Headless Express-Server hinter nginx + HTTPS. App-Pfad-Annahme:
`/var/lib/deploy/hand` (Home des `deploy`-Users). Domain-Beispiel:
`hand.jeremias-groehl.de` — überall anpassen.

## Voraussetzungen

- DNS: A/AAAA-Record `hand.jeremias-groehl.de` → Server-IP
- Server: `node >= 18`, `nginx`, `certbot` (python3-certbot-nginx)
- OrientDB auf dem Server erreichbar (lokal/compose) unter `localhost:2480`
- Google-OAuth-Client (twitterforfriends) vorhanden

## 🔗 1 — Klonen (als deploy-User)

```bash
cd /var/lib/deploy
git clone https://github.com/JereIsThere/hand.git
cd hand
```

## 📦 2 — Dependencies (nur prod, ohne Electron/Build-Tools)

```bash
npm ci --omit=dev
```

## 🔒 3 — Google-Client: Prod-Redirect-URI freischalten

In der Google Cloud Console beim twitterforfriends-Client unter
**Authorized redirect URIs** ergänzen:

```
https://hand.jeremias-groehl.de/auth/callback
```

## 📝 4 — .env anlegen

```bash
cp deploy/env.production.example .env
nano .env
```

Setzen: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`
(`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`),
`ORIENTDB_PASS`. `OAUTH_REDIRECT_URI` bleibt die `https://…/auth/callback`-Prod-URL.
`.env` ist gitignored — bleibt nur auf dem Server.

## 🔄 5 — systemd-Service

```bash
sudo cp deploy/hand.service /etc/systemd/system/hand.service
sudo systemctl daemon-reload
sudo systemctl enable --now hand
systemctl status hand          # läuft?  ·  journalctl -u hand -f  (Logs)
```

Im Log sollte stehen: `Auth: Google-OAuth aktiv (Approval-Flow)`.

## 🌐 6 — nginx + HTTPS

```bash
sudo cp deploy/nginx-hand.conf /etc/nginx/sites-available/hand
sudo ln -s /etc/nginx/sites-available/hand /etc/nginx/sites-enabled/hand
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hand.jeremias-groehl.de
```

certbot ergänzt den 443-Block + http→https-Redirect automatisch.

## ✅ 7 — Test

- `https://hand.jeremias-groehl.de` → Login-Overlay „Mit Google anmelden".
- Du (in `ADMIN_EMAILS`) kommst als **Admin** durch → alle Tools.
- Ein Freund: meldet sich an → `pending` → du gibst im **Freunde**-Tool frei.

## 🔁 Updates / Auto-Deploy

Manuell:
```bash
cd /var/lib/deploy/hand && git pull && npm ci --omit=dev && sudo systemctl restart hand
```

**Auto-Deploy** läuft über `.github/workflows/deploy.yml` (push auf `main` →
SSH → fetch/reset → `npm ci --omit=dev` → `systemctl restart hand`). Voraussetzungen:

1. **sudoers-Whitelist** — damit der deploy-User den Service ohne Passwort neu
   starten darf:
   ```bash
   echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart hand' \
     | sudo tee /etc/sudoers.d/deploy-hand
   sudo chmod 440 /etc/sudoers.d/deploy-hand
   ```
2. **GitHub-Repo-Secrets** (Settings → Secrets and variables → Actions) — gleiche
   Werte wie bei reder:
   - `SSH_HOST`, `SSH_USER` (= `deploy`), `SSH_PORT`, `SSH_PRIVATE_KEY`
3. Der Server-Checkout (`/var/lib/deploy/hand`) muss gegen GitHub authentifiziert
   sein (Clone hat ja geklappt → `git fetch` als deploy-User muss laufen).

## Alternative: docker-compose

Statt systemd kann hand auch über das `docker-compose.yml` im
[auge-framework](https://github.com/JereIsThere/auge-framework) laufen
(Service `hand`, zusammen mit OrientDB + n8n). Dann hier nichts separat
deployen — `.env` dort setzen.
