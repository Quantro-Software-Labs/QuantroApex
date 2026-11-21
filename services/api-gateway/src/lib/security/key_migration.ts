import { prisma } from '../prisma.js';
import { encryptSecret } from './encryption.js';

export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  // Check for versioned format (v1:iv:tag:data) or legacy format (iv:tag:data)
  if (parts.length === 4 && parts[0].startsWith('v')) {
    const isHex = (s: string) => /^[0-9a-fA-F]+$/.test(s);
    return isHex(parts[1]) && isHex(parts[2]) && isHex(parts[3]);
  }
  if (parts.length === 3) {
    const isHex = (s: string) => /^[0-9a-fA-F]+$/.test(s);
    return isHex(parts[0]) && isHex(parts[1]) && isHex(parts[2]);
  }
  return false;
}

export async function encryptExistingBrokerKeys(): Promise<{ processed: number; updated: number }> {
  const profiles = await prisma.userProfile.findMany({
    where: {
      OR: [
        { alpacaApiKey: { not: null } },
        { alpacaSecretKey: { not: null } },
      ],
    },
  });

  let updated = 0;

  for (const profile of profiles) {
    let needsUpdate = false;
    let encryptedApiKey = profile.alpacaApiKey;
    let encryptedSecretKey = profile.alpacaSecretKey;

    if (profile.alpacaApiKey && !isEncrypted(profile.alpacaApiKey)) {
      encryptedApiKey = encryptSecret(profile.alpacaApiKey);
      needsUpdate = true;
    }

    if (profile.alpacaSecretKey && !isEncrypted(profile.alpacaSecretKey)) {
      encryptedSecretKey = encryptSecret(profile.alpacaSecretKey);
      needsUpdate = true;
    }

    if (needsUpdate) {
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
          alpacaApiKey: encryptedApiKey,
          alpacaSecretKey: encryptedSecretKey,
        },
      });
      updated++;
    }
  }

  return { processed: profiles.length, updated };
}
