FROM node:22-alpine AS build
WORKDIR /home/node/app

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/prisma/database-config.ts ./src/prisma/database-config.ts

RUN npm ci
RUN DATABASE_URL='postgresql://user:password@localhost:5432/quadra?schema=public' npx prisma generate

COPY . .

RUN npm run build
# The emitted layout shifts when the build includes files outside src/, and the
# runtime entrypoint is only resolved when the container already started.
RUN test -f dist/main.js
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
USER node
WORKDIR /home/node/app

COPY --from=build --chown=node:node /home/node/app/package*.json ./
COPY --from=build --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=build --chown=node:node /home/node/app/dist ./dist
COPY --from=build --chown=node:node /home/node/app/prisma ./prisma
COPY --from=build --chown=node:node /home/node/app/prisma.config.ts ./
COPY --from=build --chown=node:node /home/node/app/src/prisma/database-config.ts ./src/prisma/database-config.ts
# Node does not trust the Amazon RDS certificate authority out of the box.
COPY --chown=node:node certs/rds-global-bundle.pem ./certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/home/node/app/certs/rds-global-bundle.pem

CMD ["npm", "run", "start:prod"]
