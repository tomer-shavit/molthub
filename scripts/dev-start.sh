#!/bin/bash

# Molthub Development Startup Script
# This script starts the database, runs migrations, and starts the API

set -e

echo "🚀 Starting Molthub development environment..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker compose is available
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Start PostgreSQL
echo "📦 Starting PostgreSQL..."
$COMPOSE_CMD up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 3

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm: npm install -g pnpm"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
pnpm --filter @molthub/database db:generate

# Run database migrations
echo "🗄️ Running database migrations..."
cd packages/database
export DATABASE_URL="postgresql://molthub:molthub@localhost:5432/molthub"
npx prisma db push --skip-generate
cd ../..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the development servers:"
echo ""
echo "  Terminal 1 - API:"
echo "    pnpm --filter @molthub/api dev"
echo ""
echo "  Terminal 2 - Web UI:"
echo "    pnpm --filter @molthub/web dev"
echo ""
echo "  Or run both with:"
echo "    pnpm dev"
echo ""
echo "The UI will be available at http://localhost:3000"
echo "The API will be available at http://localhost:4000"
echo "