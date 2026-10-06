"""Global Brain — transformer foundation model for V2 Personal Agents."""

from __future__ import annotations

import torch
import torch.nn as nn


class GlobalBrain(nn.Module):
    """
    Foundation model trained on labelled market samples.

    Input:  (batch, seq_len, input_dim) feature sequences
    Output: action logits (BUY/SELL/HOLD) + confidence score
    """

    def __init__(
        self,
        input_dim: int = 14,
        d_model: int = 128,
        nhead: int = 4,
        num_layers: int = 3,
        dropout: float = 0.1,
        seq_len: int = 60,
        num_classes: int = 2,  # WIN or LOSS only
    ) -> None:
        super().__init__()
        self.seq_len = seq_len
        self.input_dim = input_dim
        self.num_classes = num_classes

        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_encoding = nn.Embedding(seq_len, d_model)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        self.action_head = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes),
        )
        self.confidence_head = nn.Sequential(
            nn.Linear(d_model, d_model // 4),
            nn.ReLU(),
            nn.Linear(d_model // 4, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        x: (batch_size, seq_len, input_dim)
        Returns action_logits (B, num_classes), confidence (B, 1)
        """
        _batch, seq_len, _ = x.shape
        x = self.input_proj(x)
        positions = torch.arange(seq_len, device=x.device).unsqueeze(0)
        x = x + self.pos_encoding(positions)
        x = self.transformer(x)
        x_last = x[:, -1, :]
        return self.action_head(x_last), self.confidence_head(x_last)
