import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import { clearFcmToken, findNotificationPrefs } from '../db/repos.js';
import { config } from '../../config/index.js';
import { twilioClient, type TwilioSendResult } from './twilio_client.js';

export interface NotificationPayload {
  title: string;
  body: string;
  category: 'TRADE' | 'RISK' | 'ADVISORY' | 'DIGEST';
  data?: Record<string, any>;
}

let _firebaseApp: App | null = null;

function getFirebaseApp(): App | null {
  const { projectId, clientEmail, privateKey } = config.firebase;

  if (!projectId || !clientEmail || !privateKey) return null;

  if (getApps().length > 0) return getApps()[0]!;

  _firebaseApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

  return _firebaseApp;
}

export class NotificationDispatcher {
  async dispatch(userId: string, payload: NotificationPayload): Promise<boolean> {
    const prefs = await findNotificationPrefs(userId);

    if (!prefs) return false;

    if (payload.category === 'TRADE' && !prefs.pushEnabled) return false;
    if (payload.category === 'RISK' && !prefs.lossAlertsEnabled) return false;
    if (payload.category === 'ADVISORY' && !prefs.milestoneAlerts) return false;

    const fcmToken = prefs.fcmToken;
    const maskedUserId = userId.slice(0, 8) + '...';

    if (!fcmToken) {
      process.stdout.write(
        JSON.stringify({
          event: 'notification_skipped_no_token',
          userId: maskedUserId,
          category: payload.category,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
      return false;
    }

    const stringData: Record<string, string> = {
      category: payload.category,
      userId,
      timestamp: new Date().toISOString(),
      ...(payload.data
        ? Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, String(v)]))
        : {}),
    };

    const firebaseApp = getFirebaseApp();

    if (firebaseApp) {
      // Real FCM dispatch via Firebase Admin SDK (HTTP v1)
      const message: Message = {
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: stringData,
        android: {
          priority: payload.category === 'RISK' ? 'high' : 'normal',
          notification: {
            sound: 'default',
            channelId: payload.category.toLowerCase(),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: payload.category === 'RISK' ? true : undefined,
            },
          },
        },
      };

      try {
        const response = await getMessaging(firebaseApp).send(message);
        process.stdout.write(
          JSON.stringify({
            event: 'fcm_push_delivered',
            userId: maskedUserId,
            messageId: response,
            title: payload.title,
            timestamp: new Date().toISOString(),
          }) + '\n',
        );
        return true;
      } catch (err) {
        const error = err as Error & { code?: string };

        // Token is stale — clear it so we don't keep trying
        if (
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered'
        ) {
          await clearFcmToken(userId);
        }

        process.stdout.write(
          JSON.stringify({
            event: 'fcm_push_error',
            userId: maskedUserId,
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString(),
          }) + '\n',
        );
        return false;
      }
    }

    // Dev fallback — structured log only
    process.stdout.write(
      JSON.stringify({
        event: 'notification_dispatch_dev',
        userId: maskedUserId,
        category: payload.category,
        title: payload.title,
        body: payload.body,
        token: fcmToken.slice(0, 10) + '...',
        timestamp: new Date().toISOString(),
      }) + '\n',
    );

    return true;
  }

  async sendTradeExecuted(userId: string, symbol: string, side: string, qty: number): Promise<boolean> {
    return this.dispatch(userId, {
      title: `Trade Executed: ${side} ${symbol}`,
      body: `Apex filled ${side} order for ${qty} shares of ${symbol}.`,
      category: 'TRADE',
      data: { symbol, side, qty },
    });
  }

  async sendEmergencyStopAlert(userId: string): Promise<boolean> {
    return this.dispatch(userId, {
      title: 'Emergency Stop Activated',
      body: 'Risk Vault has halted all trading execution.',
      category: 'RISK',
    });
  }

  async sendAdvisorySignal(
    userId: string,
    symbol: string,
    action: string,
    reasoning: string,
  ): Promise<boolean> {
    return this.dispatch(userId, {
      title: `Advisory Signal: ${action} ${symbol}`,
      body: reasoning,
      category: 'ADVISORY',
      data: { symbol, action, reasoning },
    });
  }

  async sendDailyDigest(
    userId: string,
    tradesCount: number,
    pnl: number,
  ): Promise<boolean> {
    const sign = pnl >= 0 ? '+' : '';
    return this.dispatch(userId, {
      title: 'Daily Apex Summary',
      body: `${tradesCount} trades executed today. P&L: ${sign}$${Math.abs(pnl).toFixed(2)}.`,
      category: 'DIGEST',
      data: { tradesCount, pnl },
    });
  }

  /** Optional Twilio SMS channel — does not replace FCM push. */
  async sendSms(to: string, body: string): Promise<TwilioSendResult> {
    return twilioClient.sendSms(to, body);
  }

  /** Optional Twilio WhatsApp channel — does not replace FCM push. */
  async sendWhatsApp(to: string, body: string): Promise<TwilioSendResult> {
    return twilioClient.sendWhatsApp(to, body);
  }

  /**
   * Push via FCM and optionally mirror over SMS / WhatsApp when prefs allow.
   */
  async dispatchOmnichannel(
    userId: string,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const pushed = await this.dispatch(userId, payload);
    try {
      const prefs = await findNotificationPrefs(userId);
      const phone = prefs?.phoneE164;
      if (!phone) return pushed;

      const text = `${payload.title}\n${payload.body}`;
      if (prefs.smsEnabled) {
        await this.sendSms(phone, text);
      }
      if (prefs.whatsappEnabled) {
        await this.sendWhatsApp(phone, text);
      }
    } catch {
      // Twilio failures are non-fatal
    }
    return pushed;
  }

  /**
   * Push via FCM and optionally mirror the same message over SMS.
   * Returns true if FCM succeeded; SMS failures are logged but non-fatal.
   */
  async dispatchWithSms(
    userId: string,
    payload: NotificationPayload,
    phoneNumber?: string,
  ): Promise<boolean> {
    const pushed = await this.dispatch(userId, payload);
    if (phoneNumber) {
      await this.sendSms(phoneNumber, `${payload.title}\n${payload.body}`);
    }
    return pushed;
  }
}

export const notificationDispatcher = new NotificationDispatcher();
