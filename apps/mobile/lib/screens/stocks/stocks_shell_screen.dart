import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../analytics/analytics_screen.dart';
import '../dashboard/apex_agent_tab.dart';
import '../dashboard/home_tab.dart';
import '../execution/manual_trading_desk_screen.dart';
import '../strategies/strategy_marketplace_screen.dart';

/// Stocks workspace with inner tabs: Overview | Apex Agent | Strategies | Analytics.
class StocksShellScreen extends StatefulWidget {
  const StocksShellScreen({super.key});

  @override
  State<StocksShellScreen> createState() => _StocksShellScreenState();
}

class _StocksShellScreenState extends State<StocksShellScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _tabController.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: _tabController.index == 0
          ? FloatingActionButton.extended(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const ManualTradingDeskScreen(),
                  ),
                );
              },
              backgroundColor: AppColors.accentLight,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.candlestick_chart_rounded),
              label: Text(
                'Manual Trade',
                style: AppTypography.body(color: Colors.white).copyWith(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            )
          : null,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Text(
              'Stocks',
              style: AppTypography.h2(color: AppColors.white),
            ),
          ),
          TabBar(
            controller: _tabController,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.accentLight,
            unselectedLabelColor: AppColors.muted,
            indicatorColor: AppColors.accentLight,
            indicatorWeight: 2,
            labelStyle: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
            tabs: const [
              Tab(text: 'Overview'),
              Tab(text: 'Apex Agent'),
              Tab(text: 'Strategies'),
              Tab(text: 'Analytics'),
            ],
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                HomeTab(
                  onViewActivityTap: () {
                    _tabController.animateTo(1);
                  },
                ),
                const ApexAgentTab(),
                const StrategyMarketplaceScreen(isTab: true),
                const AnalyticsScreen(isTab: true),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
