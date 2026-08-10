import { prisma } from '../prisma.js';

export interface NotificationPayload {
  title: string;
  body: string;
  category: 'TRADE' | 'RISK' | 'ADVISORY' | 'DIGEST';
  data?: Record<string, any>;
}

export class NotificationDispatcher {
  async dispatch(userId: string, payload: NotificationPayload): Promise<boolean> {
    const prefs = await prisma.notificationPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) return false;

    // Check user notification preferences
    if (payload.category === 'TRADE' && !prefs.pushEnabled) return false;
    if (payload.category === 'RISK' && !prefs.lossAlertsEnabled) return false;
    if (payload.category === 'ADVISORY' && !prefs.milestoneAlerts) return false;

    // Structured log: partial userId for traceability, no sensitive content in log body
    // TODO: Replace with actual Firebase Admin SDK FCM dispatch before production
    const maskedUserId = userId.slice(0, 8) + '...';
    process.stdout.write(
      JSON.stringify({
        event: 'notification_dispatch',
        userId: maskedUserId,
        category: payload.category,
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
      title: '🚨 Emergency Stop Activated',
      body: 'Risk Vault has halted all trading execution.',
      category: 'RISK',
    });
  }

  async sendAdvisorySignal(userId: string, symbol: string, action: string, reasoning: string): Promise<boolean> {
    return this.dispatch(userId, {
      title: `Advisory Signal: ${action} ${symbol}`,
      body: reasoning,
      category: 'ADVISORY',
      data: { symbol, action, reasoning },
    });
  }
}

export const notificationDispatcher = new NotificationDispatcher();
