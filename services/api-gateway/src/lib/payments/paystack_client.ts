/**
 * Paystack — Naira cards, bank transfer, USSD, subscriptions.
 * Real payments implementation with server-side price table and constant-time HMAC verification.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/index.js';
import type { PlanTier } from '@prisma/client';

const BASE = 'https://api.paystack.co';

export interface PlanPriceInfo {
  plan: PlanTier;
  planCode: string;
  amountKobo: number;
  currency: string;
}

export function getServerPriceTable(): Record<string, PlanPriceInfo> {
  const prices = config.planPrices;
  const table: Record<string, PlanPriceInfo> = {};
  for (const [key, val] of Object.entries(prices)) {
    table[key] = {
      plan: key as PlanTier,
      planCode: process.env[`PAYSTACK_PLAN_${key}`] || `PLN_${key.toLowerCase()}_monthly`,
      amountKobo: val.amountKobo,
      currency: val.currency,
    };
  }
  return table;
}

export const SERVER_PRICE_TABLE: Record<string, PlanPriceInfo> = new Proxy({} as any, {
  get(_target, prop: string) {
    return getServerPriceTable()[prop];
  },
  ownKeys() {
    return Object.keys(getServerPriceTable());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const val = getServerPriceTable()[prop as string];
    return val ? { configurable: true, enumerable: true, value: val } : undefined;
  },
});

export function getPlanByCodeOrName(codeOrName?: string | null): PlanPriceInfo | undefined {
  if (!codeOrName) return undefined;
  const upper = codeOrName.toUpperCase();
  if (SERVER_PRICE_TABLE[upper]) return SERVER_PRICE_TABLE[upper];
  for (const info of Object.values(SERVER_PRICE_TABLE)) {
    if (info.planCode === codeOrName || info.plan === upper) {
      return info;
    }
  }
  return undefined;
}

export class PaymentsUnavailableError extends Error {
  statusCode = 503;
  code = 'PAYMENTS_UNAVAILABLE';
  constructor(message = 'Payments unavailable: Paystack secret key not configured') {
    super(message);
    this.name = 'PaymentsUnavailableError';
  }
}

export interface PaystackTransactionVerification {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paidAt?: string;
  planCode?: string;
  metadata?: Record<string, any>;
  customer?: { email?: string; id?: string };
}

export interface PaystackFakeClient {
  verifyTransaction?: (reference: string) => Promise<PaystackTransactionVerification>;
  initializeTransaction?: (params: any) => Promise<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
  }>;
}

let activeFakeClient: PaystackFakeClient | null = null;

export function setPaystackFakeClient(fake: PaystackFakeClient | null) {
  activeFakeClient = fake;
}

export function getPaystackFakeClient(): PaystackFakeClient | null {
  return activeFakeClient;
}

export class PaystackClient {
  private secretKey: string;
  private publicKey: string;

  constructor(opts?: { secretKey?: string; publicKey?: string }) {
    this.secretKey = opts?.secretKey || process.env.PAYSTACK_SECRET_KEY || config.paystack.secretKey || '';
    this.publicKey = opts?.publicKey || process.env.PAYSTACK_PUBLIC_KEY || config.paystack.publicKey || '';
  }

  private getSecretKey(): string {
    return this.secretKey || process.env.PAYSTACK_SECRET_KEY || config.paystack.secretKey || '';
  }

  isConfigured(): boolean {
    return Boolean(this.getSecretKey());
  }

  getPublicKey(): string {
    return this.publicKey || process.env.PAYSTACK_PUBLIC_KEY || config.paystack.publicKey || '';
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const key = this.getSecretKey();
    if (!key && !activeFakeClient) {
      throw new PaymentsUnavailableError();
    }

    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const body = (await res.json()) as T & { message?: string };
    if (!res.ok) {
      throw new Error(`Paystack error ${res.status}: ${(body as { message?: string }).message ?? JSON.stringify(body)}`);
    }
    return body;
  }

  async initializeTransaction(params: {
    email: string;
    amount: number; // kobo
    currency?: string;
    callbackUrl?: string;
    plan?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
  }> {
    if (activeFakeClient?.initializeTransaction) {
      return activeFakeClient.initializeTransaction(params);
    }
    if (!this.getSecretKey()) {
      throw new PaymentsUnavailableError();
    }

    const body = await this.request<{
      data: { authorization_url: string; access_code: string; reference: string };
    }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: params.email,
        amount: params.amount,
        currency: params.currency ?? 'NGN',
        callback_url: params.callbackUrl,
        plan: params.plan,
        metadata: params.metadata,
      }),
    });
    return {
      authorizationUrl: body.data.authorization_url,
      accessCode: body.data.access_code,
      reference: body.data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<PaystackTransactionVerification> {
    if (activeFakeClient?.verifyTransaction) {
      return activeFakeClient.verifyTransaction(reference);
    }
    if (!this.getSecretKey()) {
      throw new PaymentsUnavailableError();
    }

    const body = await this.request<{
      data: {
        status: string;
        reference: string;
        amount: number;
        currency: string;
        paid_at?: string;
        plan?: { plan_code?: string };
        metadata?: Record<string, any>;
        customer?: { email?: string; id?: string };
      };
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);

    return {
      status: body.data.status,
      reference: body.data.reference,
      amount: body.data.amount,
      currency: body.data.currency,
      paidAt: body.data.paid_at,
      planCode: body.data.plan?.plan_code,
      metadata: body.data.metadata,
      customer: body.data.customer,
    };
  }

  async createSubscription(params: {
    customer: string;
    plan: string;
    startDate?: string;
  }): Promise<{
    subscriptionCode?: string;
    emailToken?: string;
    status?: string;
  }> {
    if (!this.secretKey && !activeFakeClient) {
      throw new PaymentsUnavailableError();
    }

    const body = await this.request<{
      data: {
        subscription_code?: string;
        email_token?: string;
        status?: string;
      };
    }>('/subscription', {
      method: 'POST',
      body: JSON.stringify({
        customer: params.customer,
        plan: params.plan,
        start_date: params.startDate,
      }),
    });
    return {
      subscriptionCode: body.data.subscription_code,
      emailToken: body.data.email_token,
      status: body.data.status,
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    const key = this.getSecretKey();
    if (!key || !signature) return false;
    const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf-8');
    const expectedHex = createHmac('sha512', key).update(rawBuffer).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedHex, 'hex');
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    return timingSafeEqual(sigBuf, expBuf);
  }
}

export const paystackClient = new PaystackClient();
