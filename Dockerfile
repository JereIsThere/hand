# Die Hand — Tool-Management-Shell
# Schlanker Production-Container für den Express-Server.
# Gedacht für das docker-compose im auge-framework (Service `hand`),
# wo OrientDB als Service-Hostname erreichbar ist (kein SSH-Tunnel nötig).
FROM node:20-alpine

WORKDIR /app

# Nur Manifeste zuerst → Layer-Cache für Dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Rest der App
COPY . .

ENV PORT=3737
EXPOSE 3737

CMD ["node", "server.js"]
