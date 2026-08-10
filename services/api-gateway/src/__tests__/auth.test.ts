import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('Auth Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    // Clean up test users
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@test.com' } },
    });
  });

  describe('POST /auth/register', () => {
    it('should successfully register a new user and return tokens & profile', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'newuser@test.com',
          password: 'Password123!',
          firstName: 'Apex',
          lastName: 'Trader',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);

      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.user).toMatchObject({
        email: 'newuser@test.com',
        firstName: 'Apex',
        lastName: 'Trader',
        experienceLevel: 'NEWCOMER',
      });

      // Verify DB creation of linked entities
      const createdUser = await prisma.user.findUnique({
        where: { email: 'newuser@test.com' },
        include: {
          profile: true,
          onboardingProgress: true,
          agentState: true,
          portfolios: true,
        },
      });

      expect(createdUser).not.toBeNull();
      expect(createdUser?.profile).not.toBeNull();
      expect(createdUser?.onboardingProgress?.path).toBe('NEWCOMER');
      expect(createdUser?.portfolios.length).toBe(2);
    });

    it('should reject registration if email is already taken', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@test.com',
          password: 'Password123!',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@test.com',
          password: 'Password123!',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Conflict');
    });

    it('should fail validation on invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'loginuser@test.com',
          password: 'Password123!',
          firstName: 'Login',
          lastName: 'User',
        },
      });
    });

    it('should authenticate user with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'loginuser@test.com',
          password: 'Password123!',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.user.email).toBe('loginuser@test.com');
    });

    it('should reject invalid password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'loginuser@test.com',
          password: 'WrongPassword!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.message).toBe('Invalid email or password');
    });
  });

  describe('POST /auth/refresh & /auth/me & /auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'tokenuser@test.com',
          password: 'Password123!',
        },
      });

      const body = JSON.parse(registerRes.payload);
      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
    });

    it('should get current user profile with valid JWT access token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.email).toBe('tokenuser@test.com');
      expect(body).toHaveProperty('profile');
      expect(body).toHaveProperty('onboardingProgress');
    });

    it('should refresh access token using valid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.refreshToken).not.toBe(refreshToken);
    });

    it('should invalidate refresh tokens upon logout', async () => {
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(logoutRes.statusCode).toBe(200);

      // Attempting to refresh should now fail
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken,
        },
      });

      expect(refreshRes.statusCode).toBe(401);
    });
  });
});
