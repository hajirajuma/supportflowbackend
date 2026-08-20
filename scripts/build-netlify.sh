#!/bin/bash
set -e

echo "🔨 Generating Prisma client..."
npx prisma generate

echo "🏗️  Building NestJS app..."
npx nest build

echo "📦 Bundling Netlify function..."
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

echo "✅ Build complete!"
