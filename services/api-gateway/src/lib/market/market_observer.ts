import { config } from '../../config/index.js';
import { MARKET_DIRECTORY } from './market_directory.js';
import { resolveLiveQuotes } from './quote_engine.js';
import { snapshotFeatures } from '../ai/feature_snapshotter.js';

export interface ObserverStatus {
  running: boolean;
  lastRunAt: string | null;
  lastObservationCount: number;
  lastError: string | null;
  lastDurationMs: number | null;
}

const status: ObserverStatus = {
  running: false,
  lastRunAt: null,
  lastObservationCount: 0,
  lastError: null,
  lastDurationMs: null,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

export function getObserverStatus(): ObserverStatus {
  return { ...status };
}

/** One observer cycle — used by the job and by tests. Uses platform env keys only. */
export async function runMarketObservationCycle(): Promise<number> {
  const started = Date.now();
  let count = 0;

  try {
    // Platform keys via empty opts — AlpacaMarketDataClient / PolygonClient read config
    const breadthQuotes = await resolveLiveQuotes();

    const results = await Promise.allSettled(
      MARKET_DIRECTORY.map((asset) =>
        snapshotFeatures(asset.symbol, {}, { persistObservation: true, breadthQuotes }),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.observationId) {
        count += 1;
      } else if (result.status === 'rejected') {
        console.warn('Market observation symbol failed:', result.reason);
      }
    }

    status.lastRunAt = new Date().toISOString();
    status.lastObservationCount = count;
    status.lastError = null;
    status.lastDurationMs = Date.now() - started;
    return count;
  } catch (err: any) {
    status.lastError = err?.message ?? String(err);
    status.lastDurationMs = Date.now() - started;
    console.warn('Market observation cycle failed:', err);
    return count;
  }
}

export function startMarketObserver(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return;
  }

  const intervalMs = config.marketObserver.intervalMs;
  if (!intervalMs || intervalMs <= 0) {
    console.info('Market observer disabled (MARKET_OBSERVER_INTERVAL_MS=0)');
    return;
  }

  if (intervalHandle) return;

  status.running = true;

  const tick = async () => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      await runMarketObservationCycle();
    } finally {
      tickInFlight = false;
    }
  };

  // Kick off shortly after boot so API listen is not blocked
  setTimeout(() => {
    void tick();
  }, 5_000);

  intervalHandle = setInterval(() => {
    void tick();
  }, intervalMs);

  // Avoid keeping process alive solely for the interval in some environments
  if (typeof intervalHandle === 'object' && 'unref' in intervalHandle) {
    (intervalHandle as NodeJS.Timeout).unref();
  }

  console.info(`Market observer started (interval=${intervalMs}ms)`);
}

export function stopMarketObserver(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  status.running = false;
}
