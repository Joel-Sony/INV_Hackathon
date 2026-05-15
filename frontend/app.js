/**
 * MediScan — Frontend Application Logic
 * Handles file upload, drag-drop, API calls, and results rendering.
 */

const API_BASE = 'http://localhost:8000';

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const previewImage = document.getElementById('preview-image');
const previewContainer = document.querySelector('.preview-image-container');
const actionButtons = document.getElementById('action-buttons');
const btnUpload = document.getElementById('btn-upload');
const btnUploadOnly = document.getElementById('btn-upload-only');
const btnRemove = document.getElementById('btn-remove');
const btnScanAgain = document.getElementById('btn-scan-again');

const uploadSection = document.getElementById('upload-section');
const progressSection = document.getElementById('progress-section');
const resultsSection = document.getElementById('results-section');
const progressTitle = document.getElementById('progress-title');
const progressSubtitle = document.getElementById('progress-subtitle');

const ocrResultCard = document.getElementById('ocr-result-card');
const ocrText = document.getElementById('ocr-text');
const resultFilename = document.getElementById('result-filename');
const medicinesContainer = document.getElementById('medicines-container');
const errorCard = document.getElementById('error-card');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');

let selectedFile = null;

// ===== File Selection =====

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function handleFileSelect(file) {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|bmp|tiff|webp|pdf)$/i)) {
        showError('Unsupported file type', 'Please upload a JPG, PNG, PDF, WEBP, or TIFF file.');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showError('File too large', 'Maximum file size is 10 MB.');
        return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);

    // Show image preview for image files
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    } else {
        previewContainer.style.display = 'none';
    }

    dropZone.style.display = 'none';
    filePreview.style.display = 'block';
    actionButtons.style.display = 'flex';
}

function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    dropZone.style.display = 'block';
    filePreview.style.display = 'none';
    actionButtons.style.display = 'none';
    previewImage.src = '';
}

// ===== Drag & Drop =====

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
});

btnRemove.addEventListener('click', clearFile);

// ===== Section Transitions =====

function showSection(section) {
    uploadSection.style.display = 'none';
    progressSection.style.display = 'none';
    resultsSection.style.display = 'none';
    section.style.display = 'block';
}

function setProgress(step) {
    const steps = ['upload', 'ocr', 'ai'];
    steps.forEach((s, i) => {
        const el = document.getElementById('step-' + s);
        el.classList.remove('active', 'done');
        if (i < steps.indexOf(step)) el.classList.add('done');
        if (s === step) el.classList.add('active');
    });
}

// ===== API Calls =====

async function uploadFile(endpoint) {
    if (!selectedFile) return;

    showSection(progressSection);
    setProgress('upload');
    progressTitle.textContent = 'Uploading prescription...';
    progressSubtitle.textContent = 'Sending file to server';

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        // Simulate brief delay for visual feedback
        await new Promise(r => setTimeout(r, 500));
        setProgress('ocr');
        progressTitle.textContent = 'Extracting text...';
        progressSubtitle.textContent = 'Running OCR on your prescription';

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
            throw new Error(err.detail || `Server error: ${res.status}`);
        }

        const data = await res.json();

        if (endpoint === '/scan') {
            setProgress('ai');
            progressTitle.textContent = 'Analyzing medicines...';
            progressSubtitle.textContent = 'AI is explaining your prescription';
            await new Promise(r => setTimeout(r, 300));
        }

        showResults(data, endpoint);
    } catch (err) {
        showSection(resultsSection);
        ocrResultCard.style.display = 'none';
        medicinesContainer.innerHTML = '';
        showError('Upload Failed', err.message);
    }
}

// ===== Display Results =====

function showResults(data, endpoint) {
    showSection(resultsSection);
    errorCard.style.display = 'none';
    ocrResultCard.style.display = 'none';
    medicinesContainer.innerHTML = '';

    // Show filename
    resultFilename.textContent = data.filename || selectedFile?.name || '';

    // Show OCR text
    if (data.ocr_text) {
        ocrResultCard.style.display = 'block';
        ocrText.textContent = data.ocr_text;
    }

    // Show error if present
    if (data.error) {
        showError(
            data.status === 'partial' ? 'Partial Results' : 'Warning',
            data.error
        );
    }

    // Show medicine cards
    if (data.medicines && Array.isArray(data.medicines)) {
        const meds = data.medicines.medicines || data.medicines;
        renderMedicines(Array.isArray(meds) ? meds : []);
    }

    // If only upload (no OCR text, no medicines), show upload confirmation
    if (!data.ocr_text && !data.medicines) {
        ocrResultCard.style.display = 'block';
        ocrText.textContent = `✅ File uploaded successfully!\n\nFilename: ${data.filename}\nSize: ${formatBytes(data.size_bytes)}\nType: ${data.content_type}`;
    }
}

function renderMedicines(medicines) {
    if (medicines.length === 0) return;

    medicines.forEach((med, i) => {
        const card = document.createElement('div');
        card.className = 'medicine-card';
        card.style.animationDelay = `${i * 0.1}s`;

        let sideEffectsHtml = '';
        if (med.side_effects && med.side_effects.length > 0) {
            sideEffectsHtml = `
                <div class="med-field">
                    <div class="med-label">Side Effects</div>
                    <div class="med-tags">
                        ${med.side_effects.map(se => `<span class="med-tag">${escapeHtml(se)}</span>`).join('')}
                    </div>
                </div>`;
        }

        let warningsHtml = '';
        if (med.warnings && med.warnings.length > 0) {
            warningsHtml = `
                <div class="med-field">
                    <div class="med-label">Warnings</div>
                    <div class="med-tags">
                        ${med.warnings.map(w => `<span class="med-tag warning">${escapeHtml(w)}</span>`).join('')}
                    </div>
                </div>`;
        }

        let plainEnglish = '';
        if (med.plain_english) {
            plainEnglish = `<div class="plain-english">💡 ${escapeHtml(med.plain_english)}</div>`;
        }

        card.innerHTML = `
            <div class="medicine-card-header">
                <div class="med-icon">💊</div>
                <div>
                    <div class="med-name">${escapeHtml(med.name || 'Unknown Medicine')}</div>
                    <div class="med-dosage">${escapeHtml(med.dosage || '')} ${med.frequency ? '• ' + escapeHtml(med.frequency) : ''}</div>
                </div>
            </div>
            <div class="medicine-card-body">
                ${med.purpose ? `<div class="med-field"><div class="med-label">Purpose</div><div class="med-value">${escapeHtml(med.purpose)}</div></div>` : ''}
                ${sideEffectsHtml}
                ${warningsHtml}
            </div>
            ${plainEnglish}
        `;
        medicinesContainer.appendChild(card);
    });
}

function showError(title, message) {
    errorCard.style.display = 'block';
    errorTitle.textContent = '⚠️ ' + title;
    errorMessage.textContent = message;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Button Handlers =====

btnUpload.addEventListener('click', () => uploadFile('/scan'));
btnUploadOnly.addEventListener('click', () => uploadFile('/upload'));

btnScanAgain.addEventListener('click', () => {
    clearFile();
    showSection(uploadSection);
    errorCard.style.display = 'none';
});

// ===== Init =====
console.log('🏥 MediScan frontend loaded');
