import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import 'package:provider/provider.dart';
import 'core/providers/analytics_provider.dart';
import 'core/providers/auth_provider.dart';
import 'core/providers/dashboard_provider.dart';
import 'core/providers/execution_provider.dart';
import 'core/providers/kyc_provider.dart';
import 'core/providers/market_provider.dart';
import 'core/providers/notification_provider.dart';
import 'core/providers/onboarding_provider.dart';
import 'core/providers/risk_vault_provider.dart';
import 'core/providers/simulation_provider.dart';
import 'core/providers/strategy_provider.dart';
import 'core/providers/subscription_provider.dart';
import 'core/services/notification_service.dart';
import 'core/theme/app_theme.dart';
import 'firebase_options.dart';
import 'screens/auth/auth_entry_screen.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/dashboard/main_shell_screen.dart';
import 'screens/onboarding/onboarding_flow_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    await NotificationService().initializePushNotifications();
  } catch (_) {
    // Firebase not configured — push notifications disabled.
  }

  try {
    const posthogKey = String.fromEnvironment('POSTHOG_API_KEY');
    if (posthogKey.isNotEmpty) {
      final config = PostHogConfig(posthogKey);
      config.host = const String.fromEnvironment(
        'POSTHOG_HOST',
        defaultValue: 'https://us.i.posthog.com',
      );
      await Posthog().setup(config);
    }
  } catch (_) {
    // PostHog optional.
  }

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => OnboardingProvider()),
        ChangeNotifierProvider(create: (_) => RiskVaultProvider()),
        ChangeNotifierProvider(create: (_) => StrategyProvider()),
        ChangeNotifierProvider(create: (_) => ExecutionProvider()),
        ChangeNotifierProvider(create: (_) => SimulationProvider()),
        ChangeNotifierProvider(create: (_) => DashboardProvider()),
        ChangeNotifierProvider(create: (_) => AnalyticsProvider()),
        ChangeNotifierProvider(create: (_) => NotificationProvider()),
        ChangeNotifierProvider(create: (_) => MarketProvider()),
        ChangeNotifierProvider(create: (_) => KycProvider()),
        ChangeNotifierProvider(create: (_) => SubscriptionProvider()),
      ],
      child: const QuantroApexApp(),
    ),
  );
}

class QuantroApexApp extends StatelessWidget {
  const QuantroApexApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantroApex',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      home: const RootNavigator(),
    );
  }
}

class RootNavigator extends StatelessWidget {
  const RootNavigator({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    switch (authProvider.status) {
      case AuthStatus.initial:
        return const SplashScreen();
      case AuthStatus.authenticating:
        // Keep auth UI visible during interactive sign-in so errors/snackbars
        // aren't destroyed by swapping home to SplashScreen mid-flow.
        if (authProvider.user != null) {
          return const SplashScreen();
        }
        return const AuthEntryScreen();
      case AuthStatus.authenticated:
        final user = authProvider.user;
        if (user != null && user.onboardingCompletedAt == null) {
          return const OnboardingFlowScreen();
        }
        return const MainShellScreen();
      case AuthStatus.unauthenticated:
        return const AuthEntryScreen();
    }
  }
}
