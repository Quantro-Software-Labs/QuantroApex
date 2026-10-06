import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../execution/execution_controls_screen.dart';
import '../notifications/advisory_feed_screen.dart';
import '../notifications/notification_settings_screen.dart';
import 'account_details_screen.dart';
import 'data_privacy_screen.dart';
import 'experience_level_screen.dart';
import 'subscription_screen.dart';
import '../kyc/kyc_verification_screen.dart';

class SettingsScreen extends StatelessWidget {
  final bool isTab;

  const SettingsScreen({
    super.key,
    this.isTab = false,
  });

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final user = authProvider.user;

    final content = SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.space4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isTab) ...[
            Text('Settings', style: AppTypography.h2(color: AppColors.white)),
            const SizedBox(height: AppSpacing.space4),
          ],
          Container(
            padding: const EdgeInsets.all(AppSpacing.space4),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF1E293B)),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: const Color(0xFF3B82F6),
                  child: Text(
                    (user?.firstName?.isNotEmpty == true
                            ? user!.firstName![0]
                            : (user?.email.isNotEmpty == true
                                ? user!.email[0]
                                : 'T'))
                        .toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.space3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.firstName != null
                            ? '${user!.firstName} ${user.lastName ?? ''}'
                            : 'Trader Profile',
                        style: AppTypography.h3(color: AppColors.white),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user?.email ?? '',
                        style: AppTypography.caption(
                          color: const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space5),
          Text('Account & System', style: AppTypography.h3(color: AppColors.white)),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.person_outline_rounded,
            iconColor: const Color(0xFF3B82F6),
            title: 'Account Details',
            subtitle: 'Manage personal info, name, and email',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AccountDetailsScreen()),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.speed_rounded,
            iconColor: const Color(0xFFF59E0B),
            title: 'Experience Level',
            subtitle: 'Switch between Newcomer & Professional paths',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ExperienceLevelScreen()),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.badge_outlined,
            iconColor: const Color(0xFF10B981),
            title: 'Identity verification',
            subtitle: 'Required before live trading',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const KycVerificationScreen(
                    unlockLiveOnSuccess: false,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.workspace_premium_outlined,
            iconColor: const Color(0xFFF59E0B),
            title: 'Subscription',
            subtitle: 'Observer, Core, Pro, Elite plans',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.tune_rounded,
            iconColor: const Color(0xFF10B981),
            title: 'Execution Engine & Broker',
            subtitle: 'Alpaca API keys, sandbox status, order entry',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ExecutionControlsScreen()),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.auto_awesome_rounded,
            iconColor: const Color(0xFFF59E0B),
            title: 'Advisory Mode Signals',
            subtitle: 'Review manual trade recommendations',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AdvisoryFeedScreen()),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.notifications_none_rounded,
            iconColor: const Color(0xFF3B82F6),
            title: 'Notification Preferences',
            subtitle: 'Push alerts, loss warnings, digest interval',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const NotificationSettingsScreen(),
                ),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space2),
          _buildSettingsTile(
            icon: Icons.security_rounded,
            iconColor: const Color(0xFF8B5CF6),
            title: 'Data & Privacy',
            subtitle: 'Global Brain AI consent & data export',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DataPrivacyScreen()),
              );
            },
          ),
          const SizedBox(height: AppSpacing.space5),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                side: const BorderSide(color: Color(0xFF7F1D1D)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text(
                'Sign Out',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              onPressed: () async {
                await authProvider.logout();
              },
            ),
          ),
          const SizedBox(height: AppSpacing.space4),
        ],
      ),
    );

    if (isTab) {
      return content;
    }

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          'Settings & Controls',
          style: AppTypography.h2(color: Colors.white),
        ),
      ),
      body: SafeArea(child: content),
    );
  }

  Widget _buildSettingsTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      tileColor: const Color(0xFF0F172A),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: iconColor.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: iconColor, size: 20),
      ),
      title: Text(
        title,
        style: AppTypography.body(color: Colors.white)
            .copyWith(fontWeight: FontWeight.bold),
      ),
      subtitle: Text(
        subtitle,
        style: AppTypography.caption(color: const Color(0xFF64748B)),
      ),
      trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF64748B)),
    );
  }
}
