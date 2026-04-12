FROM node:22-alpine AS build
WORKDIR /home/node/app

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma

RUN npm ci
RUN npx prisma generate

COPY . .

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
USER node
WORKDIR /home/node/app

COPY --from=build --chown=node:node /home/node/app/package*.json ./
COPY --from=build --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=build --chown=node:node /home/node/app/dist ./dist

CMD ["npm", "run", "start:prod"]
