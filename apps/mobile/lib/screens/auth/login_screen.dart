import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (_formKey.currentState?.validate() ?? false) {
      final authProvider = context.read<AuthProvider>();
      await authProvider.login(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
    }
  }

  void _navigateToRegister() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (context) => const RegisterScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.space4),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: AppSpacing.space5),
                Text('QuantroApex', style: AppTypography.secondary(color: AppColors.muted)),
                const SizedBox(height: AppSpacing.space2),
                Text('Welcome Back', style: AppTypography.h1(color: AppColors.primary)),
                const SizedBox(height: AppSpacing.space2),
                Text(
                  'Access your autonomous AI trading system.',
                  style: AppTypography.body(color: AppColors.muted),
                ),
                const SizedBox(height: AppSpacing.space5),

                if (authProvider.errorMessage != null) ...[
                  Text(
                    authProvider.errorMessage!,
                    style: AppTypography.secondary(color: AppColors.danger),
                  ),
                  const SizedBox(height: AppSpacing.space3),
                ],

                InputField(
                  label: 'Email Address',
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) return 'Email is required';
                    if (!val.contains('@')) return 'Enter a valid email address';
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.space4),

                InputField(
                  label: 'Password',
                  controller: _passwordController,
                  obscureText: true,
                  validator: (val) {
                    if (val == null || val.isEmpty) return 'Password is required';
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.space5),

                PrimaryButton(
                  label: 'Sign In',
                  isLoading: authProvider.isLoading,
                  onPressed: _handleLogin,
                ),
                const SizedBox(height: AppSpacing.space3),

                Center(
                  child: GhostButton(
                    label: "Don't have an account? Sign up",
                    onPressed: _navigateToRegister,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
