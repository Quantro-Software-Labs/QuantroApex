import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV environment variable must be set. Server refusing to start.');
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parsePlanPrices(): Record<string, { amountKobo: number; currency: string; planName: string }> {
  if (process.env.PLAN_PRICES_JSON) {
    try {
      return JSON.parse(process.env.PLAN_PRICES_JSON);
    } catch {
      // fallback to default
    }
  }
  return {
    CORE: { amountKobo: 2900000, currency: 'NGN', planName: 'Core Plan' },
    PRO: { amountKobo: 7900000, currency: 'NGN', planName: 'Pro Plan' },
    ELITE: { amountKobo: 19900000, currency: 'NGN', planName: 'Elite Plan' },
  };
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV,
  isDev: process.env.NODE_ENV === 'development',

  databaseUrl: requireEnv(
    'DATABASE_URL',
    'postgresql://quantroapex:quantroapex_dev@localhost:5433/quantroapex?schema=public',
  ),
  directUrl: process.env.DIRECT_URL ?? '',

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },

  alpaca: {
    apiKey: process.env.ALPACA_API_KEY ?? '',
    apiSecret: process.env.ALPACA_SECRET_KEY ?? process.env.ALPACA_API_SECRET ?? '',
    baseUrl: process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets/v2',
    dataUrl: process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets/v2',
  },

  marketData: {
    alpacaKey: process.env.MARKET_DATA_ALPACA_KEY ?? '',
    alpacaSecret: process.env.MARKET_DATA_ALPACA_SECRET ?? '',
    cryptoExchange: process.env.CRYPTO_QUOTE_EXCHANGE ?? 'kraken',
  },

  trading: {
    liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true',
    spreadAndSlippage: {
      stocks: {
        halfSpreadBps: parseFloat(process.env.STOCKS_HALF_SPREAD_BPS ?? '2.5'),
        slippageBps: parseFloat(process.env.STOCKS_SLIPPAGE_BPS ?? '5.0'),
      },
      crypto: {
        halfSpreadBps: parseFloat(process.env.CRYPTO_HALF_SPREAD_BPS ?? '5.0'),
        slippageBps: parseFloat(process.env.CRYPTO_SLIPPAGE_BPS ?? '10.0'),
      },
      forex: {
        halfSpreadBps: parseFloat(process.env.FOREX_HALF_SPREAD_BPS ?? '1.5'),
        slippageBps: parseFloat(process.env.FOREX_SLIPPAGE_BPS ?? '2.0'),
      },
    },
  },

  planPrices: parsePlanPrices(),

  polygon: {
    apiKey: process.env.POLYGON_API_KEY ?? '',
    baseUrl: process.env.POLYGON_BASE_URL ?? 'https://api.polygon.io',
  },

  crypto: {
    exchange: process.env.CRYPTO_EXCHANGE ?? 'binance',
    apiKey: process.env.CRYPTO_API_KEY ?? '',
    apiSecret: process.env.CRYPTO_API_SECRET ?? '',
  },

  oanda: {
    apiKey: process.env.OANDA_API_KEY ?? '',
    accountId: process.env.OANDA_ACCOUNT_ID ?? '',
    baseUrl: process.env.OANDA_BASE_URL ?? 'https://api-fxpractice.oanda.com',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    fromNumber: process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_FROM_NUMBER ?? '',
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? '',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? '',
  },

  sumsub: {
    appToken: process.env.SUMSUB_APP_TOKEN ?? '',
    secretKey: process.env.SUMSUB_SECRET_KEY ?? '',
    webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET ?? '',
    levelName: process.env.SUMSUB_LEVEL_NAME ?? 'basic-kyc-level',
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    sendgridApiKey: process.env.SENDGRID_API_KEY ?? '',
    from: process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? 'noreply@quantrolabs.app',
  },

  posthog: {
    apiKey: process.env.POSTHOG_API_KEY ?? '',
    host: process.env.POSTHOG_HOST ?? 'https://app.posthog.com',
  },

  sentry: {
    dsn: process.env.SENTRY_DSN ?? '',
  },

  quantEngine: {
    baseUrl: process.env.AI_SERVICE_URL ?? process.env.QUANT_ENGINE_URL ?? 'http://127.0.0.1:8001',
  },

  marketObserver: {
    intervalMs: parseInt(process.env.MARKET_OBSERVER_INTERVAL_MS ?? '60000', 10),
  },

  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
} as const;
