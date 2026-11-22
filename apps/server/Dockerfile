# Build context: the repository root (the server bundles code from packages/shared).
#   docker build -f apps/server/Dockerfile -t taskly-server .

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm ci --workspace @taskly/server --include-workspace-root=false --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
WORKDIR /repo/apps/server
RUN npx prisma generate && npm run build

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
# Runtime packages only. Prisma's CLI stays: the container applies pending migrations before it starts.
# Our own postinstall (prisma generate) is skipped, but Prisma's must run: it fetches the schema engine
# that `migrate deploy` uses.
RUN npm ci --workspace @taskly/server --include-workspace-root=false --omit=dev --ignore-scripts \
  && npm rebuild @prisma/engines prisma \
  && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
WORKDIR /repo/apps/server
COPY apps/server/package.json apps/server/prisma.config.ts ./
COPY apps/server/prisma prisma
COPY --from=build /repo/apps/server/dist dist
USER node
EXPOSE 8030
# 384 MB of heap leaves room for the rest of the process on a 512 MB instance.
CMD ["sh", "-c", "/repo/node_modules/.bin/prisma migrate deploy && exec node --max-old-space-size=384 --enable-source-maps dist/server.js"]
