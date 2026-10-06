import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/strategy_provider.dart';
import '../../core/services/strategy_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/skeleton_loaders.dart';
import '../../widgets/sparkline_chart.dart';
import 'strategy_detail_bottom_sheet.dart';

class StrategyMarketplaceScreen extends StatefulWidget {
  final bool isTab;

  const StrategyMarketplaceScreen({
    super.key,
    this.isTab = false,
  });

  @override
  State<StrategyMarketplaceScreen> createState() => _StrategyMarketplaceScreenState();
}

class _StrategyMarketplaceScreenState extends State<StrategyMarketplaceScreen> {
  String _selectedCategory = 'All';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<StrategyProvider>().initMarketplace();
    });
  }

  @override
  Widget build(BuildContext context) {
    final strategyProvider = context.watch<StrategyProvider>();
    final strategies = strategyProvider.allStrategies;

    final filtered = strategies.where((s) {
      if (_selectedCategory == 'All') return true;
      if (_selectedCategory == 'Stocks' && s.assetClass == 'STOCKS') return true;
      if (_selectedCategory == 'Crypto' && s.assetClass == 'CRYPTO') return true;
      if (_selectedCategory == 'Forex' && s.assetClass == 'FOREX') return true;
      if (_selectedCategory == 'Conservative' && s.riskLevel == 'CONSERVATIVE') return true;
      return false;
    }).toList();

    Widget content = RefreshIndicator(
      onRefresh: () => strategyProvider.initMarketplace(),
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space4, vertical: AppSpacing.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Bar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Strategies', style: AppTypography.h1(color: AppColors.white)),
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF1E293B)),
                  ),
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: const Icon(Icons.language_rounded, size: 18, color: Color(0xFF3B82F6)),
                    onPressed: () {},
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.space3),

            // Horizontal Category Filter Chips
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildFilterChip('All'),
                  _buildFilterChip('Stocks'),
                  _buildFilterChip('Crypto'),
                  _buildFilterChip('Forex'),
                  _buildFilterChip('Conservative'),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space4),

            // Recommended Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text('Recommended for you', style: AppTypography.h2(color: AppColors.white)),
                Text(
                  'Quantro Model Feed',
                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.space3),

            // Dynamic List / Skeleton / Empty State
            if (strategyProvider.isLoading)
              Column(
                children: const [
                  SkeletonCard(height: 180),
                  SizedBox(height: AppSpacing.space3),
                  SkeletonCard(height: 180),
                ],
              )
            else if (filtered.isEmpty)
              const EmptyStateWidget(
                icon: Icons.grid_off_rounded,
                title: 'No Strategies Found',
                description: 'No active quantitative strategies match your currently selected category filter.',
              )
            else
              ...filtered.map((st) {
                final bt = st.backtestSummary;
                final retText = '+${(bt.annualizedReturn * 100).toStringAsFixed(1)}%';

                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.space3),
                  child: _buildMarketplaceCard(
                    context: context,
                    strategy: st,
                    returnPct: retText,
                  ),
                );
              }),
            const SizedBox(height: AppSpacing.space4),
          ],
        ),
      ),
    );

    if (widget.isTab) {
      return content;
    }

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      body: SafeArea(child: content),
    );
  }

  Widget _buildFilterChip(String label) {
    final isSelected = _selectedCategory == label;
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedCategory = label;
        });
      },
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF2563EB) : const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF1E293B),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            color: isSelected ? Colors.white : const Color(0xFF94A3B8),
          ),
        ),
      ),
    );
  }

  Widget _buildMarketplaceCard({
    required BuildContext context,
    required StrategyData strategy,
    required String returnPct,
  }) {
    return ApexCard(
      padding: AppSpacing.space4,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      strategy.name,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        StatusBadge(
                          label: strategy.assetClass,
                          color: const Color(0xFF3B82F6),
                        ),
                        const SizedBox(width: 6),
                        StatusBadge(
                          label: strategy.riskLevel,
                          color: const Color(0xFF64748B),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            strategy.description,
            style: AppTypography.caption(color: const Color(0xFF64748B)),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: AppSpacing.space3),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Annual Return',
                    style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    returnPct,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF10B981),
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Active Users',
                    style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${strategy.activeUserCount}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              const SparklineChart(
                data: [10, 12, 11, 14, 13, 16, 15, 18.4],
                width: 110,
                height: 36,
                lineColor: Color(0xFF10B981),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.space4),

          PrimaryButton(
            label: 'Start with this strategy',
            onPressed: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (context) => StrategyDetailBottomSheet(strategy: strategy),
              );
            },
          ),
        ],
      ),
    );
  }
}
