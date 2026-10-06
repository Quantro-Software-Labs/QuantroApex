import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF2563EB),
          foregroundColor: AppColors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white),
              )
            : Text(
                label,
                style: AppTypography.body(color: AppColors.white).copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFF3B82F6),
          side: const BorderSide(color: Color(0xFF1E293B)),
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: Text(
          label,
          style: AppTypography.body(color: const Color(0xFF3B82F6)).copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class GhostButton extends StatelessWidget {
  const GhostButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      child: Text(
        label,
        style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
      ),
    );
  }
}

class ApexCard extends StatelessWidget {
  const ApexCard({
    super.key,
    required this.child,
    this.padding = AppSpacing.space4,
    this.backgroundColor = const Color(0xFF0F172A),
    this.borderColor = const Color(0xFF1E293B),
  });

  final Widget child;
  final dynamic padding;
  final Color backgroundColor;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    EdgeInsets resolvedPadding;
    if (padding is double) {
      resolvedPadding = EdgeInsets.all(padding as double);
    } else if (padding is EdgeInsetsGeometry) {
      resolvedPadding = padding as EdgeInsets;
    } else {
      resolvedPadding = const EdgeInsets.all(AppSpacing.space4);
    }

    return Container(
      width: double.infinity,
      padding: resolvedPadding,
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor, width: 1.0),
        boxShadow: const [
          BoxShadow(
            color: Color(0x20000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

class InputField extends StatelessWidget {
  const InputField({
    super.key,
    required this.label,
    required this.controller,
    this.obscureText = false,
    this.enabled = true,
    this.keyboardType,
    this.validator,
    this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final bool obscureText;
  final bool enabled;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.secondary(color: const Color(0xFF94A3B8))),
        const SizedBox(height: AppSpacing.space2),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          enabled: enabled,
          keyboardType: keyboardType,
          validator: validator,
          onChanged: onChanged,
          style: AppTypography.body(color: AppColors.white),
          decoration: const InputDecoration(
            filled: true,
            fillColor: Color(0xFF0F172A),
          ),
        ),
      ],
    );
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    required this.color,
    this.textColor,
  });

  final String label;
  final Color color;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.space2,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.4), width: 1),
      ),
      child: Text(
        label,
        style: AppTypography.caption(color: textColor ?? color).copyWith(
          fontWeight: FontWeight.bold,
          fontSize: 11,
        ),
      ),
    );
  }
}

class MetricTile extends StatelessWidget {
  const MetricTile({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.caption(color: const Color(0xFF94A3B8)),
        ),
        const SizedBox(height: AppSpacing.space1),
        Text(
          value,
          style: AppTypography.h2(color: valueColor ?? AppColors.white),
        ),
      ],
    );
  }
}

class ActivityFeedEntry extends StatelessWidget {
  const ActivityFeedEntry({
    super.key,
    required this.message,
    required this.timestamp,
    this.accentColor = const Color(0xFF3B82F6),
  });

  final String message;
  final String timestamp;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    return ApexCard(
      padding: AppSpacing.space3,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 4,
            height: 36,
            decoration: BoxDecoration(
              color: accentColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: AppSpacing.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: AppTypography.body(color: AppColors.white).copyWith(
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  timestamp,
                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class StrategyCard extends StatelessWidget {
  const StrategyCard({
    super.key,
    required this.name,
    required this.description,
    required this.riskLevel,
    required this.assetClass,
    required this.userCount,
    required this.onStart,
  });

  final String name;
  final String description;
  final String riskLevel;
  final String assetClass;
  final int userCount;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return ApexCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StatusBadge(label: assetClass, color: const Color(0xFF2563EB)),
              const SizedBox(width: AppSpacing.space2),
              StatusBadge(label: riskLevel, color: const Color(0xFF64748B)),
            ],
          ),
          const SizedBox(height: AppSpacing.space3),
          Text(name, style: AppTypography.h2(color: AppColors.white)),
          const SizedBox(height: AppSpacing.space2),
          Text(description, style: AppTypography.secondary(color: const Color(0xFF94A3B8))),
          const SizedBox(height: AppSpacing.space3),
          Text(
            '$userCount active users',
            style: AppTypography.caption(color: const Color(0xFF64748B)),
          ),
          const SizedBox(height: AppSpacing.space3),
          PrimaryButton(label: 'Start with this', onPressed: onStart),
        ],
      ),
    );
  }
}
