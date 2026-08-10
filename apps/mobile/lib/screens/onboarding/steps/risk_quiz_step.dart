import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/providers/onboarding_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../widgets/components.dart';

class RiskQuizStep extends StatelessWidget {
  const RiskQuizStep({super.key});

  static const List<Map<String, dynamic>> _questions = [
    {
      'id': 'q1',
      'title': 'If Apex had a losing week, how would you respond?',
      'options': [
        {'label': 'Review AI reasoning & trust the learning process', 'style': 'Growth'},
        {'label': 'Pause trading temporarily to review parameters', 'style': 'Moderate'},
        {'label': 'Halt Apex immediately to protect capital', 'style': 'Conservative'},
      ],
    },
    {
      'id': 'q2',
      'title': 'How involved do you prefer to be daily?',
      'options': [
        {'label': 'Fully hands-off — let Apex execute autonomously', 'style': 'Autopilot'},
        {'label': 'Occasional check-ins via activity feed', 'style': 'Balanced'},
        {'label': 'Daily updates and advisory signal reviews', 'style': 'Active'},
      ],
    },
    {
      'id': 'q3',
      'title': 'What is your primary portfolio objective?',
      'options': [
        {'label': 'Capital preservation with low drawdown', 'style': 'Conservative'},
        {'label': 'Balanced risk-adjusted portfolio growth', 'style': 'Growth'},
        {'label': 'Aggressive momentum and higher yield targets', 'style': 'Aggressive'},
      ],
    },
  ];

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OnboardingProvider>();
    final quizAnswers = provider.quizAnswers;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Behavioural Assessment', style: AppTypography.secondary(color: AppColors.muted)),
          const SizedBox(height: AppSpacing.space2),
          Text('Risk Profile Quiz', style: AppTypography.h1(color: AppColors.primary)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Answer these brief questions so Apex can recommend the optimal starting strategy for your style.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.space5),

          ..._questions.map((q) {
            final qId = q['id'] as String;
            final selectedOption = quizAnswers[qId] as String?;
            final options = q['options'] as List<Map<String, String>>;

            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.space4),
              child: ApexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(q['title'] as String, style: AppTypography.h3(color: AppColors.primary)),
                    const SizedBox(height: AppSpacing.space3),
                    ...options.map((opt) {
                      final isSelected = selectedOption == opt['label'];

                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.space2),
                        child: InkWell(
                          onTap: () => provider.setQuizAnswer(qId, opt['label']),
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
                                  isSelected ? Icons.check_circle : Icons.circle_outlined,
                                  color: isSelected ? AppColors.accent : AppColors.muted,
                                  size: 20,
                                ),
                                const SizedBox(width: AppSpacing.space2),
                                Expanded(
                                  child: Text(
                                    opt['label']!,
                                    style: AppTypography.body(
                                      color: isSelected ? AppColors.accent : AppColors.primary,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
