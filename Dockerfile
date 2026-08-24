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

# Find main.js wherever it landed and copy it to /app/dist/main.js
RUN cp $(find dist -name "main.js" -not -path "*/node_modules/*" | head -1) dist/main.js || true

# ---------- Production stage ----------
FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci --omit=dev && npx prisma generate

COPY --from=build /app/dist ./dist

USER app

EXPOSE 3001

CMD ["node", "--max-old-space-size=512", "dist/main.js"]
