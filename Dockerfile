FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/api/package.json packages/api/
COPY packages/infrastructure/package.json packages/infrastructure/
COPY packages/collector/package.json packages/collector/
COPY packages/mcp/package.json packages/mcp/
COPY packages/sdk/package.json packages/sdk/
RUN npm ci
COPY docs docs
COPY packages/domain packages/domain
COPY packages/infrastructure packages/infrastructure
COPY packages/api packages/api
RUN npm run build --workspace=@tributax/domain \
 && npm run build --workspace=@tributax/infrastructure \
 && npm run build --workspace=@tributax/api
EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
