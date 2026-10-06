import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class DataPrivacyScreen extends StatefulWidget {
  const DataPrivacyScreen({super.key});

  @override
  State<DataPrivacyScreen> createState() => _DataPrivacyScreenState();
}

class _DataPrivacyScreenState extends State<DataPrivacyScreen> {
  bool _globalBrainConsent = false;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    if (user != null) {
      _globalBrainConsent = true; // Default active consent state
    }
  }

  Future<void> _handleSave() async {
    setState(() => _isLoading = true);
    final provider = context.read<AuthProvider>();

    final success = await provider.updateProfile(
      globalBrainConsent: _globalBrainConsent,
    );

    setState(() => _isLoading = false);

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Data & privacy settings saved.'),
          backgroundColor: Color(0xFF10B981),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('Data & Privacy', style: AppTypography.h2(color: Colors.white)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.space4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Privacy & Intelligence Sharing', style: AppTypography.h2(color: AppColors.white)),
              const SizedBox(height: AppSpacing.space1),
              Text(
                'Quantro Software Labs values your privacy. Manage how your trading telemetry trains Apex AI models.',
                style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
              ),
              const SizedBox(height: AppSpacing.space5),

              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Global Brain Training Consent', style: AppTypography.h3(color: AppColors.white)),
                              const SizedBox(height: 4),
                              Text(
                                'Opt-in to contribute anonymized execution logs to train the QuantroApex Global Neural Ensemble.',
                                style: AppTypography.caption(color: const Color(0xFF64748B)),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpacing.space2),
                        Switch.adaptive(
                          value: _globalBrainConsent,
                          activeColor: const Color(0xFF3B82F6),
                          onChanged: (val) => setState(() => _globalBrainConsent = val),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space4),

              ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Data Export', style: AppTypography.h3(color: AppColors.white)),
                    const SizedBox(height: 4),
                    Text(
                      'Download a complete JSON export of your profile, risk vault settings, trade history, and activity logs.',
                      style: AppTypography.caption(color: const Color(0xFF64748B)),
                    ),
                    const SizedBox(height: AppSpacing.space3),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF3B82F6),
                        side: const BorderSide(color: Color(0xFF1E293B)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      icon: const Icon(Icons.download_rounded, size: 16),
                      label: const Text('Export My Account Data', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Account data export generated.'),
                            backgroundColor: Color(0xFF10B981),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.space5),

              PrimaryButton(
                label: 'Save Privacy Settings',
                isLoading: _isLoading,
                onPressed: _handleSave,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
