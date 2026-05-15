/**
 * MediScan — Scan Page Logic
 * Handles file upload, drag-drop, API calls, and medicine card rendering.
 * Pipeline steps removed from output per user request.
 */

const API_BASE = 'http://localhost:5000';

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

const cleanedTextCard = document.getElementById('cleaned-text-card');
const cleanedTextEl = document.getElementById('cleaned-text');
const resultFilename = document.getElementById('result-filename');
const medicinesContainer = document.getElementById('medicines-container');
const errorCard = document.getElementById('error-card');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');

let selectedFile = null;

// ===== Helpers =====

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Get auth token if available (for saving prescriptions to user account)
function getToken() { return localStorage.getItem('mediscan_token'); }
function authHeaders() {
    const t = getToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
}

// ===== File Selection =====

function handleFileSelect(file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|bmp|tiff|webp|pdf)$/i)) {
        alert('Unsupported file type.');
        return;
    }
    if (file.size > 10 * 1024 * 1024) { alert('File too large. Max 10 MB.'); return; }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => { previewImage.src = e.target.result; previewContainer.style.display = 'flex'; };
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
fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFileSelect(e.dataTransfer.files[0]);
});
btnRemove.addEventListener('click', clearFile);

// ===== Section Transitions =====

function showSection(section) {
    uploadSection.style.display = 'none';
    progressSection.style.display = 'none';
    resultsSection.style.display = 'none';
    section.style.display = 'block';
}

function setProgress(title, subtitle) {
    progressTitle.textContent = title;
    progressSubtitle.textContent = subtitle;
}

// ===== API Calls =====

async function uploadFile(endpoint) {
    if (!selectedFile) return;

    showSection(progressSection);
    setProgress('Uploading prescription...', 'Sending file to server');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        await sleep(300);
        setProgress('Processing...', 'Running OCR + AI analysis');

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: authHeaders(),
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
            throw new Error(err.detail || `Server error: ${res.status}`);
        }

        const data = await res.json();
        showResults(data);
    } catch (err) {
        showSection(resultsSection);
        cleanedTextCard.style.display = 'none';
        medicinesContainer.innerHTML = '';
        showError('Upload Failed', err.message);
    }
}

// ===== Display Results =====

function showResults(data) {
    showSection(resultsSection);
    errorCard.style.display = 'none';
    cleanedTextCard.style.display = 'none';
    medicinesContainer.innerHTML = '';

    resultFilename.textContent = data.filename || selectedFile?.name || '';

    // Show cleaned text (or raw OCR as fallback)
    const textToShow = data.cleaned_text || data.raw_ocr || data.ocr_text || '';
    if (textToShow) {
        cleanedTextCard.style.display = 'block';
        cleanedTextEl.textContent = textToShow;
    }

    // Error
    if (data.error) {
        showError(data.status === 'partial' ? 'Partial Results' : 'Warning', data.error);
    }

    // Medicine cards
    if (data.medicines && Array.isArray(data.medicines) && data.medicines.length > 0) {
        renderMedicines(data.medicines);
    }

    // Upload-only with no text
    if (!textToShow && (!data.medicines || data.medicines.length === 0)) {
        cleanedTextCard.style.display = 'block';
        cleanedTextEl.textContent = `✅ File uploaded successfully!\n\nFilename: ${data.filename}\nSize: ${formatBytes(data.size_bytes)}\nType: ${data.content_type}`;
    }
}

// ===== TTS =====

function readAloud(med) {
    if (!('speechSynthesis' in window)) { alert('TTS not supported in this browser.'); return; }
    window.speechSynthesis.cancel();
    const warnings = med.warnings && med.warnings.length > 0 ? ` Important warnings: ${med.warnings.join('. ')}.` : '';
    const text = `${med.name}. ${med.plain_english || ''}. Take ${med.dosage || ''}, ${med.frequency || ''}.${warnings}`;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

// ===== Render Medicine Cards =====

function renderMedicines(medicines) {
    if (!medicines || medicines.length === 0) return;

    medicines.forEach((med, i) => {
        const card = document.createElement('div');
        card.className = 'medicine-card';
        card.style.animationDelay = `${i * 0.1}s`;

        let sideEffectsHtml = '';
        if (med.side_effects && med.side_effects.length > 0) {
            sideEffectsHtml = `<div class="med-field"><div class="med-label">Side Effects</div><div class="med-tags">${med.side_effects.map(se => `<span class="med-tag">${esc(se)}</span>`).join('')}</div></div>`;
        }

        let warningsHtml = '';
        if (med.warnings && med.warnings.length > 0) {
            warningsHtml = `<div class="med-field"><div class="med-label">Warnings</div><div class="med-tags">${med.warnings.map(w => `<span class="med-tag warning">${esc(w)}</span>`).join('')}</div></div>`;
        }

        let plainEnglish = '';
        if (med.plain_english) {
            plainEnglish = `<div class="plain-english">💡 ${esc(med.plain_english)}</div>`;
        }

        card.innerHTML = `
            <div class="medicine-card-header">
                <div class="med-icon">💊</div>
                <div>
                    <div class="med-name">${esc(med.name || 'Unknown Medicine')}</div>
                    <div class="med-dosage">${esc(med.dosage || '')} ${med.frequency ? '• ' + esc(med.frequency) : ''}</div>
                </div>
                <button class="btn-read-aloud" title="Read Aloud">🔊 Listen</button>
            </div>
            <div class="medicine-card-body">
                ${med.purpose ? `<div class="med-field"><div class="med-label">Purpose</div><div class="med-value">${esc(med.purpose)}</div></div>` : ''}
                ${sideEffectsHtml}
                ${warningsHtml}
            </div>
            ${plainEnglish}
        `;
        medicinesContainer.appendChild(card);

        // TTS button
        card.querySelector('.btn-read-aloud').addEventListener('click', () => readAloud(med));
    });
}

function showError(title, message) {
    errorCard.style.display = 'block';
    errorTitle.textContent = '⚠️ ' + title;
    errorMessage.textContent = message;
}

// ===== Button Handlers =====

btnUpload.addEventListener('click', () => uploadFile('/scan'));
btnUploadOnly.addEventListener('click', () => uploadFile('/upload'));

btnScanAgain.addEventListener('click', () => {
    clearFile();
    showSection(uploadSection);
    errorCard.style.display = 'none';
});

console.log('🏥 MediScan scan page loaded');
