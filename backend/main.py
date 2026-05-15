"""
MediScan — FastAPI backend server.
Handles prescription image uploads, OCR extraction, and AI explanation.
"""

import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Create uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="MediScan API",
    description="Prescription scanner with OCR and AI explanation",
    version="1.0.0"
)

# CORS — allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Allowed file types
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp", ".pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@app.get("/")
async def root():
    return {"message": "MediScan API is running", "version": "1.0.0"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a prescription image file.
    Returns file info and attempts OCR if tesseract is available.
    """
    # Validate file extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB"
        )

    # Save file to uploads directory
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(content)

    # Attempt OCR
    ocr_text = None
    ocr_error = None
    try:
        from ocr import extract_text
        ocr_text = extract_text(content)
    except Exception as e:
        ocr_error = str(e)

    return {
        "filename": file.filename,
        "size_bytes": len(content),
        "content_type": file.content_type,
        "ocr_text": ocr_text,
        "status": "success",
        "error": ocr_error
    }


@app.post("/scan")
async def scan_prescription(file: UploadFile = File(...)):
    """
    Full pipeline: Upload → OCR → AI Explanation.
    Returns OCR text and structured medicine information.
    """
    # Validate file extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB"
        )

    # Step 1: OCR
    try:
        from ocr import extract_text
        ocr_text = extract_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    if not ocr_text:
        raise HTTPException(status_code=422, detail="No text could be extracted from the image")

    # Step 2: AI Explanation
    try:
        from ai import explain_prescription
        explanation = await explain_prescription(ocr_text)
    except Exception as e:
        # Return OCR text even if AI fails
        return {
            "ocr_text": ocr_text,
            "medicines": [],
            "filename": file.filename,
            "status": "partial",
            "error": f"AI explanation failed: {str(e)}"
        }

    return {
        "ocr_text": ocr_text,
        "medicines": explanation.get("medicines", []),
        "filename": file.filename,
        "status": "success",
        "error": None
    }


@app.get("/health")
async def health_check():
    """Check if all services are available."""
    tesseract_ok = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        tesseract_ok = True
    except Exception:
        pass

    anthropic_ok = False
    try:
        import anthropic
        anthropic_ok = bool(os.environ.get("ANTHROPIC_API_KEY"))
    except ImportError:
        pass

    return {
        "status": "ok",
        "tesseract": tesseract_ok,
        "anthropic_configured": anthropic_ok,
    }
