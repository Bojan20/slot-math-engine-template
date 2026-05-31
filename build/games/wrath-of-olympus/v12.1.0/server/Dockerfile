# slot-math RGS production image
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js game.ir.json api.openapi.json ./

ENV PORT=3000
EXPOSE 3000

# Healthcheck hits /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]
