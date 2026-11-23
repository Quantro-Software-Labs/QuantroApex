"""
Cross-check test asserting that services/data-pipeline primary crypto cost constants
match the services/api-gateway crypto SIM defaults exactly.
"""

import re
from pathlib import Path
import pytest

from config import (
    PRIMARY_CRYPTO_FEE_BPS,
    PRIMARY_CRYPTO_HALF_SPREAD_BPS,
    PRIMARY_CRYPTO_SLIPPAGE_BPS,
    PRIMARY_CRYPTO_COST_PER_SIDE,
    PRIMARY_CRYPTO_ROUND_TRIP_COST,
    settings,
)


def test_cost_constants_match_gateway_defaults():
    # 1. Pipeline constants check
    assert PRIMARY_CRYPTO_FEE_BPS == 25.0, "Crypto fee per side must be 25 bps (0.25%)"
    assert PRIMARY_CRYPTO_HALF_SPREAD_BPS == 5.0, "Crypto half-spread must be 5 bps (0.05%)"
    assert PRIMARY_CRYPTO_SLIPPAGE_BPS == 10.0, "Crypto slippage per side must be 10 bps (0.10%)"

    expected_per_side = 0.0040  # 40 bps
    expected_round_trip = 0.0080  # 80 bps
    assert abs(PRIMARY_CRYPTO_COST_PER_SIDE - expected_per_side) < 1e-7
    assert abs(PRIMARY_CRYPTO_ROUND_TRIP_COST - expected_round_trip) < 1e-7

    # 2. Inspect services/api-gateway/src/config/index.ts
    repo_root = Path(__file__).resolve().parents[3]
    gateway_config_path = repo_root / "services" / "api-gateway" / "src" / "config" / "index.ts"
    assert gateway_config_path.exists(), f"Gateway config not found at {gateway_config_path}"

    config_content = gateway_config_path.read_text(encoding="utf-8")

    # Match crypto spread and slippage defaults in config/index.ts
    # halfSpreadBps: parseFloat(process.env.CRYPTO_HALF_SPREAD_BPS ?? '5.0')
    half_spread_match = re.search(r"CRYPTO_HALF_SPREAD_BPS\s*\?\?\s*['\"]([\d\.]+)['\"]", config_content)
    assert half_spread_match is not None, "Could not find CRYPTO_HALF_SPREAD_BPS default in gateway config"
    gateway_crypto_half_spread = float(half_spread_match.group(1))
    assert gateway_crypto_half_spread == PRIMARY_CRYPTO_HALF_SPREAD_BPS

    # slippageBps: parseFloat(process.env.CRYPTO_SLIPPAGE_BPS ?? '10.0')
    slippage_match = re.search(r"CRYPTO_SLIPPAGE_BPS\s*\?\?\s*['\"]([\d\.]+)['\"]", config_content)
    assert slippage_match is not None, "Could not find CRYPTO_SLIPPAGE_BPS default in gateway config"
    gateway_crypto_slippage = float(slippage_match.group(1))
    assert gateway_crypto_slippage == PRIMARY_CRYPTO_SLIPPAGE_BPS

    # 3. Inspect services/api-gateway/src/lib/broker/sim_broker.ts
    sim_broker_path = repo_root / "services" / "api-gateway" / "src" / "lib" / "broker" / "sim_broker.ts"
    assert sim_broker_path.exists(), f"SimBroker file not found at {sim_broker_path}"

    sim_broker_content = sim_broker_path.read_text(encoding="utf-8")
    # Match default crypto taker fee (0.0025)
    # : 0.0025); // 0.25% default
    fee_match = re.search(r"SIM_CRYPTO_TAKER_FEE_PCT.*?:\s*([\d\.]+)\s*\)", sim_broker_content, re.DOTALL)
    assert fee_match is not None, "Could not find SIM_CRYPTO_TAKER_FEE_PCT default in SimBroker"
    gateway_taker_fee_frac = float(fee_match.group(1))
    assert abs(gateway_taker_fee_frac - (PRIMARY_CRYPTO_FEE_BPS / 10000.0)) < 1e-7

    # 4. Settings verification
    assert settings.fee_bps_crypto == 25.0
    assert settings.half_spread_bps_crypto == 5.0
    assert settings.slippage_bps_crypto == 10.0
