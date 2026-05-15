"""
OCR module — Tesseract/pytesseract wrapper with Pillow preprocessing.
Extracts text from prescription images.
"""

import io
import pytesseract
from PIL import Image, ImageFilter, ImageOps


def preprocess(image: Image.Image) -> Image.Image:
    """Apply preprocessing to improve OCR accuracy on prescription images."""
    # Convert to grayscale
    image = ImageOps.grayscale(image)
    # Sharpen to enhance text edges
    image = image.filter(ImageFilter.SHARPEN)
    # Binarize with threshold for cleaner text
    image = image.point(lambda p: 255 if p > 128 else 0)
    return image


def extract_text(image_bytes: bytes) -> str:
    """
    Accept raw image bytes, preprocess, and run OCR.
    Returns extracted text string.
    """
    image = Image.open(io.BytesIO(image_bytes))
    processed = preprocess(image)
    text = pytesseract.image_to_string(processed)
    return text.strip()
