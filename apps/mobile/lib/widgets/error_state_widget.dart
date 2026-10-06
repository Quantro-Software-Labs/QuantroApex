import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_typography.dart';
import 'components.dart';

class ErrorStateWidget extends StatelessWidget {
  final String title;
  final String message;
  final VoidCallback onRetry;

  const ErrorStateWidget({
    super.key,
    this.title = 'Unable to Load Data',
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return ApexCard(
      backgroundColor: const Color(0xFF180A0A),
      borderColor: const Color(0xFF7F1D1D),
      padding: AppSpacing.space4,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(Icons.wifi_off_rounded, color: Color(0xFFEF4444), size: 36),
          const SizedBox(height: AppSpacing.space2),
          Text(title, style: AppTypography.h3(color: AppColors.white)),
          const SizedBox(height: 4),
          Text(
            message,
            style: AppTypography.caption(color: const Color(0xFF94A3B8)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.space3),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF3B82F6),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            icon: const Icon(Icons.refresh_rounded, size: 16),
            label: const Text('Try Again', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            onPressed: onRetry,
          ),
        ],
      ),
    );
  }
}
