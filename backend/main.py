"""
MediScan — FastAPI backend server.
Pipeline: Image Upload → OCR → LLM Cleanup → LLM Explain
Auth, Prescriptions, Reminders, and SMS via Fast2SMS.
"""

import os
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Create uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="MediScan API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp", ".pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024


# ============================================================
#  STARTUP — Init DB + Seed + Scheduler
# ============================================================

@app.on_event("startup")
def startup():
    import database as db
    from sample_data import seed_database
    db.init_db()
    seed_database()
    print("[STARTUP] Database initialized and seeded.")


# ============================================================
#  HELPERS
# ============================================================

def _validate_file(filename, content):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not supported.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 10 MB.")


def _get_current_user(authorization: str = None):
    """Extract user from auth header. Returns user dict or raises 401."""
    from auth import extract_token, get_user_from_token
    import database as db
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = extract_token(authorization)
    user_id = get_user_from_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ============================================================
#  ROOT + HEALTH
# ============================================================

@app.get("/")
async def root():
    return {"message": "MediScan API is running", "version": "2.0.0"}


@app.get("/health")
async def health_check():
    tesseract_ok = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        tesseract_ok = True
    except Exception:
        pass
    return {
        "status": "ok",
        "tesseract_installed": tesseract_ok,
        "openrouter_api_key": bool(os.getenv("API_KEY")),
        "fast2sms_api_key": bool(os.getenv("FAST2SMS_API_KEY")),
    }


# ============================================================
#  AUTH ENDPOINTS
# ============================================================

@app.post("/auth/login")
async def login(request: Request):
    body = await request.json()
    email = body.get("email", "").strip()
    password = body.get("password", "").strip()
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")

    import database as db
    from auth import create_session
    user = db.get_user_by_email(email)
    if not user or user["password"] != password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_session(user["id"])
    return {
        "token": token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"], "phone": user["phone"]}
    }


@app.post("/auth/logout")
async def logout(authorization: str = Header(None)):
    from auth import extract_token, delete_session
    token = extract_token(authorization)
    if token:
        delete_session(token)
    return {"success": True}


@app.get("/auth/me")
async def get_me(authorization: str = Header(None)):
    user = _get_current_user(authorization)
    return {"id": user["id"], "name": user["name"], "email": user["email"], "phone": user["phone"]}


# ============================================================
#  SCAN ENDPOINTS (existing, now saves to DB if authenticated)
# ============================================================

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), authorization: str = Header(None)):
    content = await file.read()
    _validate_file(file.filename, content)

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(content)

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
async def scan_prescription(file: UploadFile = File(...), authorization: str = Header(None)):
    content = await file.read()
    _validate_file(file.filename, content)

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(content)

    response = {
        "filename": file.filename,
        "raw_ocr": "",
        "cleaned_text": "",
        "medicines": [],
        "status": "success",
        "error": None
    }

    # Step 1: OCR
    try:
        from ocr import extract_text
        raw_ocr = extract_text(content)
        response["raw_ocr"] = raw_ocr
    except Exception as e:
        response["status"] = "partial"
        response["error"] = f"OCR failed: {str(e)}"
        return response

    if not raw_ocr or not raw_ocr.strip():
        response["status"] = "partial"
        response["error"] = "No text could be extracted from the image"
        return response

    # Step 2+3: LLM cleanup + extraction
    try:
        from ai import full_pipeline
        ai_result = await full_pipeline(raw_ocr)
        response["cleaned_text"] = ai_result.get("cleaned_text", "")
        response["medicines"] = ai_result.get("medicines", [])
    except Exception as e:
        response["status"] = "partial"
        response["error"] = f"AI pipeline failed: {str(e)}"

    # Save to DB if user is authenticated
    try:
        user = _get_current_user(authorization)
        import database as db
        pid = db.save_prescription(
            user["id"], file.filename,
            response["raw_ocr"], response["cleaned_text"],
            response["medicines"]
        )
        response["prescription_id"] = pid
    except Exception:
        pass  # Not logged in — still return results, just don't save

    return response


# ============================================================
#  PRESCRIPTION ENDPOINTS
# ============================================================

@app.get("/prescriptions")
async def list_prescriptions(authorization: str = Header(None)):
    user = _get_current_user(authorization)
    import database as db
    prescriptions = db.get_prescriptions_for_user(user["id"])
    return {"prescriptions": prescriptions}


@app.get("/prescriptions/{prescription_id}")
async def get_prescription(prescription_id: int, authorization: str = Header(None)):
    user = _get_current_user(authorization)
    import database as db
    rx = db.get_prescription_by_id(prescription_id)
    if not rx or rx["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return rx


# ============================================================
#  REMINDER ENDPOINTS
# ============================================================

@app.get("/reminders")
async def list_reminders(authorization: str = Header(None)):
    user = _get_current_user(authorization)
    import database as db
    reminders = db.get_reminders_for_user(user["id"])
    return {"reminders": reminders}


@app.post("/reminders")
async def create_reminder(request: Request, authorization: str = Header(None)):
    user = _get_current_user(authorization)
    body = await request.json()

    medicine_name = body.get("medicine_name", "").strip()
    if not medicine_name:
        raise HTTPException(status_code=400, detail="medicine_name is required")

    dosage = body.get("dosage", "")
    frequency = body.get("frequency", "once daily")
    phone_number = body.get("phone_number", user["phone"])
    prescription_id = body.get("prescription_id")

    # Parse reminder times from frequency or use provided times
    reminder_times = body.get("reminder_times")
    if not reminder_times:
        from reminders import parse_frequency
        reminder_times = parse_frequency(frequency)

    import database as db
    rid = db.create_reminder(
        user_id=user["id"],
        medicine_name=medicine_name,
        dosage=dosage,
        frequency=frequency,
        reminder_times=reminder_times,
        phone_number=phone_number,
        prescription_id=prescription_id
    )

    return {"id": rid, "status": "created", "reminder_times": reminder_times}


@app.put("/reminders/{reminder_id}/toggle")
async def toggle_reminder(reminder_id: int, authorization: str = Header(None)):
    user = _get_current_user(authorization)
    import database as db
    reminder = db.get_reminder_by_id(reminder_id)
    if not reminder or reminder["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Reminder not found")
    new_state = db.toggle_reminder(reminder_id)
    return {"id": reminder_id, "is_active": new_state}


@app.delete("/reminders/{reminder_id}")
async def delete_reminder_endpoint(reminder_id: int, authorization: str = Header(None)):
    user = _get_current_user(authorization)
    import database as db
    reminder = db.get_reminder_by_id(reminder_id)
    if not reminder or reminder["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.delete_reminder(reminder_id)
    return {"id": reminder_id, "status": "deleted"}


@app.get("/reminders/logs")
async def get_sms_logs_endpoint(authorization: str = Header(None)):
    user = _get_current_user(authorization)
    import database as db
    logs = db.get_sms_logs(user_id=user["id"], limit=20)
    return {"logs": logs}


@app.post("/reminders/test-email")
async def test_email(request: Request, authorization: str = Header(None)):
    user = _get_current_user(authorization)
    body = await request.json()
    medicine_name = body.get("medicine_name", "Test Medicine")
    dosage = body.get("dosage", "500mg")
    frequency = body.get("frequency", "twice daily")

    from reminders import send_email
    import database as db

    result = send_email(user["email"], medicine_name, dosage, frequency)
    db.log_sms(
        reminder_id=None,
        phone=user["email"],
        message=result.get("message", ""),
        status=result.get("status", "unknown")
    )
    return {"email_result": result}

