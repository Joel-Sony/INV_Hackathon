"""
Pydantic schemas for MediScan API responses.
"""

from pydantic import BaseModel
from typing import List, Optional


class Medicine(BaseModel):
    name: str
    dosage: str = ""
    frequency: str = ""
    purpose: str = ""
    side_effects: List[str] = []
    warnings: List[str] = []
    plain_english: str = ""


class ScanResponse(BaseModel):
    ocr_text: str
    medicines: List[Medicine] = []
    filename: str = ""
    status: str = "success"
    error: Optional[str] = None


class UploadResponse(BaseModel):
    filename: str
    size_bytes: int
    content_type: str
    ocr_text: Optional[str] = None
    status: str = "success"
    error: Optional[str] = None
