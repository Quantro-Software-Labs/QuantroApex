'use client';

import Link from 'next/link';
import {
  Zap,
  ShieldCheck,
  BarChart3,
  Cpu,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PublicLandingPage() {
  return (
    <div className="min-h-screen bg-[#060D1A] text-apex-text selection:bg-apex-accent/30 selection:text-white">
      {/* ─── 1. Header Navigation ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-apex-border/60 bg-[#060D1A]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          
          {/* Logo & Sub-brand */}
          <Link href="/" className="flex items-center gap-3 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/quantro_logo.jpeg"
              alt="Quantro Logo"
              className="h-9 w-9 rounded-xl object-cover ring-1 ring-apex-border shadow-md shadow-apex-accent/10 group-hover:ring-apex-accent/60 transition-all"
            />
            <div className="flex flex-col leading-none">
              <span className="text-base font-extrabold text-apex-text tracking-tight group-hover:text-white transition-colors">
                QuantroApex
              </span>
              <span className="text-[9px] font-bold tracking-widest text-apex-accent uppercase mt-0.5">
                Quantro Software Labs
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-apex-muted">
            <a href="#features" className="hover:text-apex-text transition-colors">Features</a>
            <a href="#trading-desk" className="hover:text-apex-text transition-colors">Trading Desk</a>
            <a href="#strategies" className="hover:text-apex-text transition-colors">Strategies</a>
            <a href="#performance" className="hover:text-apex-text transition-colors">Performance</a>
            <a href="#pricing" className="hover:text-apex-text transition-colors">Pricing</a>
          </nav>

          {/* CTA Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="hidden sm:inline-flex items-center justify-center rounded-lg border border-apex-border bg-apex-surface px-4 py-2 text-xs font-semibold text-apex-text hover:bg-apex-hover hover:border-apex-accent/40 transition-all"
            >
              Sign In
            </Link>
            <Link
              href="/home"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-apex-accent px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-apex-accent/25 hover:bg-blue-600 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Launch App</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ─── 2. Hero Section ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-32">
        {/* Glow backdrop */}
        <div className="pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-apex-accent/10 blur-[140px]" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            {/* Status Pill — Quiet Confidence */}
            <div className="inline-flex items-center gap-2 rounded-full border border-apex-border bg-apex-surface/80 px-4 py-1.5 text-xs font-medium text-apex-text backdrop-blur-md shadow-sm">
              <span className="h-2 w-2 rounded-full bg-apex-success" />
              <span>Quantro Engine</span>
              <span className="text-apex-border">•</span>
              <span className="text-apex-muted">Desktop Trading Companion</span>
            </div>

            {/* Headline — One Honest Claim */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-apex-text leading-[1.1]">
              Quiet, Disciplined <br />
              <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
                Desktop Trading Desk
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-apex-muted leading-relaxed max-w-2xl mx-auto">
              Real-time order execution, TradingView charting, and server-enforced risk limits built specifically for desktop traders.
            </p>

            {/* Hero CTA — Single Clear Action */}
            <div className="flex justify-center pt-2">
              <Link
                href="/stocks/trading-desk"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-apex-accent px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-apex-accent/20 hover:bg-blue-600 transition-all"
              >
                <Zap size={16} />
                <span>Launch Desktop Trading Desk</span>
              </Link>
            </div>
          </div>

          {/* ─── Hero Video Showcase (`splash.mp4`) ──────────────────────── */}
          <div className="mt-14 max-w-5xl mx-auto">
            <div className="relative rounded-3xl border border-apex-accent/30 bg-apex-surface/90 p-2 shadow-2xl shadow-apex-accent/15 backdrop-blur-xl group">
              
              {/* Telemetry Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-apex-border/60 text-xs text-apex-muted">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-apex-success" />
                  <span className="font-semibold text-apex-text">QUANTROAPEX LIVE SHOWCASE</span>
                  <span className="text-apex-muted text-[11px] hidden sm:inline">| System ID: QA-9810</span>
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span>Execution: <strong className="text-apex-success">11.4ms</strong></span>
                  <span className="hidden sm:inline">Engine: <strong className="text-apex-accent">Active</strong></span>
                </div>
              </div>

              {/* Video Player Frame */}
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
                <video
                  src="/splash.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* Floating telemetry overlay card */}
                <div className="absolute bottom-4 left-4 right-4 sm:right-auto p-4 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md text-xs space-y-2 max-w-xs hidden sm:block">
                  <div className="flex items-center justify-between text-apex-text font-semibold">
                    <span>Apex Agent Status</span>
                    <span className="text-apex-success text-[10px] uppercase font-bold tracking-wider">Trading Active</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-apex-muted">
                    <div className="flex justify-between">
                      <span>Symbol:</span> <span className="text-apex-text font-mono">NVDA</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Strategy:</span> <span className="text-apex-text">Apex Momentum Alpha</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Confidence Score:</span> <span className="text-apex-accent font-semibold">94.8%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. Stats & System Capabilities ─────────────────────────────── */}
      <section className="border-y border-apex-border bg-apex-surface/40 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-apex-text font-mono">WebSockets</p>
              <p className="text-xs sm:text-sm text-apex-muted font-medium mt-1">Real-Time Data Streaming</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-apex-success font-mono">&lt; 15ms</p>
              <p className="text-xs sm:text-sm text-apex-muted font-medium mt-1">Execution Engine Latency</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-apex-accent font-mono">Risk Vault</p>
              <p className="text-xs sm:text-sm text-apex-muted font-medium mt-1">Server-Side Drawdown Protection</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-apex-text font-mono">Sim & Live</p>
              <p className="text-xs sm:text-sm text-apex-muted font-medium mt-1">Alpaca & Paper Integration</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. Key Features Grid ────────────────────────────────────────── */}
      <section id="features" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-apex-accent">Engine Architecture</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-apex-text tracking-tight">
              Engineered for High-Frequency Autonomous Intelligence
            </p>
            <p className="text-sm text-apex-muted">
              Built ground-up by Quantro Software Labs to eliminate human emotion and maximize strategic edge.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-4 hover:border-apex-accent/40 transition-all group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-apex-accent/10 text-apex-accent group-hover:scale-110 transition-transform">
                <Cpu size={24} />
              </div>
              <h3 className="text-lg font-bold text-apex-text">Autonomous AI Engine</h3>
              <p className="text-xs text-apex-muted leading-relaxed">
                Self-learning neural models continuously analyze tick-level order book data and auto-tune strategy parameters.
              </p>
            </div>

            <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-4 hover:border-apex-accent/40 transition-all group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-apex-success/10 text-apex-success group-hover:scale-110 transition-transform">
                <BarChart3 size={24} />
              </div>
              <h3 className="text-lg font-bold text-apex-text">TradingView Trading Desk</h3>
              <p className="text-xs text-apex-muted leading-relaxed">
                Professional lightweight charts integrated directly with order entry, real-time depth, and working order execution.
              </p>
            </div>

            <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-4 hover:border-apex-accent/40 transition-all group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-bold text-apex-text">Quantro Risk Vault</h3>
              <p className="text-xs text-apex-muted leading-relaxed">
                Institutional risk guardrails enforce maximum drawdown limits, position limits, and automatic stop-loss triggers.
              </p>
            </div>

            <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-4 hover:border-apex-accent/40 transition-all group">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                <Zap size={24} />
              </div>
              <h3 className="text-lg font-bold text-apex-text">Real-Time Signal Feed</h3>
              <p className="text-xs text-apex-muted leading-relaxed">
                Instant execution alerts, AI advisory breakdown, and real-time market sentiment streaming across all devices.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ─── 5. Trading Desk Preview Section ────────────────────────────── */}
      <section id="trading-desk" className="py-16 bg-apex-surface/20 border-t border-apex-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-apex-accent">Institutional Interface</span>
              <h2 className="text-3xl font-extrabold text-apex-text">Full-Bleed Trading Desk</h2>
              <p className="text-sm text-apex-muted">Designed for rapid execution, charting analysis, and position tracking.</p>
            </div>
            
            <Link
              href="/stocks/trading-desk"
              className="inline-flex items-center gap-2 text-sm font-semibold text-apex-accent hover:underline"
            >
              <span>Open Interactive Trading Desk</span>
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="rounded-2xl border border-apex-border bg-apex-surface overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-apex-border bg-apex-surface/80">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-red-500/80" />
                <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs text-apex-muted font-mono ml-2">quantro-desk.apex.app</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-md bg-apex-accent/10 text-apex-accent font-medium">Alpaca Paper Connected</span>
              </div>
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div className="space-y-4 lg:col-span-1">
                <h3 className="text-xl font-bold text-apex-text">Seamless Execution & Position Oversight</h3>
                <p className="text-xs text-apex-muted leading-relaxed">
                  Switch effortlessly between stocks, crypto, and forex pairs while the Apex Agent monitors entry signals in the background.
                </p>
                <ul className="space-y-2 text-xs text-apex-text">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-apex-success shrink-0" />
                    <span>TradingView Lightweight Charts engine</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-apex-success shrink-0" />
                    <span>Instant Market & Limit order execution</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-apex-success shrink-0" />
                    <span>Real-time position PnL tracking</span>
                  </li>
                </ul>
              </div>

              <div className="lg:col-span-2 rounded-xl border border-apex-border/80 bg-[#060D1A] p-4 font-mono text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-apex-border pb-2 text-apex-muted">
                  <span>SYMBOL: NVDA</span>
                  <span>PRICE: $128.45 (+3.42%)</span>
                  <span>ACTION: BUY LIMIT</span>
                </div>
                <div className="h-36 flex items-end gap-1.5 pt-4 px-2 border-b border-apex-border/40">
                  {[40, 55, 35, 70, 60, 85, 75, 90, 65, 80, 95, 110, 100, 120].map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div
                        style={{ height: `${val}%` }}
                        className={cn(
                          'w-full rounded-t transition-all duration-300',
                          i % 2 === 0 ? 'bg-apex-success/80' : 'bg-apex-danger/80'
                        )}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-apex-muted">
                  <span>Apex Signal: STRONG BUY</span>
                  <span>Target: $135.00</span>
                  <span className="text-apex-success font-bold">EXECUTED #4910</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. Pricing Section ──────────────────────────────────────────── */}
      <section id="pricing" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-apex-accent">Transparent Pricing</span>
            <h2 className="text-3xl font-extrabold text-apex-text">Choose Your Trading Edge</h2>
            <p className="text-sm text-apex-muted">Start free with paper trading or unlock full autonomous live execution.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Observer Plan */}
            <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase text-apex-muted tracking-wider">Observer</span>
                <div>
                  <span className="text-3xl font-extrabold text-apex-text">Free</span>
                </div>
                <p className="text-xs text-apex-muted">Ideal for exploring signals and paper trading simulations.</p>
                <ul className="space-y-2.5 text-xs text-apex-text pt-2">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Simulation trading</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Advisory signals</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Strategy marketplace browse</span></li>
                </ul>
              </div>
              <Link href="/auth/signup" className="w-full inline-flex items-center justify-center rounded-xl border border-apex-border bg-apex-hover py-2.5 text-xs font-semibold text-apex-text hover:border-apex-accent/40 transition-all">Get Started Free</Link>
            </div>

            {/* Core Plan */}
            <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase text-apex-accent tracking-wider">Core</span>
                <div>
                  <span className="text-3xl font-extrabold text-apex-text">₦29,000</span>
                  <span className="text-xs text-apex-muted"> / mo</span>
                </div>
                <p className="text-xs text-apex-muted">Automated autopilot trading with Risk Vault protection.</p>
                <ul className="space-y-2.5 text-xs text-apex-text pt-2">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Everything in Observer</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Autopilot execution</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Risk Vault enforcement</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Real-time push notifications</span></li>
                </ul>
              </div>
              <Link href="/auth/signup" className="w-full inline-flex items-center justify-center rounded-xl border border-apex-border bg-apex-hover py-2.5 text-xs font-semibold text-apex-text hover:border-apex-accent/40 transition-all">Select Core</Link>
            </div>

            {/* Pro Plan */}
            <div className="rounded-2xl border-2 border-apex-accent bg-apex-surface p-6 space-y-6 flex flex-col justify-between relative shadow-xl shadow-apex-accent/10">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-apex-accent text-[9px] font-bold uppercase tracking-wider text-white">Most Popular</span>
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase text-apex-accent tracking-wider">Pro</span>
                <div>
                  <span className="text-3xl font-extrabold text-apex-text">₦79,000</span>
                  <span className="text-xs text-apex-muted"> / mo</span>
                </div>
                <p className="text-xs text-apex-muted">Full manual trading desk & SMC market analysis tools.</p>
                <ul className="space-y-2.5 text-xs text-apex-text pt-2">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Everything in Core</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Manual trading desk</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>SMC analysis tools</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Priority support</span></li>
                </ul>
              </div>
              <Link href="/auth/signup" className="w-full inline-flex items-center justify-center rounded-xl bg-apex-accent py-2.5 text-xs font-semibold text-white shadow-md shadow-apex-accent/30 hover:bg-blue-600 transition-all">Select Pro</Link>
            </div>

            {/* Elite Plan */}
            <div className="rounded-2xl border border-apex-border bg-apex-surface p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase text-purple-400 tracking-wider">Elite</span>
                <div>
                  <span className="text-3xl font-extrabold text-apex-text">₦199,000</span>
                  <span className="text-xs text-apex-muted"> / mo</span>
                </div>
                <p className="text-xs text-apex-muted">Unlimited capital allocation & Global Brain AI access.</p>
                <ul className="space-y-2.5 text-xs text-apex-text pt-2">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Everything in Pro</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Unlimited capital allocation</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Early Global Brain V2 access</span></li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-apex-success shrink-0" /><span>Dedicated onboarding</span></li>
                </ul>
              </div>
              <Link href="/auth/signup" className="w-full inline-flex items-center justify-center rounded-xl border border-apex-border bg-apex-hover py-2.5 text-xs font-semibold text-apex-text hover:border-apex-accent/40 transition-all">Select Elite</Link>
            </div>

          </div>
        </div>
      </section>

      {/* ─── 7. Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-apex-border bg-[#040810] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            
            <Link href="/" className="flex items-center gap-3 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/quantro_logo.jpeg"
                alt="Quantro Logo"
                className="h-9 w-9 rounded-xl object-cover ring-1 ring-apex-border"
              />
              <div className="flex flex-col leading-none">
                <span className="text-base font-bold text-apex-text tracking-tight">QuantroApex</span>
                <span className="text-[9px] font-semibold text-apex-muted tracking-widest uppercase mt-0.5">
                  Quantro Software Labs
                </span>
              </div>
            </Link>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-apex-muted">
              <Link href="/home" className="hover:text-apex-text transition-colors">App Dashboard</Link>
              <Link href="/stocks/trading-desk" className="hover:text-apex-text transition-colors">Trading Desk</Link>
              <Link href="/auth/login" className="hover:text-apex-text transition-colors">Login</Link>
              <Link href="/auth/signup" className="hover:text-apex-text transition-colors">Sign Up</Link>
            </div>
          </div>

          <div className="border-t border-apex-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-apex-muted">
            <p>© {new Date().getFullYear()} Quantro Software Labs. All rights reserved.</p>
            <p className="text-[11px] text-apex-muted/80 max-w-md text-center sm:text-right">
              Trading stocks and cryptocurrencies involves risk. QuantroApex provides automated execution systems and tools for decision support.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
