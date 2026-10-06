import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/skeleton_loaders.dart';
import 'trade_detail_screen.dart';

class TradeHistoryScreen extends StatefulWidget {
  const TradeHistoryScreen({super.key});

  @override
  State<TradeHistoryScreen> createState() => _TradeHistoryScreenState();
}

class _TradeHistoryScreenState extends State<TradeHistoryScreen> {
  String _filterSide = 'ALL';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ExecutionProvider>();
    final orders = provider.orders;

    final filteredOrders = orders.where((ord) {
      if (_filterSide == 'BUY' && ord.side != 'BUY') return false;
      if (_filterSide == 'SELL' && ord.side != 'SELL') return false;
      if (_searchController.text.isNotEmpty) {
        return ord.symbol.toUpperCase().contains(_searchController.text.trim().toUpperCase());
      }
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('Trade History Log', style: AppTypography.h2(color: Colors.white)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Filter Bar & Search Input
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space4, vertical: AppSpacing.space2),
              child: Column(
                children: [
                  InputField(
                    label: 'Search Symbol (e.g. AAPL)',
                    controller: _searchController,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.space3),
                  Row(
                    children: ['ALL', 'BUY', 'SELL'].map((side) {
                      final isSelected = _filterSide == side;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(side),
                          selected: isSelected,
                          selectedColor: const Color(0xFF3B82F6),
                          backgroundColor: const Color(0xFF0F172A),
                          labelStyle: TextStyle(
                            color: isSelected ? Colors.white : const Color(0xFF94A3B8),
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                          onSelected: (_) => setState(() => _filterSide = side),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space2),

            Expanded(
              child: RefreshIndicator(
                onRefresh: () => provider.fetchExecutionState(),
                child: provider.isLoading
                    ? ListView.builder(
                        padding: const EdgeInsets.all(AppSpacing.space4),
                        itemCount: 5,
                        itemBuilder: (context, index) => const SkeletonListTile(),
                      )
                    : filteredOrders.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.all(AppSpacing.space4),
                            child: EmptyStateWidget(
                              icon: Icons.history_toggle_off_rounded,
                              title: 'No Trade History Found',
                              description: 'No orders or trade executions match your current search or filter criteria.',
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(AppSpacing.space4),
                            itemCount: filteredOrders.length,
                            itemBuilder: (context, index) {
                              final ord = filteredOrders[index];
                              final isBuy = ord.side == 'BUY';

                              return Padding(
                                padding: const EdgeInsets.only(bottom: AppSpacing.space2),
                                child: InkWell(
                                  onTap: () {
                                    showModalBottomSheet(
                                      context: context,
                                      backgroundColor: Colors.transparent,
                                      isScrollControlled: true,
                                      builder: (context) => TradeDetailScreen(order: ord),
                                    );
                                  },
                                  borderRadius: BorderRadius.circular(12),
                                  child: ApexCard(
                                    padding: AppSpacing.space3,
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Row(
                                          children: [
                                            StatusBadge(
                                              label: ord.side,
                                              color: isBuy ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                                            ),
                                            const SizedBox(width: AppSpacing.space3),
                                            Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(ord.symbol, style: AppTypography.h3(color: AppColors.white)),
                                                Text(
                                                  '${ord.quantity.toStringAsFixed(0)} shares @ ${ord.orderType}',
                                                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                        Row(
                                          children: [
                                            StatusBadge(
                                              label: ord.status,
                                              color: ord.status == 'FILLED' ? const Color(0xFF3B82F6) : const Color(0xFF64748B),
                                            ),
                                            const SizedBox(width: 4),
                                            const Icon(Icons.chevron_right_rounded, color: Color(0xFF64748B), size: 18),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
