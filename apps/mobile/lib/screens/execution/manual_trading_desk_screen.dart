import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/execution_provider.dart';
import '../../core/providers/market_provider.dart';
import '../../core/services/execution_service.dart';
import '../../core/services/market_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/trading_chart_widget.dart';
import 'order_panel_sheet.dart';

/// Manual Trading Desk — symbol search, chart + layers, quick BUY/SELL, positions.
class ManualTradingDeskScreen extends StatefulWidget {
  final String? initialSymbol;

  const ManualTradingDeskScreen({super.key, this.initialSymbol});

  @override
  State<ManualTradingDeskScreen> createState() => _ManualTradingDeskScreenState();
}

class _ManualTradingDeskScreenState extends State<ManualTradingDeskScreen> {
  static const _timeframes = ['1m', '5m', '15m', '1H', '4H', 'D', 'W'];
  static const _recentDefaults = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'SPY'];

  final _searchController = TextEditingController();
  final _chartKey = GlobalKey<TradingChartWidgetState>();
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final List<String> _recentSymbols = List.of(_recentDefaults);

  String _symbol = 'AAPL';
  String _timeframe = '1H';
  bool _loading = false;
  String? _error;
  StockDetailResponse? _detail;

  final Map<String, bool> _layers = {
    'structure': true,
    'ob': true,
    'fvg': true,
    'liquidity': false,
    'pd': true,
    'ema20': true,
    'ema50': true,
    'ema200': false,
  };

  @override
  void initState() {
    super.initState();
    if (widget.initialSymbol != null && widget.initialSymbol!.isNotEmpty) {
      _symbol = widget.initialSymbol!.toUpperCase();
      _pushRecent(_symbol);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MarketProvider>().loadStocks(silent: true);
      context.read<ExecutionProvider>().fetchExecutionState(silent: true);
      _loadSymbol(_symbol);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _pushRecent(String symbol) {
    _recentSymbols.remove(symbol);
    _recentSymbols.insert(0, symbol);
    if (_recentSymbols.length > 8) {
      _recentSymbols.removeRange(8, _recentSymbols.length);
    }
  }

  Future<void> _loadSymbol(String symbol) async {
    final sym = symbol.trim().toUpperCase();
    if (sym.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
      _symbol = sym;
    });
    _pushRecent(sym);

    try {
      final detail = await MarketService().getStockDetail(sym);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
      });
      _pushOverlaysToChart();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Failed to load $sym';
      });
    }
  }

  Map<String, dynamic> _buildOverlays(List<CandleData> candles) {
    if (candles.isEmpty) return {};
    final last = candles.last;
    final mid = (last.high + last.low) / 2;
    final range = (last.high - last.low).abs();
    final swingHigh = candles.map((c) => c.high).reduce((a, b) => a > b ? a : b);
    final swingLow = candles.map((c) => c.low).reduce((a, b) => a < b ? a : b);

    return {
      'structure': [
        {
          'price': swingHigh,
          'color': 'rgba(168,85,247,0.75)',
          'lineWidth': 2,
          'title': 'BOS',
        },
        {
          'price': swingLow,
          'color': 'rgba(14,165,233,0.75)',
          'lineWidth': 2,
          'title': 'CHoCH',
        },
      ],
      'ob': [
        {
          'price': last.close >= last.open ? last.low : last.high,
          'color': last.close >= last.open
              ? 'rgba(34,197,94,0.45)'
              : 'rgba(239,68,68,0.45)',
          'title': 'OB',
        },
      ],
      'fvg': [
        {
          'price': mid,
          'color': 'rgba(59,130,246,0.5)',
          'lineStyle': 2,
          'title': 'FVG',
        },
      ],
      'liquidity': [
        {'price': swingHigh, 'color': 'rgba(234,179,8,0.55)', 'lineStyle': 1, 'title': 'EQH'},
        {'price': swingLow, 'color': 'rgba(234,179,8,0.55)', 'lineStyle': 1, 'title': 'EQL'},
      ],
      'pd': [
        {
          'price': mid + range * 0.25,
          'color': 'rgba(239,68,68,0.4)',
          'lineStyle': 2,
          'title': 'Premium',
          'zone': 'premium',
        },
        {
          'price': mid - range * 0.25,
          'color': 'rgba(34,197,94,0.4)',
          'lineStyle': 2,
          'title': 'Discount',
          'zone': 'discount',
        },
      ],
    };
  }

  void _pushOverlaysToChart() {
    final candles = _detail?.candles ?? const <CandleData>[];
    final overlays = _buildOverlays(candles);
    _chartKey.currentState?.setOverlays(overlays);
    for (final e in _layers.entries) {
      _chartKey.currentState?.toggleOverlay(e.key, e.value);
    }
  }

  void _openLayersSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            return Container(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
              decoration: const BoxDecoration(
                color: AppColors.darkBackground,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                border: Border(top: BorderSide(color: AppColors.darkBorder)),
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
                  const SizedBox(height: 16),
                  Text('Layers', style: AppTypography.h2(color: AppColors.white)),
                  const SizedBox(height: 4),
                  Text(
                    'Structure · OB · FVG · Liquidity · PD · EMAs',
                    style: AppTypography.caption(color: const Color(0xFF64748B)),
                  ),
                  const SizedBox(height: 12),
                  ..._layerDefs.map((def) {
                    final on = _layers[def.key] ?? false;
                    return SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(def.label, style: AppTypography.secondary(color: AppColors.white)),
                      subtitle: Text(def.hint, style: AppTypography.caption(color: const Color(0xFF64748B))),
                      value: on,
                      activeColor: AppColors.accentLight,
                      onChanged: (v) {
                        setSheet(() => _layers[def.key] = v);
                        setState(() {});
                        _chartKey.currentState?.toggleOverlay(def.key, v);
                      },
                    );
                  }),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _openPositionsDrawer() {
    _scaffoldKey.currentState?.openEndDrawer();
  }

  Future<void> _openOrderPanel(String side) async {
    final price = _detail?.stock.price ?? 0;
    final name = _detail?.stock.name ?? _symbol;
    final asset = _detail?.stock.assetClass ?? 'STOCKS';
    await OrderPanelSheet.show(
      context,
      symbol: _symbol,
      companyName: name,
      currentPrice: price,
      assetClass: asset,
      initialSide: side,
      isSimulated: true,
    );
  }

  List<_LayerDef> get _layerDefs => const [
        _LayerDef('structure', 'Structure', 'BOS / CHoCH levels'),
        _LayerDef('ob', 'Order blocks', 'Bullish / bearish OB'),
        _LayerDef('fvg', 'Fair value gaps', 'Imbalance midpoints'),
        _LayerDef('liquidity', 'Liquidity', 'EQH / EQL pools'),
        _LayerDef('pd', 'Premium / Discount', 'PD array zones'),
        _LayerDef('ema20', 'EMA 20', 'Short trend'),
        _LayerDef('ema50', 'EMA 50', 'Intermediate trend'),
        _LayerDef('ema200', 'EMA 200', 'Long trend'),
      ];

  List<StockQuoteData> _searchResults(MarketProvider market) {
    final q = _searchController.text.trim().toLowerCase();
    if (q.isEmpty) return const [];
    return market.stocks
        .where((s) =>
            s.symbol.toLowerCase().contains(q) || s.name.toLowerCase().contains(q))
        .take(8)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final market = context.watch<MarketProvider>();
    final execution = context.watch<ExecutionProvider>();
    final price = _detail?.stock.price ?? 0;
    final changePct = _detail?.stock.changePct24h ?? 0;
    final candles = _detail?.candles ?? const <CandleData>[];
    final results = _searchResults(market);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.darkBackground,
      endDrawer: _PositionsDrawer(
        positions: execution.positions,
        onRefresh: () => execution.fetchExecutionState(),
      ),
      appBar: AppBar(
        backgroundColor: AppColors.darkBackground,
        elevation: 0,
        title: Text('Manual Trading Desk', style: AppTypography.h3(color: AppColors.white)),
        actions: [
          IconButton(
            tooltip: 'Open positions',
            icon: const Icon(Icons.account_balance_wallet_outlined, color: AppColors.accentLight),
            onPressed: _openPositionsDrawer,
          ),
          IconButton(
            tooltip: 'Layers',
            icon: const Icon(Icons.layers_outlined, color: Color(0xFF94A3B8)),
            onPressed: _openLayersSheet,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _searchController,
                  style: AppTypography.body(color: AppColors.white),
                  decoration: InputDecoration(
                    hintText: 'Search symbol…',
                    hintStyle: const TextStyle(color: Color(0xFF64748B)),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF64748B), size: 20),
                    filled: true,
                    fillColor: AppColors.darkSurface,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.darkBorder),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.darkBorder),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.accentLight),
                    ),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.arrow_forward, color: AppColors.accentLight, size: 18),
                      onPressed: () {
                        FocusScope.of(context).unfocus();
                        _loadSymbol(_searchController.text);
                      },
                    ),
                  ),
                  textInputAction: TextInputAction.search,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (v) {
                    FocusScope.of(context).unfocus();
                    _loadSymbol(v);
                  },
                ),
                if (results.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 160),
                    decoration: BoxDecoration(
                      color: AppColors.darkSurface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.darkBorder),
                    ),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: results.length,
                      separatorBuilder: (_, __) =>
                          const Divider(height: 1, color: AppColors.darkBorder),
                      itemBuilder: (_, i) {
                        final s = results[i];
                        return ListTile(
                          dense: true,
                          title: Text(s.symbol, style: AppTypography.secondary(color: AppColors.white)),
                          subtitle: Text(
                            s.name,
                            style: AppTypography.caption(color: const Color(0xFF64748B)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          trailing: Text(
                            '\$${s.price.toStringAsFixed(2)}',
                            style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                          ),
                          onTap: () {
                            _searchController.clear();
                            FocusScope.of(context).unfocus();
                            setState(() {});
                            _loadSymbol(s.symbol);
                          },
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                SizedBox(
                  height: 32,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _recentSymbols.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final sym = _recentSymbols[i];
                      final selected = sym == _symbol;
                      return GestureDetector(
                        onTap: () => _loadSymbol(sym),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: selected
                                ? AppColors.accentLight.withValues(alpha: 0.2)
                                : AppColors.darkSurface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: selected ? AppColors.accentLight : AppColors.darkBorder,
                            ),
                          ),
                          child: Text(
                            sym,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: selected ? AppColors.accentLight : const Color(0xFF94A3B8),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),

          // Symbol header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Text(_symbol, style: AppTypography.h2(color: AppColors.white)),
                const SizedBox(width: 10),
                if (_loading)
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accentLight),
                  )
                else ...[
                  Text(
                    price < 2 ? price.toStringAsFixed(4) : '\$${price.toStringAsFixed(2)}',
                    style: AppTypography.h3(color: AppColors.white),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${changePct >= 0 ? '+' : ''}${changePct.toStringAsFixed(2)}%',
                    style: AppTypography.caption(
                      color: changePct >= 0 ? AppColors.success : AppColors.danger,
                    ),
                  ),
                ],
                const Spacer(),
                TextButton.icon(
                  onPressed: _openLayersSheet,
                  icon: const Icon(Icons.layers, size: 16, color: AppColors.accentLight),
                  label: Text('Layers', style: AppTypography.caption(color: AppColors.accentLight)),
                ),
              ],
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: AppTypography.caption(color: AppColors.danger)),
            ),

          // Timeframes
          SizedBox(
            height: 36,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _timeframes.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, i) {
                final tf = _timeframes[i];
                final selected = tf == _timeframe;
                return ChoiceChip(
                  label: Text(tf, style: TextStyle(fontSize: 12, color: selected ? Colors.white : const Color(0xFF94A3B8))),
                  selected: selected,
                  selectedColor: AppColors.accentLight,
                  backgroundColor: AppColors.darkSurface,
                  side: BorderSide(color: selected ? AppColors.accentLight : AppColors.darkBorder),
                  onSelected: (_) => setState(() => _timeframe = tf),
                );
              },
            ),
          ),
          const SizedBox(height: 8),

          // Chart
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: TradingChartWidget(
                key: _chartKey,
                candles: candles,
                expand: true,
                timeframe: _timeframe,
                overlays: candles.isEmpty ? null : _buildOverlays(candles),
                overlayVisibility: Map.of(_layers),
              ),
            ),
          ),

          // BUY / SELL strip + Advanced
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              decoration: const BoxDecoration(
                color: AppColors.darkSurface,
                border: Border(top: BorderSide(color: AppColors.darkBorder)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: SizedBox(
                          height: 48,
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.success,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: price <= 0 ? null : () => _openOrderPanel('BUY'),
                            child: Text('BUY', style: AppTypography.h3(color: Colors.white)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: SizedBox(
                          height: 48,
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.danger,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: price <= 0 ? null : () => _openOrderPanel('SELL'),
                            child: Text('SELL', style: AppTypography.h3(color: Colors.white)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    height: 42,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.accentLight,
                        side: const BorderSide(color: AppColors.darkBorder),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: price <= 0 ? null : () => _openOrderPanel('BUY'),
                      child: const Text('Advanced → Order panel'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LayerDef {
  final String key;
  final String label;
  final String hint;
  const _LayerDef(this.key, this.label, this.hint);
}

class _PositionsDrawer extends StatelessWidget {
  final List<PositionData> positions;
  final VoidCallback onRefresh;

  const _PositionsDrawer({required this.positions, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: AppColors.darkBackground,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text('Open positions', style: AppTypography.h3(color: AppColors.white)),
                  ),
                  IconButton(
                    onPressed: onRefresh,
                    icon: const Icon(Icons.refresh, color: AppColors.accentLight, size: 20),
                  ),
                ],
              ),
            ),
            const Divider(color: AppColors.darkBorder, height: 1),
            Expanded(
              child: positions.isEmpty
                  ? Center(
                      child: Text(
                        'No open positions',
                        style: AppTypography.secondary(color: const Color(0xFF64748B)),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: positions.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final p = positions[i];
                        return Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.darkSurface,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppColors.darkBorder),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(p.symbol, style: AppTypography.secondary(color: AppColors.white)),
                                    Text(
                                      'Qty ${p.quantity}',
                                      style: AppTypography.caption(color: const Color(0xFF64748B)),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                'Avg \$${p.averageCost.toStringAsFixed(2)}',
                                style: AppTypography.caption(color: const Color(0xFF94A3B8)),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
