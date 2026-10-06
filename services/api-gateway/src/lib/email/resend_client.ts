import { Resend } from 'resend';
import { config } from '../../config/index.js';
import {
  dailyDigestTemplate,
  waitlistConfirmationTemplate,
  weeklyReportTemplate,
  welcomeTemplate,
} from './templates/index.js';

export interface EmailSendResult {
  id: string | null;
  provider: 'resend' | 'sendgrid' | 'noop';
  success: boolean;
  error?: string;
}

export class ResendClient {
  private apiKey: string;
  private from: string;
  private sendgridKey: string;
  private client: Resend | null = null;

  constructor(opts?: { apiKey?: string; from?: string; sendgridKey?: string }) {
    this.apiKey = opts?.apiKey || config.email.resendApiKey || '';
    this.from = opts?.from || config.email.from || 'noreply@quantrolabs.app';
    this.sendgridKey = opts?.sendgridKey || config.email.sendgridApiKey || '';
  }

  isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return this.apiKey.length > 0;
  }

  private getClient(): Resend {
    if (!this.client) {
      this.client = new Resend(this.apiKey);
    }
    return this.client;
  }

  private async send(to: string, subject: string, html: string): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      process.stdout.write(
        JSON.stringify({
          event: 'email_noop',
          to,
          subject,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
      return { id: null, provider: 'noop', success: true };
    }

    try {
      const result = await this.getClient().emails.send({
        from: this.from,
        to,
        subject,
        html,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return {
        id: result.data?.id ?? null,
        provider: 'resend',
        success: true,
      };
    } catch (err) {
      const error = err as Error;
      if (this.sendgridKey) {
        return this.sendViaSendGrid(to, subject, html, error.message);
      }
      return { id: null, provider: 'resend', success: false, error: error.message };
    }
  }

  private async sendViaSendGrid(
    to: string,
    subject: string,
    html: string,
    priorError: string,
  ): Promise<EmailSendResult> {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: this.from.includes('<') ? this.from.replace(/.*<([^>]+)>.*/, '$1') : this.from },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          id: null,
          provider: 'sendgrid',
          success: false,
          error: `Resend failed (${priorError}); SendGrid: ${text}`,
        };
      }

      return {
        id: res.headers.get('x-message-id'),
        provider: 'sendgrid',
        success: true,
      };
    } catch (err) {
      const error = err as Error;
      return {
        id: null,
        provider: 'sendgrid',
        success: false,
        error: `Resend failed (${priorError}); SendGrid: ${error.message}`,
      };
    }
  }

  async sendWelcome(to: string, firstName?: string): Promise<EmailSendResult> {
    const tpl = welcomeTemplate(firstName || 'trader');
    return this.send(to, tpl.subject, tpl.html);
  }

  async sendTradeSummary(
    to: string,
    summary: { symbol: string; side: string; qty: number; pnl?: number },
  ): Promise<EmailSendResult> {
    const pnlLine =
      summary.pnl !== undefined
        ? `<p>P&amp;L: ${summary.pnl >= 0 ? '+' : ''}${summary.pnl.toFixed(2)}</p>`
        : '';
    return this.send(
      to,
      `Trade summary: ${summary.side} ${summary.symbol}`,
      `<p>Your Apex trade was filled.</p><p>${summary.side} ${summary.qty} ${summary.symbol}</p>${pnlLine}`,
    );
  }

  async sendWeeklyDigest(
    to: string,
    digest: { tradesCount: number; pnl: number },
  ): Promise<EmailSendResult> {
    const tpl = weeklyReportTemplate({
      rangeLabel: 'this week',
      summary: `${digest.tradesCount} trades · P&L ${digest.pnl >= 0 ? '+' : ''}${digest.pnl.toFixed(2)}`,
      topTradesHtml: '<p>See the app for full trade history.</p>',
    });
    return this.send(to, tpl.subject, tpl.html);
  }

  async sendDailyDigest(
    to: string,
    digest: {
      dateLabel: string;
      pnl: number;
      trades: number;
      apexStatus: string;
      portfolio: number;
    },
  ): Promise<EmailSendResult> {
    const tpl = dailyDigestTemplate(digest);
    return this.send(to, tpl.subject, tpl.html);
  }

  /**
   * Optional custom password-reset email. Firebase Auth owns reset in production.
   */
  async sendPasswordReset(to: string, resetUrl: string): Promise<EmailSendResult> {
    return this.send(
      to,
      'Reset your QuantroApex password',
      `<p>Click to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
    );
  }

  async sendWaitlistJoined(to: string, assetClass: string): Promise<EmailSendResult> {
    const tpl = waitlistConfirmationTemplate(assetClass);
    return this.send(to, tpl.subject, tpl.html);
  }
}

export const resendClient = new ResendClient();

export async function sendWelcomeEmail(to: string, firstName: string) {
  return resendClient.sendWelcome(to, firstName);
}

export async function sendTradeSummaryEmail(
  to: string,
  summary: { symbol: string; side: string; qty: number; pnl?: number },
) {
  return resendClient.sendTradeSummary(to, summary);
}

export async function sendWeeklyDigestEmail(
  to: string,
  digest: { tradesCount: number; pnl: number },
) {
  return resendClient.sendWeeklyDigest(to, digest);
}

export async function sendWaitlistConfirmation(
  to: string,
  assetClass: string,
) {
  return resendClient.sendWaitlistJoined(to, assetClass);
}
