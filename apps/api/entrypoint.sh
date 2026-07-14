#!/bin/sh
set -e
echo "Running database migrations…"
npx prisma migrate deploy
echo "Seeding base data (idempotent)…"
npx prisma db seed || echo "Seed skipped/failed (continuing)"
echo "Starting API…"
node dist/main.js
