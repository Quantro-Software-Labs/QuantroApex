import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/notification_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class NotificationSettingsScreen extends StatelessWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationProvider>();
    final prefs = provider.preferences;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primary),
        title: Text('Notification Preferences', style: AppTypography.h2(color: AppColors.primary)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.space4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Alert Channel Configurations', style: AppTypography.h2(color: AppColors.primary)),
              const SizedBox(height: AppSpacing.space1),
              Text(
                'Customize quiet confidence alerts across trade execution, risk enforcement, and strategy advisory signals.',
                style: AppTypography.secondary(color: AppColors.muted),
              ),
              const SizedBox(height: AppSpacing.space4),

              if (provider.isLoading || prefs == null)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(AppSpacing.space4),
                    child: CircularProgressIndicator(color: AppColors.accent),
                  ),
                )
              else ...[
                ApexCard(
                  child: Column(
                    children: [
                      _SwitchTile(
                        title: 'Trade Execution Alerts',
                        subtitle: 'Instant push alerts when strategy market orders are filled.',
                        value: prefs.tradeAlerts,
                        onChanged: (val) => provider.updatePreferences(tradeAlerts: val),
                      ),
                      const Divider(color: AppColors.border, height: 24),
                      _SwitchTile(
                        title: 'Risk Vault Warnings',
                        subtitle: 'High-priority notifications for emergency stops or risk parameter breaches.',
                        value: prefs.riskAlerts,
                        onChanged: (val) => provider.updatePreferences(riskAlerts: val),
                      ),
                      const Divider(color: AppColors.border, height: 24),
                      _SwitchTile(
                        title: 'Advisory Mode Signals',
                        subtitle: 'Alerts when high-conviction trade recommendations are ready for manual review.',
                        value: prefs.advisorySignals,
                        onChanged: (val) => provider.updatePreferences(advisorySignals: val),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space5),

                Text('Digest Frequency', style: AppTypography.h2(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space2),

                ApexCard(
                  child: Column(
                    children: ['OFF', 'DAILY', 'WEEKLY'].map((freq) {
                      return RadioListTile<String>(
                        title: Text(
                          freq == 'OFF' ? 'Disabled' : (freq == 'DAILY' ? 'Daily Morning Summary' : 'Weekly Performance Audit'),
                          style: AppTypography.body(color: AppColors.primary),
                        ),
                        value: freq,
                        groupValue: prefs.digestFrequency,
                        activeColor: AppColors.accent,
                        onChanged: (val) {
                          if (val != null) provider.updatePreferences(digestFrequency: val);
                        },
                      );
                    }).toList(),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SwitchTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SwitchTile({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppTypography.h3(color: AppColors.primary)),
              const SizedBox(height: 4),
              Text(subtitle, style: AppTypography.caption(color: AppColors.muted)),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.space2),
        Switch.adaptive(
          value: value,
          activeColor: AppColors.accent,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
