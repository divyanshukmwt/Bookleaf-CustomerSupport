#!/bin/sh
set -e
# Apply database migrations, optionally seed (idempotent), then start the API.
npx prisma migrate deploy
if [ "$RUN_SEED" = "true" ]; then
  npx prisma db seed
fi
exec node dist/server.js
