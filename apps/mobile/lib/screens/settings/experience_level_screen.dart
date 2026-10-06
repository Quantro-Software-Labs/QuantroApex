import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class ExperienceLevelScreen extends StatefulWidget {
  const ExperienceLevelScreen({super.key});

  @override
  State<ExperienceLevelScreen> createState() => _ExperienceLevelScreenState();
}

class _ExperienceLevelScreenState extends State<ExperienceLevelScreen> {
  String _selectedLevel = 'NEWCOMER';
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    if (user != null) {
      _selectedLevel = user.experienceLevel;
    }
  }

  Future<void> _handleSave() async {
    setState(() => _isLoading = true);
    final provider = context.read<AuthProvider>();

    final success = await provider.updateProfile(
      experienceLevel: _selectedLevel,
    );

    setState(() => _isLoading = false);

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Experience level updated successfully.'),
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
        title: Text('Experience Level', style: AppTypography.h2(color: Colors.white)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.space4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('System Interaction Profile', style: AppTypography.h2(color: AppColors.white)),
              const SizedBox(height: AppSpacing.space1),
              Text(
                'Choose how Apex presents technical depth and trade execution guidance.',
                style: AppTypography.secondary(color: const Color(0xFF94A3B8)),
              ),
              const SizedBox(height: AppSpacing.space5),

              _buildLevelOption(
                level: 'NEWCOMER',
                title: 'Newcomer (Guided Learning)',
                subtitle: 'Step-by-step guidance, plain-English trade hypotheses, and risk tutorials.',
                icon: Icons.school_outlined,
              ),
              const SizedBox(height: AppSpacing.space3),

              _buildLevelOption(
                level: 'INTERMEDIATE',
                title: 'Intermediate Trader',
                subtitle: 'Blended controls with strategy performance indicators and risk vault customization.',
                icon: Icons.show_chart_rounded,
              ),
              const SizedBox(height: AppSpacing.space3),

              _buildLevelOption(
                level: 'PROFESSIONAL',
                title: 'Professional (Express Path)',
                subtitle: 'Direct quantitative controls, raw metric grids, and fast execution dispatch.',
                icon: Icons.bolt_rounded,
              ),
              const SizedBox(height: AppSpacing.space5),

              PrimaryButton(
                label: 'Save Experience Level',
                isLoading: _isLoading,
                onPressed: _handleSave,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLevelOption({
    required String level,
    required String title,
    required String subtitle,
    required IconData icon,
  }) {
    final isSelected = _selectedLevel == level;

    return InkWell(
      onTap: () => setState(() => _selectedLevel = level),
      borderRadius: BorderRadius.circular(16),
      child: ApexCard(
        backgroundColor: isSelected ? const Color(0xFF1E293B) : const Color(0xFF0F172A),
        borderColor: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF1E293B),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFF3B82F6).withValues(alpha: 0.2) : const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF94A3B8), size: 24),
            ),
            const SizedBox(width: AppSpacing.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTypography.h3(color: AppColors.white)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: AppTypography.caption(color: const Color(0xFF64748B))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
