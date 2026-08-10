import 'package:flutter/material.dart';
import '../core/services/analytics_service.dart';
import '../core/theme/app_colors.dart';

class EquityChart extends StatelessWidget {
  const EquityChart({
    super.key,
    required this.points,
    this.height = 180,
  });

  final List<EquityPointData> points;
  final double height;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) {
      return SizedBox(
        height: height,
        child: const Center(
          child: Text('No performance data available', style: TextStyle(color: AppColors.muted)),
        ),
      );
    }

    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _EquityChartPainter(points: points),
      ),
    );
  }
}

class _EquityChartPainter extends CustomPainter {
  final List<EquityPointData> points;

  _EquityChartPainter({required this.points});

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;

    final equities = points.map((p) => p.equity).toList();
    final minEquity = equities.reduce((a, b) => a < b ? a : b);
    final maxEquity = equities.reduce((a, b) => a > b ? a : b);
    final range = (maxEquity - minEquity) == 0 ? 1.0 : (maxEquity - minEquity);

    final path = Path();
    final fillPath = Path();

    final dx = size.width / (points.length - 1);

    for (int i = 0; i < points.length; i++) {
      final x = i * dx;
      final normalizedY = (points[i].equity - minEquity) / range;
      final y = size.height - (normalizedY * (size.height - 20) + 10);

      if (i == 0) {
        path.moveTo(x, y);
        fillPath.moveTo(x, size.height);
        fillPath.lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }

    fillPath.lineTo(size.width, size.height);
    fillPath.close();

    // Fill Gradient
    final gradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        AppColors.accent.withValues(alpha: 0.25),
        AppColors.accent.withValues(alpha: 0.0),
      ],
    );

    final fillPaint = Paint()
      ..shader = gradient.createShader(Rect.fromLTWH(0, 0, size.width, size.height))
      ..style = PaintingStyle.fill;

    canvas.drawPath(fillPath, fillPaint);

    // Line Stroke
    final linePaint = Paint()
      ..color = AppColors.accent
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawPath(path, linePaint);
  }

  @override
  bool shouldRepaint(covariant _EquityChartPainter oldDelegate) {
    return oldDelegate.points != points;
  }
}
