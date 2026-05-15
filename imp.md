# 🏗️ MediScan — 4-Hour Sprint Plan

## Architecture Overview

```
mediscan/
├── backend/
│   ├── main.py       FastAPI server
│   ├── ocr.py        Tesseract/pytesseract wrapper
│   ├── ai.py         Claude API integration (claude-opus-4-5)
│   └── models.py     Pydantic schemas
└── frontend/
    ├── App.jsx        Main React app
    ├── Upload.jsx     Drag-drop uploader
    ├── Results.jsx    Medicine explanation cards
    └── Reminders.jsx  Dosage reminder UI
```

---

## Team Split

| Person | Role | Hours |
|--------|------|-------|
| A | FastAPI + OCR pipeline | 4h |
| B | Claude AI integration + prompts | 4h |
| C | React UI — Upload + OCR display | 4h |
| D | React UI — Results cards + Reminders | 4h |

---

## Hour-by-Hour Timeline

### Hour 1 — Setup & Scaffolding (all 4 in parallel)

- **A**: `pip install fastapi uvicorn pytesseract pillow python-multipart anthropic` → scaffold `main.py` with `/scan`, `/explain`, `/interactions` endpoints, CORS enabled
- **B**: Create `ai.py` with Anthropic SDK using `claude-opus-4-5`, write the medicine explanation system prompt
- **C**: `npx create-react-app mediscan` → build drag-and-drop upload component with preview
- **D**: Design the Results card component and Reminder modal skeleton

### Hour 2 — Core Features

- **A**: Implement `ocr.py` — accept image/PDF, run pytesseract with Pillow preprocessing (grayscale + threshold + sharpen), return raw text
- **B**: Finalize prompt engineering — extract medicine name, dosage, purpose, side effects, warnings as JSON
- **C**: Wire upload to `/scan` endpoint, display raw OCR text, add loading states
- **D**: Build `Results.jsx` — card per medicine with expandable sections

### Hour 3 — Integration

- **A + B**: Connect OCR output → Claude API → return structured JSON to frontend
- **C + D**: Consume `/scan` API response, render medicine cards, implement reminder form (time picker + medicine name)

### Hour 4 — Polish + Demo Prep

- **A**: Error handling + SQLite history via `databases` package + `/history` endpoint
- **B**: Drug interactions — second Claude call with `/interactions` endpoint
- **C**: UI polish, loading skeletons, PDF support via react-pdf
- **D**: `.ics` export for reminders, final testing with real prescriptions

---

## Key Code Snippets

### `backend/ai.py` — Claude does the heavy lifting

```python
import anthropic, json

client = anthropic.Anthropic()

SYSTEM_PROMPT = """You are a medical prescription explainer.
Given OCR text from a prescription, extract and explain each medicine.
Return ONLY valid JSON:
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
}"""

async def explain_prescription(ocr_text: str):
    msg = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": ocr_text}]
    )
    return json.loads(msg.content[0].text)
```

### `backend/main.py`

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from ocr import extract_text
from ai import explain_prescription

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.post("/scan")
async def scan_prescription(file: UploadFile = File(...)):
    image_bytes = await file.read()
    ocr_text = extract_text(image_bytes)
    explanation = await explain_prescription(ocr_text)
    return {"ocr_text": ocr_text, "medicines": explanation}

@app.get("/history")
async def get_history():
    # SQLite via databases package
    return {"scans": []}  # implement with DB
```

### `backend/ocr.py`

```python
import pytesseract
from PIL import Image, ImageFilter, ImageOps
import io

def preprocess(image: Image.Image) -> Image.Image:
    image = ImageOps.grayscale(image)
    image = image.filter(ImageFilter.SHARPEN)
    image = image.point(lambda p: 255 if p > 128 else 0)
    return image

def extract_text(image_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(image_bytes))
    processed = preprocess(image)
    return pytesseract.image_to_string(processed)
```

### Frontend API Call Pattern (React)

```javascript
const scanPrescription = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("http://localhost:8000/scan", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Scan failed");
  const data = await res.json();
  setMedicines(data.medicines);
};
```

---

## Extensibility Hooks (build these first, fill later)

| Feature | Hook to Add Now |
|---------|----------------|
| Drug interactions | Add `/interactions` endpoint, pass medicine list to Claude |
| Multi-language | Add `lang` param to `/scan`, include in system prompt |
| History | Add SQLite via `databases` package, `/history` endpoint |
| Doctor notes | Second Claude call with different prompt |
| Export PDF | `reportlab` in backend, `/export` endpoint |

---

## Critical Tips

1. **OCR quality**: Tesseract struggles with bad photos — preprocess in `ocr.py` (grayscale + threshold + sharpen with Pillow) before passing to pytesseract
2. **Claude as fallback**: If OCR returns garbled text, `claude-opus-4-5` can still infer likely medicines from partial input — mention this in your system prompt
3. **Reminders**: Use browser `Notification API` + `setTimeout` for in-app reminders without a backend — localStorage stores them
4. **Demo prescription**: Download a sample prescription image from Google for demo — don't wait for a real one

---

## Commands to Get Started Right Now

```bash
# Backend (Person A)
mkdir mediscan && cd mediscan && mkdir backend frontend
cd backend
pip install fastapi uvicorn pytesseract pillow python-multipart anthropic databases aiosqlite

# Install Tesseract engine
brew install tesseract        # macOS
# apt install tesseract-ocr   # Linux

uvicorn main:app --reload

# Frontend (Person C)
cd ../frontend
npx create-react-app .
npm start
```

---

## Model Reference

| Parameter | Value |
|-----------|-------|
| Model | `claude-opus-4-5` |
| SDK | `anthropic` (Python) |
| Max tokens | `2000` |
| Response format | JSON only (enforced via system prompt) |