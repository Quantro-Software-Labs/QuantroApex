import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { posthog } from '../lib/analytics/posthog_client.js';
import { sendWaitlistConfirmation } from '../lib/email/resend_client.js';

export async function waitlistRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/', async (request, reply) => {
    const schema = z.object({
      assetClass: z.enum(['CRYPTO', 'FOREX']),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    await prisma.waitlist.upsert({
      where: {
        userId_assetClass: { userId, assetClass: parsed.data.assetClass },
      },
      create: { userId, assetClass: parsed.data.assetClass },
      update: {},
    });

    const totalCount = await prisma.waitlist.count({
      where: { assetClass: parsed.data.assetClass },
    });

    posthog.capture({
      distinctId: userId,
      event: 'waitlist_joined',
      properties: { asset_class: parsed.data.assetClass },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.email) {
      await sendWaitlistConfirmation(user.email, parsed.data.assetClass);
    }

    return reply.send({ joined: true, totalCount });
  });

  app.get('/count', async (request, reply) => {
    const schema = z.object({ assetClass: z.enum(['CRYPTO', 'FOREX']) });
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError' });
    }
    const totalCount = await prisma.waitlist.count({
      where: { assetClass: parsed.data.assetClass },
    });
    return reply.send({ assetClass: parsed.data.assetClass, totalCount });
  });
}
