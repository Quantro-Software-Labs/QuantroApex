import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/providers/analytics_provider.dart';
import 'core/providers/auth_provider.dart';
import 'core/providers/dashboard_provider.dart';
import 'core/providers/execution_provider.dart';
import 'core/providers/notification_provider.dart';
import 'core/providers/onboarding_provider.dart';
import 'core/providers/risk_vault_provider.dart';
import 'core/providers/simulation_provider.dart';
import 'core/providers/strategy_provider.dart';
import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'screens/auth/login_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'screens/onboarding/onboarding_flow_screen.dart';

void main() {
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
      theme: AppTheme.light(),
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
      case AuthStatus.authenticating:
        return const Scaffold(
          backgroundColor: AppColors.white,
          body: Center(
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.accent,
              ),
            ),
          ),
        );
      case AuthStatus.authenticated:
        final user = authProvider.user;
        if (user != null && user.onboardingCompletedAt == null) {
          return const OnboardingFlowScreen();
        }
        return const DashboardScreen();
      case AuthStatus.unauthenticated:
        return const LoginScreen();
    }
  }
}
