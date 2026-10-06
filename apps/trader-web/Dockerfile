# ==============================================================================
# QuantroApex Trader Web — Next.js Production Dockerfile
# ==============================================================================

FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable pnpm

COPY apps/trader-web/package.json apps/trader-web/pnpm-lock.yaml ./apps/trader-web/
COPY pnpm-workspace.yaml ./

WORKDIR /app/apps/trader-web
RUN pnpm install --frozen-lockfile

COPY apps/trader-web ./

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder /app/apps/trader-web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/trader-web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/trader-web/.next/static ./.next/static

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
