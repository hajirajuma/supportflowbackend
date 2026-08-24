# ---------- Build stage ----------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

RUN npm ci

COPY . .
RUN npx prisma generate
RUN NODE_OPTIONS="--max-old-space-size=1536" npm run build

# ---------- Production stage ----------
FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

# Non-root user for container hardening
RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install production deps only (the Prisma engine/adapter is a runtime dep)
RUN npm ci --omit=dev && npx prisma generate

COPY --from=build /app/dist ./dist

USER app

EXPOSE 3001

CMD ["node", "--max-old-space-size=512", "dist/main.js"]
