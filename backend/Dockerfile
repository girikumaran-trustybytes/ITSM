# Multi-stage build to produce a slim runtime image with OpenSSL 1.1 installed
FROM node:20-bullseye AS builder
WORKDIR /app
COPY package*.json ./
# show output for npm errors during image build; skip audit/funding to speed up
RUN npm ci --no-audit --no-fund
COPY . .
# Build TypeScript
RUN npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy production artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "dist/index.js"]
 
