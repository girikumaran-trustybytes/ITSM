# Multi-stage build to produce a slim runtime image with OpenSSL 1.1 installed
FROM node:20-bullseye AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --silent
COPY . .
# Generate Prisma client and build TypeScript
RUN npm run prisma:generate && npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
# Install OpenSSL 1.1 runtime (libssl.so.1.1) required by Prisma native engine
RUN apt-get update && apt-get install -y --no-install-recommends libssl1.1 ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy production artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "dist/index.js"]
 
