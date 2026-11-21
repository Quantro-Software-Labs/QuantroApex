import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Returns the start of the current trading day (as a UTC Date object).
 *
 * Day boundaries:
 * - America/New_York midnight for STOCKS (and FOREX / GLOBAL).
 * - UTC midnight for CRYPTO.
 */
export function getTradingDayStart(
  arg1?: string | Date,
  arg2?: Date | string,
): Date {
  let assetClass = 'STOCKS';
  let now = new Date();

  if (typeof arg1 === 'string') {
    assetClass = arg1;
    if (arg2 instanceof Date) now = arg2;
  } else if (arg1 instanceof Date) {
    now = arg1;
    if (typeof arg2 === 'string') assetClass = arg2;
  } else if (typeof arg2 === 'string') {
    assetClass = arg2;
  }

  const cls = String(assetClass).toUpperCase();
  if (cls === 'CRYPTO') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  }

  // Format date in America/New_York
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;

  // In America/New_York, 00:00:00 is either 04:00:00 UTC (EDT) or 05:00:00 UTC (EST).
  // Find the exact UTC candidate whose America/New_York local time is 00:00:00.
  for (const utcHour of [4, 5]) {
    const candidate = new Date(`${year}-${month}-${day}T0${utcHour}:00:00.000Z`);
    const timeParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(candidate);
    const hour = parseInt(timeParts.find((p) => p.type === 'hour')!.value, 10) % 24;
    const minute = parseInt(timeParts.find((p) => p.type === 'minute')!.value, 10);
    if (hour === 0 && minute === 0) {
      return candidate;
    }
  }

  return new Date(`${year}-${month}-${day}T05:00:00.000Z`);
}

export interface ComputeRealizedLossParams {
  userId: string;
  assetClass?: string;
  isSimulated?: boolean;
  now?: Date;
  tx?: DbClient;
}

/**
 * Computes realized losses for the current trading day server-side from the trades table.
 * Returns the sum of realized losses (positive number) for closed trades where realizedPnl < 0.
 */
export async function computeRealizedLossToday(params: ComputeRealizedLossParams): Promise<number> {
  const { userId, assetClass, isSimulated, now = new Date(), tx = defaultPrisma } = params;
  const dayStart = getTradingDayStart(assetClass ?? 'STOCKS', now);

  const trades = await tx.trade.findMany({
    where: {
      order: {
        userId,
        ...(isSimulated !== undefined ? { isSimulated } : {}),
        ...(assetClass && assetClass !== 'GLOBAL' ? { assetClass: assetClass as any } : {}),
      },
      filledAt: { gte: dayStart },
      realizedPnl: { lt: 0 },
    },
    select: {
      realizedPnl: true,
    },
  });

  let totalLoss = new Prisma.Decimal(0);
  for (const trade of trades) {
    if (trade.realizedPnl && trade.realizedPnl.isNegative()) {
      totalLoss = totalLoss.add(trade.realizedPnl.abs());
    }
  }

  return totalLoss.toNumber();
}

/**
 * DAY orders expire at 4:00 PM America/New_York of the session they were placed for.
 * - Orders placed during market hours (before 4:00 PM NY on a weekday Mon-Fri) expire at 4:00 PM NY of that same day.
 * - Orders placed after 4:00 PM NY on a weekday, or placed on a weekend, are for the NEXT session and expire at 4:00 PM NY of that next session.
 * - Correctly handles DST transitions (EDT 20:00 UTC vs EST 21:00 UTC) and weekends.
 */
export function getSessionCloseForDayOrder(placedAt: Date): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(placedAt);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10) % 24;
  const minute = parseInt(getPart('minute'), 10);
  const weekday = getPart('weekday');

  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  const isBefore4Pm = hour < 16;

  let sessionDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (!isWeekday || !isBefore4Pm) {
    // Advance to next session
    do {
      sessionDate.setUTCDate(sessionDate.getUTCDate() + 1);
      const nextParts = formatter.formatToParts(sessionDate);
      const nextWeekday = nextParts.find((p) => p.type === 'weekday')?.value;
      if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(nextWeekday ?? '')) {
        break;
      }
    } while (true);
  }

  const sessionParts = formatter.formatToParts(sessionDate);
  const sYear = sessionParts.find((p) => p.type === 'year')!.value;
  const sMonth = sessionParts.find((p) => p.type === 'month')!.value;
  const sDay = sessionParts.find((p) => p.type === 'day')!.value;

  // 16:00 NY is 20:00 UTC (EDT) or 21:00 UTC (EST)
  for (const utcHour of [20, 21]) {
    const candidate = new Date(`${sYear}-${sMonth}-${sDay}T${utcHour}:00:00.000Z`);
    const checkParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(candidate);
    const cHour = parseInt(checkParts.find((p) => p.type === 'hour')!.value, 10) % 24;
    const cMinute = parseInt(checkParts.find((p) => p.type === 'minute')!.value, 10);
    if (cHour === 16 && cMinute === 0) {
      return candidate;
    }
  }

  return new Date(`${sYear}-${sMonth}-${sDay}T21:00:00.000Z`);
}

export function isDayOrderExpired(createdAt: Date, now: Date = new Date()): boolean {
  const sessionClose = getSessionCloseForDayOrder(createdAt);
  return now.getTime() >= sessionClose.getTime();
}
