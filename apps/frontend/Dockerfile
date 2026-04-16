FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS dev
COPY package.json pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --filter @street-art/frontend... --ignore-workspace --frozen-lockfile=false || pnpm install --filter @street-art/frontend... --frozen-lockfile=false
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@street-art/frontend", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @street-art/frontend build

FROM node:24-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/frontend/.next/standalone ./
COPY --from=build /workspace/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /workspace/apps/frontend/public ./apps/frontend/public
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
