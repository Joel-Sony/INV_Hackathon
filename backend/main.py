"""
MediScan — FastAPI backend server.
Pipeline: Image Upload → OCR (Tesseract multi-pass) → LLM Cleanup → LLM Explain
All LLM calls go through OpenRouter.
"""

import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Create uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="MediScan API",
    description="Prescription scanner with OCR and AI explanation via OpenRouter",
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


def _validate_file(filename: str, content: bytes):
    """Validate file extension and size."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB"
        )


@app.get("/")
async def root():
    return {"message": "MediScan API is running", "version": "1.0.0"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a prescription image and run OCR only.
    Returns raw OCR text without LLM processing.
    """
    content = await file.read()
    _validate_file(file.filename, content)

    # Save file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(content)

    # Run OCR
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
    Full pipeline: Upload → OCR → LLM Cleanup → LLM Explain.
    
    Pipeline steps visible in response:
    1. raw_ocr: Raw text from Tesseract multi-pass
    2. cleaned_text: LLM-cleaned version of the OCR text
    3. medicines: Extracted & explained medicines
    4. pipeline: Status of each step
    """
    content = await file.read()
    _validate_file(file.filename, content)

    # Save file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(content)

    response = {
        "filename": file.filename,
        "raw_ocr": "",
        "cleaned_text": "",
        "medicines": [],
        "pipeline": {
            "upload": "success",
            "ocr": "pending",
            "llm_cleanup": "pending",
            "llm_explain": "pending"
        },
        "status": "success",
        "error": None
    }

    # Step 1: OCR extraction (Tesseract multi-pass)
    try:
        from ocr import extract_text
        raw_ocr = extract_text(content)
        response["raw_ocr"] = raw_ocr
        response["pipeline"]["ocr"] = "success"
    except Exception as e:
        response["pipeline"]["ocr"] = f"failed: {str(e)}"
        response["status"] = "partial"
        response["error"] = f"OCR failed: {str(e)}"
        return response

    if not raw_ocr or not raw_ocr.strip():
        response["pipeline"]["ocr"] = "no_text_found"
        response["status"] = "partial"
        response["error"] = "No text could be extracted from the image"
        return response

    # Step 2 + 3: LLM cleanup + medicine extraction
    try:
        from ai import full_pipeline
        ai_result = await full_pipeline(raw_ocr)
        response["cleaned_text"] = ai_result.get("cleaned_text", "")
        response["medicines"] = ai_result.get("medicines", [])
        response["pipeline"]["llm_cleanup"] = ai_result["pipeline"]["ocr_cleanup"]
        response["pipeline"]["llm_explain"] = ai_result["pipeline"]["medicine_extraction"]
    except Exception as e:
        response["status"] = "partial"
        response["error"] = f"AI pipeline failed: {str(e)}"
        response["pipeline"]["llm_cleanup"] = f"failed: {str(e)}"
        response["pipeline"]["llm_explain"] = "skipped"

    return response


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

    api_key_set = bool(os.getenv("API_KEY"))

    return {
        "status": "ok",
        "tesseract_installed": tesseract_ok,
        "openrouter_api_key": api_key_set,
    }
