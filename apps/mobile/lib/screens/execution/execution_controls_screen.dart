import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/providers/simulation_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/components.dart';

class ExecutionControlsScreen extends StatefulWidget {
  const ExecutionControlsScreen({super.key});

  @override
  State<ExecutionControlsScreen> createState() => _ExecutionControlsScreenState();
}

class _ExecutionControlsScreenState extends State<ExecutionControlsScreen> {
  final _symbolController = TextEditingController(text: 'AAPL');
  final _qtyController = TextEditingController(text: '10');
  final _apiKeyController = TextEditingController();
  final _secretKeyController = TextEditingController();
  final _demoCapitalController = TextEditingController(text: '5000');
  String _side = 'BUY';

  @override
  void dispose() {
    _symbolController.dispose();
    _qtyController.dispose();
    _apiKeyController.dispose();
    _secretKeyController.dispose();
    _demoCapitalController.dispose();
    super.dispose();
  }

  void _showResetDemoModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.space4),
          decoration: const BoxDecoration(
            color: Color(0xFF0F172A),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(top: BorderSide(color: Color(0xFF1E293B))),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.space4),
              Text('Set Demo Capital Amount', style: AppTypography.h2(color: AppColors.white)),
              const SizedBox(height: AppSpacing.space1),
              Text(
                'Choose a realistic paper trading capital starting balance (e.g. \$1,000, \$5,000, or custom).',
                style: AppTypography.caption(color: const Color(0xFF94A3B8)),
              ),
              const SizedBox(height: AppSpacing.space4),

              InputField(
                label: 'Demo Capital Balance (\$)',
                controller: _demoCapitalController,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: AppSpacing.space3),

              Row(
                children: [1000, 2500, 5000, 10000, 25000].map((amt) {
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        side: const BorderSide(color: Color(0xFF1E293B)),
                      ),
                      onPressed: () {
                        setState(() {
                          _demoCapitalController.text = amt.toString();
                        });
                      },
                      child: Text('\$${amt.toString()}', style: const TextStyle(fontSize: 11, color: Colors.white)),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: AppSpacing.space5),

              PrimaryButton(
                label: 'Reset Demo Account Balance',
                onPressed: () async {
                  final amt = double.tryParse(_demoCapitalController.text.trim());
                  if (amt == null || amt < 100) return;
                  final nav = Navigator.of(context);
                  final messenger = ScaffoldMessenger.of(context);

                  final simProvider = context.read<SimulationProvider>();
                  final success = await simProvider.resetSimulation(startingCapital: amt);

                  nav.pop();
                  if (success) {
                    messenger.showSnackBar(
                      SnackBar(
                        content: Text('Demo account reset to \$${amt.toStringAsFixed(2)} starting capital.'),
                        backgroundColor: const Color(0xFF10B981),
                      ),
                    );
                  }
                },
              ),
              const SizedBox(height: AppSpacing.space4),
            ],
          ),
        ),
      ),
    );
  }

  void _showConnectBrokerModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.space4),
          decoration: const BoxDecoration(
            color: Color(0xFF0F172A),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(top: BorderSide(color: Color(0xFF1E293B))),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.space4),
              Text('Connect Alpaca Broker API', style: AppTypography.h2(color: AppColors.white)),
              const SizedBox(height: AppSpacing.space1),
              Text(
                'Enter your Alpaca paper or live trading API credentials. Keys are encrypted server-side.',
                style: AppTypography.caption(color: const Color(0xFF94A3B8)),
              ),
              const SizedBox(height: AppSpacing.space4),

              InputField(
                label: 'Alpaca Key ID (e.g. PK...)',
                controller: _apiKeyController,
              ),
              const SizedBox(height: AppSpacing.space3),
              InputField(
                label: 'Alpaca Secret Key',
                controller: _secretKeyController,
                obscureText: true,
              ),
              const SizedBox(height: AppSpacing.space5),

              PrimaryButton(
                label: 'Save & Verify Credentials',
                onPressed: () async {
                  if (_apiKeyController.text.isEmpty || _secretKeyController.text.isEmpty) return;
                  final nav = Navigator.of(context);
                  final messenger = ScaffoldMessenger.of(context);
                  final provider = context.read<ExecutionProvider>();
                  final success = await provider.saveBrokerCredentials(
                    apiKey: _apiKeyController.text.trim(),
                    secretKey: _secretKeyController.text.trim(),
                  );

                  nav.pop();
                  if (success) {
                    messenger.showSnackBar(
                      const SnackBar(
                        content: Text('Alpaca broker credentials saved successfully.'),
                        backgroundColor: Color(0xFF10B981),
                      ),
                    );
                  }
                },
              ),
              const SizedBox(height: AppSpacing.space4),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleExecute() async {
    final qty = double.tryParse(_qtyController.text) ?? 0;
    if (_symbolController.text.isEmpty || qty <= 0) return;

    final provider = context.read<ExecutionProvider>();
    final success = await provider.placeOrder(
      symbol: _symbolController.text.trim().toUpperCase(),
      side: _side,
      quantity: qty,
      aiReasoning: 'Manual execution request via controls',
    );

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Order executed successfully.'),
          backgroundColor: Color(0xFF10B981),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ExecutionProvider>();
    final positions = provider.positions;
    final orders = provider.orders;
    final isConnected = provider.isBrokerConnected;
    final maskedKey = provider.maskedApiKey;

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('Execution Engine', style: AppTypography.h2(color: Colors.white)),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.fetchExecutionState(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.space4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Broker Connection Card
                ApexCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: (isConnected ? const Color(0xFF10B981) : const Color(0xFFF59E0B))
                                      .withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(
                                  isConnected ? Icons.check_circle_rounded : Icons.link_off_rounded,
                                  color: isConnected ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                                  size: 20,
                                ),
                              ),
                              const SizedBox(width: AppSpacing.space3),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Alpaca Broker Connection', style: AppTypography.h3(color: AppColors.white)),
                                  Text(
                                    isConnected ? 'Connected (${maskedKey ?? 'Paper Account'})' : 'Using Shared Sandbox Broker',
                                    style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          StatusBadge(
                            label: isConnected ? 'Connected' : 'Sandbox',
                            color: isConnected ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space3),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFF3B82F6),
                                side: const BorderSide(color: Color(0xFF1E293B)),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              icon: const Icon(Icons.key_rounded, size: 16),
                              label: Text(
                                isConnected ? 'Update API Keys' : 'Connect Alpaca Keys',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                              ),
                              onPressed: () => _showConnectBrokerModal(context),
                            ),
                          ),
                          if (isConnected) ...[
                            const SizedBox(width: AppSpacing.space2),
                            OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFFEF4444),
                                side: const BorderSide(color: Color(0xFF7F1D1D)),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              child: const Text('Disconnect', style: TextStyle(fontSize: 12)),
                              onPressed: () => provider.disconnectBroker(),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space4),

                // Paper Trading Demo Capital Control Card
                ApexCard(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Paper Trading Demo Capital', style: AppTypography.h3(color: AppColors.white)),
                          const SizedBox(height: 2),
                          Text('Customize paper account starting balance', style: AppTypography.caption(color: const Color(0xFF94A3B8))),
                        ],
                      ),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF3B82F6),
                          side: const BorderSide(color: Color(0xFF1E293B)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.refresh_rounded, size: 16),
                        label: const Text('Reset Balance', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                        onPressed: () => _showResetDemoModal(context),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space4),

                Text('Open Positions', style: AppTypography.h2(color: AppColors.white)),
                const SizedBox(height: AppSpacing.space3),

                if (positions.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.space3),
                    child: Text('No active positions open.', style: AppTypography.secondary(color: const Color(0xFF64748B))),
                  )
                else
                  ...positions.map((pos) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space3),
                      child: ApexCard(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(pos.symbol, style: AppTypography.h2(color: AppColors.white)),
                                const SizedBox(height: AppSpacing.space1),
                                Text(
                                  'Avg Cost: \$${pos.averageCost.toStringAsFixed(2)}',
                                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                                ),
                              ],
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '${pos.quantity.toStringAsFixed(2)} shares',
                                  style: AppTypography.h3(color: const Color(0xFF3B82F6)),
                                ),
                                const SizedBox(height: AppSpacing.space1),
                                Text(
                                  'Value: \$${(pos.quantity * pos.averageCost).toStringAsFixed(2)}',
                                  style: AppTypography.caption(color: const Color(0xFF64748B)),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                const SizedBox(height: AppSpacing.space5),

                // Order Entry Form
                Text('Place Test Order', style: AppTypography.h2(color: AppColors.white)),
                const SizedBox(height: AppSpacing.space3),
                ApexCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: InputField(
                              label: 'Symbol',
                              controller: _symbolController,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.space3),
                          Expanded(
                            child: InputField(
                              label: 'Quantity',
                              controller: _qtyController,
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space4),
                      Row(
                        children: [
                          Expanded(
                            child: ChoiceChip(
                              label: const Center(child: Text('BUY')),
                              selected: _side == 'BUY',
                              selectedColor: const Color(0xFF10B981),
                              backgroundColor: const Color(0xFF0F172A),
                              labelStyle: TextStyle(
                                color: _side == 'BUY' ? Colors.white : const Color(0xFF94A3B8),
                                fontWeight: FontWeight.bold,
                              ),
                              onSelected: (_) => setState(() => _side = 'BUY'),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.space3),
                          Expanded(
                            child: ChoiceChip(
                              label: const Center(child: Text('SELL')),
                              selected: _side == 'SELL',
                              selectedColor: const Color(0xFFEF4444),
                              backgroundColor: const Color(0xFF0F172A),
                              labelStyle: TextStyle(
                                color: _side == 'SELL' ? Colors.white : const Color(0xFF94A3B8),
                                fontWeight: FontWeight.bold,
                              ),
                              onSelected: (_) => setState(() => _side = 'SELL'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.space4),
                      if (provider.errorMessage != null) ...[
                        Text(
                          provider.errorMessage!,
                          style: AppTypography.secondary(color: const Color(0xFFEF4444)),
                        ),
                        const SizedBox(height: AppSpacing.space3),
                      ],
                      PrimaryButton(
                        label: 'Dispatch to Alpaca Engine',
                        isLoading: provider.isExecuting,
                        onPressed: _handleExecute,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space5),

                // Order History
                Text('Order History', style: AppTypography.h2(color: AppColors.white)),
                const SizedBox(height: AppSpacing.space3),
                if (orders.isEmpty)
                  Text('No recent orders logged.', style: AppTypography.secondary(color: const Color(0xFF64748B)))
                else
                  ...orders.map((ord) {
                    final isBuy = ord.side == 'BUY';

                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.space2),
                      child: ApexCard(
                        padding: AppSpacing.space3,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                StatusBadge(
                                  label: ord.side,
                                  color: isBuy ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                                ),
                                const SizedBox(width: AppSpacing.space3),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(ord.symbol, style: AppTypography.h3(color: AppColors.white)),
                                    Text(
                                      '${ord.quantity.toStringAsFixed(0)} shares @ ${ord.orderType}',
                                      style: AppTypography.caption(color: const Color(0xFF64748B)),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            StatusBadge(
                              label: ord.status,
                              color: ord.status == 'FILLED' ? const Color(0xFF3B82F6) : const Color(0xFF64748B),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
