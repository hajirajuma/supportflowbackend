#!/bin/bash
set -e

echo "🔨 Generating Prisma client..."
npx prisma generate

echo "🏗️  Building NestJS app..."
npx nest build

echo "📦 Bundling Netlify function..."
mkdir -p netlify/functions

# Create empty shim modules for packages with unresolvable dynamic requires.
# @nestjs/microservices — optional NestJS package, not installed but dynamically required by @nestjs/core
# class-transformer/storage — dynamic require path in @nestjs/mapped-types
mkdir -p netlify/functions/node_modules/@nestjs/microservices
echo 'module.exports = {};' > netlify/functions/node_modules/@nestjs/microservices/index.js
mkdir -p netlify/functions/node_modules/@nestjs/microservices/dist
echo 'module.exports = {};' > netlify/functions/node_modules/@nestjs/microservices/dist/microservices-module.js

mkdir -p netlify/functions/node_modules/class-transformer
echo 'module.exports = {};' > netlify/functions/node_modules/class-transformer/storage.js

# Bundle everything into a single file. Only mark the shimmed packages as external.
npx esbuild netlify/functions/api.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=netlify/functions/api.js \
  --external:@nestjs/microservices \
  --external:@nestjs/microservices/* \
  --external:class-transformer/storage

echo "✅ Build complete!"
