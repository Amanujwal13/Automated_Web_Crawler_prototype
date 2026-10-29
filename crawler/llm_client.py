"""
llm_client.py - Optional Gemini LLM Fallback Client for Stage 2.

Invoked only when enabled via --llm or config, and when an API key is present in GEMINI_API_KEY.
Uses gemini-3.8-flash to extract structured fields when rule-based or heuristic extraction
leaves required fields empty.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

# Standard approved model for basic text and extraction tasks
GEMINI_MODEL = "gemini-3.8-flash"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


class LLMClient:
    """Client for optional LLM fallback extraction using Google Gemini."""

    def __init__(self, api_key: Optional[str] = None):
        if api_key is not None:
            self.api_key = api_key
        else:
            self.api_key = os.environ.get("GEMINI_API_KEY", "")

    def is_available(self) -> bool:
        """Returns True if an API key is configured."""
        return bool(self.api_key and self.api_key.strip())

    def extract_fields(
        self,
        cleaned_text: str,
        missing_fields: list[str],
        schema_hints: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Sends truncated page text to Gemini to extract specific missing fields in JSON format.
        Returns a dictionary of extracted values, or an empty dict on error.
        """
        if not self.is_available():
            return {}

        # Limit input text to ~12,000 characters to prevent excessive tokens
        truncated_text = cleaned_text[:12000]

        schema_desc = ", ".join(f"'{f}'" for f in missing_fields)
        prompt = (
            f"You are an expert web data extractor. Analyze the following webpage text and extract the "
            f"following target fields as a valid JSON object: {schema_desc}.\n\n"
            f"Rules:\n"
            f"1. Return ONLY a valid JSON object where keys are the target fields.\n"
            f"2. If a field cannot be found, set its value to null.\n"
            f"3. Strip HTML tags, leading/trailing whitespace, and newlines from field values.\n\n"
            f"--- Webpage Text ---\n{truncated_text}\n"
        )

        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        url = f"{GEMINI_API_URL}?key={self.api_key}"
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                if response.status != 200:
                    return {}
                resp_data = json.loads(response.read().decode("utf-8"))

            candidates = resp_data.get("candidates", [])
            if not candidates:
                return {}

            content_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
            extracted = json.loads(content_text)
            return extracted if isinstance(extracted, dict) else {}

        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, Exception) as exc:
            # Fallback must never crash the crawl loop
            return {"_llm_error": str(exc)[:200]}
