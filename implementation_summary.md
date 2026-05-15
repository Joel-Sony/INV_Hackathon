# 🏗️ MediScan Implementation Summary

This document outlines the current state of the MediScan application. We have built the base application, capable of processing medical prescriptions by running OCR to extract text and utilizing an LLM to correct the text and extract the final list of medicines.

## Core Architecture

The project is split into a **FastAPI backend** and a **Vanilla HTML/JS/CSS frontend**.

```
INV_Hackathon/
├── backend/
│   ├── main.py        # FastAPI application and endpoints
│   ├── ocr.py         # Image preprocessing and Tesseract OCR wrapper
│   ├── ai.py          # OpenRouter LLM integration for text cleanup and extraction
│   └── models.py      # Pydantic data models
├── frontend/
│   ├── index.html     # Main application structure
│   ├── style.css      # Styling with modern glassmorphism UI
│   └── app.js         # Client-side logic for uploads and pipeline rendering
└── .env               # Environment variables (OpenRouter API key)
```

## Backend Pipeline (`backend/main.py`)

The core of the application resides in the backend, exposing two primary endpoints: `/upload` and `/scan`.

### 1. Multi-pass OCR (`backend/ocr.py`)

To handle the difficulty of reading handwriting with Tesseract, we implemented a robust **multi-pass extraction strategy**.

*   **Advanced Preprocessing:** We use `Pillow` and `numpy` to apply various transformations before OCR:
    *   Upscaling (for better DPI)
    *   Aggressive contrast and brightness boosting
    *   Adaptive thresholding (crucial for uneven handwriting ink)
    *   Morphological closing (filling in broken pen strokes)
    *   Deskewing (straightening tilted text)
*   **Multiple Pipelines:** We run the image through 3 different preprocessing pipelines (Handwriting, High Contrast, Simple).
*   **Multiple Configurations:** For each pipeline, we test 5 different Tesseract configurations (varying the Page Segmentation Mode and Engine Mode).
*   **Merging:** The results from up to 15 different extraction attempts are merged to form a comprehensive, albeit messy, raw OCR output.

### 2. LLM Processing (`backend/ai.py`)

We use **OpenRouter** (specifically `google/gemini-2.0-flash-001`) to make sense of the raw OCR text. This is a two-step process:

*   **Step 1: Cleanup:** The raw, garbled OCR text is passed to the LLM with instructions to reconstruct the actual written text, fix spelling errors, and format it cleanly.
*   **Step 2: Extraction:** The cleaned text is passed to the LLM again to extract a structured JSON array containing:
    *   Medicine Name
    *   Dosage
    *   Frequency
    *   Purpose
    *   Side Effects
    *   Warnings
    *   A "Plain English" explanation

## Frontend Application (`frontend/`)

The frontend is a single-page application built with Vanilla web technologies, emphasizing a polished, modern user experience.

*   **UI/UX:**
    *   **Glassmorphism Design:** Uses CSS backdrop-filters, gradients, and custom properties (CSS variables) for a premium look.
    *   **Animated Background:** Floating, blurred blobs add a dynamic feel.
    *   **Drag-and-Drop:** Intuitive file upload zone with preview capabilities.
*   **Pipeline Visibility:**
    *   When a user uploads a prescription, the app displays a 4-step progress indicator (Upload → OCR → LLM Cleanup → Explain).
    *   The results section displays the **Raw OCR Output**, the **LLM-Cleaned Text**, and finally the styled **Medicine Cards**.
    *   Pipeline status badges clearly show the success/failure of each backend step.

## How to Run

Currently, the application runs on custom ports to avoid conflicts:

**Start the Backend:**
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 5000
```
*(The backend is currently running on port 5000 in the background).*

**Start the Frontend:**
```bash
cd frontend
python3 -m http.server 3002
```
*(The frontend is currently running on port 3002 in the background. Access it at `http://localhost:3002`).*

> [!NOTE]
> Ensure the `API_KEY` is set in the `.env` file for OpenRouter requests to succeed. The frontend `app.js` is currently configured to point to `API_BASE = 'http://localhost:8000'`. **Since the backend was moved to port 5000, `frontend/app.js` needs to be updated to point to port 5000 for the app to function properly.**
