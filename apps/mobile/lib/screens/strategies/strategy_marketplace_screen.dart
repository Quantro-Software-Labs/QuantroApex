import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/strategy_provider.dart';
import '../../core/services/strategy_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import 'strategy_detail_bottom_sheet.dart';

class StrategyMarketplaceScreen extends StatelessWidget {
  const StrategyMarketplaceScreen({super.key});

  void _openDetail(BuildContext context, StrategyData strategy) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => StrategyDetailBottomSheet(strategy: strategy),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<StrategyProvider>();
    final recommended = provider.recommendedStrategies;
    final strategies = provider.strategies;
    final activeFilter = provider.assetClassFilter;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primary),
        title: Text('Strategy Marketplace', style: AppTypography.h2(color: AppColors.primary)),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.loadMarketplace(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (recommended.isNotEmpty) ...[
                  Text('Recommended for You', style: AppTypography.h2(color: AppColors.primary)),
                  const SizedBox(height: AppSpacing.space2),
                  Text(
                    'Matched based on your experience level and Risk Vault settings.',
                    style: AppTypography.secondary(color: AppColors.muted),
                  ),
                  const SizedBox(height: AppSpacing.space3),
                  ...recommended.map((strat) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space3),
                      child: StrategyCard(
                        name: strat.name,
                        description: strat.description,
                        riskLevel: strat.riskLevel,
                        assetClass: strat.assetClass,
                        userCount: strat.activeUserCount,
                        onStart: () => _openDetail(context, strat),
                      ),
                    );
                  }),
                  const SizedBox(height: AppSpacing.space4),
                ],

                Text('Browse All Strategies', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space3),

                // Filter Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _FilterChip(
                        label: 'All Assets',
                        isSelected: activeFilter == 'ALL',
                        onTap: () => provider.setFilters(assetClass: 'ALL'),
                      ),
                      const SizedBox(width: AppSpacing.space2),
                      _FilterChip(
                        label: 'Stocks',
                        isSelected: activeFilter == 'STOCKS',
                        onTap: () => provider.setFilters(assetClass: 'STOCKS'),
                      ),
                      const SizedBox(width: AppSpacing.space2),
                      _FilterChip(
                        label: 'Crypto',
                        isSelected: activeFilter == 'CRYPTO',
                        onTap: () => provider.setFilters(assetClass: 'CRYPTO'),
                      ),
                      const SizedBox(width: AppSpacing.space2),
                      _FilterChip(
                        label: 'Forex',
                        isSelected: activeFilter == 'FOREX',
                        onTap: () => provider.setFilters(assetClass: 'FOREX'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space4),

                if (provider.isLoading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.space5),
                      child: CircularProgressIndicator(color: AppColors.accent),
                    ),
                  )
                else if (strategies.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.space4),
                    child: Text(
                      'No strategies match the selected filter.',
                      style: AppTypography.secondary(color: AppColors.muted),
                    ),
                  )
                else
                  ...strategies.map((strat) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space3),
                      child: GestureDetector(
                        onTap: () => _openDetail(context, strat),
                        child: StrategyCard(
                          name: strat.name,
                          description: strat.description,
                          riskLevel: strat.riskLevel,
                          assetClass: strat.assetClass,
                          userCount: strat.activeUserCount,
                          onStart: () => _openDetail(context, strat),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(
        label,
        style: AppTypography.secondary(
          color: isSelected ? AppColors.white : AppColors.primary,
        ),
      ),
      selected: isSelected,
      selectedColor: AppColors.accent,
      backgroundColor: AppColors.surface,
      onSelected: (_) => onTap(),
    );
  }
}
