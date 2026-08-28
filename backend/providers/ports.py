"""
Port congestion signal provider - HYBRID.

Combines:
  - Real dwell baseline CSV (static, is_live=false)
  - Live GDELT news disruption score for ports
"""
from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from backend.providers.base import RiskSignalProvider
from backend.providers.news import NewsProvider
from ml.config import DATA_DIR

logger = logging.getLogger(__name__)

PORT_DWELL_CSV = DATA_DIR / "port_dwell.csv"


class PortsProvider(RiskSignalProvider):
    """Hybrid port congestion signals: static dwell + live news."""

    def __init__(self, news_provider: NewsProvider) -> None:
        self._news = news_provider
        self._dwell_map: dict[str, float] = {}
        self._load_baseline()

    def _load_baseline(self) -> None:
        """Load static port dwell times."""
        try:
            df = pd.read_csv(PORT_DWELL_CSV, comment='#')
            self._dwell_map = dict(zip(df["port_code"], df["median_dwell_days"]))
        except Exception as e:
            logger.warning(f"Failed to load port dwell CSV: {e}")
            self._dwell_map = {}

    @property
    def name(self) -> str:
        return "ports"

    @property
    def is_live(self) -> bool:
        return self._news.is_live  # Live if news component is live

    async def fetch(self, lat: float, lon: float, location_code: str,
                    **kwargs: Any) -> dict:
        """Fetch port congestion signal combining baseline + live news."""
        dwell = self._dwell_map.get(location_code, 3.5)
        dwell_score = min(1.0, dwell / 7.0)

        # Get live news component
        port_name = kwargs.get("location_name", location_code)
        news_result = await self._news.fetch(lat, lon, location_code,
                                              location_name=f"{port_name} port")
        news_severity = news_result.get("severity", 0)

        # Combined
        severity = round(0.6 * dwell_score + 0.4 * news_severity, 4)

        return {
            "severity": severity,
            "is_live": news_result.get("is_live", False),
            "source": "Port Authority + GDELT",
            "detail": f"Dwell: {dwell:.1f} days, News risk: {news_severity:.2f}",
            "dwell_days": dwell,
            "news_severity": news_severity,
            "dwell_is_live": False,
            "news_is_live": news_result.get("is_live", False),
        }
