// Zentrale Liste aller optionalen Konfigurationswerte die im Vault leben können.
// Wird vom Setup-Wizard + vom /api/setup-status-Endpoint genutzt.
// Bootstrap-Secrets (VAULT_KEY, SESSION_SECRET, ORIENTDB_*, GOOGLE_*) sind
// NICHT hier — die müssen manuell in .env (können nicht aus Vault kommen).

export const SETUP_KEYS = [
  {
    key: 'N8N_BUILD_WEBHOOK',
    label: 'n8n Build-Webhook',
    service: 'n8n',
    description: 'URL des n8n-Workflows der bei genehmigten Auge-Submissions ein Themen-Skelett baut.',
    placeholder: 'https://n8n.jeremias-groehl.de/webhook/auge-submission-build',
    secret: false,
    group: 'Auge',
  },
  {
    key: 'GOOGLE_CLIENT_ID',
    label: 'Google OAuth Client ID',
    service: 'google',
    description: 'Für hand-Auth (twitterforfriends-Client). Bootstrap-Secret — besser in .env als im Vault.',
    placeholder: '123456789-abc.apps.googleusercontent.com',
    secret: false,
    group: 'Auth',
    bootstrapHint: true,
  },
  {
    key: 'GOOGLE_CLIENT_SECRET',
    label: 'Google OAuth Client Secret',
    service: 'google',
    description: 'Gegenpart zur Client ID. Bootstrap-Secret — besser in .env.',
    placeholder: 'GOCSPX-…',
    secret: true,
    group: 'Auth',
    bootstrapHint: true,
  },
  {
    key: 'SSH_HOST',
    label: 'SSH Host',
    service: 'server',
    description: 'Prod-Server-Hostname für den OrientDB-SSH-Tunnel (lokal → hand baut Tunnel selbst).',
    placeholder: 'v220240121523…hetzner.cloud',
    secret: false,
    group: 'Server',
  },
  {
    key: 'SSH_USER',
    label: 'SSH User',
    service: 'server',
    description: 'SSH-User für den Tunnel (default: deploy).',
    placeholder: 'deploy',
    secret: false,
    group: 'Server',
  },
  {
    key: 'SSH_PORT',
    label: 'SSH Port',
    service: 'server',
    description: 'SSH-Port (default: 22).',
    placeholder: '22',
    secret: false,
    group: 'Server',
  },
];
