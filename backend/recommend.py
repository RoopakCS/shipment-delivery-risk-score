"""
LLM recommendation engine.

Fallback chain: fine-tuned model -> base flan-t5-base -> templated text.
Always exposes generated_by so we never overclaim.

NOTE: LLM training is deferred to a later pass. This module implements
the templated fallback only.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# Action -> urgency mapping
ACTION_URGENCY = {
    "REROUTE": "IMMEDIATE",
    "EXPEDITE": "IMMEDIATE",
    "NOTIFY_CUSTOMER": "HIGH",
    "REBOOK_CARRIER": "HIGH",
    "ADD_BUFFER": "MEDIUM",
    "RESEQUENCE_HUB": "MEDIUM",
    "MONITOR": "LOW",
}


def _select_action(score: float, band: str, drivers: list[dict]) -> str:
    """Select recommended action based on risk score and drivers."""
    if band == "CRITICAL":
        # Check top driver for specific recommendations
        if drivers:
            top_feat = drivers[0].get("feature", "")
            if "weather" in top_feat:
                return "REROUTE"
            if "port" in top_feat or "congestion" in top_feat:
                return "EXPEDITE"
            if "carrier" in top_feat:
                return "REBOOK_CARRIER"
        return "REROUTE"
    elif band == "HIGH":
        if drivers:
            top_feat = drivers[0].get("feature", "")
            if "weather" in top_feat:
                return "REROUTE"
            if "traffic" in top_feat:
                return "RESEQUENCE_HUB"
        return "NOTIFY_CUSTOMER"
    elif band == "MEDIUM":
        return "ADD_BUFFER"
    else:
        return "MONITOR"


def _generate_headline(action: str, drivers: list[dict], mode: str) -> str:
    """Generate a one-line headline for the recommendation."""
    top_driver = drivers[0]["label"] if drivers else "multiple factors"
    headlines = {
        "REROUTE": f"Reroute {mode.lower()} shipment to avoid {top_driver.lower()} impact",
        "EXPEDITE": f"Expedite processing to offset {top_driver.lower()} delays",
        "NOTIFY_CUSTOMER": f"Alert customer: {top_driver.lower()} may cause delivery delay",
        "REBOOK_CARRIER": f"Rebook with alternative carrier due to {top_driver.lower()}",
        "ADD_BUFFER": f"Add schedule buffer to account for {top_driver.lower()}",
        "RESEQUENCE_HUB": f"Resequence hub operations to mitigate {top_driver.lower()}",
        "MONITOR": f"Continue monitoring {top_driver.lower()} conditions",
    }
    return headlines.get(action, f"Take action for {top_driver}")


def _generate_detail(action: str, drivers: list[dict],
                      score: float, breach_prob: float) -> str:
    """Generate a 2-sentence justification."""
    reasons = ", ".join(d["label"].lower() for d in drivers[:3]) if drivers else "current conditions"
    prob_pct = f"{breach_prob:.0%}"

    details = {
        "REROUTE": (
            f"Current risk factors ({reasons}) give a {prob_pct} probability of SLA breach. "
            f"Alternative routing should be evaluated immediately to protect delivery commitment."
        ),
        "EXPEDITE": (
            f"With {reasons} contributing to elevated risk (breach probability {prob_pct}), "
            f"expedited handling at the next hub will help recover the schedule."
        ),
        "NOTIFY_CUSTOMER": (
            f"Risk score of {score}/10 driven by {reasons} indicates likely delay. "
            f"Proactive customer notification will improve service perception."
        ),
        "REBOOK_CARRIER": (
            f"Current carrier performance combined with {reasons} creates {prob_pct} breach risk. "
            f"Rebooking with a higher-reliability carrier is recommended."
        ),
        "ADD_BUFFER": (
            f"Moderate risk from {reasons} suggests adding time buffer. "
            f"This precautionary measure should prevent SLA breach (probability: {prob_pct})."
        ),
        "RESEQUENCE_HUB": (
            f"Hub congestion amplified by {reasons} warrants priority handling. "
            f"Resequencing this shipment in hub operations will reduce delay risk."
        ),
        "MONITOR": (
            f"Risk is currently manageable with {reasons} as primary factors. "
            f"Continue monitoring; escalate if conditions deteriorate."
        ),
    }
    return details.get(action, f"Risk score {score}/10 with {prob_pct} breach probability.")


def generate_recommendation(
    score: float,
    band: str,
    breach_prob: float,
    drivers: list[dict],
    mode: str = "AIR",
) -> dict:
    """Generate a recommendation using the fallback template engine.

    Returns dict matching RecommendationSchema:
      action, urgency, headline, detail, generated_by
    """
    action = _select_action(score, band, drivers)
    urgency = ACTION_URGENCY.get(action, "MEDIUM")
    headline = _generate_headline(action, drivers, mode)
    detail = _generate_detail(action, drivers, score, breach_prob)

    return {
        "action": action,
        "urgency": urgency,
        "headline": headline,
        "detail": detail,
        "generated_by": "template_engine",
    }
