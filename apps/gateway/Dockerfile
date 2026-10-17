FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma7.config.ts ./prisma7.config.ts
COPY tsconfig.json ./tsconfig.json
COPY src ./src

# Generate Prisma client during build (requires dummy URL)
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate --config prisma7.config.ts
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Run migrations at startup, then start the server
CMD sh -c "npx prisma migrate deploy --config prisma7.config.ts && node dist/index.js"
