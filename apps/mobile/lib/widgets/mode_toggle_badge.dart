import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/simulation_provider.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_typography.dart';

class ModeToggleBadge extends StatelessWidget {
  const ModeToggleBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SimulationProvider>();
    final isSim = provider.activeMode == 'SIM';

    return GestureDetector(
      onTap: () {
        final newMode = isSim ? 'LIVE' : 'SIM';
        provider.toggleMode(newMode);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Switched to $newMode mode.')),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSim ? AppColors.accent.withValues(alpha: 0.1) : AppColors.success.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSim ? AppColors.accent : AppColors.success,
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSim ? AppColors.accent : AppColors.success,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              isSim ? 'SIM MODE' : 'LIVE MODE',
              style: AppTypography.caption(
                color: isSim ? AppColors.accent : AppColors.success,
              ).copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}
