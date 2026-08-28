"""
Scoring engine for Shipment Delivery Risk Score.

Loads trained models, applies them to shipments, and computes risk scores.
Uses the SAME feature schema from ml/features.py.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ml.config import ARTIFACTS_DIR, breach_prob_to_score, risk_band
from ml.features import CATEGORICAL_FEATURES, FEATURE_MAP, FEATURE_NAMES

logger = logging.getLogger(__name__)

MODELS_DIR = ARTIFACTS_DIR / "models"


class ScoringEngine:
    """Loads and applies ML models to score shipments."""

    def __init__(self) -> None:
        self._models: dict[str, dict] = {}
        self._loaded = False

    def load_models(self) -> bool:
        """Load all trained model sets. Returns True if successful."""
        for model_name in ["air", "surface"]:
            model_dir = MODELS_DIR / model_name
            if not model_dir.exists():
                logger.warning(f"Model directory not found: {model_dir}")
                continue

            try:
                clf = joblib.load(model_dir / "classifier.joblib")
                reg = joblib.load(model_dir / "regressor.joblib")
                encoders = joblib.load(model_dir / "encoders.joblib")

                explainer = None
                explainer_path = model_dir / "shap_explainer.joblib"
                if explainer_path.exists():
                    try:
                        explainer = joblib.load(explainer_path)
                    except Exception as e:
                        logger.warning(f"Failed to load SHAP explainer for {model_name}: {e}")

                self._models[model_name] = {
                    "classifier": clf,
                    "regressor": reg,
                    "encoders": encoders,
                    "explainer": explainer,
                }
                logger.info(f"Loaded model set: {model_name}")
            except Exception as e:
                logger.error(f"Failed to load model {model_name}: {e}")

        self._loaded = len(self._models) > 0
        return self._loaded

    @property
    def models_loaded(self) -> bool:
        return self._loaded

    def _select_model(self, mode: str) -> str:
        """Select model set based on transport mode."""
        if mode == "AIR" and "air" in self._models:
            return "air"
        return "surface" if "surface" in self._models else list(self._models.keys())[0]

    def _prepare_features(self, feature_values: dict) -> pd.DataFrame:
        """Build feature DataFrame from a dict of values."""
        row = {}
        for feat_name in FEATURE_NAMES:
            row[feat_name] = feature_values.get(feat_name, 0)
        return pd.DataFrame([row])

    def _encode_categoricals(self, df: pd.DataFrame, encoders: dict) -> pd.DataFrame:
        """Encode categorical features using stored encoders."""
        df = df.copy()
        for col in CATEGORICAL_FEATURES:
            if col not in df.columns:
                df[col] = "UNKNOWN"
            if col in encoders:
                le = encoders[col]
                df[col] = df[col].astype(str).map(
                    lambda x, _le=le: (
                        _le.transform([x])[0] if x in _le.classes_ else 0
                    )
                )
            else:
                df[col] = 0
        return df

    def _get_shap_drivers(self, model_name: str, X: np.ndarray,
                           feature_values: dict, top_n: int = 3) -> list[dict]:
        """Get top N SHAP-based drivers for a prediction."""
        model = self._models.get(model_name, {})
        explainer = model.get("explainer")
        if explainer is None:
            return []

        try:
            shap_values = explainer.shap_values(X.reshape(1, -1))
            if isinstance(shap_values, list):
                vals = shap_values[1][0]
            else:
                vals = shap_values[0]

            abs_vals = np.abs(vals)
            top_idx = abs_vals.argsort()[-top_n:][::-1]

            drivers = []
            for idx in top_idx:
                feat_name = FEATURE_NAMES[idx]
                feat_def = FEATURE_MAP.get(feat_name)
                feat_val = feature_values.get(feat_name, 0)

                direction = "increases" if vals[idx] > 0 else "decreases"
                label = feat_def.label if feat_def else feat_name

                try:
                    explanation = feat_def.explanation_template.format(value=feat_val) if feat_def else f"{feat_name}={feat_val}"
                except Exception:
                    explanation = f"{label}: {feat_val}"

                drivers.append({
                    "feature": feat_name,
                    "label": label,
                    "value": round(float(feat_val), 4),
                    "contribution": round(float(abs(vals[idx])), 4),
                    "direction": direction,
                    "explanation": explanation,
                })

            return drivers
        except Exception as e:
            logger.warning(f"SHAP computation failed: {e}")
            return []

    def score_shipment(self, feature_values: dict) -> dict:
        """Score a single shipment.

        Args:
            feature_values: dict of feature name -> value

        Returns dict with score, band, breach_probability, predicted_delay_hours,
        confidence, model_used, validation_status, drivers.
        """
        if not self._loaded:
            raise RuntimeError("Models not loaded. Call load_models() first.")

        mode = feature_values.get("mode", "GROUND")
        model_name = self._select_model(mode)
        model = self._models[model_name]

        # Prepare features
        X_df = self._prepare_features(feature_values)
        X_df = self._encode_categoricals(X_df, model["encoders"])
        X_df = X_df.fillna(0)
        X = X_df.values.astype(float)

        # Classify
        clf = model["classifier"]
        p_breach = float(clf.predict_proba(X)[0][1])

        # Regress
        reg = model["regressor"]
        pred_delay_min = float(reg.predict(X)[0])
        pred_delay_hours = max(0, pred_delay_min / 60.0)

        # Score
        score = breach_prob_to_score(p_breach)
        band = risk_band(score)

        # SHAP drivers
        drivers = self._get_shap_drivers(model_name, X[0], feature_values, top_n=3)

        # Confidence: use calibration quality (proxy)
        confidence = round(min(0.95, 0.5 + abs(p_breach - 0.5) * 0.9), 2)

        # Validation status
        validation = "validated_on_real_data" if model_name == "air" else "simulated"

        return {
            "score": score,
            "band": band,
            "breach_probability": round(p_breach, 4),
            "predicted_delay_hours": round(pred_delay_hours, 2),
            "confidence": confidence,
            "model_used": model_name.upper(),
            "validation_status": validation,
            "drivers": drivers,
        }

    def score_batch(self, shipments: list[dict]) -> list[dict]:
        """Score a batch of shipments. Returns list of risk dicts."""
        return [self.score_shipment(s) for s in shipments]
