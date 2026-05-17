FROM node:18-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY schema.sql ./schema.sql

USER node

EXPOSE 4000

CMD ["node", "src/index.js"]
