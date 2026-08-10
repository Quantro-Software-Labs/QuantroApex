import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { authenticate } from './auth.js';

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: config.jwt.accessSecret,
    sign: { expiresIn: config.jwt.accessExpiresIn },
  });

  app.decorate('authenticate', authenticate);
});
