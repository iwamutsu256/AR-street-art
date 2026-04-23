FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /workspace

FROM base AS dev
COPY package.json pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/package.json
RUN pnpm install --filter @street-art/admin... --ignore-workspace --frozen-lockfile=false || pnpm install --filter @street-art/admin... --frozen-lockfile=false
COPY . .
EXPOSE 3002
CMD ["pnpm", "--filter", "@street-art/admin", "dev:docker"]

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @street-art/admin build

FROM node:24-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/admin/.next/standalone ./
COPY --from=build /workspace/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /workspace/apps/admin/public ./apps/admin/public
EXPOSE 3002
CMD ["node", "apps/admin/server.js"]
