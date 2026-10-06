"""
SCOPED_EDGE operating policy for Global Brain inference.

Selectivity is proven; broad profitability is not. Enforce:
  - hard WIN-probability gate at 0.55
  - NGX + US stocks only (crypto/forex inference disabled)
  - paper mode until DECISION_GATE criteria are all green
"""

from __future__ import annotations

from typing import Any

# Matches holdout eval gate that cut losses -430% → -193%.
INFERENCE_MIN_WIN_PROB: float = 0.55

# Primary focus — NGX / African-linked equities (ngx-trend-follower pocket).
PAPER_PRIMARY_SYMBOLS: frozenset[str] = frozenset(
    {
        "DANGCEM.LG",
        "MTNN.LG",
        "GTCO.LG",
        "ZENITHBANK.LG",
        "AIRTELAFRI.LG",
        # Yahoo-reachable African proxies used in labelling today
        "AAF.L",
        "MTN.JO",
        "NPN.JO",
        "SHEL.L",
        "BP.L",
    }
)

# Secondary — US stocks (beats baselines; not yet profitable).
PAPER_SECONDARY_SYMBOLS: frozenset[str] = frozenset(
    {"AAPL", "MSFT", "SPY", "QQQ"}
)

PAPER_UNIVERSE: frozenset[str] = PAPER_PRIMARY_SYMBOLS | PAPER_SECONDARY_SYMBOLS

PAPER_ALLOWED_ASSET_CLASSES: frozenset[str] = frozenset({"STOCKS"})

# Explicit blocks — never act on these via Global Brain inference.
INFERENCE_BLOCKED_ASSET_CLASSES: frozenset[str] = frozenset({"CRYPTO", "FOREX"})

# Promotion criteria before live NGX inference (all must be green).
DECISION_GATE: dict[str, Any] = {
    "min_paper_trades_ngx_stocks": 500,
    "min_paper_hit_rate": 0.35,
    "min_paper_weeks_positive_pnl": 8,
    "min_walk_forward_windows_positive": 4,
    "min_walk_forward_windows_total": 6,
    "min_ngx_labelled_samples": 1000,
    "fee_round_trip": 0.002,
}


def is_inference_allowed(
    symbol: str,
    asset_class: str | None = None,
) -> tuple[bool, str]:
    """Return (allowed, reason). Crypto/forex and out-of-universe stocks are denied."""
    sym = (symbol or "").strip().upper()
    ac = (asset_class or "").strip().upper()

    if ac in INFERENCE_BLOCKED_ASSET_CLASSES:
        return False, f"asset_class {ac} disabled for inference (SCOPED_EDGE)"

    if ac and ac not in PAPER_ALLOWED_ASSET_CLASSES:
        return False, f"asset_class {ac} not in paper allow-list"

    universe_upper = {u.upper() for u in PAPER_UNIVERSE}
    if sym not in universe_upper:
        return False, f"{symbol} outside NGX/US paper universe"

    return True, "ok"


def passes_confidence_gate(
    win_prob: float, min_win_prob: float = INFERENCE_MIN_WIN_PROB
) -> bool:
    """Hard gate — every inference call must pass before acting."""
    return float(win_prob) >= float(min_win_prob)
