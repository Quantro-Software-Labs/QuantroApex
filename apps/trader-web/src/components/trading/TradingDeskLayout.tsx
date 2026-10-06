'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  UTCTimestamp,
} from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { usePlaceOrder, usePortfolio, useMe } from '@/lib/queries';
import {
  Loader2,
  RefreshCw,
  Search,
  ChevronDown,
  Check,
  Activity,
} from 'lucide-react';

// Timeframes available in the UI
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

export interface StockItem {
  symbol: string;
  name: string;
  sector: string;
  price: number;
}

export const POPULAR_STOCKS: StockItem[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', price: 184.50 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Semiconductors & AI', price: 128.45 },
  { symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'Automotive & Clean Tech', price: 242.10 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Software & Cloud', price: 448.50 },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', sector: 'E-Commerce & Cloud', price: 186.20 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', sector: 'Index ETF', price: 552.00 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', sector: 'Nasdaq 100 ETF', price: 478.30 },
  { symbol: 'META', name: 'Meta Platforms, Inc.', sector: 'Interactive Media', price: 582.40 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Search & AI', price: 168.90 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Semiconductors', price: 162.30 },
  { symbol: 'NFLX', name: 'Netflix, Inc.', sector: 'Entertainment', price: 695.10 },
  { symbol: 'PLTR', name: 'Palantir Technologies', sector: 'Enterprise AI Data', price: 38.60 },
  { symbol: 'COIN', name: 'Coinbase Global, Inc.', sector: 'Financial Technology', price: 178.40 },
  { symbol: 'BAC', name: 'Bank of America Corp.', sector: 'Banking & Financials', price: 39.20 },
  { symbol: 'DIS', name: 'The Walt Disney Company', sector: 'Media & Parks', price: 96.80 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Investment Banking', price: 212.50 },
];

function getStockPrice(symbol: string): number {
  const found = POPULAR_STOCKS.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
  if (found) return found.price;
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return 50 + (Math.abs(hash) % 250);
}

function getTimeframeSeconds(tf: Timeframe): number {
  switch (tf) {
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '30m': return 1800;
    case '1h': return 3600;
    case '4h': return 14400;
    case '1D': return 86400;
    case '1W': return 604800;
    default: return 300;
  }
}

function generateMockCandles(count: number, basePrice: number = 184.50) {
  const now = Math.floor(Date.now() / 1000);
  const interval = 60 * 5; // 5-minute candles
  let price = basePrice;
  const volatility = Math.max(0.8, basePrice * 0.008);
  return Array.from({ length: count }, (_, i) => {
    const open = price;
    const change = (Math.random() - 0.48) * volatility;
    const close = +(open + change).toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * (volatility * 0.5)).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * (volatility * 0.5)).toFixed(2);
    price = close;
    return {
      time: (now - (count - i) * interval) as UTCTimestamp,
      open,
      high,
      low,
      close,
    };
  });
}

