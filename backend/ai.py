"""
AI module — OpenRouter LLM integration for prescription explanation.
Uses OpenRouter API (OpenAI-compatible) to:
1. Clean up broken/garbled OCR text from handwriting
2. Extract and explain medicines in plain English
"""

import json
import os
from openai import OpenAI
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

API_KEY = os.getenv('API_KEY')

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=API_KEY,
)

# Model to use via OpenRouter
MODEL = "google/gemini-2.0-flash-001"


# ============================================================
#  STEP 1: Clean up broken OCR text
# ============================================================

OCR_CLEANUP_PROMPT = """You are an expert at reading broken/garbled OCR output from handwritten medical prescriptions.

The text below was extracted by OCR from a handwritten prescription image. It contains errors, broken words, missing characters, and noise.

Your job:
1. Reconstruct the actual text the doctor wrote
2. Fix spelling of medicine names (use your medical knowledge)
3. Fix dosage numbers and units (mg, ml, tablets, etc.)
4. Fix frequency instructions (twice daily, after meals, etc.)
5. Remove obvious OCR noise/artifacts
6. Keep the original structure/layout as much as possible

Return ONLY the cleaned-up prescription text. Do not add explanations."""


async def clean_ocr_text(raw_ocr: str) -> str:
    """Send broken OCR text to LLM for cleanup and reconstruction."""
    if not raw_ocr or not raw_ocr.strip():
        return ""
    
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": OCR_CLEANUP_PROMPT},
                {"role": "user", "content": f"OCR Output:\n\n{raw_ocr}"}
            ],
            max_tokens=2000,
            temperature=0.1,  # Low temperature for accuracy
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[AI] OCR cleanup failed: {e}")
        return raw_ocr  # Return raw text if cleanup fails


# ============================================================
#  STEP 2: Extract & explain medicines
# ============================================================

EXPLAIN_PROMPT = """You are a medical prescription explainer.
Given cleaned prescription text, extract and explain each medicine.

Return ONLY valid JSON with no extra text or markdown:
{
  "medicines": [{
    "name": "Medicine Name",
    "dosage": "500mg",
    "frequency": "Twice daily after meals",
    "purpose": "What this medicine treats",
    "side_effects": ["effect1", "effect2"],
    "warnings": ["warning1", "warning2"],
    "plain_english": "A simple 1-2 sentence explanation a patient can understand"
  }]
}

Rules:
- If you can identify the medicine, fill in purpose/side_effects/warnings from your knowledge
- If dosage or frequency is unclear, note it as "unclear from prescription"
- plain_english should be very simple, like explaining to a grandparent
- If no medicines found, return: {"medicines": []}"""


async def explain_prescription(cleaned_text: str) -> dict:
    """Send cleaned prescription text to LLM for medicine extraction."""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": EXPLAIN_PROMPT},
                {"role": "user", "content": cleaned_text}
            ],
            max_tokens=3000,
            temperature=0.2,
        )
        raw = response.choices[0].message.content.strip()
        
        # Handle markdown code blocks in response
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"medicines": [], "raw_response": raw}
    except Exception as e:
        print(f"[AI] Explain failed: {e}")
        return {"medicines": [], "error": str(e)}


# ============================================================
#  FULL PIPELINE: Raw OCR → Clean → Explain
# ============================================================

async def full_pipeline(raw_ocr: str) -> dict:
    """
    Complete AI pipeline:
    1. Clean up broken OCR text using LLM
    2. Extract and explain medicines using LLM
    
    Returns dict with cleaned_text, medicines, and pipeline status.
    """
    result = {
        "raw_ocr": raw_ocr,
        "cleaned_text": "",
        "medicines": [],
        "pipeline": {
            "ocr_cleanup": "pending",
            "medicine_extraction": "pending"
        }
    }
    
    # Step 1: Clean OCR
    try:
        cleaned = await clean_ocr_text(raw_ocr)
        result["cleaned_text"] = cleaned
        result["pipeline"]["ocr_cleanup"] = "success"
    except Exception as e:
        result["cleaned_text"] = raw_ocr
        result["pipeline"]["ocr_cleanup"] = f"failed: {str(e)}"
    
    # Step 2: Explain medicines
    try:
        explanation = await explain_prescription(result["cleaned_text"])
        result["medicines"] = explanation.get("medicines", [])
        result["pipeline"]["medicine_extraction"] = "success"
    except Exception as e:
        result["pipeline"]["medicine_extraction"] = f"failed: {str(e)}"
    
    return result
