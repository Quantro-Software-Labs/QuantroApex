import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/onboarding_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import 'steps/capital_step.dart';
import 'steps/experience_select_step.dart';
import 'steps/how_apex_learns_step.dart';
import 'steps/notification_prefs_step.dart';
import 'steps/onboarding_complete_step.dart';
import 'steps/paper_trading_prompt_step.dart';
import 'steps/risk_quiz_step.dart';
import 'steps/risk_vault_step.dart';
import 'steps/strategy_select_step.dart';
import 'steps/welcome_step.dart';

class OnboardingFlowScreen extends StatefulWidget {
  const OnboardingFlowScreen({super.key});

  @override
  State<OnboardingFlowScreen> createState() => _OnboardingFlowScreenState();
}

class _OnboardingFlowScreenState extends State<OnboardingFlowScreen> {
  bool _isSelectingPath = true;

  Widget _getStepWidget(String path, int step) {
    if (path == 'EXPRESS') {
      switch (step) {
        case 1:
          return const RiskVaultStep();
        case 2:
          return const StrategySelectStep();
        case 3:
          return const CapitalStep();
        case 4:
          return const OnboardingCompleteStep();
        default:
          return const RiskVaultStep();
      }
    } else {
      switch (step) {
        case 1:
          return const WelcomeStep();
        case 2:
          return const HowApexLearnsStep();
        case 3:
          return const RiskVaultStep();
        case 4:
          return const RiskQuizStep();
        case 5:
          return const StrategySelectStep();
        case 6:
          return const CapitalStep();
        case 7:
          return const NotificationPrefsStep();
        case 8:
          return const PaperTradingPromptStep();
        case 9:
          return const OnboardingCompleteStep();
        default:
          return const WelcomeStep();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();
    final currentStep = provider.currentStep;
    final totalSteps = provider.totalSteps;

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        leading: !_isSelectingPath && currentStep > 1
            ? IconButton(
                icon: const Icon(Icons.arrow_back, color: AppColors.primary),
                onPressed: () => provider.previousStep(),
              )
            : null,
        title: !_isSelectingPath
            ? Text(
                'Step $currentStep of $totalSteps',
                style: AppTypography.secondary(color: AppColors.muted),
              )
            : null,
        centerTitle: true,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.space4),
          child: Column(
            children: [
              if (!_isSelectingPath) ...[
                LinearProgressIndicator(
                  value: currentStep / totalSteps,
                  backgroundColor: AppColors.surface,
                  color: AppColors.accent,
                  minHeight: 4,
                ),
                const SizedBox(height: AppSpacing.space4),
              ],

              Expanded(
                child: _isSelectingPath
                    ? const ExperienceSelectStep()
                    : _getStepWidget(provider.path, currentStep),
              ),

              const SizedBox(height: AppSpacing.space3),

              if (_isSelectingPath)
                PrimaryButton(
                  label: 'Continue to Setup',
                  onPressed: () {
                    setState(() {
                      _isSelectingPath = false;
                    });
                  },
                )
              else if (currentStep < totalSteps)
                PrimaryButton(
                  label: 'Continue',
                  onPressed: () => provider.nextStep(),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
