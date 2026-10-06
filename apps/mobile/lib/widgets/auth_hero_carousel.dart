import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Auto-advancing trading visual slides for the auth entry hero.
class AuthHeroCarousel extends StatefulWidget {
  const AuthHeroCarousel({super.key, this.height = 200});

  final double height;

  @override
  State<AuthHeroCarousel> createState() => _AuthHeroCarouselState();
}

class _AuthHeroCarouselState extends State<AuthHeroCarousel> {
  late final PageController _controller;
  Timer? _timer;
  int _index = 0;

  static const _slides = [
    _SlideKind.candles,
    _SlideKind.equity,
    _SlideKind.trades,
  ];

  @override
  void initState() {
    super.initState();
    _controller = PageController();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_index + 1) % _slides.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: widget.height,
          child: PageView.builder(
            controller: _controller,
            itemCount: _slides.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: _HeroSlide(kind: _slides[i]),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(_slides.length, (i) {
            final active = i == _index;
            return AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: active ? 18 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: active
                    ? const Color(0xFF3B82F6)
                    : const Color(0xFF334155),
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }),
        ),
      ],
    );
  }
}

enum _SlideKind { candles, equity, trades }

class _HeroSlide extends StatelessWidget {
  const _HeroSlide({required this.kind});

  final _SlideKind kind;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0F172A), Color(0xFF111C2E), Color(0xFF0B1220)],
        ),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(painter: _SlidePainter(kind: kind)),
          ),
          Positioned(
            left: 14,
            top: 12,
            child: Text(
              switch (kind) {
                _SlideKind.candles => 'Live markets',
                _SlideKind.equity => 'Quiet confidence',
                _SlideKind.trades => 'Trade flow',
              },
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 12,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.2,
              ),
            ),
          ),
          Positioned(
            left: 14,
            bottom: 12,
            child: Text(
              switch (kind) {
                _SlideKind.candles => 'NGX · US · Crypto',
                _SlideKind.equity => 'Equity curve · paper',
                _SlideKind.trades => 'Filled · watching risk',
              },
              style: const TextStyle(
                color: Color(0xFFE2E8F0),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SlidePainter extends CustomPainter {
  _SlidePainter({required this.kind});

  final _SlideKind kind;

  @override
  void paint(Canvas canvas, Size size) {
    switch (kind) {
      case _SlideKind.candles:
        _paintCandles(canvas, size);
      case _SlideKind.equity:
        _paintEquity(canvas, size);
      case _SlideKind.trades:
        _paintTrades(canvas, size);
    }
  }

  void _paintCandles(Canvas canvas, Size size) {
    final rng = math.Random(7);
    final count = 18;
    final padL = 16.0;
    final padR = 16.0;
    final padT = 36.0;
    final padB = 40.0;
    final w = (size.width - padL - padR) / count;
    var price = 0.55;

    for (var i = 0; i < count; i++) {
      final open = price;
      final move = (rng.nextDouble() - 0.42) * 0.12;
      final close = (open + move).clamp(0.12, 0.88);
      final high = math.max(open, close) + rng.nextDouble() * 0.05;
      final low = math.min(open, close) - rng.nextDouble() * 0.05;
      price = close;

      final up = close >= open;
      final color = up ? const Color(0xFF10B981) : const Color(0xFFEF4444);
      final cx = padL + i * w + w / 2;
      final yHigh = padT + (1 - high.clamp(0.05, 0.95)) * (size.height - padT - padB);
      final yLow = padT + (1 - low.clamp(0.05, 0.95)) * (size.height - padT - padB);
      final yOpen = padT + (1 - open) * (size.height - padT - padB);
      final yClose = padT + (1 - close) * (size.height - padT - padB);

      final wick = Paint()
        ..color = color.withValues(alpha: 0.85)
        ..strokeWidth = 1.2;
      canvas.drawLine(Offset(cx, yHigh), Offset(cx, yLow), wick);

      final bodyTop = math.min(yOpen, yClose);
      final bodyH = math.max((yOpen - yClose).abs(), 3.0);
      final body = RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx, bodyTop + bodyH / 2),
          width: w * 0.55,
          height: bodyH,
        ),
        const Radius.circular(1.5),
      );
      canvas.drawRRect(body, Paint()..color = color.withValues(alpha: 0.9));
    }
  }

  void _paintEquity(Canvas canvas, Size size) {
    final points = <Offset>[];
    final values = [
      0.35, 0.38, 0.36, 0.42, 0.48, 0.45, 0.52, 0.58, 0.55, 0.62,
      0.68, 0.66, 0.72, 0.78, 0.75, 0.82, 0.80, 0.86,
    ];
    final padL = 16.0;
    final padR = 16.0;
    final padT = 40.0;
    final padB = 42.0;
    final chartH = size.height - padT - padB;
    final chartW = size.width - padL - padR;

    for (var i = 0; i < values.length; i++) {
      final x = padL + (i / (values.length - 1)) * chartW;
      final y = padT + (1 - values[i]) * chartH;
      points.add(Offset(x, y));
    }

    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (var i = 1; i < points.length; i++) {
      final p0 = points[i - 1];
      final p1 = points[i];
      final mid = Offset((p0.dx + p1.dx) / 2, (p0.dy + p1.dy) / 2);
      path.quadraticBezierTo(p0.dx, p0.dy, mid.dx, mid.dy);
    }
    path.lineTo(points.last.dx, points.last.dy);

    final fill = Path.from(path)
      ..lineTo(points.last.dx, size.height - padB)
      ..lineTo(points.first.dx, size.height - padB)
      ..close();

    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            const Color(0xFF3B82F6).withValues(alpha: 0.35),
            const Color(0xFF3B82F6).withValues(alpha: 0.02),
          ],
        ).createShader(Rect.fromLTWH(0, padT, size.width, chartH)),
    );

    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xFF60A5FA)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round,
    );

    // Trade markers
    for (final i in [4, 9, 14]) {
      final p = points[i];
      canvas.drawCircle(p, 4.5, Paint()..color = const Color(0xFF10B981));
      canvas.drawCircle(p, 2.2, Paint()..color = Colors.white);
    }
  }

  void _paintTrades(Canvas canvas, Size size) {
    final rows = [
      ('BUY  AAPL', '+1.24%', const Color(0xFF10B981)),
      ('SELL TSLA', '−0.48%', const Color(0xFFEF4444)),
      ('BUY  BTC', '+0.92%', const Color(0xFF10B981)),
      ('BUY  MTNN', '+0.31%', const Color(0xFF10B981)),
    ];

    final tp = TextPainter(textDirection: TextDirection.ltr);
    var y = 44.0;
    for (final row in rows) {
      final bg = RRect.fromRectAndRadius(
        Rect.fromLTWH(14, y, size.width - 28, 28),
        const Radius.circular(8),
      );
      canvas.drawRRect(
        bg,
        Paint()..color = const Color(0xFF16233B).withValues(alpha: 0.9),
      );

      tp.text = TextSpan(
        text: row.$1,
        style: const TextStyle(
          color: Color(0xFFE2E8F0),
          fontSize: 12,
          fontWeight: FontWeight.w600,
          fontFamily: 'monospace',
        ),
      );
      tp.layout();
      tp.paint(canvas, Offset(24, y + 7));

      tp.text = TextSpan(
        text: row.$2,
        style: TextStyle(
          color: row.$3,
          fontSize: 12,
          fontWeight: FontWeight.w700,
          fontFamily: 'monospace',
        ),
      );
      tp.layout();
      tp.paint(canvas, Offset(size.width - 24 - tp.width, y + 7));

      y += 34;
    }
  }

  @override
  bool shouldRepaint(covariant _SlidePainter oldDelegate) =>
      oldDelegate.kind != kind;
}
