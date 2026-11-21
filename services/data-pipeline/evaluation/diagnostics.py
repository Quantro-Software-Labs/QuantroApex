"""
Diagnostics for ML model and rule baselines.

Provides granular post-evaluation visibility into:
1. Breakdown by setup type (SMC rule families)
2. Breakdown by trade direction (LONG / SHORT / BUY)
3. Breakdown by symbol (BTCUSDT, ETHUSDT, etc.)
4. Breakdown by timeframe (1h, 4h, etc.)
5. Model calibration: predicted probability buckets vs realised out-of-sample win rate
6. Turnover and total execution costs paid as a percentage of gross PnL.
"""

from __future__ import annotations

from typing import Any
import numpy as np


def _slice_metrics(samples: list[dict[str, Any]], fee_round_trip: float) -> dict[str, Any]:
    n = len(samples)
    if n == 0:
        return {
            "trades": 0,
            "win_rate": 0.0,
            "avg_return_pct": 0.0,
            "total_return_pct": 0.0,
        }
    rets = [float(s.get("pnl_pct", 0.0)) - fee_round_trip for s in samples]
    wins = sum(1 for r in rets if r > 0)
    return {
        "trades": n,
        "win_rate": float(wins / n),
        "avg_return_pct": float(np.mean(rets) * 100.0),
        "total_return_pct": float(np.sum(rets) * 100.0),
    }


def compute_diagnostics(
    test_samples: list[dict[str, Any]],
    model_preds: list[int],
    win_probs: list[float],
    fee_round_trip: float,
) -> dict[str, Any]:
    """
    Compute full diagnostics comparing rule-only and model out-of-sample trades.
    """
    assert len(test_samples) == len(model_preds) == len(win_probs)

    # Annotate samples with model decision and prob
    annotated: list[dict[str, Any]] = []
    for s, take, prob in zip(test_samples, model_preds, win_probs):
        item = dict(s)
        item["_take"] = take
        item["_prob"] = prob
        features = item.get("features", {}) or {}
        # Determine setup type from SMC features or strategy_id
        setup = features.get("smc_structure") or item.get("strategy_id") or "STANDARD"
        if features.get("smc_ob_count", 0) > 0:
            setup = f"{setup}_OB"
        elif features.get("smc_fvg_count", 0) > 0:
            setup = f"{setup}_FVG"
        item["_setup_type"] = setup
        annotated.append(item)

    model_samples = [s for s in annotated if s["_take"] == 1]

    # Helper for grouped breakdown
    def breakdown(group_key: str) -> dict[str, Any]:
        groups: set[str] = {str(s.get(group_key, "UNKNOWN")) for s in annotated}
        out: dict[str, Any] = {}
        for g in sorted(groups):
            rule_subset = [s for s in annotated if str(s.get(group_key, "UNKNOWN")) == g]
            model_subset = [s for s in model_samples if str(s.get(group_key, "UNKNOWN")) == g]
            out[g] = {
                "rule_only": _slice_metrics(rule_subset, fee_round_trip),
                "model": _slice_metrics(model_subset, fee_round_trip),
            }
        return out

    by_setup = breakdown("_setup_type")
    by_direction = breakdown("direction")
    by_symbol = breakdown("symbol")
    by_timeframe = breakdown("timeframe")

    # Calibration buckets: [0.50, 0.55), [0.55, 0.60), [0.60, 0.65), [0.65, 0.70), [0.70, 1.00]
    buckets = [
        (0.50, 0.55),
        (0.55, 0.60),
        (0.60, 0.65),
        (0.65, 0.70),
        (0.70, 1.00),
    ]
    calibration: list[dict[str, Any]] = []
    for low, high in buckets:
        in_b = [
            s for s in annotated
            if low <= s["_prob"] < high or (high == 1.00 and s["_prob"] == 1.00)
        ]
        count = len(in_b)
        if count == 0:
            calibration.append({
                "bucket": f"[{low:.2f}, {high:.2f})",
                "count": 0,
                "mean_pred_prob": 0.0,
                "realised_win_rate": 0.0,
            })
        else:
            mean_p = float(np.mean([s["_prob"] for s in in_b]))
            wins = sum(1 for s in in_b if (float(s.get("pnl_pct", 0.0)) - fee_round_trip) > 0)
            calibration.append({
                "bucket": f"[{low:.2f}, {high:.2f})",
                "count": count,
                "mean_pred_prob": round(mean_p, 4),
                "realised_win_rate": round(wins / count, 4),
            })

    # Turnover & Cost Impact
    gross_pnls = [float(s.get("pnl_pct", 0.0)) for s in model_samples]
    total_gross = float(np.sum(gross_pnls)) * 100.0 if gross_pnls else 0.0
    total_costs = float(len(model_samples) * fee_round_trip) * 100.0
    net_pnl = total_gross - total_costs
    cost_as_pct_gross = (
        float(abs(total_costs / total_gross) * 100.0) if abs(total_gross) > 1e-6 else 0.0
    )

    return {
        "by_setup_type": by_setup,
        "by_direction": by_direction,
        "by_symbol": by_symbol,
        "by_timeframe": by_timeframe,
        "calibration": calibration,
        "turnover_and_costs": {
            "model_trades_taken": len(model_samples),
            "rule_trades_available": len(annotated),
            "total_gross_pnl_pct": round(total_gross, 2),
            "total_costs_paid_pct": round(total_costs, 2),
            "net_pnl_pct": round(net_pnl, 2),
            "costs_as_pct_of_gross_pnl": round(cost_as_pct_gross, 2),
        },
    }
