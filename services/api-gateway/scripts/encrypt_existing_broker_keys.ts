import { prisma } from '../src/lib/prisma.js';
import { encryptExistingBrokerKeys } from '../src/lib/security/key_migration.js';

export { encryptExistingBrokerKeys };

async function main() {
  process.stdout.write('[Migration] Starting idempotent encryption of existing broker keys...\n');
  try {
    const result = await encryptExistingBrokerKeys();
    process.stdout.write(
      `[Migration] Completed: checked ${result.processed} profiles, updated ${result.updated} profiles with encrypted keys.\n`,
    );
  } catch (err) {
    process.stderr.write(
      `[Migration] Error during broker keys encryption: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes('encrypt_existing_broker_keys')) {
  main();
}
