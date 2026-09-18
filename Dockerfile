FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/api/package.json packages/api/
COPY packages/infrastructure/package.json packages/infrastructure/
RUN npm ci
COPY tsconfig.base.json ./
COPY docs docs
COPY packages/domain packages/domain
COPY packages/api packages/api
COPY packages/infrastructure packages/infrastructure
RUN npm run build
EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
