"""
OCR module — Maximum-strength handwriting extraction pipeline.
Uses aggressive preprocessing to get as much text as possible from
handwritten prescriptions, even if broken/garbled. The LLM cleans it up later.
"""

import io
import numpy as np
import pytesseract
from PIL import Image, ImageFilter, ImageOps, ImageEnhance


# ============================================================
#  PREPROCESSING FUNCTIONS
# ============================================================

def _to_grayscale(img):
    return ImageOps.grayscale(img)


def _upscale(img, target_width=3000):
    """Upscale small images — Tesseract needs 300+ DPI equivalent."""
    w, h = img.size
    if w < target_width:
        scale = target_width / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img


def _boost_contrast(img, factor=2.5):
    """Aggressive contrast boost to reveal faint handwriting."""
    return ImageEnhance.Contrast(img).enhance(factor)


def _boost_brightness(img, factor=1.2):
    """Slight brightness boost to lighten background."""
    return ImageEnhance.Brightness(img).enhance(factor)


def _sharpen(img, factor=3.0):
    """Heavy sharpening to crisp up pen strokes."""
    return ImageEnhance.Sharpness(img).enhance(factor)


def _adaptive_threshold(img, block_size=35, offset=12):
    """
    Adaptive thresholding — the KEY for handwriting.
    Handles uneven ink, shadows, and varying pen pressure.
    """
    arr = np.array(img, dtype=np.float64)
    # Local mean via box blur
    blurred = img.filter(ImageFilter.BoxBlur(block_size // 2))
    local_mean = np.array(blurred, dtype=np.float64)
    # Foreground = darker than local mean minus offset
    binary = np.where(arr < local_mean - offset, 0, 255).astype(np.uint8)
    return Image.fromarray(binary)


def _global_threshold(img, thresh=140):
    """Simple global threshold — works for high contrast text."""
    return img.point(lambda p: 255 if p > thresh else 0)


def _denoise(img):
    """Median filter removes salt-and-pepper noise while keeping strokes."""
    return img.filter(ImageFilter.MedianFilter(size=3))


def _morphological_close(img):
    """
    Close small gaps in handwritten strokes.
    Dilate then erode — connects broken letter parts.
    """
    # MaxFilter = dilation, MinFilter = erosion
    img = img.filter(ImageFilter.MaxFilter(size=3))
    img = img.filter(ImageFilter.MinFilter(size=3))
    return img


def _invert_if_needed(img):
    """If image is mostly dark (white text on dark bg), invert it."""
    arr = np.array(img)
    if np.mean(arr) < 127:
        return ImageOps.invert(img)
    return img


def _deskew(img):
    """Correct skewed/tilted handwriting by finding best rotation angle."""
    arr = np.array(img)
    inv = 255 - arr
    best_angle = 0
    best_score = 0
    for angle_10x in range(-100, 101, 5):  # -10° to +10° in 0.5° steps
        angle = angle_10x / 10.0
        rotated = img.rotate(angle, fillcolor=255, expand=False)
        rot_arr = 255 - np.array(rotated)
        row_sums = np.sum(rot_arr, axis=1)
        score = np.var(row_sums)
        if score > best_score:
            best_score = score
            best_angle = angle
    if abs(best_angle) > 0.3:
        img = img.rotate(best_angle, fillcolor=255, expand=True)
    return img


def _add_border(img, size=30):
    """White border prevents Tesseract from clipping edge text."""
    return ImageOps.expand(img, border=size, fill=255)


# ============================================================
#  TESSERACT CONFIGURATIONS
# ============================================================

# Each config targets different handwriting scenarios
CONFIGS = [
    # Config 1: LSTM engine, uniform text block — best general handwriting
    '--oem 1 --psm 6 -c preserve_interword_spaces=1',
    # Config 2: Single column of variable-size text (typical prescriptions)
    '--oem 1 --psm 4 -c preserve_interword_spaces=1',
    # Config 3: Fully automatic with LSTM
    '--oem 1 --psm 3',
    # Config 4: Sparse text — catches isolated words that others miss
    '--oem 1 --psm 11',
    # Config 5: Legacy + LSTM combined — sometimes catches what LSTM alone misses
    '--oem 2 --psm 6',
]


# ============================================================
#  PREPROCESSING PIPELINES
# ============================================================

def pipeline_handwriting(img):
    """Aggressive pipeline for handwritten text."""
    img = _to_grayscale(img)
    img = _upscale(img, target_width=3000)
    img = _invert_if_needed(img)
    img = _boost_contrast(img, factor=2.5)
    img = _boost_brightness(img, factor=1.2)
    img = _sharpen(img, factor=3.0)
    img = _adaptive_threshold(img, block_size=35, offset=12)
    img = _denoise(img)
    img = _morphological_close(img)
    img = _deskew(img)
    img = _add_border(img, size=30)
    return img


def pipeline_high_contrast(img):
    """Extreme contrast pipeline — for very faint handwriting."""
    img = _to_grayscale(img)
    img = _upscale(img, target_width=3000)
    img = _invert_if_needed(img)
    img = _boost_contrast(img, factor=4.0)
    img = _sharpen(img, factor=4.0)
    img = _adaptive_threshold(img, block_size=21, offset=8)
    img = _morphological_close(img)
    img = _denoise(img)
    img = _add_border(img, size=30)
    return img


def pipeline_simple(img):
    """Lighter pipeline — for printed or clean handwriting."""
    img = _to_grayscale(img)
    img = _upscale(img, target_width=2000)
    img = _boost_contrast(img, factor=1.8)
    img = img.filter(ImageFilter.SHARPEN)
    img = _global_threshold(img, thresh=140)
    img = _denoise(img)
    img = _add_border(img, size=20)
    return img


# ============================================================
#  MAIN EXTRACTION — MULTI-PASS STRATEGY
# ============================================================

def extract_text(image_bytes: bytes) -> str:
    """
    Multi-pass OCR extraction optimized for handwriting.
    
    Strategy:
    1. Run 3 different preprocessing pipelines
    2. For each pipeline, try multiple Tesseract configs
    3. Collect ALL extracted text fragments
    4. Merge and deduplicate
    5. Return the combined raw text (LLM will clean it up)
    
    Returns raw/messy text — the LLM pipeline handles interpretation.
    """
    image = Image.open(io.BytesIO(image_bytes))
    
    all_texts = []
    pipelines = [
        ("handwriting", pipeline_handwriting),
        ("high_contrast", pipeline_high_contrast),
        ("simple", pipeline_simple),
    ]
    
    for pipe_name, pipe_fn in pipelines:
        try:
            processed = pipe_fn(image.copy())
        except Exception:
            continue
        
        for config in CONFIGS:
            try:
                text = pytesseract.image_to_string(processed, config=config)
                cleaned = _basic_clean(text)
                if cleaned and len(cleaned) > 3:
                    all_texts.append(cleaned)
            except Exception:
                continue
    
    if not all_texts:
        return ""
    
    # Merge: take the longest result as primary, append unique lines from others
    merged = _merge_results(all_texts)
    return merged


def _basic_clean(text: str) -> str:
    """Remove obvious junk but keep everything else — LLM will interpret."""
    lines = []
    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue
        # Skip lines that are pure noise (only special chars, less than 2 alnum chars)
        alnum = sum(1 for c in stripped if c.isalnum())
        if alnum < 2 and len(stripped) < 4:
            continue
        lines.append(stripped)
    return '\n'.join(lines)


def _merge_results(texts: list) -> str:
    """
    Smart merge: use longest text as base, add unique lines from other passes.
    This captures text that one config/pipeline caught but another missed.
    """
    if not texts:
        return ""
    
    # Sort by length descending — longest is usually most complete
    texts.sort(key=len, reverse=True)
    primary = texts[0]
    primary_lines = set(primary.lower().split('\n'))
    
    extra_lines = []
    for text in texts[1:]:
        for line in text.split('\n'):
            # Add lines not already in primary (fuzzy: lowercase compare)
            if line.strip() and line.lower().strip() not in primary_lines:
                # Check it's not too similar to existing lines
                is_new = True
                for existing in primary_lines:
                    if _similarity(line.lower().strip(), existing) > 0.8:
                        is_new = False
                        break
                if is_new:
                    extra_lines.append(line.strip())
                    primary_lines.add(line.lower().strip())
    
    result = primary
    if extra_lines:
        result += '\n\n--- Additional detected text ---\n'
        result += '\n'.join(extra_lines)
    
    return result


def _similarity(a: str, b: str) -> float:
    """Simple character-level similarity ratio."""
    if not a or not b:
        return 0.0
    common = sum(1 for ca, cb in zip(a, b) if ca == cb)
    return common / max(len(a), len(b))
