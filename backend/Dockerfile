FROM node:22-slim
# openssl is required by the Prisma engines on slim images
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# devDependencies (typescript, @types/*) are needed for the build; pruned afterwards.
# prisma + tsx stay in `dependencies` so migrations and the seed can run inside the container.
RUN npm install --include=dev --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npx tsc -p tsconfig.build.json && npm prune --omit=dev && npx prisma generate
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 4000
USER node
ENTRYPOINT ["./docker-entrypoint.sh"]
