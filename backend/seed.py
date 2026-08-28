"""
Seed the database with active fleet shipments and score them.

Loads active.parquet, scores each shipment, and inserts into SQLite.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime

import pandas as pd

from backend.db import ShipmentDB, create_db_and_tables, get_session
from backend.recommend import generate_recommendation
from backend.scoring import ScoringEngine
from ml.config import DATA_DIR
from ml.features import FEATURE_NAMES

logger = logging.getLogger(__name__)


def seed_database(scoring_engine: ScoringEngine | None = None) -> int:
    """Seed the database with scored active fleet shipments.

    Args:
        scoring_engine: Pre-loaded scoring engine. If None, creates one.

    Returns number of shipments seeded.
    """
    print(f"\n{'='*60}")
    print("[SEED] Seeding database with active fleet")
    print(f"{'='*60}")

    # Create tables
    create_db_and_tables()

    # Load active fleet
    active_path = DATA_DIR / "active.parquet"
    if not active_path.exists():
        print(f"  ERROR: {active_path} not found. Run build_dataset.py first.")
        return 0

    df = pd.read_parquet(active_path)
    print(f"  Loaded {len(df):,} active shipments")

    # Load scoring engine if needed
    if scoring_engine is None:
        scoring_engine = ScoringEngine()
        if not scoring_engine.load_models():
            print("  ERROR: Failed to load models. Run train.py first.")
            return 0

    # Score and insert
    session = get_session()
    count = 0

    for _, row in df.iterrows():
        # Build feature dict
        feature_values = {}
        for feat in FEATURE_NAMES:
            if feat in row:
                feature_values[feat] = row[feat]

        # Score
        try:
            risk = scoring_engine.score_shipment(feature_values)
        except Exception as e:
            logger.warning(f"Scoring failed for {row['id']}: {e}")
            continue

        # Generate recommendation
        rec = generate_recommendation(
            score=risk["score"],
            band=risk["band"],
            breach_prob=risk["breach_probability"],
            drivers=risk.get("drivers", []),
            mode=row.get("mode", "GROUND"),
        )

        # Compute predicted delivery
        predicted_delivery = None
        if row.get("departed_at") and risk["predicted_delay_hours"] > 0:
            try:
                dep = datetime.fromisoformat(str(row["departed_at"]))
                transit_h = row.get("planned_transit_hours", 24)
                from datetime import timedelta
                predicted = dep + timedelta(hours=transit_h + risk["predicted_delay_hours"])
                predicted_delivery = predicted.isoformat()
            except Exception:
                pass

        # Create DB record
        shipment = ShipmentDB(
            id=row["id"],
            mode=row.get("mode", "GROUND"),
            status=row.get("status", "IN_TRANSIT"),
            carrier=row.get("carrier", "Unknown"),
            service_level=row.get("service_level", "STANDARD"),
            progress_pct=float(row.get("progress_pct", 0)),
            origin_code=row.get("origin_code", ""),
            origin_name=row.get("origin_name", ""),
            origin_lat=float(row.get("origin_lat", 0)),
            origin_lon=float(row.get("origin_lon", 0)),
            dest_code=row.get("dest_code", ""),
            dest_name=row.get("dest_name", ""),
            dest_lat=float(row.get("dest_lat", 0)),
            dest_lon=float(row.get("dest_lon", 0)),
            departed_at=str(row.get("departed_at", "")),
            promised_delivery=str(row.get("promised_delivery", "")),
            predicted_delivery=predicted_delivery,
            value_usd=float(row.get("value_usd", 0)),
            weight_kg=float(row.get("weight_kg", 0)),
            risk_score=risk["score"],
            risk_band=risk["band"],
            breach_probability=risk["breach_probability"],
            predicted_delay_hours=risk["predicted_delay_hours"],
            confidence=risk["confidence"],
            model_used=risk["model_used"],
            validation_status=risk["validation_status"],
            features_json=json.dumps(feature_values, default=str),
            drivers_json=json.dumps(risk.get("drivers", []), default=str),
            signals_json=None,  # Will be populated by live refresh
            recommendation_json=json.dumps(rec, default=str),
            updated_at=datetime.now().isoformat(),
        )

        session.merge(shipment)
        count += 1

    session.commit()
    session.close()

    print(f"  Seeded {count:,} shipments")
    print(f"  Database: risk_score.db")

    return count


if __name__ == "__main__":
    seed_database()
