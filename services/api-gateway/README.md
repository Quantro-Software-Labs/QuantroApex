# QuantroApex API Gateway

The core backend orchestrator for **QuantroApex**, built with **Fastify**, **TypeScript**, **Prisma ORM**, and **PostgreSQL**.

---

## 🏛️ Overview

The API Gateway manages user authentication, account security, institutional risk enforcing, multi-broker order execution, real-time WebSocket market broadcasting, payment webhooks, and communication with down-stream AI microservices.

---

## ⚡ Key Modules & Features

- **🔐 Authentication & User Bridge**: Firebase Admin JWT verification, automatic user provisioning, and role-based route access controls.
- **🛡️ Server-Side Risk Enforcer**: Real-time evaluation of drawdown limits, daily max loss, per-trade position sizing, and mandatory emergency stop rules.
- **💼 Multi-Broker Engine**: Abstraction layer supporting:
  - **Alpaca Markets** (Stocks & Equities)
  - **OANDA** (Forex)
  - **CCXT** (Binance / Bybit / Crypto Exchanges)
- **🤖 AI & Quant Engine Gateway**: Fastify proxy routes connecting to `services/ai-service` (`:8001`) for Smart Money Concepts (SMC) analysis, TA-Lib pattern detection, and VectorBT backtests.
- **💳 Payments & KYC**: Paystack subscription webhooks and Sumsub KYC identity verification flow.
- **📢 Real-Time WebSockets & Notifications**: Live tick distribution, execution alerts via Twilio SMS, Resend transactional emails, and Sentry error monitoring.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (`>= 20.0.0`)
- **Framework**: Fastify v4 / v5
- **ORM & Database**: Prisma ORM, PostgreSQL / Supabase
- **Testing**: Vitest (`npm test`)
- **Monitoring**: Sentry, PostHog

---

## 🚀 Quick Start

### 1. Installation

```bash
cd services/api-gateway
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` in the root or `services/api-gateway/`:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:password@localhost:5432/quantroapex"
DIRECT_URL="postgresql://postgres:password@localhost:5432/quantroapex"
FIREBASE_PROJECT_ID="quantroapex"
AI_SERVICE_URL="http://localhost:8001"
DATA_PIPELINE_URL="http://localhost:8002"
```

### 3. Database Migration

```bash
npx prisma migrate dev
```

### 4. Running the Gateway

- **Development**:
  ```bash
  npm run dev
  ```
- **Production Build**:
  ```bash
  npm run build
  npm start
  ```

### 5. Running Tests

```bash
npm test
```

---

## 📌 API Routes Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | `GET` | Health status and sub-service connectivity |
| `/auth/login` | `POST` | User authentication & session generation |
| `/users/me` | `GET` | Retrieve user profile & subscription tier |
| `/execution/order` | `POST` | Route order through Risk Enforcer & Broker Engine |
| `/execution/positions` | `GET` | Active positions across connected brokers |
| `/risk-vault/limits` | `POST` | Configure user risk limits & drawdown controls |
| `/ai/analysis` | `GET` | Fetch SMC overlays & indicators from AI service |
| `/market/quotes` | `GET` | Real-time quote snapshots |
| `/kyc/status` | `GET` | Retrieve Sumsub KYC verification state |
| `/payments/webhook` | `POST` | Paystack payment status notifications |
