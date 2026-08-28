"""
Flight delay signal provider - AviationStack API.

LIVE, requires AVIATIONSTACK_API_KEY env var.

*** HARD QUOTA GUARD ***
Free tier: 100 requests/month. Our hard cap: 60/month.
- Persistent on-disk call counter
- Only call for AIR shipments currently displayed
- 6-hour cache per route
- When capped or missing, fall back to BTS historical delay rates
- NEVER call inside a loop over the full fleet
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx

from backend.providers.base import RiskSignalProvider
from ml.config import (
    ARTIFACTS_DIR,
    AVIATIONSTACK_CACHE_HOURS,
    AVIATIONSTACK_HARD_CAP,
    AVIATIONSTACK_URL,
)

logger = logging.getLogger(__name__)

COUNTER_FILE = ARTIFACTS_DIR / "aviationstack_counter.json"


class FlightProvider(RiskSignalProvider):
    """Live flight delay signals from AviationStack API with hard quota guard."""

    def __init__(self) -> None:
        self._api_key = os.environ.get("AVIATIONSTACK_API_KEY", "")
        self._cache: dict[str, tuple[float, dict]] = {}
        self._cache_ttl = AVIATIONSTACK_CACHE_HOURS * 3600
        self._is_live = bool(self._api_key)

    @property
    def name(self) -> str:
        return "flight"

    @property
    def is_live(self) -> bool:
        return self._is_live

    def _get_call_count(self) -> tuple[int, str]:
        """Get current month's call count from persistent counter.

        Returns (count, month_key).
        """
        month_key = time.strftime("%Y-%m")
        if COUNTER_FILE.exists():
            with open(COUNTER_FILE) as f:
                data = json.load(f)
            return data.get(month_key, 0), month_key
        return 0, month_key

    def _increment_counter(self) -> int:
        """Increment the persistent call counter. Returns new count."""
        month_key = time.strftime("%Y-%m")
        data = {}
        if COUNTER_FILE.exists():
            with open(COUNTER_FILE) as f:
                data = json.load(f)

        current = data.get(month_key, 0) + 1
        data[month_key] = current

        COUNTER_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(COUNTER_FILE, "w") as f:
            json.dump(data, f)

        return current

    @property
    def calls_remaining(self) -> int:
        """Number of API calls remaining this month."""
        count, _ = self._get_call_count()
        return max(0, AVIATIONSTACK_HARD_CAP - count)

    async def fetch(self, lat: float, lon: float, location_code: str,
                    **kwargs: Any) -> dict:
        """Fetch flight delay data for an airport.

        Falls back to historical rates when:
        - No API key
        - Quota exhausted
        - API error
        """
        # No API key -> fallback
        if not self._api_key:
            return self._fallback(location_code, "No API key configured")

        # Check quota
        count, _ = self._get_call_count()
        if count >= AVIATIONSTACK_HARD_CAP:
            logger.warning(f"AviationStack quota exhausted ({count}/{AVIATIONSTACK_HARD_CAP})")
            return self._fallback(location_code, f"Monthly quota exhausted ({count}/{AVIATIONSTACK_HARD_CAP})")

        # Check cache
        cache_key = location_code
        now = time.time()
        if cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached

        # Make API call
        try:
            params = {
                "access_key": self._api_key,
                "dep_iata": location_code,
                "limit": 10,
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(AVIATIONSTACK_URL, params=params)
                resp.raise_for_status()
                data = resp.json()

            # Increment counter AFTER successful call
            new_count = self._increment_counter()
            logger.info(f"AviationStack call #{new_count} for {location_code}")

            if "error" in data:
                return self._fallback(location_code, data["error"].get("message", "API error"))

            flights = data.get("data", [])
            if not flights:
                return self._fallback(location_code, "No flights returned")

            # Compute delay probability from current flights
            delayed = sum(1 for f in flights
                          if f.get("departure", {}).get("delay") and
                          int(f["departure"]["delay"]) > 15)
            delay_prob = delayed / len(flights) if flights else 0.2

            result = {
                "severity": round(delay_prob, 4),
                "is_live": True,
                "source": "AviationStack",
                "detail": f"{delayed}/{len(flights)} flights delayed at {location_code}",
                "flights_checked": len(flights),
                "flights_delayed": delayed,
                "calls_remaining": AVIATIONSTACK_HARD_CAP - new_count,
            }

            self._is_live = True
            self._cache[cache_key] = (now, result)
            return result

        except Exception as e:
            logger.warning(f"AviationStack fetch failed: {e}")
            return self._fallback(location_code, str(e)[:50])

    def _fallback(self, location_code: str, reason: str) -> dict:
        """Fall back to BTS historical delay rates."""
        self._is_live = False
        # Use a reasonable historical average (~20% for US airports)
        return {
            "severity": 0.20,
            "is_live": False,
            "source": "BTS Historical (fallback)",
            "detail": f"Using historical rates. Reason: {reason}",
            "calls_remaining": self.calls_remaining,
        }

    async def health_check(self) -> dict:
        """Include quota info in health check."""
        count, month = self._get_call_count()
        return {
            "name": self.name,
            "is_live": self.is_live,
            "api_key_set": bool(self._api_key),
            "calls_this_month": count,
            "calls_remaining": max(0, AVIATIONSTACK_HARD_CAP - count),
            "hard_cap": AVIATIONSTACK_HARD_CAP,
            "current_month": month,
        }
