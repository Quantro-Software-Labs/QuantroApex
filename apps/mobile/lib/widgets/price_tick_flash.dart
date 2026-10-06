import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';

class PriceTickFlash extends StatefulWidget {
  final String priceText;
  final double changePct;
  final TextStyle textStyle;

  const PriceTickFlash({
    super.key,
    required this.priceText,
    required this.changePct,
    required this.textStyle,
  });

  @override
  State<PriceTickFlash> createState() => _PriceTickFlashState();
}

class _PriceTickFlashState extends State<PriceTickFlash> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Color?> _colorAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    final flashColor = widget.changePct >= 0
        ? AppColors.success.withValues(alpha: 0.35)
        : AppColors.danger.withValues(alpha: 0.35);

    _colorAnimation = ColorTween(
      begin: flashColor,
      end: Colors.transparent,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));

    _controller.forward();
  }

  @override
  void didUpdateWidget(covariant PriceTickFlash oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.priceText != widget.priceText) {
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _colorAnimation,
      builder: (context, child) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: _colorAnimation.value,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            widget.priceText,
            style: widget.textStyle,
          ),
        );
      },
    );
  }
}
