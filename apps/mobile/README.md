# QuantroApex Mobile App

An institutional-grade, cross-platform algorithmic trading, portfolio management, and AI advisory client built with **Flutter**.

---

## 📱 Features

- **🔐 Multi-Method Authentication**: Firebase Auth integration supporting Email/Password, Phone OTP, and Biometric/PIN flows.
- **⚡ Real-Time Ticker & Market Feeds**: Live streaming tickers, price tick flash animations, interactive candle/sparkline charts, and market depth displays.
- **🤖 Apex Agent & AI Advisory**: Real-time signal feed with AI confidence scores, Smart Money Concepts (SMC) visual overlays (Order Blocks, Fair Value Gaps, Liquidity Pools), and autonomous trading controls.
- **📊 Manual Execution Desk**: One-tap market/limit order placement, dynamic stop-loss/take-profit sliders, position management, and order history.
- **🛡️ Risk Vault & Institutional Rules**: Real-time server-enforced drawdown tracking, daily loss metrics, exposure limits, and emergency kill switches.
- **📋 KYC & Subscription Management**: Integrated Sumsub identity verification onboarding and Paystack subscription management.
- **🌓 Dark Mode & Calm UX**: Modern dark-mode UI with sleek gradients, skeleton loaders, custom badges, and smooth chart visualizations.

---

## 🛠️ Architecture & Tech Stack

- **Framework**: Flutter `3.22+` / Dart `3.4+`
- **State Management**: Provider & Riverpod
- **Networking**: `http` / WebSocket with automatic reconnection and fallback
- **Authentication**: Firebase Authentication (`firebase_core`, `firebase_auth`)
- **Charts**: Custom Flutter Canvas charts + TradingView HTML embeds
- **Supported Platforms**:
  - iOS (`iOS 14.0+`)
  - Android (`API 24+` / Android 7.0+)
  - Web (HTML5 Canvas / Wasm)
  - Linux Desktop / macOS / Windows

---

## 🚀 Getting Started

### 1. Prerequisites

- [Flutter SDK](https://docs.flutter.dev/get-started/install) (`>= 3.22.0`)
- Android Studio / Xcode (for mobile device emulation)
- Linux Desktop dependencies (if building on Linux):
  ```bash
  sudo apt-get install -y libsecret-1-dev libjsoncpp-dev libgl1-mesa-dev
  ```

### 2. Environment Configuration

Ensure Firebase credentials are in place:
- **Android**: `android/app/google-services.json`
- **iOS**: `ios/Runner/GoogleService-Info.plist`
- **Options**: `lib/firebase_options.dart`

To override the default API Gateway URL (`http://localhost:3000`), update `lib/core/config/app_config.dart` or pass build environment flags:
```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

### 3. Dependencies Setup

```bash
cd apps/mobile
flutter pub get
```

### 4. Running the App

- **Chrome / Web**:
  ```bash
  flutter run -d chrome
  ```
- **Linux Desktop**:
  ```bash
  flutter run -d linux
  ```
- **Android Emulator**:
  ```bash
  flutter run -d android
  ```
- **iOS Simulator**:
  ```bash
  flutter run -d iphone
  ```

---

## 🧪 Testing & Code Formatting

```bash
# Run unit and widget test suite
flutter test

# Run code analysis
flutter analyze
```

---

## 📁 Directory Structure

```
apps/mobile/
├── android/               # Native Android project files
├── ios/                   # Native iOS project files
├── lib/
│   ├── core/
│   │   ├── config/        # API endpoints & environment configuration
│   │   ├── providers/     # State management providers (KYC, Market, Subscriptions)
│   │   ├── services/      # API clients (HTTP, WebSockets, Analytics, KYC)
│   │   └── theme/         # App colors, typography, theme tokens
│   ├── screens/
│   │   ├── analytics/     # Trade history & performance breakdown
│   │   ├── auth/          # Splash, Email, Phone OTP, Reset screens
│   │   ├── dashboard/     # Home tab, Apex Agent, Main shell container
│   │   ├── execution/     # Trading desk & order modals
│   │   ├── kyc/           # Identity verification flow
│   │   ├── notifications/ # Advisory signal detail screens
│   │   ├── onboarding/    # Multi-step onboarding carousel
│   │   ├── risk_vault/    # Drawdown limits & emergency controls
│   │   └── strategies/    # Strategy marketplace & details
│   └── widgets/           # Sparklines, Gauges, Ticker tapes, Modals
├── test/                  # Widget & unit test suite
└── pubspec.yaml           # Flutter package manifest
```
