"""
Sutures cost calculator — built-in pricing for common LLM models.

Best-effort: unknown models default to $0. Pricing is per 1M tokens.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ModelPricing:
    """Per-million-token pricing for a model."""

    input_per_million: float
    output_per_million: float


# ---------------------------------------------------------------------------
# Built-in pricing table (USD per 1M tokens)
# ---------------------------------------------------------------------------

MODEL_PRICING: dict[str, ModelPricing] = {
    # Anthropic
    "claude-sonnet-4-20250514": ModelPricing(3.00, 15.00),
    "claude-opus-4-20250514": ModelPricing(15.00, 75.00),
    "claude-haiku-4-5-20251001": ModelPricing(0.80, 4.00),
    # Common aliases
    "claude-3-5-sonnet": ModelPricing(3.00, 15.00),
    "claude-3-opus": ModelPricing(15.00, 75.00),
    "claude-3-5-haiku": ModelPricing(0.80, 4.00),
    # OpenAI
    "gpt-4o": ModelPricing(2.50, 10.00),
    "gpt-4o-mini": ModelPricing(0.15, 0.60),
    "gpt-4-turbo": ModelPricing(10.00, 30.00),
    "gpt-4": ModelPricing(30.00, 60.00),
    "gpt-3.5-turbo": ModelPricing(0.50, 1.50),
    "o1": ModelPricing(15.00, 60.00),
    "o1-mini": ModelPricing(3.00, 12.00),
    "o3-mini": ModelPricing(1.10, 4.40),
    # Google
    "gemini-1.5-pro": ModelPricing(3.50, 10.50),
    "gemini-1.5-flash": ModelPricing(0.075, 0.30),
    "gemini-2.0-flash": ModelPricing(0.10, 0.40),
    # Meta (via API providers)
    "llama-3.1-405b": ModelPricing(3.00, 3.00),
    "llama-3.1-70b": ModelPricing(0.80, 0.80),
    "llama-3.1-8b": ModelPricing(0.10, 0.10),
}

# Zero pricing sentinel for unknown models
_ZERO_PRICING = ModelPricing(0.0, 0.0)


class CostCalculator:
    """Tracks cumulative cost across an agent's lifetime.

    Thread-safe for single-agent use. For multi-agent, each agent gets its own
    calculator instance.
    """

    def __init__(self, custom_pricing: dict[str, ModelPricing] | None = None) -> None:
        self._cumulative_cost_usd: float = 0.0
        self._cumulative_tokens: int = 0
        self._custom_pricing: dict[str, ModelPricing] = custom_pricing or {}

    @property
    def cumulative_cost_usd(self) -> float:
        return self._cumulative_cost_usd

    @property
    def cumulative_tokens(self) -> int:
        return self._cumulative_tokens

    def get_pricing(self, model: str) -> ModelPricing:
        """Look up pricing for a model. Falls back to $0 for unknown models."""
        # Check custom pricing first
        if model in self._custom_pricing:
            return self._custom_pricing[model]
        # Check built-in table
        if model in MODEL_PRICING:
            return MODEL_PRICING[model]
        # Try partial match (e.g., "gpt-4o-2024-08-06" matches "gpt-4o")
        for known_model, pricing in MODEL_PRICING.items():
            if model.startswith(known_model):
                return pricing
        return _ZERO_PRICING

    def calculate(self, model: str, input_tokens: int, output_tokens: int) -> CostResult:
        """Calculate cost for a single API call and update cumulative totals."""
        pricing = self.get_pricing(model)
        input_cost = (input_tokens / 1_000_000) * pricing.input_per_million
        output_cost = (output_tokens / 1_000_000) * pricing.output_per_million
        call_cost = input_cost + output_cost
        total_tokens = input_tokens + output_tokens

        self._cumulative_cost_usd += call_cost
        self._cumulative_tokens += total_tokens

        return CostResult(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost_usd=round(call_cost, 8),
            cumulative_cost_usd=round(self._cumulative_cost_usd, 8),
        )

    def reset(self) -> None:
        """Reset cumulative counters."""
        self._cumulative_cost_usd = 0.0
        self._cumulative_tokens = 0


@dataclass(frozen=True)
class CostResult:
    """Result of a cost calculation."""

    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_usd: float
    cumulative_cost_usd: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "cost_usd": self.cost_usd,
            "cumulative_cost_usd": self.cumulative_cost_usd,
        }
