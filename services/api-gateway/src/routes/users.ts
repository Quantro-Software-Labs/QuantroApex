import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';

/** PATCH /users/profile — post-registration profile setup */
export async function usersRoutes(app: FastifyInstance) {
  app.patch('/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(120).optional(),
      preferredMarket: z.string().min(2).max(64).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.preferredMarket !== undefined && {
          preferredMarket: parsed.data.preferredMarket,
        }),
      },
    });

    return reply.send({
      user: {
        id: user.id,
        name: user.name,
        preferredMarket: user.preferredMarket,
        email: user.email,
        phone: user.phone,
      },
    });
  });
}
