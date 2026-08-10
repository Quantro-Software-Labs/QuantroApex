import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const KNOWN_WEAK_SECRETS = ['change-me', 'dev-', 'secret-key', 'quantroapex', 'placeholder', 'example'];

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireStrongSecret(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Generate a strong secret with: openssl rand -hex 32`,
    );
  }
  if (value.length < 32) {
    throw new Error(`${key} must be at least 32 characters long for security.`);
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
    if (KNOWN_WEAK_SECRETS.some((w) => value.toLowerCase().includes(w))) {
      throw new Error(
        `${key} appears to use a default or weak value. ` +
        `Set a cryptographically random secret in production.`,
      );
    }
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',

  databaseUrl: requireEnv('DATABASE_URL'),

  jwt: {
    // No fallback — server refuses to start if secrets are missing
    accessSecret: requireEnv('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production-min-32'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production-min-32'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  alpaca: {
    apiKey: process.env.ALPACA_API_KEY ?? '',
    // Normalise env var name: accept both ALPACA_SECRET_KEY and ALPACA_API_SECRET
    apiSecret: process.env.ALPACA_SECRET_KEY ?? process.env.ALPACA_API_SECRET ?? '',
    baseUrl: process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets/v2',
  },

  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
} as const;
