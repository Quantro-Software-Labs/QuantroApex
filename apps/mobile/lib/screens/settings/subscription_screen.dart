import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/providers/subscription_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SubscriptionProvider>().refresh();
    });
  }

  Future<void> _selectPlan(PlanDefinition plan) async {
    final subs = context.read<SubscriptionProvider>();
    if (plan.isFree) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You are on the free Observer plan.')),
      );
      return;
    }
    if (subs.planId == plan.id) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('You are already on ${plan.name}.')),
      );
      return;
    }

    final session = await subs.startCheckout(plan.id);
    if (!mounted || session == null) return;

    final paid = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _PaystackCheckoutPage(
          authorizationUrl: session.authorizationUrl,
          reference: session.reference,
          plan: plan.id,
        ),
      ),
    );

    if (paid == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${plan.name} plan activated.')),
      );
    }
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.darkCard,
        title: Text('Cancel subscription?', style: AppTypography.h3(color: AppColors.white)),
        content: Text(
          'You will move to the free Observer plan at the end of the current period.',
          style: AppTypography.body(color: AppColors.muted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep plan'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel plan', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final ok = await context.read<SubscriptionProvider>().cancel();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'Subscription cancelled.' : 'Could not cancel right now.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final subs = context.watch<SubscriptionProvider>();
    final current = subs.current;
    final planId = subs.planId;

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        title: Text('Subscription', style: AppTypography.h3(color: AppColors.white)),
      ),
      body: SafeArea(
        child: subs.loading && current == null
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.accentLight),
              )
            : ListView(
                padding: const EdgeInsets.all(AppSpacing.space4),
                children: [
                  if (current != null) ...[
                    _CurrentPlanBanner(
                      planId: planId,
                      activeUntil: current.activeUntil,
                      cancelled: current.isCancelled,
                      onCancel: current.isPaid && !current.isCancelled ? _cancel : null,
                    ),
                    const SizedBox(height: AppSpacing.space4),
                  ],
                  Text(
                    'Choose a plan',
                    style: AppTypography.h2(color: AppColors.white),
                  ),
                  const SizedBox(height: AppSpacing.space1),
                  Text(
                    'Upgrade when you are ready for live autopilot and desk tools.',
                    style: AppTypography.secondary(color: AppColors.muted),
                  ),
                  const SizedBox(height: AppSpacing.space4),
                  ...kPlanCatalog.map((plan) {
                    final selected = planId == plan.id ||
                        (plan.id == 'FREE' && (planId == 'FREE' || planId == 'OBSERVER'));
                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space3),
                      child: _PlanCard(
                        plan: plan,
                        selected: selected,
                        busy: subs.busy,
                        onTap: () => _selectPlan(plan),
                      ),
                    );
                  }),
                  if (subs.error != null) ...[
                    const SizedBox(height: AppSpacing.space2),
                    Text(
                      subs.error!,
                      style: AppTypography.caption(color: AppColors.danger),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}

class _CurrentPlanBanner extends StatelessWidget {
  final String planId;
  final DateTime? activeUntil;
  final bool cancelled;
  final VoidCallback? onCancel;

  const _CurrentPlanBanner({
    required this.planId,
    this.activeUntil,
    required this.cancelled,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final label = planId == 'FREE' ? 'Observer' : planId;
    final expiry = activeUntil != null
        ? '${activeUntil!.day}/${activeUntil!.month}/${activeUntil!.year}'
        : null;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.space3),
      decoration: BoxDecoration(
        color: AppColors.darkCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.darkBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Current plan', style: AppTypography.caption(color: AppColors.muted)),
          const SizedBox(height: 4),
          Text(label, style: AppTypography.h3(color: AppColors.white)),
          if (expiry != null) ...[
            const SizedBox(height: 4),
            Text(
              cancelled ? 'Cancels / expired $expiry' : 'Renews / active until $expiry',
              style: AppTypography.caption(color: AppColors.muted),
            ),
          ],
          if (onCancel != null) ...[
            const SizedBox(height: AppSpacing.space2),
            TextButton(
              onPressed: onCancel,
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              child: const Text('Cancel subscription'),
            ),
          ],
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final PlanDefinition plan;
  final bool selected;
  final bool busy;
  final VoidCallback onTap;

  const _PlanCard({
    required this.plan,
    required this.selected,
    required this.busy,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.darkCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: busy ? null : onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.space3),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? AppColors.accentLight : AppColors.darkBorder,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      plan.name,
                      style: AppTypography.h3(color: AppColors.white),
                    ),
                  ),
                  if (selected)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Current',
                        style: AppTypography.caption(color: AppColors.accentLight),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                plan.priceLabel,
                style: AppTypography.body(color: AppColors.accentLight),
              ),
              const SizedBox(height: AppSpacing.space2),
              ...plan.features.map(
                (f) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.check, size: 16, color: AppColors.success),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          f,
                          style: AppTypography.secondary(color: AppColors.muted),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaystackCheckoutPage extends StatefulWidget {
  final String authorizationUrl;
  final String reference;
  final String plan;

  const _PaystackCheckoutPage({
    required this.authorizationUrl,
    required this.reference,
    required this.plan,
  });

  @override
  State<_PaystackCheckoutPage> createState() => _PaystackCheckoutPageState();
}

class _PaystackCheckoutPageState extends State<_PaystackCheckoutPage> {
  late final WebViewController _controller;
  bool _verifying = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.darkBackground)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final url = request.url;
            if (url.contains('billing/callback') ||
                url.contains('reference=') ||
                url.contains('trxref=')) {
              _handleReturn();
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.authorizationUrl));
  }

  Future<void> _handleReturn() async {
    if (_verifying) return;
    setState(() => _verifying = true);
    final ok = await context.read<SubscriptionProvider>().confirmPayment(
          reference: widget.reference,
          plan: widget.plan,
        );
    if (mounted) Navigator.of(context).pop(ok);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        title: Text('Checkout', style: AppTypography.h3(color: AppColors.white)),
      ),
      body: _verifying
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: AppColors.accentLight),
                  SizedBox(height: 16),
                  Text('Confirming payment…', style: TextStyle(color: Colors.white70)),
                ],
              ),
            )
          : WebViewWidget(controller: _controller),
    );
  }
}
