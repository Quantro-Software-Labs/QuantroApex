import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';

class QuantroLogo extends StatelessWidget {
  final double size;
  final bool showText;
  final bool isDarkBackground;

  const QuantroLogo({
    super.key,
    this.size = 48.0,
    this.showText = false,
    this.isDarkBackground = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(size * 0.22),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF00E5FF).withValues(alpha: 0.25),
                blurRadius: 16,
                spreadRadius: 1,
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(size * 0.22),
            child: Image.asset(
              'assets/images/quantro_logo.jpg',
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) {
                // Fallback glowing Q icon if image loading fails
                return Container(
                  color: AppColors.primary,
                  child: Center(
                    child: Text(
                      'Q',
                      style: TextStyle(
                        fontSize: size * 0.55,
                        fontWeight: FontWeight.bold,
                        color: const Color(0xFF00E5FF),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        if (showText) ...[
          const SizedBox(height: 12),
          Text(
            'QUANTRO',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              letterSpacing: 3.5,
              color: isDarkBackground ? AppColors.white : AppColors.primary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'SOFTWARE LABS',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 2.5,
              color: isDarkBackground
                  ? AppColors.muted
                  : AppColors.muted.withValues(alpha: 0.8),
            ),
          ),
        ],
      ],
    );
  }
}
