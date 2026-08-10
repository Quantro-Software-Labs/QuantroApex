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
        child: isLoading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white),
              )
            : Text(label, style: AppTypography.body(color: AppColors.white)),
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
          foregroundColor: AppColors.accent,
          side: const BorderSide(color: AppColors.accent),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: Text(label, style: AppTypography.body(color: AppColors.accent)),
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
      child: Text(label, style: AppTypography.secondary(color: AppColors.muted)),
    );
  }
}

class ApexCard extends StatelessWidget {
  const ApexCard({
    super.key,
    required this.child,
    this.padding = AppSpacing.space4,
  });

  final Widget child;
  final double padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(padding),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(color: Color(0x0A000000), blurRadius: 2, offset: Offset(0, 1)),
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
    this.keyboardType,
    this.validator,
  });

  final String label;
  final TextEditingController controller;
  final bool obscureText;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.secondary(color: AppColors.muted)),
        const SizedBox(height: AppSpacing.space2),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          validator: validator,
          style: AppTypography.body(color: AppColors.primary),
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
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.space2,
        vertical: AppSpacing.space1,
      ),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(label, style: AppTypography.caption(color: AppColors.white)),
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
        Text(label, style: AppTypography.caption(color: AppColors.muted)),
        const SizedBox(height: AppSpacing.space1),
        Text(
          value,
          style: AppTypography.h2(color: valueColor ?? AppColors.primary),
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
    this.accentColor = AppColors.accent,
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
            width: 3,
            height: 40,
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
                Text(message, style: AppTypography.body(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space1),
                Text(timestamp, style: AppTypography.caption(color: AppColors.muted)),
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
              StatusBadge(label: assetClass, color: AppColors.accentMid),
              const SizedBox(width: AppSpacing.space2),
              StatusBadge(label: riskLevel, color: AppColors.muted),
            ],
          ),
          const SizedBox(height: AppSpacing.space3),
          Text(name, style: AppTypography.h2(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(description, style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space3),
          Text(
            '$userCount active users',
            style: AppTypography.caption(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space3),
          PrimaryButton(label: 'Start with this', onPressed: onStart),
        ],
      ),
    );
  }
}
