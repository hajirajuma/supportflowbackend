#!/bin/bash
set -e

echo "🔨 Generating Prisma client..."
npx prisma generate

echo "📦 Building Netlify function..."
mkdir -p netlify/functions

# Bundle only our source code, mark all npm packages as external.
# Netlify will install the dependencies listed in netlify/functions/package.json
# at build time, so the function can require() them at runtime.
npx esbuild netlify/functions/api.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=netlify/functions/api.js \
  --packages=external

# Copy Prisma generated client and engine to the functions directory
# so the function can create database connections at runtime
mkdir -p netlify/functions/node_modules/.prisma
mkdir -p netlify/functions/node_modules/@prisma/client
cp -r generated/prisma/* netlify/functions/node_modules/.prisma/ 2>/dev/null || true
cp generated/prisma/*.js netlify/functions/node_modules/@prisma/client/ 2>/dev/null || true
cp generated/prisma/*.d.ts netlify/functions/node_modules/@prisma/client/ 2>/dev/null || true
cp -r generated/prisma/node_modules netlify/functions/node_modules/.prisma/ 2>/dev/null || true

echo "✅ Build complete!"
