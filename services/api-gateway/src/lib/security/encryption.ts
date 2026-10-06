import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Bytes for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_ACCESS_SECRET || 'quantroapex-secure-fallback-encryption-key-min32chars';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt sensitive plain text string (e.g. API keys, secrets).
 * Returns string formatted as iv:authTag:encryptedHex
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt cipher string formatted as iv:authTag:encryptedHex.
 * If input is unencrypted plain text (legacy fallback), returns input as-is.
 */
export function decryptSecret(cipherText: string | null | undefined): string {
  if (!cipherText) return '';
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    // Return plain text if not formatted as iv:authTag:encrypted
    return cipherText;
  }

  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, log warning and return raw value
    process.stderr.write(`Decryption warning: ${err instanceof Error ? err.message : String(err)}\n`);
    return cipherText;
  }
}
