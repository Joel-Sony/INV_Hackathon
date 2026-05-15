"""
AI module — Claude API integration for prescription explanation.
Uses Anthropic SDK with claude-sonnet to extract and explain medicines.
"""

import json
import anthropic

client = anthropic.Anthropic()

SYSTEM_PROMPT = """You are a medical prescription explainer.
Given OCR text from a prescription, extract and explain each medicine.
If the OCR text is garbled or partial, do your best to infer the likely medicines.
Return ONLY valid JSON with no extra text:
{
  "medicines": [{
    "name": "",
    "dosage": "",
    "frequency": "",
    "purpose": "",
    "side_effects": [],
    "warnings": [],
    "plain_english": ""
  }]
}

If no medicines can be identified, return: {"medicines": []}
"""


async def explain_prescription(ocr_text: str) -> dict:
    """Send OCR text to Claude and get structured medicine explanations."""
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": ocr_text}]
    )
    try:
        return json.loads(msg.content[0].text)
    except (json.JSONDecodeError, IndexError):
        return {"medicines": [], "raw_response": msg.content[0].text}
