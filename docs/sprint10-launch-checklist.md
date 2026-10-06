# Sprint 10 — Beta launch checklist

## Security & financial (do first)
- [x] Risk Vault enforced server-side (`validateTradeRisk` + execution path)
- [x] LIVE orders require KYC (`mode: LIVE` / `isSimulated: false` → 403 KYC_REQUIRED)
- [x] Plan gates for MANUAL desk / live autopilot (403 PLAN_REQUIRED)
- [x] Orders/trades scoped by `userId` (isolation test)
- [x] Paystack webhook HMAC verification when secret configured
- [x] Sumsub webhook signature required in production
- [x] Win rate / profit factor pure functions unit-tested

Run: `cd services/api-gateway && npm test -- security_audit`

## Monitoring (production env)
Set in production secrets (not commit):

```
NODE_ENV=production
SENTRY_DSN=https://...@o....ingest.sentry.io/...
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com
SUMSUB_WEBHOOK_SECRET=...
PAYSTACK_SECRET_KEY=sk_live_...
CORS_ORIGIN=https://apex.quantrolabs.app
```

- [ ] Sentry DSN live — confirm error appears in Sentry after a test 500
- [ ] PostHog production key — confirm `kyc_initiated` / `upgrade_completed` from a device
- [ ] Uptime: ping `GET /health` every 60s (Better Stack / UptimeRobot); alert if down > 2 min

Health endpoint: `GET ${API_BASE_URL}/health`

## Store submission
- [ ] Host `docs/legal/privacy.html` at https://apex.quantrolabs.app/privacy
- [ ] Apple: screenshots (6.5"), metadata, 17+ financial, review notes (paper = no real money; live needs KYC)
- [ ] Google Play: listing, feature graphic, data safety form, financial content rating
- [ ] Submit both **this week** while polish continues

## Quiet Confidence (design pass)
- [x] Mode badge: subtle "Simulation" / "Live" (not SIM MODE caps)
- [x] Calm snackbars via `widgets/calm_feedback.dart`
- [x] Home status: "Trading paused" / "Apex running" (no "HALTED" shout)
- [x] Risk Vault: amber pause UI — "Pause all trading" (not HALT ALL TRADING NOW)
- [x] Order sheet Risk Vault copy without exclamation marks
- [x] Simulation ticks: plain language fill notice

## AI track (non-blocking)
- Pipeline stream continues in background
- Colab retrain when GPU quota returns
- Paper trader toward 500-take decision gate
