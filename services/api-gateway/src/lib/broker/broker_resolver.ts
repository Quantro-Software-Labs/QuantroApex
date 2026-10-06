import type { AssetClass } from '../db/types.js';
import { IBrokerClient } from './broker_client.js';
import { AlpacaClient, defaultBrokerClient } from './alpaca_client.js';
import { CcxtClient, cryptoBrokerClient } from './ccxt_client.js';
import { OandaClient, forexBrokerClient } from './oanda_client.js';

export interface BrokerCredentials {
  alpacaApiKey?: string | null;
  alpacaSecretKey?: string | null;
  cryptoApiKey?: string | null;
  cryptoApiSecret?: string | null;
  cryptoExchange?: string | null;
  oandaApiKey?: string | null;
  oandaAccountId?: string | null;
}

/**
 * Resolve the correct third-party broker for an asset class.
 * Stocks → Alpaca | Crypto → CCXT | Forex → OANDA
 */
export function resolveBrokerClient(
  assetClass: AssetClass | string,
  credentials?: BrokerCredentials,
): IBrokerClient {
  const cls = String(assetClass).toUpperCase();

  if (cls === 'CRYPTO') {
    if (credentials?.cryptoApiKey && credentials?.cryptoApiSecret) {
      return new CcxtClient({
        exchangeId: credentials.cryptoExchange ?? undefined,
        apiKey: credentials.cryptoApiKey,
        apiSecret: credentials.cryptoApiSecret,
      });
    }
    return cryptoBrokerClient;
  }

  if (cls === 'FOREX') {
    if (credentials?.oandaApiKey && credentials?.oandaAccountId) {
      return new OandaClient({
        apiKey: credentials.oandaApiKey,
        accountId: credentials.oandaAccountId,
      });
    }
    return forexBrokerClient;
  }

  // STOCKS (default)
  if (credentials?.alpacaApiKey && credentials?.alpacaSecretKey) {
    return new AlpacaClient({
      apiKey: credentials.alpacaApiKey,
      apiSecret: credentials.alpacaSecretKey,
    });
  }
  return defaultBrokerClient;
}
