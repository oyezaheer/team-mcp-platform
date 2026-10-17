FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY data ./data

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3004

EXPOSE 3004

CMD ["npm", "start"]
