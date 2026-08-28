"""
Abstract base class for all risk signal providers.

Every provider must implement:
  - name: str
  - is_live: bool
  - fetch(): async method returning signal data
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class RiskSignalProvider(ABC):
    """Base class for live risk signal providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name."""
        ...

    @property
    @abstractmethod
    def is_live(self) -> bool:
        """Whether this provider is currently returning live data."""
        ...

    @abstractmethod
    async def fetch(self, lat: float, lon: float, location_code: str,
                    **kwargs: Any) -> dict:
        """Fetch signal data for a location.

        Returns dict with at minimum:
          - severity: float 0-1
          - is_live: bool
          - source: str
          - detail: str
        """
        ...

    async def health_check(self) -> dict:
        """Check provider health. Override for custom checks."""
        return {"name": self.name, "is_live": self.is_live, "status": "ok"}
