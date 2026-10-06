import 'package:flutter/material.dart';
import '../core/services/market_service.dart';
import '../core/theme/app_colors.dart';

class SmoothGradientChart extends StatelessWidget {
  final List<CandleData> candles;
  final double height;

  const SmoothGradientChart({
    super.key,
    required this.candles,
    this.height = 180,
  });

  @override
  Widget build(BuildContext context) {
    if (candles.isEmpty) {
      return SizedBox(
        height: height,
        child: const Center(child: Text('No chart data', style: TextStyle(color: Colors.grey))),
      );
    }

    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0B132B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF1E293B)),
        boxShadow: [
          BoxShadow(
            color: AppColors.accent.withValues(alpha: 0.08),
            blurRadius: 16,
            spreadRadius: 2,
          ),
        ],
      ),
      child: CustomPaint(
        size: Size(double.infinity, height),
        painter: _ChartPainter(candles),
      ),
    );
  }
}

class _ChartPainter extends CustomPainter {
  final List<CandleData> candles;

  _ChartPainter(this.candles);

  @override
  void paint(Canvas canvas, Size size) {
    final prices = candles.map((c) => c.close).toList();
    final maxPrice = prices.reduce((a, b) => a > b ? a : b);
    final minPrice = prices.reduce((a, b) => a < b ? a : b);
    final range = (maxPrice - minPrice).abs() + 0.001;

    final width = size.width;
    final height = size.height;
    final points = <Offset>[];

    final stepX = width / (prices.length - 1);
    for (int i = 0; i < prices.length; i++) {
      final x = i * stepX;
      final y = height - ((prices[i] - minPrice) / range) * (height - 30) - 15;
      points.add(Offset(x, y));
    }

    // Grid Lines
    final gridPaint = Paint()
      ..color = const Color(0xFF1E293B)
      ..strokeWidth = 1.0;

    canvas.drawLine(Offset(0, height * 0.25), Offset(width, height * 0.25), gridPaint);
    canvas.drawLine(Offset(0, height * 0.50), Offset(width, height * 0.50), gridPaint);
    canvas.drawLine(Offset(0, height * 0.75), Offset(width, height * 0.75), gridPaint);

    // Smooth Curve Path
    final path = Path();
    path.moveTo(points.first.dx, points.first.dy);

    for (int i = 0; i < points.length - 1; i++) {
      final p1 = points[i];
      final p2 = points[i + 1];
      final controlPoint1 = Offset(p1.dx + (p2.dx - p1.dx) / 2, p1.dy);
      final controlPoint2 = Offset(p1.dx + (p2.dx - p1.dx) / 2, p2.dy);
      path.cubicTo(controlPoint1.dx, controlPoint1.dy, controlPoint2.dx, controlPoint2.dy, p2.dx, p2.dy);
    }

    // Gradient Fill Path
    final fillPath = Path.from(path);
    fillPath.lineTo(width, height);
    fillPath.lineTo(0, height);
    fillPath.close();

    final isBullish = prices.last >= prices.first;
    final strokeColor = isBullish ? AppColors.accentLight : AppColors.danger;

    final fillGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        strokeColor.withValues(alpha: 0.35),
        strokeColor.withValues(alpha: 0.0),
      ],
    );

    final fillPaint = Paint()
      ..shader = fillGradient.createShader(Rect.fromLTWH(0, 0, width, height))
      ..style = PaintingStyle.fill;

    canvas.drawPath(fillPath, fillPaint);

    // Stroke Paint
    final strokePaint = Paint()
      ..color = strokeColor
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(path, strokePaint);

    // Active Pulsing End Dot
    final lastPoint = points.last;
    final dotOuterPaint = Paint()..color = strokeColor.withValues(alpha: 0.3);
    final dotInnerPaint = Paint()..color = strokeColor;

    canvas.drawCircle(lastPoint, 7, dotOuterPaint);
    canvas.drawCircle(lastPoint, 3.5, dotInnerPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
