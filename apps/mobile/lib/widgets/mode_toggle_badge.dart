import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/kyc_provider.dart';
import '../core/providers/simulation_provider.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_typography.dart';
import '../screens/kyc/kyc_verification_screen.dart';
import 'calm_feedback.dart';

class ModeToggleBadge extends StatelessWidget {
  const ModeToggleBadge({super.key});

  Future<void> _onTap(BuildContext context) async {
    final simulation = context.read<SimulationProvider>();
    final kyc = context.read<KycProvider>();
    final isSim = simulation.activeMode == 'SIM';

    if (!isSim) {
      await simulation.toggleMode('SIM');
      if (context.mounted) {
        showCalmSnackBar(context, 'Using simulation capital.');
      }
      return;
    }

    await kyc.refreshStatus();
    if (!context.mounted) return;

    if (!kyc.isVerified) {
      final verified = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => const KycVerificationScreen(unlockLiveOnSuccess: true),
        ),
      );
      if (verified != true) {
        if (context.mounted) {
          showCalmSnackBar(
            context,
            'Live trading needs identity verification first.',
          );
        }
        return;
      }
    }

    await simulation.toggleMode('LIVE');
    if (context.mounted) {
      showCalmSnackBar(context, 'Live mode is on. Risk Vault still applies.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SimulationProvider>();
    final isSim = provider.activeMode == 'SIM';

    return GestureDetector(
      onTap: () => _onTap(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.darkCard.withValues(alpha: 0.8),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSim
                ? AppColors.darkBorder
                : AppColors.success.withValues(alpha: 0.45),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSim ? AppColors.muted : AppColors.success,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              isSim ? 'Simulation' : 'Live',
              style: AppTypography.caption(
                color: isSim ? AppColors.muted : AppColors.success,
              ).copyWith(fontWeight: FontWeight.w500, letterSpacing: 0.2),
            ),
          ],
        ),
      ),
    );
  }
}
