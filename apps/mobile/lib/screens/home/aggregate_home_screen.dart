import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/dashboard_provider.dart';
import '../../core/providers/simulation_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/mode_toggle_badge.dart';
import '../../widgets/quantro_logo.dart';

/// Aggregate portfolio home with Stocks / Crypto / Forex class cards.
class AggregateHomeScreen extends StatelessWidget {
  final void Function(int tabIndex)? onOpenTab;

  const AggregateHomeScreen({super.key, this.onOpenTab});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final simulation = context.watch<SimulationProvider>();
    final dashboard = context.watch<DashboardProvider>();

    final user = auth.user;
    final name = user?.firstName != null && user!.firstName!.isNotEmpty
        ? user.firstName
        : (user?.email.split('@').first.isNotEmpty == true
            ? user!.email.split('@').first
            : 'Trader');

    final equity = simulation.equity;
    const starting = 100000.0;
    final pnl = equity - starting;
    final pnlPct = starting > 0 ? (pnl / starting) * 100 : 0.0;
    final pnlPositive = pnl >= 0;
    final pnlColor = pnlPositive ? AppColors.success : AppColors.danger;

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([
          context.read<SimulationProvider>().fetchSimulationSummary(),
          context.read<DashboardProvider>().initDashboard(),
        ]);
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.space4,
          vertical: AppSpacing.space3,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const QuantroLogo(
                  size: 32,
                  showText: true,
                  isDarkBackground: true,
                  isHorizontal: true,
                  showTagline: false,
                ),
                const ModeToggleBadge(),
              ],
            ),
            const SizedBox(height: AppSpacing.space4),
            Text(
              'Hello, $name',
              style: AppTypography.h2(color: AppColors.white),
            ),
            const SizedBox(height: 4),
            Text(
              'Portfolio overview',
              style: AppTypography.caption(color: AppColors.muted),
            ),
            const SizedBox(height: AppSpacing.space4),
            // 1. Portfolio Card & Today's Move
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.space4),
              decoration: BoxDecoration(
                color: AppColors.darkSurface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.darkBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Total equity',
                    style: AppTypography.caption(color: AppColors.muted),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '\$${equity.toStringAsFixed(2)}',
                    style: AppTypography.display(color: AppColors.white).copyWith(
                      fontSize: 28,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${pnlPositive ? '+' : ''}\$${pnl.toStringAsFixed(2)}  (${pnlPct.toStringAsFixed(2)}%) today',
                    style: AppTypography.body(color: pnlColor).copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space4),

            // 2. Apex Operating Status
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.space4),
              decoration: BoxDecoration(
                color: AppColors.darkSurface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.darkBorder),
              ),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.success,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Apex Agent Operating',
                          style: AppTypography.h3(color: AppColors.white),
                        ),
                        Text(
                          dashboard.activeStrategyName != null
                              ? 'Running ${dashboard.activeStrategyName}'
                              : 'Autonomous risk vault monitoring active',
                          style: AppTypography.caption(color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () => onOpenTab?.call(1),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accentMid,
                      foregroundColor: AppColors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      minimumSize: Size.zero,
                    ),
                    child: const Text('Open Desk'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.space5),

            // 3. Asset Waitlists & Trading Desk Access
            Text(
              'Markets',
              style: AppTypography.h3(color: AppColors.white),
            ),
            const SizedBox(height: AppSpacing.space3),
            _AssetClassCard(
              title: 'Stocks',
              subtitle: 'US Equities · Alpaca Live & Simulation',
              accent: AppColors.accentLight,
              muted: false,
              onTap: () => onOpenTab?.call(1),
            ),
            const SizedBox(height: AppSpacing.space3),
            _AssetClassCard(
              title: 'Crypto',
              subtitle: 'Spot digital assets',
              accent: const Color(0xFF8B5CF6),
              muted: true,
              onNotify: () => _joinWaitlist(context, 'CRYPTO'),
              onTap: () => onOpenTab?.call(1),
            ),
            const SizedBox(height: AppSpacing.space3),
            _AssetClassCard(
              title: 'Forex',
              subtitle: 'Major currency pairs',
              accent: const Color(0xFF14B8A6),
              muted: true,
              onNotify: () => _joinWaitlist(context, 'FOREX'),
              onTap: () => onOpenTab?.call(1),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _joinWaitlist(BuildContext context, String assetClass) async {
    final result = await context.read<AuthProvider>().joinWaitlist(assetClass);
    if (!context.mounted) return;
    final label = assetClass == 'CRYPTO' ? 'Crypto' : 'Forex';
    if (result != null) {
      final count = result['totalCount'];
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            count != null
                ? 'You\'re on the $label waitlist ($count joined).'
                : 'You\'re on the $label waitlist.',
          ),
          backgroundColor: AppColors.darkSurface,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not join waitlist. Try again.'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }
}

class _AssetClassCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Color accent;
  final bool muted;
  final VoidCallback? onTap;
  final VoidCallback? onNotify;

  const _AssetClassCard({
    required this.title,
    required this.subtitle,
    required this.accent,
    required this.muted,
    this.onTap,
    this.onNotify,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: muted ? 0.72 : 1,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.space4),
            decoration: BoxDecoration(
              color: AppColors.darkSurface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.darkBorder),
            ),
            child: Row(
              children: [
                Container(
                  width: 4,
                  height: 48,
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            title,
                            style: AppTypography.h3(color: AppColors.white),
                          ),
                          if (muted) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: accent.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'soon',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: accent,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: AppTypography.caption(color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                if (muted && onNotify != null)
                  TextButton(
                    onPressed: onNotify,
                    style: TextButton.styleFrom(
                      foregroundColor: accent,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                    child: const Text(
                      'Notify me',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  )
                else
                  Icon(Icons.chevron_right_rounded, color: AppColors.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
