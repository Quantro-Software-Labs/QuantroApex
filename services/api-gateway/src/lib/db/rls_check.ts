import { prisma } from '../prisma.js';

export async function assertDatabaseRlsAccess(): Promise<void> {
  try {
    // SELECT on users to confirm database role can access users table without being blocked by RLS
    await prisma.user.findFirst({ select: { id: true } });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (
      msg.includes('permission denied') ||
      err?.code === '42501' ||
      msg.toLowerCase().includes('row-level security') ||
      msg.toLowerCase().includes('rls')
    ) {
      throw new Error(
        `CRITICAL: Database connection is locked out by Row-Level Security (RLS). ` +
          `The role in DATABASE_URL must own the tables or have BYPASSRLS privilege ` +
          `(e.g., ALTER ROLE <username> WITH BYPASSRLS;). Details: ${err.message}`,
      );
    }
    // In unit tests or mock environments where DB might not be connected yet during initialization
    if (process.env.NODE_ENV !== 'test') {
      console.warn('RLS startup check warning:', msg);
    }
  }
}
