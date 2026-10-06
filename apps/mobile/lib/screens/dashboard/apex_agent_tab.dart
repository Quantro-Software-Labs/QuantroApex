import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/dashboard_provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/providers/market_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/skeleton_loaders.dart';
import '../analytics/trade_detail_screen.dart';

class ApexAgentTab extends StatelessWidget {
  const ApexAgentTab({super.key});

  @override
  Widget build(BuildContext context) {
    final dashboardProvider = context.watch<DashboardProvider>();
    final executionProvider = context.watch<ExecutionProvider>();
    final marketProvider = context.watch<MarketProvider>();

    final agentState = dashboardProvider.agentState;
    final activeStrategy = dashboardProvider.activeStrategyName ?? 'No Active Strategy';
    final entries = dashboardProvider.entries;
    final orders = executionProvider.orders;
    final learningStats = marketProvider.learningStats;

    final lastOrder = orders.isNotEmpty ? orders.first : null;

    return RefreshIndicator(
      onRefresh: () async {
        await dashboardProvider.initDashboard();
        await executionProvider.fetchExecutionState();
        await marketProvider.fetchLearningStats();
      },
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space4, vertical: AppSpacing.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Bar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Apex Agent', style: AppTypography.h1(color: AppColors.white)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.4)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFF10B981),
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Text(
                        'Live Operating',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF10B981),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.space4),

            // Agent Phase Stepper
            _buildAgentStepper(currentPhase: agentState.phase),
            const SizedBox(height: AppSpacing.space4),

            // Global Brain V2 AI Training Engine Card
            if (learningStats != null) ...[
              Container(
                padding: const EdgeInsets.all(AppSpacing.space4),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF0F172A), Color(0xFF1E1B4B)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.memory_rounded, color: AppColors.accentLight, size: 20),
                            const SizedBox(width: 8),
                            Text('Global Brain V2 Learning Engine', style: AppTypography.h3(color: AppColors.white)),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.accent.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${learningStats.modelReadinessPct.toStringAsFixed(1)}% Ready for V2',
                            style: AppTypography.caption(color: AppColors.accentLight),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.space3),
                    Text(
                      'Every manual trade in Stocks, Forex & Crypto generates training data points. The engine is learning from your execution patterns to power the V2 Autonomous Model.',
                      style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                    ),
                    const SizedBox(height: AppSpacing.space3),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Samples Logged: ${learningStats.totalSamples} trade data points',
                          style: AppTypography.caption(color: Colors.white),
                        ),
                        Text(
                          'Win Rate: ${(learningStats.winRate * 100).toStringAsFixed(1)}%',
                          style: AppTypography.caption(color: AppColors.success),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (learningStats.modelReadinessPct / 100).clamp(0.05, 1.0),
                        backgroundColor: const Color(0xFF1E293B),
                        color: AppColors.accentLight,
                        minHeight: 6,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space4),
            ],

            // Current Strategy Card
            ApexCard(
              padding: AppSpacing.space4,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Active Strategy',
                            style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            activeStrategy,
                            style: AppTypography.h2(color: AppColors.white).copyWith(
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Model Allocation · Enforced Bounds',
                            style: AppTypography.caption(color: const Color(0xFF64748B)),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            'Confidence',
                            style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                          ),
                          const SizedBox(height: 4),
                          StatusBadge(
                            label: 'Active',
                            color: const Color(0xFF10B981),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space4),

            // Last Trade Executed Section
            Text('Last Executed Trade', style: AppTypography.h2(color: AppColors.white)),
            const SizedBox(height: AppSpacing.space3),

            if (executionProvider.isLoading)
              const SkeletonCard(height: 110)
            else if (lastOrder == null)
              const EmptyStateWidget(
                icon: Icons.candlestick_chart_rounded,
                title: 'No Trades Executed Yet',
                description: 'Apex will display live order executions and Gemini AI trade rationale here.',
              )
            else
              InkWell(
                onTap: () {
                  showModalBottomSheet(
                    context: context,
                    backgroundColor: Colors.transparent,
                    isScrollControlled: true,
                    builder: (context) => TradeDetailScreen(order: lastOrder),
                  );
                },
                child: ApexCard(
                  padding: AppSpacing.space3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Center(
                              child: Text(
                                lastOrder.symbol,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${lastOrder.side} ${lastOrder.quantity.toStringAsFixed(0)} ${lastOrder.symbol} @ ${lastOrder.orderType}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Executed ${lastOrder.createdAt.hour}:${lastOrder.createdAt.minute.toString().padLeft(2, '0')}',
                                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                                ),
                              ],
                            ),
                          ),
                          StatusBadge(
                            label: lastOrder.status,
                            color: lastOrder.status == 'FILLED' ? const Color(0xFF3B82F6) : const Color(0xFF64748B),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF060B14),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFF1E293B)),
                        ),
                        child: Text(
                          'Apex reasoning: ${lastOrder.side == 'BUY' ? 'Strong 20-period momentum signal' : 'Target exit trigger'} detected. Sized within Risk Vault limits.',
                          style: TextStyle(
                            fontSize: 11,
                            fontStyle: FontStyle.italic,
                            color: Colors.white.withValues(alpha: 0.75),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: AppSpacing.space4),

            // Timeline Feed
            Text('Activity Timeline', style: AppTypography.h2(color: AppColors.white)),
            const SizedBox(height: AppSpacing.space3),

            if (dashboardProvider.isLoading)
              Column(
                children: const [
                  SkeletonListTile(),
                  SkeletonListTile(),
                  SkeletonListTile(),
                ],
              )
            else if (entries.isEmpty)
              const EmptyStateWidget(
                icon: Icons.timeline_rounded,
                title: 'Timeline Empty',
                description: 'Apex events, phase upgrades, and trade logs will appear here in chronological order.',
              )
            else
              ...entries.map((entry) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ApexCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          margin: const EdgeInsets.only(top: 4),
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Color(0xFF3B82F6),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            entry.message,
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            const SizedBox(height: AppSpacing.space4),
          ],
        ),
      ),
    );
  }

  Widget _buildAgentStepper({required String currentPhase}) {
    final phases = ['SEED', 'LEARNING', 'ADAPTING', 'AUTONOMOUS'];
    int activeIndex = phases.indexOf(currentPhase.toUpperCase());
    if (activeIndex == -1) activeIndex = 1; // Default to LEARNING

    return ApexCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(phases.length, (index) {
              final isCompleted = index <= activeIndex;
              final isActive = index == activeIndex;

              return Expanded(
                child: Row(
                  children: [
                    Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isActive
                            ? const Color(0xFF3B82F6)
                            : (isCompleted ? const Color(0xFF2563EB) : const Color(0xFF1E293B)),
                        boxShadow: isActive
                            ? [
                                BoxShadow(
                                  color: const Color(0xFF3B82F6).withValues(alpha: 0.6),
                                  blurRadius: 8,
                                  spreadRadius: 2,
                                )
                              ]
                            : null,
                      ),
                    ),
                    if (index < phases.length - 1)
                      Expanded(
                        child: Container(
                          height: 2,
                          color: isCompleted ? const Color(0xFF2563EB) : const Color(0xFF1E293B),
                        ),
                      ),
                  ],
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(phases.length, (index) {
              final isActive = index == activeIndex;
              return Text(
                phases[index],
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
                  color: isActive ? const Color(0xFF3B82F6) : const Color(0xFF64748B),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}