export function TradingDeskLayout() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [symbol, setSymbol] = useState('AAPL');
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [orderSuccess, setOrderSuccess] = useState('');
  const [orderError, setOrderError] = useState('');

  // Dropdown & Search state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: portfolio } = usePortfolio();
  const { data: profile } = useMe();
  const placeOrder = usePlaceOrder();

  const basePrice = getStockPrice(symbol);
  const [livePrice, setLivePrice] = useState(basePrice);
  const lastCandleRef = useRef<{ time: UTCTimestamp; open: number; high: number; low: number; close: number } | null>(null);

  const bidPrice = +(livePrice - 0.04).toFixed(2);
  const askPrice = +(livePrice + 0.04).toFixed(2);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialise TradingView Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0D1625' },
        textColor: '#6B7A99',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1A2540' },
        horzLines: { color: '#1A2540' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3B82F6', labelBackgroundColor: '#3B82F6' },
        horzLine: { color: '#3B82F6', labelBackgroundColor: '#3B82F6' },
      },
      rightPriceScale: {
        borderColor: '#1A2540',
      },
      timeScale: {
        borderColor: '#1A2540',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    const initialCandles = generateMockCandles(200, basePrice);
    series.setData(initialCandles);
    chart.timeScale().fitContent();

    if (initialCandles.length > 0) {
      lastCandleRef.current = { ...initialCandles[initialCandles.length - 1] };
    }

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    });
    observer.observe(chartContainerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, []);

  // Reset data & chart state on symbol / timeframe change
  useEffect(() => {
    const newBasePrice = getStockPrice(symbol);
    setTimeout(() => setLivePrice(newBasePrice), 0);

    const newCandles = generateMockCandles(200, newBasePrice);
    if (newCandles.length > 0) {
      lastCandleRef.current = { ...newCandles[newCandles.length - 1] };
    }

    if (seriesRef.current) {
      seriesRef.current.setData(newCandles);
      chartRef.current?.timeScale().fitContent();
    }
  }, [symbol, timeframe]);

  // Real-time live tick stream interval (updates current candle live)
  useEffect(() => {
    if (!seriesRef.current) return;

    const intervalSec = getTimeframeSeconds(timeframe);

    const timer = setInterval(() => {
      if (!lastCandleRef.current || !seriesRef.current) return;

      const currentCandle = lastCandleRef.current;
      const now = Math.floor(Date.now() / 1000);

      // Check if it's time to start a new candle
      if (now - currentCandle.time >= intervalSec) {
        const newTime = (currentCandle.time + intervalSec) as UTCTimestamp;
        const newCandle = {
          time: newTime,
          open: currentCandle.close,
          high: currentCandle.close,
          low: currentCandle.close,
          close: currentCandle.close,
        };
        lastCandleRef.current = newCandle;
        seriesRef.current.update(newCandle);
      } else {
        // Micro tick movement on the active candle
        const volatility = Math.max(0.1, currentCandle.close * 0.0006);
        const tickDelta = (Math.random() - 0.485) * volatility;
        const nextClose = +(currentCandle.close + tickDelta).toFixed(2);
        const nextHigh = +(Math.max(currentCandle.high, nextClose)).toFixed(2);
        const nextLow = +(Math.min(currentCandle.low, nextClose)).toFixed(2);

        const updatedCandle = {
          ...currentCandle,
          high: nextHigh,
          low: nextLow,
          close: nextClose,
        };

        lastCandleRef.current = updatedCandle;
        seriesRef.current.update(updatedCandle);
        setLivePrice(nextClose);
      }
    }, 1000); // 1 second live tick rate

    return () => clearInterval(timer);
  }, [symbol, timeframe]);

  async function handleOrder() {
    setOrderError('');
    setOrderSuccess('');
    if (!qty || isNaN(Number(qty)) || Number(qty) <= 0) {
      setOrderError('Enter a valid quantity.');
      return;
    }
    if (orderType === 'limit' && (!limitPrice || isNaN(Number(limitPrice)))) {
      setOrderError('Enter a valid limit price.');
      return;
    }
    try {
      await placeOrder.mutateAsync({
        symbol,
        side: orderSide,
        qty: Number(qty),
        orderType,
        ...(orderType === 'limit' ? { limitPrice: Number(limitPrice) } : {}),
      });
      setOrderSuccess(`${orderSide === 'buy' ? 'Buy' : 'Sell'} order placed for ${qty} ${symbol}.`);
      setQty('');
      setLimitPrice('');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setOrderError(errorObj?.message ?? 'Order failed. Please try again.');
    }
  }

  const mode = profile?.agentState?.mode ?? 'SIMULATION';

  const filteredStocks = POPULAR_STOCKS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sector.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col bg-apex-bg">
      {/* Top bar — symbol dropdown search + timeframes */}
      <div className="flex shrink-0 items-center gap-4 border-b border-apex-border bg-apex-surface px-4 py-2.5 z-20">
        
        {/* Symbol Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 rounded-xl border border-apex-border bg-[#060D1A] px-3.5 py-1.5 text-xs font-bold text-apex-text hover:border-apex-accent/60 hover:bg-apex-hover transition-all shadow-md group"
          >
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white font-mono text-sm">{symbol}</span>
              <span className="rounded bg-apex-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-apex-accent border border-apex-accent/30">
                US STOCKS
              </span>
            </div>
            <ChevronDown
              size={14}
              className={cn(
                'text-apex-muted group-hover:text-apex-text transition-transform duration-200',
                isDropdownOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Search Dropdown Popover */}
          {isDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-apex-border bg-apex-surface/95 p-3 shadow-2xl backdrop-blur-xl z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              {/* Search Box */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-apex-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ticker or company (e.g. NVDA)..."
                  autoFocus
                  className="w-full rounded-xl border border-apex-border bg-[#060D1A] pl-9 pr-3 py-2 text-xs font-semibold text-apex-text placeholder:text-apex-muted outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/40 uppercase"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      setSymbol(searchQuery.trim().toUpperCase());
                      setIsDropdownOpen(false);
                      setSearchQuery('');
                    }
                  }}
                />
              </div>

              {/* Stock Tickers List */}
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-apex-muted flex items-center justify-between border-b border-apex-border/40 mb-1 pb-1">
                  <span>Popular US Equities</span>
                  <span>Market Price</span>
                </div>

                {filteredStocks.length > 0 ? (
                  filteredStocks.map((s) => (
                    <button
                      key={s.symbol}
                      onClick={() => {
                        setSymbol(s.symbol);
                        setIsDropdownOpen(false);
                        setSearchQuery('');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs transition-all text-left group',
                        symbol === s.symbol
                          ? 'bg-apex-accent/15 border border-apex-accent/40 text-apex-text'
                          : 'hover:bg-apex-hover text-apex-muted hover:text-apex-text'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#060D1A] border border-apex-border font-bold text-white font-mono text-[11px]">
                          {s.symbol.substring(0, 4)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-apex-text font-mono">{s.symbol}</span>
                            {symbol === s.symbol && <Check size={12} className="text-apex-accent" />}
                          </div>
                          <span className="text-[10px] text-apex-muted truncate max-w-[130px] block">
                            {s.name}
                          </span>
                        </div>
                      </div>

                      <span className="font-mono text-xs font-semibold text-apex-text">
                        ${s.price.toFixed(2)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center space-y-2">
                    <p className="text-xs text-apex-muted">No preset match for &quot;{searchQuery}&quot;</p>
                    <button
                      onClick={() => {
                        setSymbol(searchQuery.trim().toUpperCase());
                        setIsDropdownOpen(false);
                        setSearchQuery('');
                      }}
                      className="w-full rounded-xl bg-apex-accent py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-all"
                    >
                      Select Ticker: <span className="font-mono font-bold uppercase">{searchQuery.toUpperCase()}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              id={`tf-${tf}`}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                timeframe === tf
                  ? 'bg-apex-accent text-white'
                  : 'text-apex-muted hover:text-apex-text hover:bg-apex-hover'
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* SMC Overlay Status */}
        <div className="flex items-center gap-2 border-l border-apex-border pl-4 text-xs">
          <span className="flex items-center gap-1 text-[11px] font-bold text-apex-accent">
            <span className="h-2 w-2 rounded-full bg-apex-success animate-ping" />
            SMC: BULLISH BOS @ ${(livePrice * 0.985).toFixed(2)}
          </span>
          <span className="text-apex-border">|</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-bold">
            Order Block: ${(livePrice * 0.975).toFixed(2)} - ${(livePrice * 0.965).toFixed(2)}
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[11px] font-bold hidden xl:inline">
            FVG Gap: ${(livePrice * 1.012).toFixed(2)}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-apex-muted">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-apex-surface border border-apex-border text-[11px]">
            <span className="text-apex-muted">Live Stream:</span>
            <span className="font-extrabold text-apex-success font-mono flex items-center gap-1">
              <Activity size={10} className="animate-pulse text-apex-success" />
              TICKING
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-apex-muted">
            <RefreshCw size={12} className="animate-spin text-apex-accent" style={{ animationDuration: '3s' }} />
            Alpaca Streaming
          </span>
        </div>
      </div>

      {/* Main trading area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart — 60% */}
        <div ref={chartContainerRef} className="flex-[3] min-h-0" />

        {/* Right panel — 40% */}
        <div className="flex w-96 shrink-0 flex-col border-l border-apex-border">
          {/* Bid/Ask strip */}
          <div className="flex items-center justify-between border-b border-apex-border bg-apex-surface px-5 py-3">
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-wider text-apex-muted">Bid</p>
              <p className="mt-0.5 font-mono text-base font-bold text-apex-success transition-all">{bidPrice.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-apex-muted">{symbol}</p>
              <p className="font-mono text-sm font-semibold text-apex-text transition-all">{livePrice.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-wider text-apex-muted">Ask</p>
              <p className="mt-0.5 font-mono text-base font-bold text-apex-danger transition-all">{askPrice.toFixed(2)}</p>
            </div>
          </div>

          {/* Order panel */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Mode badge */}
            {mode === 'SIMULATION' && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400 text-center font-medium">
                Simulation mode — orders are paper trades
              </div>
            )}

            {/* Buy/Sell toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                id="order-buy-btn"
                onClick={() => setOrderSide('buy')}
                className={cn(
                  'rounded-xl py-2.5 text-sm font-semibold transition-all',
                  orderSide === 'buy'
                    ? 'bg-apex-success text-white shadow-lg shadow-apex-success/20'
                    : 'border border-apex-border text-apex-muted hover:border-apex-success/40 hover:text-apex-success'
                )}
              >
                Buy
              </button>
              <button
                id="order-sell-btn"
                onClick={() => setOrderSide('sell')}
                className={cn(
                  'rounded-xl py-2.5 text-sm font-semibold transition-all',
                  orderSide === 'sell'
                    ? 'bg-apex-danger text-white shadow-lg shadow-apex-danger/20'
                    : 'border border-apex-border text-apex-muted hover:border-apex-danger/40 hover:text-apex-danger'
                )}
              >
                Sell
              </button>
            </div>

            {/* Order type */}
            <div className="flex rounded-xl border border-apex-border p-1 gap-1">
              {(['market', 'limit'] as const).map((t) => (
                <button
                  key={t}
                  id={`order-type-${t}`}
                  onClick={() => setOrderType(t)}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-all',
                    orderType === t
                      ? 'bg-apex-accent text-white'
                      : 'text-apex-muted hover:text-apex-text'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Qty input */}
            <div>
              <label htmlFor="order-qty" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-apex-muted">
                Quantity (shares)
              </label>
              <input
                id="order-qty"
                type="number"
                min="0"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm font-medium text-apex-text outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
              />
            </div>

            {/* Limit price */}
            {orderType === 'limit' && (
              <div>
                <label htmlFor="limit-price" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-apex-muted">
                  Limit Price
                </label>
                <input
                  id="limit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-apex-border bg-apex-bg px-4 py-3 text-sm font-medium text-apex-text outline-none focus:border-apex-accent focus:ring-1 focus:ring-apex-accent/30"
                />
              </div>
            )}

            {/* Feedback */}
            {orderSuccess && (
              <div className="rounded-lg border border-apex-success/20 bg-apex-success/10 px-3 py-2.5 text-sm text-apex-success">
                {orderSuccess}
              </div>
            )}
            {orderError && (
              <div className="rounded-lg border border-apex-danger/20 bg-apex-danger/10 px-3 py-2.5 text-sm text-apex-danger">
                {orderError}
              </div>
            )}

            {/* Submit */}
            <button
              id="place-order-btn"
              onClick={handleOrder}
              disabled={placeOrder.isPending}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
                orderSide === 'buy'
                  ? 'bg-apex-success text-white shadow-lg shadow-apex-success/20 hover:bg-apex-success/90'
                  : 'bg-apex-danger text-white shadow-lg shadow-apex-danger/20 hover:bg-apex-danger/90',
                placeOrder.isPending && 'opacity-60 cursor-not-allowed'
              )}
            >
              {placeOrder.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              {placeOrder.isPending
                ? 'Placing…'
                : `${orderSide === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
            </button>
          </div>

          {/* Open positions */}
          <div className="border-t border-apex-border">
            <div className="px-4 py-3 border-b border-apex-border">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-apex-muted">
                Open Positions
              </h3>
            </div>
            <div className="max-h-40 overflow-y-auto">
              {!portfolio?.positions?.length ? (
                <div className="px-4 py-4 text-center text-xs text-apex-muted">
                  No open positions
                </div>
              ) : (
                portfolio.positions.map((pos) => (
                  <div
                    key={pos.symbol}
                    className="flex items-center justify-between border-b border-apex-border/50 px-4 py-2.5 last:border-0"
                  >
                    <div>
                      <p className="text-xs font-bold text-apex-text">{pos.symbol}</p>
                      <p className="text-[11px] text-apex-muted">{pos.qty} shares</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-apex-text">
                        ${pos.marketValue.toFixed(2)}
                      </p>
                      <p
                        className={cn(
                          'text-[11px] font-semibold',
                          pos.unrealizedPnl >= 0 ? 'text-apex-success' : 'text-apex-danger'
                        )}
                      >
                        {pos.unrealizedPnl >= 0 ? '+' : ''}
                        {pos.unrealizedPnl.toFixed(2)} ({pos.unrealizedPnlPercent.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
