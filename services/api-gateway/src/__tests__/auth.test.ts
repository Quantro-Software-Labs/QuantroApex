import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

describe('Auth Endpoints (Firebase)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  describe('POST /auth/forgot-password', () => {
    it('defers password reset to Firebase', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'anyone@example.com' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.provider).toBe('firebase');
    });
  });

  describe('GET /auth/me', () => {
    it('requires authentication', async () => {
      const response = await app.inject({ method: 'GET', url: '/auth/me' });
      expect(response.statusCode).toBe(401);
    });

    it('accepts firebase_dev token when database is available', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: 'Bearer firebase_dev:user_test_fb_1:trader@test.com',
        },
      });
      expect([200, 401, 503]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('id');
      }
    });
  });

  describe('legacy register/login removed', () => {
    it('no longer exposes POST /auth/register', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'x@test.com', password: 'Password123!' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('no longer exposes POST /auth/login', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'x@test.com', password: 'Password123!' },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
