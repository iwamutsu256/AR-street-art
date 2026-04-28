FROM node:24-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV npm_config_store_dir=/pnpm/store
RUN apt-get update && apt-get install -y git openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /workspace
