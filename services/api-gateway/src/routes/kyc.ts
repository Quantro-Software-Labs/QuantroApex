/**
 * Sumsub KYC — global identity verification (220+ countries).
 */
import { createHmac } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId } from '../plugins/auth.js';
import { posthog } from '../lib/analytics/posthog_client.js';
import { config } from '../config/index.js';

const SUMSUB_BASE = 'https://api.sumsub.com';

function plainEnglishRejection(label: string | null): string {
  const reasons: Record<string, string> = {
    FORGERY: 'The document could not be verified. Please try a different document.',
    DOCUMENT_TEMPLATE: 'We could not read your document clearly. Please try again with better lighting.',
    LOW_QUALITY: 'The document image was too blurry. Please retake with better lighting.',
    SELFIE_MISMATCH: 'The selfie did not match the document photo. Please try again.',
    FAKE_SELFIE: 'We could not verify the selfie. Please try again in good lighting.',
  };
  return (
    reasons[label || ''] ||
    'Verification was unsuccessful. Please try again with a different document.'
  );
}

async function sumsubApiCall(method: string, path: string, body?: object) {
  const appToken = process.env.SUMSUB_APP_TOKEN || '';
  const secret = process.env.SUMSUB_SECRET_KEY || '';
  if (!appToken || !secret) {
    return {
      id: `mock_applicant_${Date.now()}`,
      token: `mock_sumsub_token_${Date.now()}`,
      mock: true,
    };
  }

  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const signature = createHmac('sha256', secret)
    .update(ts + method.toUpperCase() + path + bodyStr)
    .digest('hex');

  const res = await fetch(`${SUMSUB_BASE}${path}`, {
    method,
    headers: {
      'X-App-Token': appToken,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': ts,
      'Content-Type': 'application/json',
    },
    body: body ? bodyStr : undefined,
  });
  return res.json();
}

export async function kycRoutes(app: FastifyInstance) {
  app.post('/webhook', async (request, reply) => {
    const signature = String(request.headers['x-payload-digest'] || '');
    const secret = process.env.SUMSUB_WEBHOOK_SECRET || '';
    const requireSignature =
      Boolean(secret) || process.env.NODE_ENV === 'production';
    if (requireSignature) {
      if (!secret) {
        return reply.status(503).send({ error: 'WebhookSecretNotConfigured' });
      }
      const expected = createHmac('sha256', secret)
        .update(JSON.stringify(request.body))
        .digest('hex');
      if (signature !== expected) {
        return reply.status(401).send({ error: 'InvalidSignature' });
      }
    }

    const body = request.body as {
      type?: string;
      applicantId?: string;
      reviewResult?: {
        reviewAnswer?: string;
        rejectLabels?: string[];
        reviewId?: string;
      };
    };

    const kyc = await prisma.kYCVerification.findFirst({
      where: { sumsubApplicantId: body.applicantId },
    });
    if (!kyc) return reply.status(200).send({ ok: true });

    if (body.type === 'applicantPending') {
      await prisma.kYCVerification.update({
        where: { id: kyc.id },
        data: { status: 'UNDER_REVIEW' },
      });
    }

    if (body.type === 'applicantReviewed') {
      const approved = body.reviewResult?.reviewAnswer === 'GREEN';
      const rejectionReason = body.reviewResult?.rejectLabels?.[0] || null;
      await prisma.kYCVerification.update({
        where: { id: kyc.id },
        data: {
          status: approved ? 'VERIFIED' : 'REJECTED',
          verifiedAt: approved ? new Date() : null,
          rejectionReason: approved ? null : plainEnglishRejection(rejectionReason),
          sumsubReviewId: body.reviewResult?.reviewId,
        },
      });
      posthog.capture({
        distinctId: kyc.userId,
        event: approved ? 'kyc_completed' : 'kyc_rejected',
      });
    }

    return reply.status(200).send({ ok: true });
  });

  app.register(async (authed) => {
    authed.addHook('preHandler', app.authenticate);

    authed.post('/initiate', async (request, reply) => {
      const userId = getUserId(request);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const level = process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';

      const applicant = await sumsubApiCall(
        'POST',
        `/resources/applicants?levelName=${level}`,
        {
          externalUserId: userId,
          email: user?.email,
          phone: user?.phone,
        },
      );

      const applicantId = String((applicant as { id?: string }).id || `mock_${userId}`);
      const tokenRes = await sumsubApiCall(
        'POST',
        `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=${level}`,
      );
      const accessToken = String(
        (tokenRes as { token?: string }).token || `mock_token_${Date.now()}`,
      );

      await prisma.kYCVerification.upsert({
        where: { userId },
        create: { userId, sumsubApplicantId: applicantId, status: 'SUBMITTED' },
        update: { sumsubApplicantId: applicantId, status: 'SUBMITTED' },
      });

      posthog.capture({ distinctId: userId, event: 'kyc_initiated' });

      return reply.status(201).send({
        accessToken,
        applicantId,
        level,
        sandbox: !process.env.SUMSUB_APP_TOKEN,
      });
    });

    authed.get('/status', async (request, reply) => {
      const userId = getUserId(request);
      const kyc = await prisma.kYCVerification.findUnique({ where: { userId } });
      return reply.send({
        status: kyc?.status ?? 'PENDING',
        rejectionReason: kyc?.rejectionReason ?? null,
        verifiedAt: kyc?.verifiedAt ?? null,
        countryCode: kyc?.countryCode ?? null,
      });
    });

    // Dev / sandbox only — lets Flutter complete mock KYC without Sumsub keys
    authed.post('/sandbox-complete', async (request, reply) => {
      if (process.env.SUMSUB_APP_TOKEN) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Sandbox complete is disabled when Sumsub is configured',
        });
      }
      const schema = z.object({
        result: z.enum(['VERIFIED', 'REJECTED']).default('VERIFIED'),
      });
      const parsed = schema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError' });
      }
      const userId = getUserId(request);
      const approved = parsed.data.result === 'VERIFIED';
      const kyc = await prisma.kYCVerification.upsert({
        where: { userId },
        create: {
          userId,
          sumsubApplicantId: `mock_${userId}`,
          status: approved ? 'VERIFIED' : 'REJECTED',
          verifiedAt: approved ? new Date() : null,
          rejectionReason: approved
            ? null
            : 'Verification was unsuccessful. Please try again with a different document.',
        },
        update: {
          status: approved ? 'VERIFIED' : 'REJECTED',
          verifiedAt: approved ? new Date() : null,
          rejectionReason: approved
            ? null
            : 'Verification was unsuccessful. Please try again with a different document.',
        },
      });
      return reply.send({
        status: kyc.status,
        rejectionReason: kyc.rejectionReason,
        verifiedAt: kyc.verifiedAt,
      });
    });
  });
}

/** Gate LIVE trades behind verified KYC */
export async function assertKycVerified(userId: string): Promise<void> {
  if (config.isDev && process.env.KYC_BYPASS === 'true') return;
  const kyc = await prisma.kYCVerification.findUnique({ where: { userId } });
  if (kyc?.status !== 'VERIFIED') {
    const err = new Error('Identity verification required before live trading') as Error & {
      statusCode?: number;
      name?: string;
    };
    err.statusCode = 403;
    err.name = 'KYC_REQUIRED';
    throw err;
  }
}
