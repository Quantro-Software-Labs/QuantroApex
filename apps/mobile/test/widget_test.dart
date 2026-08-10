import 'package:flutter_test/flutter_test.dart';
import 'package:quantroapex/main.dart';

void main() {
  testWidgets('Home shell renders tagline', (WidgetTester tester) async {
    await tester.pumpWidget(const QuantroApexApp());
    expect(find.text('Trade smarter. Let it learn.'), findsOneWidget);
  });
}
