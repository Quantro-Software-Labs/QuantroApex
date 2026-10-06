# QuantroApex Trader Web

A high-performance, institutional desktop interface for **QuantroApex** built with **Next.js 16**, **React 19**, **Tailwind CSS**, and **TanStack React Query**.

---

## 💻 Overview

QuantroApex Trader Web provides professional traders with an interface for monitoring algorithmic trading bots, executing manual trades, connecting institutional brokerages, managing risk vaults, and observing AI-driven Smart Money Concepts (SMC) market signals in real time.

---

## ✨ Features

- **📊 Interactive Trading Charts**: Dynamic candlestick visualizations powered by Lightweight Charts and TradingView widgets with SMC overlays (Order Blocks, Fair Value Gaps, Liquidity Pools).
- **🤖 Apex Agent Control Room**: Toggle autonomous trading strategies, adjust risk profiles, view live inference logs, and monitor execution state.
- **🔌 Brokerage Integration**: Connect Alpaca Markets, OANDA Forex, or CCXT Crypto brokerages directly via secure credentials.
- **🛡️ Risk Vault Management**: Configure daily loss limits, drawdown fail-safes, max leverage, and position size caps.
- **⚡ Real-Time Market Data**: High-frequency order book snapshots, live ticker tapes, and execution event notifications.
- **🔐 Firebase Authentication & Sumsub KYC**: Secure user login with Firebase Auth, multi-tier KYC onboarding, and Paystack billing portals.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router, Server Components)
- **UI Library**: React 19, Tailwind CSS, Lucide Icons, Radix UI primitives
- **Data Fetching & State**: TanStack React Query v5, SWR, Zustand
- **Charting**: Lightweight Charts, TradingView HTML embeds, Recharts
- **Auth**: Firebase Client SDK (`firebase/auth`)

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: `>= 20.0.0`
- **pnpm / npm**: `npm >= 10`

### 2. Environment Variables

Create `.env.local` in `apps/trader-web/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=quantroapex.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=quantroapex
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=quantroapex.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=429681170519
NEXT_PUBLIC_FIREBASE_APP_ID=1:429681170519:web:your-app-id
```

### 3. Run Development Server

From the repository root:
```bash
npm run trader:dev
```
Or directly inside `apps/trader-web`:
```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## 📁 Directory Structure

```
apps/trader-web/
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── analytics/         # Trade performance & metrics breakdown
│   │   ├── dashboard/         # Core trading desktop & Apex Agent control
│   │   ├── kyc/               # Verification & document upload
│   │   ├── login/             # Auth login page
│   │   ├── marketplace/       # Strategy marketplace & backtest reports
│   │   ├── register/          # User registration page
│   │   ├── settings/          # Broker credentials & security preferences
│   │   ├── layout.tsx         # Root layout with React Query provider
│   │   └── page.tsx           # Landing page & navigation redirect
│   ├── components/
│   │   ├── broker/            # BrokerConnectModal & account cards
│   │   ├── chart/             # TradingView & Lightweight Charts components
│   │   ├── layout/            # Sidebar navigation & TopBar headers
│   │   ├── risk/              # RiskVault status indicators & drawdown gauges
│   │   └── ui/                # Buttons, Modals, Badges, Tabs
│   └── lib/
│       ├── api.ts             # Axios/Fetch gateway wrapper
│       ├── firebase.ts        # Firebase Client SDK initialization
│       ├── queries.ts         # React Query hooks (market, orders, positions)
│       └── utils.ts           # Number formatting & CSS class utility helpers
├── public/                    # Static assets & favicon
└── package.json               # Next.js package dependencies
```
