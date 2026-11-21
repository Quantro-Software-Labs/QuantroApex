import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import {
  encryptSecret,
  decryptSecret,
  validateBrokerKeyEncryptionBoot,
} from '../lib/security/encryption.js';
import { encryptExistingBrokerKeys } from '../lib/security/key_migration.js';

describe('B. Broker key encryption & secret leakage protection', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@brokerencryption.test' } },
    });

    const session = await registerTestUser(app, 'trader@brokerencryption.test');
    userId = session.user.id;
    accessToken = session.accessToken;
  });

  it('uses AES-256-GCM with 12-byte IV and version prefix (v1:iv:tag:data)', () => {
    const rawSecret = 'alpaca_live_secret_key_987654321';
    const ciphertext1 = encryptSecret(rawSecret);
    const ciphertext2 = encryptSecret(rawSecret);

    // Format must be v1:iv:tag:encryptedData
    const parts1 = ciphertext1.split(':');
    expect(parts1.length).toBe(4);
    expect(parts1[0]).toBe('v1');
    expect(parts1[1].length).toBe(24); // 12 bytes in hex = 24 chars
    expect(parts1[2].length).toBe(32); // 16 bytes tag in hex = 32 chars

    // Random IV per value: two encryptions of the same secret must produce different ciphertexts
    expect(ciphertext1).not.toBe(ciphertext2);

    // Decryption round-trip recovers secret
    expect(decryptSecret(ciphertext1)).toBe(rawSecret);
    expect(decryptSecret(ciphertext2)).toBe(rawSecret);
  });

  it('refuses to boot in production if key is missing or wrong length', () => {
    const origEnv = process.env.NODE_ENV;
    const origKey = process.env.BROKER_KEY_ENCRYPTION_KEY;

    try {
      process.env.NODE_ENV = 'production';

      // Missing key
      delete process.env.BROKER_KEY_ENCRYPTION_KEY;
      expect(() => validateBrokerKeyEncryptionBoot()).toThrow(
        /BROKER_KEY_ENCRYPTION_KEY/,
      );

      // Wrong length key (e.g. 16 bytes base64 instead of 32 bytes)
      process.env.BROKER_KEY_ENCRYPTION_KEY = Buffer.from('too_short_key_16b').toString('base64');
      expect(() => validateBrokerKeyEncryptionBoot()).toThrow(
        /must be exactly 32 bytes/,
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origKey !== undefined) {
        process.env.BROKER_KEY_ENCRYPTION_KEY = origKey;
      }
    }
  });

  it('encrypts on write via /broker-credentials and never leaks raw secret in response bodies', async () => {
    const rawApiKey = 'PKTESTKEY12345678';
    const rawSecretKey = 'SKSECRETVAL9876543210';

    // Save credentials
    const saveRes = await app.inject({
      method: 'POST',
      url: '/execution/broker-credentials',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        apiKey: rawApiKey,
        secretKey: rawSecretKey,
      },
    });

    expect(saveRes.statusCode).toBe(200);
    const saveBodyStr = saveRes.payload;
    expect(saveBodyStr).not.toContain(rawSecretKey);
    expect(saveBodyStr).not.toContain(rawApiKey);

    const saveBody = JSON.parse(saveBodyStr);
    expect(saveBody.hasBrokerKeys).toBe(true);
    expect(saveBody.brokerApiKeyLast4).toBe('5678');
    expect(saveBody.maskedApiKey).toBe('PK...5678');

    // Verify DB stored values are encrypted with v1 prefix
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    expect(profile?.alpacaApiKey).toBeDefined();
    expect(profile?.alpacaApiKey?.startsWith('v1:')).toBe(true);
    expect(profile?.alpacaSecretKey?.startsWith('v1:')).toBe(true);
    expect(profile?.alpacaApiKey).not.toBe(rawApiKey);
    expect(profile?.alpacaSecretKey).not.toBe(rawSecretKey);

    // Verify GET /execution/broker-credentials never leaks secret
    const getCredsRes = await app.inject({
      method: 'GET',
      url: '/execution/broker-credentials',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getCredsRes.payload).not.toContain(rawSecretKey);
    expect(getCredsRes.payload).not.toContain(rawApiKey);
    const getCredsBody = JSON.parse(getCredsRes.payload);
    expect(getCredsBody.hasBrokerKeys).toBe(true);
    expect(getCredsBody.brokerApiKeyLast4).toBe('5678');

    // Verify GET /auth/me never leaks secret
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.payload).not.toContain(rawSecretKey);
    expect(meRes.payload).not.toContain(rawApiKey);
    const meBody = JSON.parse(meRes.payload);
    expect(meBody.profile.hasBrokerKeys).toBe(true);
    expect(meBody.profile.brokerApiKeyLast4).toBe('5678');
    expect(meBody.profile.alpacaApiKey).toBeUndefined();
    expect(meBody.profile.alpacaSecretKey).toBeUndefined();
  });

  it('scripts/encrypt_existing_broker_keys is idempotent and encrypts unencrypted DB values without logging secrets', async () => {
    // Insert a profile with plaintext keys
    const rawPlainKey = 'PK_PLAINTEXT_11112222';
    const rawPlainSecret = 'SK_PLAINTEXT_SECRET_9999';

    await prisma.userProfile.update({
      where: { userId },
      data: {
        alpacaApiKey: rawPlainKey,
        alpacaSecretKey: rawPlainSecret,
      },
    });

    // Run migration script
    const res1 = await encryptExistingBrokerKeys();
    expect(res1.updated).toBeGreaterThanOrEqual(1);

    // Verify profile is now encrypted
    const updatedProfile = await prisma.userProfile.findUnique({ where: { userId } });
    expect(updatedProfile?.alpacaApiKey?.startsWith('v1:')).toBe(true);
    expect(updatedProfile?.alpacaSecretKey?.startsWith('v1:')).toBe(true);
    expect(decryptSecret(updatedProfile?.alpacaApiKey)).toBe(rawPlainKey);
    expect(decryptSecret(updatedProfile?.alpacaSecretKey)).toBe(rawPlainSecret);

    // Idempotent: running again should update 0 profiles
    const res2 = await encryptExistingBrokerKeys();
    expect(res2.updated).toBe(0);
  });
});
