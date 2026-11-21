"""Tests for holdout locking and audited access logging."""

import os
from pathlib import Path
import pytest
from evaluation.metrics import guard_holdout_access


def test_holdout_guard_refuses_without_flag(tmp_path):
    log_file = tmp_path / "holdout_access.log"

    # Must raise PermissionError when allow_holdout is False
    with pytest.raises(PermissionError, match="Final holdout access is locked"):
        guard_holdout_access(
            allow_holdout=False,
            caller="test_runner",
            log_path=str(log_file),
        )

    # Log file should not exist or be empty
    assert not log_file.exists()


def test_holdout_guard_allows_and_logs_with_flag(tmp_path):
    log_file = tmp_path / "holdout_access.log"

    # When allow_holdout is True, should not raise and should write log
    guard_holdout_access(
        allow_holdout=True,
        caller="researcher_alice",
        reason="Final acceptance audit",
        log_path=str(log_file),
    )

    assert log_file.exists()
    content = log_file.read_text(encoding="utf-8")
    assert "Holdout accessed" in content
    assert "caller=researcher_alice" in content
    assert "reason=Final acceptance audit" in content
