import type { AssetClass } from '../db/types.js';
import { IBrokerClient } from './broker_client.js';
import { AlpacaClient } from './alpaca_client.js';
import { CcxtClient } from './ccxt_client.js';
import { OandaClient } from './oanda_client.js';
import { decryptSecret } from '../security/encryption.js';

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
 * Resolve the correct third-party broker for an asset class in LIVE mode.
 * Stocks → Alpaca | Crypto → CCXT | Forex → OANDA
 * Requires user's own broker credentials. Throws if missing.
 * Decrypts credentials only inside broker_resolver right before building the client.
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
        apiKey: decryptSecret(credentials.cryptoApiKey),
        apiSecret: decryptSecret(credentials.cryptoApiSecret),
      });
    }
    throw new Error('No broker credentials configured for LIVE trading on CRYPTO.');
  }

  if (cls === 'FOREX') {
    if (credentials?.oandaApiKey && credentials?.oandaAccountId) {
      return new OandaClient({
        apiKey: decryptSecret(credentials.oandaApiKey),
        accountId: credentials.oandaAccountId,
      });
    }
    throw new Error('No broker credentials configured for LIVE trading on FOREX.');
  }

  // STOCKS (default)
  if (credentials?.alpacaApiKey && credentials?.alpacaSecretKey) {
    return new AlpacaClient({
      apiKey: decryptSecret(credentials.alpacaApiKey),
      apiSecret: decryptSecret(credentials.alpacaSecretKey),
    });
  }
  throw new Error('No broker credentials configured for LIVE trading on STOCKS.');
}
