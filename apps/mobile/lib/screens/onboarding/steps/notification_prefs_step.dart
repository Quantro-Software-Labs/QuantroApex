import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class NotificationPrefsStep extends StatelessWidget {
  const NotificationPrefsStep({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Respecting Your Attention', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('Notification Preferences', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Apex only interrupts you for meaningful events. Choose your preferred update frequency.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          Text('Performance Digest Interval', style: AppTypography.h3(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space3),
          _RadioOptionTile(
            title: 'Daily Digest',
            subtitle: 'One summary notification at market close.',
            isSelected: provider.digestInterval == 'daily',
            onTap: () => provider.setNotificationPrefs(digestInterval: 'daily'),
          ),
          const SizedBox(height: AppSpacing.space2),
          _RadioOptionTile(
            title: 'Weekly Wrap',
            subtitle: 'A single weekly breakdown of strategy shifts and outcomes.',
            isSelected: provider.digestInterval == 'weekly',
            onTap: () => provider.setNotificationPrefs(digestInterval: 'weekly'),
          ),
          const SizedBox(height: AppSpacing.space2),
          _RadioOptionTile(
            title: 'Milestones Only',
            subtitle: 'Only notify when major achievements or phase evolutions occur.',
            isSelected: provider.digestInterval == 'milestones_only',
            onTap: () => provider.setNotificationPrefs(digestInterval: 'milestones_only'),
          ),
          const SizedBox(height: AppSpacing.space5),

          ApexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SwitchListTile(
                  title: Text('Milestone Notifications', style: AppTypography.body(color: AppColors.primary)),
                  subtitle: Text('Alert when agent advances phases or reaches new equity highs.', style: AppTypography.caption(color: AppColors.muted)),
                  value: provider.milestoneAlerts,
                  activeColor: AppColors.accent,
                  onChanged: (val) => provider.setNotificationPrefs(milestoneAlerts: val),
                  contentPadding: EdgeInsets.zero,
                ),
                const Divider(),
                SwitchListTile(
                  title: Text('Loss Threshold Alerts', style: AppTypography.body(color: AppColors.primary)),
                  subtitle: Text('Notify if daily movement drops beyond ${provider.lossThresholdPct?.toStringAsFixed(0)}%.', style: AppTypography.caption(color: AppColors.muted)),
                  value: provider.lossAlertsEnabled,
                  activeColor: AppColors.accent,
                  onChanged: (val) => provider.setNotificationPrefs(lossAlertsEnabled: val),
                  contentPadding: EdgeInsets.zero,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RadioOptionTile extends StatelessWidget {
  const _RadioOptionTile({
    required this.title,
    required this.subtitle,
    required this.isSelected,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.space3),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.surface : AppColors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? AppColors.accent : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: isSelected ? AppColors.accent : AppColors.muted,
              size: 20,
            ),
            const SizedBox(width: AppSpacing.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTypography.h3(color: AppColors.primary)),
                  const SizedBox(height: AppSpacing.space1),
                  Text(subtitle, style: AppTypography.caption(color: AppColors.muted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
