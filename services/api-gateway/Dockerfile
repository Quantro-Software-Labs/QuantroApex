# ==============================================================================
# QuantroApex API Gateway — Multi-Stage Production Dockerfile
# Optimized for small image size, fast startup, and high security.
# ==============================================================================

# ── Stage 1: Build & Prune ───────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace configs & lockfile
COPY package*.json ./
COPY services/api-gateway/package*.json ./services/api-gateway/
COPY services/api-gateway/prisma ./services/api-gateway/prisma

# Install all dependencies including devDependencies for compilation
RUN npm ci --workspace=@quantroapex/api-gateway

# Copy API gateway source code
COPY services/api-gateway ./services/api-gateway

# Generate Prisma Client & compile TypeScript
WORKDIR /app/services/api-gateway
RUN npx prisma generate
RUN npm run build

# Remove devDependencies for lean production bundle
RUN npm prune --production

# ── Stage 2: Production Runtime ─────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Security: Create non-root system group & user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S quantroapex -u 1001 -G nodejs

# Copy built application & node_modules from builder stage
COPY --from=builder --chown=quantroapex:nodejs /app/services/api-gateway/dist ./dist
COPY --from=builder --chown=quantroapex:nodejs /app/services/api-gateway/node_modules ./node_modules
COPY --from=builder --chown=quantroapex:nodejs /app/services/api-gateway/package.json ./package.json
COPY --from=builder --chown=quantroapex:nodejs /app/services/api-gateway/prisma ./prisma

# Switch to unprivileged user
USER quantroapex

EXPOSE 3000

# Health check directive using built-in Node fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health/live').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
