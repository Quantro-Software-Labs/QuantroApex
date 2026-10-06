import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

/// Placeholder for Crypto / Forex with waitlist Notify me → POST /waitlist.
class ComingSoonScreen extends StatefulWidget {
  final String title;
  final String assetClass;
  final String subtitle;
  final Color accent;

  const ComingSoonScreen({
    super.key,
    required this.title,
    required this.assetClass,
    required this.subtitle,
    this.accent = AppColors.accentLight,
  });

  @override
  State<ComingSoonScreen> createState() => _ComingSoonScreenState();
}

class _ComingSoonScreenState extends State<ComingSoonScreen> {
  bool _loading = false;
  bool _joined = false;

  Future<void> _notifyMe() async {
    setState(() => _loading = true);
    final result =
        await context.read<AuthProvider>().joinWaitlist(widget.assetClass);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (result != null) _joined = true;
    });

    if (result != null) {
      final count = result['totalCount'];
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            count != null
                ? 'You\'re on the ${widget.title} waitlist ($count joined).'
                : 'You\'re on the ${widget.title} waitlist.',
          ),
          backgroundColor: AppColors.darkSurface,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not join waitlist. Try again.'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.space4,
        vertical: AppSpacing.space5,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                widget.title,
                style: AppTypography.h2(color: AppColors.white),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: widget.accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'soon',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: widget.accent,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.space2),
          Text(
            widget.subtitle,
            style: AppTypography.body(color: AppColors.muted),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.all(AppSpacing.space5),
            decoration: BoxDecoration(
              color: AppColors.darkSurface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.darkBorder),
            ),
            child: Column(
              children: [
                Icon(
                  Icons.schedule_rounded,
                  size: 48,
                  color: widget.accent.withValues(alpha: 0.8),
                ),
                const SizedBox(height: 16),
                Text(
                  'Coming soon',
                  style: AppTypography.h2(color: AppColors.white),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'We\'re finishing ${widget.title.toLowerCase()} markets. Join the waitlist and we\'ll notify you when it launches.',
                  style: AppTypography.body(color: AppColors.muted),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: (_loading || _joined) ? null : _notifyMe,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: widget.accent,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor:
                          widget.accent.withValues(alpha: 0.35),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            _joined ? 'You\'re on the list' : 'Notify me',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
        ],
      ),
    );
  }
}
