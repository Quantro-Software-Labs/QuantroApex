import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';

class QuantroLogo extends StatelessWidget {
  final double size;
  final bool showText;
  final bool isDarkBackground;
  final bool isHorizontal;
  final bool showTagline;

  const QuantroLogo({
    super.key,
    this.size = 40.0,
    this.showText = true,
    this.isDarkBackground = true,
    this.isHorizontal = true,
    this.showTagline = false,
  });

  @override
  Widget build(BuildContext context) {
    final logoWidget = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.24),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2563EB).withValues(alpha: 0.3),
            blurRadius: 12,
            spreadRadius: 1,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.24),
        child: Image.asset(
          'assets/images/quantro_logo.jpg',
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) {
            return Container(
              color: const Color(0xFF0F172A),
              child: Center(
                child: Text(
                  'Q',
                  style: TextStyle(
                    fontSize: size * 0.5,
                    fontWeight: FontWeight.bold,
                    color: AppColors.accentMid,
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );

    if (!showText) return logoWidget;

    final textColumn = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment:
          isHorizontal ? CrossAxisAlignment.start : CrossAxisAlignment.center,
      children: [
        // Parent Brand Attribution
        Text(
          'QUANTRO SOFTWARE LABS',
          style: TextStyle(
            fontSize: size * 0.22,
            fontWeight: FontWeight.w600,
            letterSpacing: 2.2,
            color: isDarkBackground
                ? const Color(0xFF94A3B8)
                : const Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 1),
        // Dominant Product Title: QuantroApex
        RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: 'Quantro',
                style: TextStyle(
                  fontSize: size * 0.48,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.2,
                  color: isDarkBackground ? Colors.white : AppColors.primary,
                ),
              ),
              TextSpan(
                text: 'Apex',
                style: TextStyle(
                  fontSize: size * 0.48,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.2,
                  color: const Color(0xFF3B82F6), // Dominant Apex Blue Accent
                ),
              ),
            ],
          ),
        ),
        if (showTagline) ...[
          const SizedBox(height: 2),
          Text(
            'Autonomous AI Trading System',
            style: TextStyle(
              fontSize: size * 0.22,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF64748B),
            ),
          ),
        ],
      ],
    );

    if (isHorizontal) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          logoWidget,
          SizedBox(width: size * 0.3),
          textColumn,
        ],
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        logoWidget,
        SizedBox(height: size * 0.25),
        textColumn,
      ],
    );
  }
}

