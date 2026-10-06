import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';

/** Issue a Firebase-dev bearer token for tests (no real Firebase needed). */
export function firebaseTestAuth(emailOrPhone?: string) {
  const contact = emailOrPhone ?? `user_${Date.now()}@test.com`;
  const firebaseUid = `firebase_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const token = `firebase_dev:${firebaseUid}:${contact}`;
  return {
    firebaseUid,
    email: contact.startsWith('+') ? null : contact,
    phone: contact.startsWith('+') ? contact : null,
    token,
    headers: { authorization: `Bearer ${token}` },
  };
}

export async function registerTestUser(app: FastifyInstance, email?: string) {
  const auth = firebaseTestAuth(email);
  const me = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: auth.headers,
  });

  if (me.statusCode !== 200) {
    throw new Error(`Failed to bootstrap test user: ${me.statusCode} ${me.payload}`);
  }

  const body = JSON.parse(me.payload);
  return {
    ...auth,
    accessToken: auth.token,
    user: body,
  };
}

export async function cleanupTestUsers(emailSuffix = '@test.com') {
  await prisma.user.deleteMany({
    where: { email: { endsWith: emailSuffix } },
  });
}
