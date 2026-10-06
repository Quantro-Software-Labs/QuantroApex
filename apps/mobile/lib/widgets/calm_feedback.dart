import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_typography.dart';

/// Quiet Confidence feedback — short, calm, never celebratory.
void showCalmSnackBar(
  BuildContext context,
  String message, {
  bool isError = false,
}) {
  ScaffoldMessenger.of(context).hideCurrentSnackBar();
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: isError ? const Color(0xFF3F1D1D) : AppColors.darkCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isError ? AppColors.danger.withValues(alpha: 0.4) : AppColors.darkBorder,
        ),
      ),
      content: Text(
        message,
        style: AppTypography.secondary(
          color: isError ? const Color(0xFFFECACA) : AppColors.white,
        ),
      ),
      duration: const Duration(seconds: 3),
    ),
  );
}
