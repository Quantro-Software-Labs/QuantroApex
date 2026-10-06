import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../widgets/quantro_logo.dart';

/// Branded splash view shown while auth status is being resolved.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            QuantroLogo(size: 48),
            SizedBox(height: AppSpacing.space5),
            CircularProgressIndicator(color: Color(0xFF3B82F6), strokeWidth: 2),
          ],
        ),
      ),
    );
  }
}
