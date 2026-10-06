import twilio from 'twilio';
import { config } from '../../config/index.js';

export interface TwilioSendResult {
  sid: string | null;
  status: 'sent' | 'logged' | 'error';
  error?: string;
}

export class TwilioClient {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;
  private whatsappFrom: string;
  private client: ReturnType<typeof twilio> | null = null;

  constructor(opts?: {
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
    whatsappFrom?: string;
  }) {
    this.accountSid = opts?.accountSid || config.twilio.accountSid || '';
    this.authToken = opts?.authToken || config.twilio.authToken || '';
    this.fromNumber = opts?.fromNumber || config.twilio.fromNumber || '';
    this.whatsappFrom = opts?.whatsappFrom || config.twilio.whatsappFrom || '';
  }

  isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return !!(this.accountSid && this.authToken);
  }

  private getClient(): ReturnType<typeof twilio> {
    if (!this.client) {
      this.client = twilio(this.accountSid, this.authToken);
    }
    return this.client;
  }

  async sendSms(to: string, body: string): Promise<TwilioSendResult> {
    if (!this.isConfigured() || !this.fromNumber) {
      process.stdout.write(
        JSON.stringify({
          event: 'twilio_sms_noop',
          to: to.slice(0, 6) + '...',
          bodyPreview: body.slice(0, 80),
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
      return { sid: null, status: 'logged' };
    }

    try {
      const msg = await this.getClient().messages.create({
        to,
        from: this.fromNumber,
        body,
      });
      return { sid: msg.sid, status: 'sent' };
    } catch (err) {
      const error = err as Error;
      return { sid: null, status: 'error', error: error.message };
    }
  }

  async sendWhatsApp(to: string, body: string): Promise<TwilioSendResult> {
    const from = this.whatsappFrom || (this.fromNumber ? `whatsapp:${this.fromNumber}` : '');
    const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    if (!this.isConfigured() || !from) {
      process.stdout.write(
        JSON.stringify({
          event: 'twilio_whatsapp_noop',
          to: recipient.slice(0, 14) + '...',
          bodyPreview: body.slice(0, 80),
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
      return { sid: null, status: 'logged' };
    }

    try {
      const msg = await this.getClient().messages.create({
        to: recipient,
        from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        body,
      });
      return { sid: msg.sid, status: 'sent' };
    } catch (err) {
      const error = err as Error;
      return { sid: null, status: 'error', error: error.message };
    }
  }
}

export const twilioClient = new TwilioClient();
