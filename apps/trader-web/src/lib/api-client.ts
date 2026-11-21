/**
 * API client — typed Axios-like fetch wrapper.
 * Automatically attaches Firebase Auth token to every request.
 * All API calls go through this client, never raw fetch.
 */
import { auth } from './firebase';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    let payload: { error?: string; code?: string; message?: string; details?: unknown } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore parse errors
    }
    const errorCode = payload.code ?? payload.error ?? 'ApiError';
    throw new ApiError(
      res.status,
      errorCode,
      payload.message ?? `HTTP ${res.status}`,
      payload.details,
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export function formatApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'NO_REAL_QUOTE':
        return 'No real-time market quote available for this symbol. Orders are not filled against stale or synthetic prices.';
      case 'STALE_QUOTE':
        return 'Market quote is stale. Waiting for fresh live market tick before filling orders.';
      case 'MARKET_CLOSED':
        return 'Market is closed. Market orders open at 9:30 am New York time, or place a limit order.';
      case 'QUEUED':
        return 'Market is closed. Your close order has been queued and will fill at the first quote after the open.';
      case 'EMERGENCY_STOP_ACTIVE':
        return 'Emergency Stop is active. Trading is halted until the emergency stop is explicitly resumed.';
      case 'INSUFFICIENT_POSITION':
        return 'Insufficient position: you cannot sell more shares than you currently hold.';
      case 'MARKET_DATA_UNAVAILABLE':
        return 'Market data history is currently unavailable for this asset.';
      case 'LIVE_DISABLED':
        return 'Live trading is disabled during this beta preview. Paper trading is active.';
      case 'KYC_REQUIRED':
        return 'Identity verification (KYC) is required before placing live orders.';
      case 'BROKER_CREDENTIALS_MISSING':
        return 'Please connect your broker credentials in Settings before placing live orders.';
      case 'PLAN_REQUIRED':
        return 'Plan upgrade required to access this feature.';
      default:
        return err.message || 'An unexpected error occurred.';
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
