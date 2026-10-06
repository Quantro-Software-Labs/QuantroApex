import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/analytics_provider.dart';
import '../../core/providers/dashboard_provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/providers/market_provider.dart';
import '../../core/providers/notification_provider.dart';
import '../../core/providers/risk_vault_provider.dart';
import '../../core/providers/simulation_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../widgets/live_ticker_tape.dart';
import '../home/aggregate_home_screen.dart';
import '../market/coming_soon_screen.dart';
import '../settings/settings_screen.dart';
import '../stocks/stocks_shell_screen.dart';

class MainShellScreen extends StatefulWidget {
  final int initialTab;

  const MainShellScreen({
    super.key,
    this.initialTab = 0,
  });

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  late int _currentIndex;
  Timer? _autoRefreshTimer;
  MarketProvider? _marketProvider;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTab;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _marketProvider = context.read<MarketProvider>();
      _refreshAllData(silent: false);
      _startAutoRefreshTimer();
      _marketProvider!.startAutoRefresh();
    });
  }

  void _startAutoRefreshTimer() {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) {
        _refreshAllData(silent: true);
      }
    });
  }

  void _refreshAllData({required bool silent}) {
    context.read<DashboardProvider>().initDashboard(silent: silent);
    context.read<SimulationProvider>().fetchSimulationSummary(silent: silent);
    context.read<ExecutionProvider>().fetchExecutionState(silent: silent);
    context.read<AnalyticsProvider>().loadAnalytics(silent: silent);

    final marketProvider = context.read<MarketProvider>();
    marketProvider.loadTicker(silent: silent);

    if (!silent) {
      context.read<RiskVaultProvider>().fetchVault();
      context.read<NotificationProvider>().loadNotificationState();
      marketProvider.fetchLearningStats();
      marketProvider.loadSentiment(silent: false);
    }
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _marketProvider?.stopAutoRefresh();
    super.dispose();
  }

  void _openTab(int index) {
    setState(() => _currentIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> tabs = [
      AggregateHomeScreen(onOpenTab: _openTab),
      const StocksShellScreen(),
      const SettingsScreen(isTab: true),
    ];

    final inAppQueue = context.watch<NotificationProvider>().inAppQueue;

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      body: Stack(
        children: [
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFF10B981),
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'QuantroApex Operating',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF94A3B8),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const LiveTickerTape(),
                Expanded(
                  child: IndexedStack(
                    index: _currentIndex < tabs.length ? _currentIndex : 0,
                    children: tabs,
                  ),
                ),
              ],
            ),
          ),
          if (inAppQueue.isNotEmpty)
            Positioned(
              top: MediaQuery.of(context).padding.top + 8,
              left: 16,
              right: 16,
              child: _InAppBanner(
                notification: inAppQueue.first,
                onDismiss: () =>
                    context.read<NotificationProvider>().dismissInAppNotification(0),
              ),
            ),
        ],
      ),
      bottomNavigationBar: _buildBottomNavigationBar(),
    );
  }

  Widget _buildBottomNavigationBar() {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        border: Border(
          top: BorderSide(color: Color(0xFF1E293B), width: 1.0),
        ),
      ),
      child: BottomNavigationBar(
        currentIndex: _currentIndex < 3 ? _currentIndex : 0,
        onTap: (index) {
          setState(() => _currentIndex = index);
        },
        backgroundColor: Colors.transparent,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFF3B82F6),
        unselectedItemColor: const Color(0xFF64748B),
        selectedFontSize: 10,
        unselectedFontSize: 10,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined, size: 20),
            activeIcon: Icon(Icons.home_rounded, size: 20),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.candlestick_chart_outlined, size: 20),
            activeIcon: Icon(Icons.candlestick_chart_rounded, size: 20),
            label: 'Stocks',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.settings_outlined, size: 20),
            activeIcon: Icon(Icons.settings_rounded, size: 20),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

class _NavIconWithBadge extends StatelessWidget {
  final IconData icon;
  final bool showBadge;
  final bool active;

  const _NavIconWithBadge({
    required this.icon,
    this.showBadge = false,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 28,
      height: 24,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Align(
            alignment: Alignment.center,
            child: Icon(
              icon,
              size: 20,
              color: active ? const Color(0xFF3B82F6) : const Color(0xFF64748B),
            ),
          ),
          if (showBadge)
            Positioned(
              right: -6,
              top: -2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: const Text(
                  'soon',
                  style: TextStyle(
                    fontSize: 7,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF3B82F6),
                    height: 1,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _InAppBanner extends StatefulWidget {
  final InAppNotification notification;
  final VoidCallback onDismiss;

  const _InAppBanner({required this.notification, required this.onDismiss});

  @override
  State<_InAppBanner> createState() => _InAppBannerState();
}

class _InAppBannerState extends State<_InAppBanner> {
  Timer? _autoDismiss;

  @override
  void initState() {
    super.initState();
    _autoDismiss = Timer(const Duration(seconds: 5), widget.onDismiss);
  }

  @override
  void dispose() {
    _autoDismiss?.cancel();
    super.dispose();
  }

  Color get _accentColor {
    switch (widget.notification.category) {
      case 'RISK':
        return const Color(0xFFEF4444);
      case 'ADVISORY':
        return const Color(0xFFF59E0B);
      default:
        return const Color(0xFF3B82F6);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onDismiss,
      child: Material(
        color: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _accentColor.withValues(alpha: 0.5)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.5),
                blurRadius: 20,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: _accentColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  widget.notification.category == 'RISK'
                      ? Icons.warning_amber_rounded
                      : widget.notification.category == 'ADVISORY'
                          ? Icons.lightbulb_outline_rounded
                          : Icons.bolt_rounded,
                  color: _accentColor,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.notification.title,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.notification.body,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF94A3B8),
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: widget.onDismiss,
                child: const Icon(Icons.close_rounded, color: Color(0xFF64748B), size: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
