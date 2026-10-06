/**
 * Ensures a Firebase-authenticated identity has a corresponding app user row.
 * Auth lives in Firebase — we only store profile + trading state in Postgres.
 */
import {
  createUserWithBootstrap,
  findUserByFirebaseUid,
  type AppUser,
} from '../db/repos.js';

export type { AppUser };

export async function ensureAppUser(params: {
  firebaseUid: string;
  email?: string;
  phone?: string | null;
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<AppUser> {
  const email = params.email?.toLowerCase().trim() || null;

  const existing = await findUserByFirebaseUid(params.firebaseUid);
  if (existing) return existing;

  try {
    return await createUserWithBootstrap({
      firebaseUid: params.firebaseUid,
      email,
      phone: params.phone,
      name: params.name,
      firstName: params.firstName,
      lastName: params.lastName,
    });
  } catch {
    // Race: another request created the row
    const raced = await findUserByFirebaseUid(params.firebaseUid);
    if (raced) return raced;
    throw new Error('Failed to create app user');
  }
}

export function safeUser(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    experienceLevel: user.experienceLevel,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
  };
}
