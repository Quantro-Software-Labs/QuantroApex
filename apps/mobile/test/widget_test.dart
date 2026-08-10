import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:quantroapex/core/providers/auth_provider.dart';
import 'package:quantroapex/screens/auth/login_screen.dart';

void main() {
  testWidgets('LoginScreen renders header and form fields', (WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AuthProvider(),
        child: const MaterialApp(
          home: LoginScreen(),
        ),
      ),
    );

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('QUANTRO'), findsOneWidget);
    expect(find.text('Welcome Back'), findsOneWidget);
  });
}
