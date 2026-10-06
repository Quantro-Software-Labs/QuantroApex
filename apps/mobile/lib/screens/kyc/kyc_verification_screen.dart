import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/providers/kyc_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

/// Sumsub identity verification — gates Live trading.
///
/// Flow: initiate → WebView (or sandbox buttons) → poll /kyc/status every 5s
/// for up to 2 minutes → VERIFIED / REJECTED / UNDER_REVIEW.
class KycVerificationScreen extends StatefulWidget {
  /// When true, pops with `true` on VERIFIED so callers can unlock Live.
  final bool unlockLiveOnSuccess;

  const KycVerificationScreen({
    super.key,
    this.unlockLiveOnSuccess = true,
  });

  @override
  State<KycVerificationScreen> createState() => _KycVerificationScreenState();
}

class _KycVerificationScreenState extends State<KycVerificationScreen> {
  WebViewController? _webController;
  bool _started = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final kyc = context.read<KycProvider>();
    await kyc.refreshStatus();
    if (!mounted) return;
    if (kyc.isVerified) {
      _finishVerified();
      return;
    }
    if (!_started) {
      _started = true;
      final ok = await kyc.startVerification();
      if (!mounted || !ok) return;
      final session = kyc.session;
      if (session != null && !session.sandbox) {
        _webController = WebViewController()
          ..setJavaScriptMode(JavaScriptMode.unrestricted)
          ..setBackgroundColor(AppColors.darkBackground)
          ..loadRequest(session.webSdkUri);
        setState(() {});
      }
    }
  }

  void _finishVerified() {
    if (widget.unlockLiveOnSuccess && mounted) {
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kyc = context.watch<KycProvider>();

    if (kyc.phase == KycFlowPhase.verified) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _finishVerified();
      });
    }

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        title: Text(
          'Identity verification',
          style: AppTypography.h3(color: AppColors.white),
        ),
      ),
      body: SafeArea(child: _buildBody(kyc)),
    );
  }

  Widget _buildBody(KycProvider kyc) {
    switch (kyc.phase) {
      case KycFlowPhase.initiating:
      case KycFlowPhase.idle:
        return const Center(
          child: CircularProgressIndicator(color: AppColors.accentLight),
        );
      case KycFlowPhase.error:
        return _MessageState(
          icon: Icons.error_outline_rounded,
          iconColor: AppColors.danger,
          title: 'Something went wrong',
          body: kyc.errorMessage ?? 'Please try again in a moment.',
          primaryLabel: 'Try again',
          onPrimary: () => kyc.retry(),
        );
      case KycFlowPhase.rejected:
        return _MessageState(
          icon: Icons.highlight_off_rounded,
          iconColor: AppColors.danger,
          title: 'Verification unsuccessful',
          body: kyc.status?.rejectionReason ??
              'We could not verify your identity. You can try again with a different document.',
          primaryLabel: 'Try again',
          onPrimary: () => kyc.retry(),
          secondaryLabel: 'Stay in simulation',
          onSecondary: () => Navigator.of(context).pop(false),
        );
      case KycFlowPhase.underReview:
        return _MessageState(
          icon: Icons.hourglass_empty_rounded,
          iconColor: AppColors.amberGlow,
          title: 'Under review',
          body:
              'Your documents are being reviewed. This usually takes a few minutes. We will notify you when it is complete — you can keep using simulation in the meantime.',
          primaryLabel: 'Back to app',
          onPrimary: () => Navigator.of(context).pop(false),
        );
      case KycFlowPhase.verified:
        return _MessageState(
          icon: Icons.verified_rounded,
          iconColor: AppColors.success,
          title: 'Verified',
          body: 'Identity confirmed. Live trading is unlocked.',
          primaryLabel: 'Continue',
          onPrimary: _finishVerified,
        );
      case KycFlowPhase.webview:
      case KycFlowPhase.polling:
        final sandbox = kyc.session?.sandbox ?? false;
        if (sandbox) {
          return _SandboxPanel(
            onApprove: () => kyc.completeSandbox(approved: true),
            onReject: () => kyc.completeSandbox(approved: false),
          );
        }
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.space4,
                0,
                AppSpacing.space4,
                AppSpacing.space2,
              ),
              child: Text(
                'Complete the steps below. This is required before live trading with real capital.',
                style: AppTypography.body(color: AppColors.muted),
              ),
            ),
            if (kyc.phase == KycFlowPhase.polling)
              const LinearProgressIndicator(
                minHeight: 2,
                color: AppColors.accentLight,
                backgroundColor: AppColors.darkBorder,
              ),
            Expanded(
              child: _webController == null
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: AppColors.accentLight,
                      ),
                    )
                  : WebViewWidget(controller: _webController!),
            ),
          ],
        );
    }
  }
}

class _SandboxPanel extends StatelessWidget {
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const _SandboxPanel({
    required this.onApprove,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.space4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sandbox verification',
            style: AppTypography.h2(color: AppColors.white),
          ),
          const SizedBox(height: AppSpacing.space2),
          Text(
            'Sumsub keys are not configured. Use these controls to simulate KYC for local and staging builds.',
            style: AppTypography.body(color: AppColors.muted),
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onApprove,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.success,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('Mark verified'),
            ),
          ),
          const SizedBox(height: AppSpacing.space2),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: onReject,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.danger,
                side: const BorderSide(color: AppColors.danger),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('Simulate rejection'),
            ),
          ),
          const SizedBox(height: AppSpacing.space4),
        ],
      ),
    );
  }
}

class _MessageState extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String body;
  final String primaryLabel;
  final VoidCallback onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  const _MessageState({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
    this.secondaryLabel,
    this.onSecondary,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.space4),
      child: Column(
        children: [
          const Spacer(),
          Icon(icon, size: 56, color: iconColor),
          const SizedBox(height: AppSpacing.space3),
          Text(title, style: AppTypography.h2(color: AppColors.white)),
          const SizedBox(height: AppSpacing.space2),
          Text(
            body,
            textAlign: TextAlign.center,
            style: AppTypography.body(color: AppColors.muted),
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onPrimary,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.accent,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: Text(primaryLabel),
            ),
          ),
          if (secondaryLabel != null && onSecondary != null) ...[
            const SizedBox(height: AppSpacing.space2),
            TextButton(
              onPressed: onSecondary,
              child: Text(
                secondaryLabel!,
                style: AppTypography.body(color: AppColors.muted),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.space3),
        ],
      ),
    );
  }
}
