FROM node:22-alpine
USER node
RUN mkdir -p /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node . .
COPY node_modules /home/node/app/node_modules
RUN npm run build
CMD ["npm", "run", "start:prod"]