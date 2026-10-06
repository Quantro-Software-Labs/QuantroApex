import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/auth_hero_carousel.dart';
import '../../widgets/quantro_logo.dart';
import 'email_auth_screen.dart';
import 'phone_auth_screen.dart';

/// Quiet Confidence auth entry — phone primary, email secondary, Google tertiary.
class AuthEntryScreen extends StatefulWidget {
  const AuthEntryScreen({super.key});

  @override
  State<AuthEntryScreen> createState() => _AuthEntryScreenState();
}

class _AuthEntryScreenState extends State<AuthEntryScreen> {
  static const _bg = Color(0xFF060D1A);
  static const _accent = Color(0xFF3B82F6);
  bool _googleLoading = false;

  Future<void> _continueWithGoogle() async {
    setState(() => _googleLoading = true);
    final ok = await context.read<AuthProvider>().signInWithGoogle();
    if (!mounted) return;
    setState(() => _googleLoading = false);
    if (!ok) {
      final err = context.read<AuthProvider>().errorMessage;
      if (err != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(err), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(flex: 2),
              const Center(
                child: QuantroLogo(
                  size: 48,
                  showText: true,
                  isDarkBackground: true,
                ),
              ),
              const SizedBox(height: 20),
              const AuthHeroCarousel(height: 176),
              const SizedBox(height: 20),
              Text(
                'Sign in to QuantroApex',
                style: AppTypography.h1(color: Colors.white),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'Autonomous trading with quiet confidence.',
                style: AppTypography.body(color: const Color(0xFF94A3B8)),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              if (auth.errorMessage != null) ...[
                Text(
                  auth.errorMessage!,
                  style: AppTypography.secondary(color: const Color(0xFFEF4444)),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
              ],
              _AuthMethodButton(
                label: 'Continue with phone',
                icon: Icons.phone_iphone_rounded,
                filled: true,
                accent: _accent,
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const PhoneAuthScreen()),
                  );
                },
              ),
              const SizedBox(height: 12),
              _AuthMethodButton(
                label: 'Continue with email',
                icon: Icons.mail_outline_rounded,
                filled: false,
                accent: _accent,
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const EmailAuthScreen()),
                  );
                },
              ),
              const SizedBox(height: 12),
              _AuthMethodButton(
                label: 'Continue with Google',
                iconWidget: const _GoogleGlyph(),
                filled: false,
                accent: const Color(0xFF94A3B8),
                muted: true,
                loading: _googleLoading,
                onPressed: _googleLoading ? null : _continueWithGoogle,
              ),
              const Spacer(flex: 1),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}

class _AuthMethodButton extends StatelessWidget {
  const _AuthMethodButton({
    required this.label,
    required this.accent,
    this.icon,
    this.iconWidget,
    this.filled = false,
    this.muted = false,
    this.loading = false,
    this.onPressed,
  });

  final String label;
  final IconData? icon;
  final Widget? iconWidget;
  final Color accent;
  final bool filled;
  final bool muted;
  final bool loading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: Color(0xFF3B82F6),
            ),
          )
        : Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (iconWidget != null)
                iconWidget!
              else if (icon != null)
                Icon(icon, size: 20, color: filled ? Colors.white : accent),
              const SizedBox(width: 10),
              Text(
                label,
                style: AppTypography.body(
                  color: filled
                      ? Colors.white
                      : (muted ? const Color(0xFF94A3B8) : accent),
                ).copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          );

    if (filled) {
      return SizedBox(
        height: 52,
        child: ElevatedButton(
          onPressed: onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: accent,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: child,
        ),
      );
    }

    if (muted) {
      return SizedBox(
        height: 52,
        child: TextButton(
          onPressed: onPressed,
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFF94A3B8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: child,
        ),
      );
    }

    return SizedBox(
      height: 52,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: accent,
          side: const BorderSide(color: Color(0xFF1E293B)),
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: child,
      ),
    );
  }
}

class _GoogleGlyph extends StatelessWidget {
  const _GoogleGlyph();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Text(
        'G',
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Color(0xFF4285F4),
          height: 1,
        ),
      ),
    );
  }
}
