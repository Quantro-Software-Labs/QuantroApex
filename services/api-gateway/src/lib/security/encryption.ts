import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for AES-GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes for auth tag
export const CURRENT_KEY_VERSION = 'v1';

/**
 * Validates that the broker key encryption key is properly configured.
 * In production, refuses to boot if BROKER_KEY_ENCRYPTION_KEY is missing or not 32 bytes (base64 decoded).
 */
export function validateBrokerKeyEncryptionBoot(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const b64Key = process.env.BROKER_KEY_ENCRYPTION_KEY;

  if (isProd) {
    if (!b64Key) {
      throw new Error(
        'FATAL: BROKER_KEY_ENCRYPTION_KEY is required in production. Must be a 32-byte base64-encoded string.',
      );
    }
    const keyBuf = Buffer.from(b64Key, 'base64');
    if (keyBuf.length !== 32) {
      throw new Error(
        `FATAL: BROKER_KEY_ENCRYPTION_KEY must be exactly 32 bytes when decoded from base64 (got ${keyBuf.length} bytes).`,
      );
    }
  } else if (b64Key) {
    const keyBuf = Buffer.from(b64Key, 'base64');
    if (keyBuf.length !== 32) {
      throw new Error(
        `BROKER_KEY_ENCRYPTION_KEY must be exactly 32 bytes when decoded from base64 (got ${keyBuf.length} bytes).`,
      );
    }
  }
}

/**
 * Resolve 32-byte Buffer key for a given version.
 */
function getEncryptionKey(_keyVersion = CURRENT_KEY_VERSION): Buffer {
  const b64Key = process.env.BROKER_KEY_ENCRYPTION_KEY;

  if (b64Key) {
    const buf = Buffer.from(b64Key, 'base64');
    if (buf.length === 32) {
      return buf;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`BROKER_KEY_ENCRYPTION_KEY must be 32 bytes (got ${buf.length}).`);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('BROKER_KEY_ENCRYPTION_KEY is required in production.');
  }

  // Non-production fallback only (never used in production)
  return Buffer.from('MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=', 'base64');
}

/**
 * Encrypt sensitive plain text string (e.g. broker API keys, secrets).
 * Returns ciphertext formatted as: `${keyVersion}:${ivHex}:${authTagHex}:${encryptedHex}`
 */
export function encryptSecret(plainText: string, keyVersion = CURRENT_KEY_VERSION): string {
  if (!plainText) return '';

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(keyVersion), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${keyVersion}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt cipher string formatted as:
 * - Versioned: `${keyVersion}:${ivHex}:${authTagHex}:${encryptedHex}` (4 parts)
 * - Legacy: `${ivHex}:${authTagHex}:${encryptedHex}` (3 parts)
 * If input is unencrypted plain text (legacy fallback/idempotency), returns input as-is.
 */
export function decryptSecret(cipherText: string | null | undefined): string {
  if (!cipherText) return '';
  const parts = cipherText.split(':');

  let keyVersion = CURRENT_KEY_VERSION;
  let ivHex: string;
  let authTagHex: string;
  let encryptedHex: string;

  if (parts.length === 4) {
    [keyVersion, ivHex, authTagHex, encryptedHex] = parts;
  } else if (parts.length === 3) {
    [ivHex, authTagHex, encryptedHex] = parts;
  } else {
    // Return plain text if not formatted as ciphertext
    return cipherText;
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(keyVersion), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    process.stderr.write(
      `Decryption warning: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return cipherText;
  }
}
