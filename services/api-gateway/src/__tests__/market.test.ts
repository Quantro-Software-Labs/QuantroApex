import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';
import { registerTestUser } from './helpers/firebase_auth.js';
import { setMockRealQuote, setMockCandles, clearMockRealQuotes } from '../lib/market/quote_engine.js';

describe('Market & Stock Study Hub Endpoints', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const session = await registerTestUser(app);
    authToken = session.accessToken;

    setMockRealQuote('AAPL', 150);
    setMockRealQuote('MSFT', 300);
    setMockRealQuote('BTC/USD', 65000);
    setMockCandles('AAPL', [
      { timestamp: '2026-11-19T00:00:00Z', open: 145, high: 149, low: 144, close: 148, volume: 5000 },
      { timestamp: '2026-11-20T00:00:00Z', open: 148, high: 152, low: 147, close: 150, volume: 10000 },
    ]);
  });

  afterAll(async () => {
    clearMockRealQuotes();
    await app.close();
  });

  it('should fetch stock directory with live quotes via GET /market/stocks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/market/stocks',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Array.isArray(json.stocks)).toBe(true);
    expect(json.stocks.length).toBeGreaterThan(0);
    expect(json.stocks[0]).toHaveProperty('symbol');
    expect(json.stocks[0]).toHaveProperty('price');
  });

  it('should fetch stock details, technicals, and candles via GET /market/stocks/:symbol', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/market/stocks/AAPL',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.stock.symbol).toBe('AAPL');
    expect(json.technicals).toHaveProperty('rsi');
    expect(json.technicals).toHaveProperty('macd');
    expect(Array.isArray(json.candles)).toBe(true);
    expect(json.candles.length).toBeGreaterThan(0);
  });

  it('should return 503 MARKET_DATA_UNAVAILABLE when candles/history are unavailable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/market/stocks/MSFT',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(503);
    const json = res.json();
    expect(json.error).toBe('MARKET_DATA_UNAVAILABLE');
  });

  it('should return 404 for unknown stock symbol', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/market/stocks/NONEXISTENT',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('should generate AI technical & fundamental study via POST /market/ai-study', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/market/ai-study',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { symbol: 'NVDA' },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.symbol).toBe('NVDA');
    expect(json.studyText).toBeDefined();
    expect(json.recommendation).toBeDefined();
  });

  it('should fetch live ticker tape via GET /market/ticker', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/market/ticker',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Array.isArray(json.ticker)).toBe(true);
    expect(json.ticker.length).toBeGreaterThan(0);
  });

  it('should fetch market sentiment via GET /market/sentiment', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/market/sentiment',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.sentiment).toHaveProperty('score');
    expect(json.sentiment).toHaveProperty('label');
    expect(json.sentiment).toHaveProperty('summary');
  });
});
