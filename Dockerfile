FROM node:20-alpine

WORKDIR /app

COPY package.json server.js ./
COPY lib ./lib
COPY public ./public

ENV PORT=7000
EXPOSE 7000

CMD ["node", "server.js"]
