# ⚡ QuantroApex V1

> **Autonomous AI Trading Assistant & Risk Governance Platform**
> Built with *Quiet Confidence* design principles for disciplined algorithmic capital growth.

---

## 🛡️ Quiet Confidence Design Philosophy

QuantroApex is engineered around five core visual and interaction principles:
1. **Composed Numbers & Data**: Muted tones (slate, emerald, crimson) instead of aggressive flashing colors. Financial values are displayed with tabular monospaced numbers.
2. **Deterministic Control**: The user defines hard boundary constraints (Risk Vault) that the autonomous agent can *never* override.
3. **Transparent Reasoning**: Every order, position modification, or advisory signal presents plain-language AI rationale.
4. **Advisory Mode Flexibility**: Switch seamlessly between **Autonomous Execution** (hands-free) and **Advisory Mode** (swipe-to-approve signal feed).
5. **Fail-Safe Reliability**: Built-in paper trading simulation, real-time WebSocket activity feeds, and single-tap Emergency Stop controls.

---

## 🏗️ Architecture Overview

QuantroApex is structured as a modern monorepo separating API services and mobile clients:

```
QuantroApex/
├── apps/
│   └── mobile/                     # Flutter 3.27 Mobile App (iOS / Android / Linux)
│       ├── lib/
│       │   ├── core/               # ApiService, Auth, Providers (State Management)
│       │   ├── screens/            # Auth, Onboarding, Risk Vault, Marketplace, Dashboard, Advisory, Analytics
│       │   └── widgets/            # Quiet Confidence Design System UI Components
│       └── pubspec.yaml
├── services/
│   └── api-gateway/                # Fastify + TypeScript API Server
│       ├── prisma/                 # Database Schema & PostgreSQL Migrations
│       ├── src/
│       │   ├── lib/                # Risk Enforcer, Execution Engine, Alpaca Broker Client, EventBus
│       │   ├── plugins/            # JWT Auth, Fastify Decorators
│       │   └── routes/             # Auth, Onboarding, Risk Vault, Strategies, Execution, Analytics, Notifications
│       ├── Dockerfile              # Multi-Stage Production Container Image
│       └── package.json
├── docker-compose.yml              # Local PostgreSQL 16 Infrastructure
└── README.md
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: `v22.0.0` or later
- **Docker & Docker Compose**: For PostgreSQL database
- **Flutter**: `v3.27.0` or later (for mobile client)

### 1. Database Infrastructure Setup
Start the local PostgreSQL container:
```bash
docker-compose up -d
```

### 2. API Gateway Setup
Navigate to the API gateway and configure environment:
```bash
cd services/api-gateway
cp ../../.env.example .env
```

Ensure your `.env` contains your PostgreSQL credentials and JWT secrets (`openssl rand -hex 32`).

Run database migrations & start dev server:
```bash
npm install
npx prisma migrate deploy
npm run dev
```
The API Gateway starts on `http://localhost:3000`.

### 3. Flutter Mobile Client Setup
In a new terminal window:
```bash
cd apps/mobile
flutter pub get
flutter run -d linux # or -d chrome / android / ios
```

---

## 📡 API Endpoint Directory

### Authentication & User Profile
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/auth/register` | Register new account & issue JWT tokens | No |
| `POST` | `/auth/login` | Authenticate credentials (rate limited: 10/min) | No |
| `POST` | `/auth/refresh` | Rotate access token using refresh token | No |
| `POST` | `/auth/logout` | Revoke user refresh tokens | Yes |
| `GET` | `/auth/me` | Fetch authenticated user profile & agent state | Yes |

### Onboarding & Setup
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/onboarding/progress` | Fetch current onboarding step & progress | Yes |
| `POST` | `/onboarding/path` | Set onboarding path (`NEWCOMER` / `EXPRESS`) | Yes |
| `POST` | `/onboarding/step` | Update step index & step state | Yes |
| `POST` | `/onboarding/complete` | Finalise onboarding & set Risk Vault parameters | Yes |

### Risk Vault Governance
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/risk-vault` | Fetch active Risk Vault parameters & emergency status | Yes |
| `PUT` | `/risk-vault` | Update daily loss limits, drawdown, exposure % | Yes |
| `POST` | `/risk-vault/emergency-stop` | **Halt all trading immediately** | Yes |
| `POST` | `/risk-vault/resume` | Resume trading after emergency stop | Yes |

### Strategy Marketplace
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/strategies` | Browse active strategies (paginated) | Yes |
| `GET` | `/strategies/recommended` | Fetch personalized AI strategy recommendations | Yes |
| `GET` | `/strategies/:id` | Fetch strategy detail by ID or slug | Yes |
| `POST` | `/strategies/select` | Attach strategy to active trading agent | Yes |

### Execution & Simulation Engine
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/execution/order` | Submit market/limit order (evaluated by Risk Enforcer) | Yes |
| `GET` | `/execution/orders` | Fetch user order history (paginated) | Yes |
| `GET` | `/execution/positions` | Fetch active portfolio positions & cash balance | Yes |
| `POST` | `/execution/signal` | Execute strategy signal | Yes |
| `GET` | `/simulation/summary` | Fetch paper trading portfolio summary | Yes |
| `POST` | `/simulation/reset` | Reset paper account to $100,000 initial capital | Yes |
| `POST` | `/simulation/generate-ticks` | Simulate live market price movement | Yes |

### Activity Feed & Real-Time Stream
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/activity-feed` | Fetch activity log (paginated) | Yes |
| `WS` | `/activity-feed/ws/events?token=<jwt>` | **Real-time WebSocket event stream** | Yes |

### Analytics & Performance
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/analytics/metrics` | Fetch win rate, profit factor, equity, trade count | Yes |
| `GET` | `/analytics/equity-curve` | Fetch portfolio time-series equity points | Yes |
| `GET` | `/analytics/trade-history` | Fetch fill logs with AI reasoning | Yes |

### Notifications & Advisory Mode
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/notifications/preferences` | Fetch notification & advisory alert settings | Yes |
| `PUT` | `/notifications/preferences` | Update push alert settings | Yes |
| `POST` | `/notifications/fcm-token` | Register FCM push device token | Yes |
| `GET` | `/notifications/advisory-feed` | Fetch pending Advisory Mode trade signals | Yes |
| `POST` | `/notifications/advisory/respond` | Approve or reject pending signal | Yes |

### Monitoring & Operations
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Basic service ping | No |
| `GET` | `/health/live` | Liveness probe (container uptime) | No |
| `GET` | `/health/ready` | Readiness probe (PostgreSQL database check) | No |
| `GET` | `/health/detailed` | Detailed subsystem status, DB latency & memory usage | No |

---

## 🧪 Verification & Testing

Run the full API Gateway test suite (includes 41 unit, integration, and E2E journey tests):
```bash
npm test --workspace=@quantroapex/api-gateway
```

Run Flutter static analysis:
```bash
cd apps/mobile && flutter analyze
```

---

## 📦 Container Production Deployment

Build the multi-stage Docker container image:
```bash
docker build -t quantroapex-api-gateway ./services/api-gateway
```

Run the container:
```bash
docker run -d \
  --name quantroapex-gateway \
  -p 3000:3000 \
  --env-file .env \
  quantroapex-api-gateway
```

---

## 📄 License & System Status
- **Status**: V1 Production-Ready (100% Sprints Completed & Verified)
- **Built by**: QuantroApex Autonomous Engineering Team
