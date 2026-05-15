/* MediScan — app.js */

const API_BASE = 'http://localhost:5000';

const uploadSection   = document.getElementById('upload-section');
const progressSection = document.getElementById('progress-section');
const resultsSection  = document.getElementById('results-section');

const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const uploadTrigger = document.getElementById('upload-trigger');
const filePreview   = document.getElementById('file-preview');
const previewImage  = document.getElementById('preview-image');
const fileNameEl    = document.getElementById('file-name');
const fileSizeEl    = document.getElementById('file-size');
const btnRemove     = document.getElementById('btn-remove');
const actionButtons = document.getElementById('action-buttons');
const btnUpload     = document.getElementById('btn-upload');
const btnUploadOnly = document.getElementById('btn-upload-only');
const btnScanAgain  = document.getElementById('btn-scan-again');

const progressTitle = document.getElementById('progress-title');
const progressBar   = document.getElementById('progress-bar');
const stepEls = {
    upload:  document.getElementById('step-upload'),
    ocr:     document.getElementById('step-ocr'),
    cleanup: document.getElementById('step-cleanup'),
    explain: document.getElementById('step-explain'),
};

const pipelineSteps = document.getElementById('pipeline-steps');
const rawOcrCard    = document.getElementById('raw-ocr-card');
const rawOcrText    = document.getElementById('raw-ocr-text');
const resultFilename = document.getElementById('result-filename');
const cleanedCard   = document.getElementById('cleaned-text-card');
const cleanedText   = document.getElementById('cleaned-text');
const medContainer  = document.getElementById('medicines-container');
const errorCard     = document.getElementById('error-card');
const errorTitle    = document.getElementById('error-title');
const errorMsg      = document.getElementById('error-message');

let selectedFile = null;

/* ─── Section display ─── */
function show(id) {
    const displayMap = {
        'upload-section':   'grid',
        'progress-section': 'flex',
        'results-section':  'block',
    };
    [uploadSection, progressSection, resultsSection].forEach(s => {
        if (!s) return;
        s.style.display = s.id === id ? (displayMap[s.id] || 'block') : 'none';
    });
}
show('upload-section');

/* ─── File handling ─── */
function handleFile(file) {
    if (!file) return;
    const valid = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp', 'application/pdf'];
    if (!valid.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|bmp|tiff|webp)$/i)) {
        return alert('Unsupported file type.');
    }
    if (file.size > 10 * 1024 * 1024) return alert('File exceeds 10 MB.');
    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = fmtSize(file.size);
    dropZone.style.display = 'none';
    filePreview.style.display = 'block';
    actionButtons.style.display = 'flex';
    if (file.type.startsWith('image/')) {
        const r = new FileReader();
        r.onload = e => { previewImage.src = e.target.result; previewImage.style.display = 'block'; };
        r.readAsDataURL(file);
    } else {
        previewImage.style.display = 'none';
    }
}

function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}

uploadTrigger && uploadTrigger.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
dropZone && dropZone.addEventListener('click', () => { if (!selectedFile) fileInput.click(); });
fileInput && fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
dropZone && dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone && dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone && dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

function resetUpload() {
    selectedFile = null;
    fileInput.value = '';
    previewImage.src = '';
    dropZone.style.display = 'block';
    filePreview.style.display = 'none';
    actionButtons.style.display = 'none';
}
btnRemove && btnRemove.addEventListener('click', resetUpload);

btnScanAgain && btnScanAgain.addEventListener('click', () => {
    resetUpload();
    show('upload-section');
    if (medContainer) medContainer.innerHTML = '';
    if (rawOcrCard) rawOcrCard.style.display = 'none';
    if (cleanedCard) cleanedCard.style.display = 'none';
    if (errorCard) errorCard.style.display = 'none';
    if (pipelineSteps) pipelineSteps.innerHTML = '';
    Object.values(stepEls).forEach(el => el && el.classList.remove('active', 'done'));
});

/* ─── Step helpers ─── */
function setStep(key) {
    Object.entries(stepEls).forEach(([k, el]) => {
        if (!el) return;
        el.classList.remove('active', 'done');
        if (k === key) el.classList.add('active');
    });
}
function doneStep(key) {
    if (stepEls[key]) {
        stepEls[key].classList.remove('active');
        stepEls[key].classList.add('done');
    }
}
function setProgress(pct) { if (progressBar) progressBar.style.width = pct + '%'; }

function setPipeline(steps) {
    if (!pipelineSteps) return;
    pipelineSteps.innerHTML = '';
    steps.forEach(s => {
        const b = document.createElement('span');
        b.className = 'rbadge rbadge-' + (s.status === 'success' ? 'success' : s.status === 'failed' ? 'error' : 'pending');
        b.textContent = s.label;
        pipelineSteps.appendChild(b);
    });
}

/* ─── Upload Only (no AI) ─── */
btnUploadOnly && btnUploadOnly.addEventListener('click', async () => {
    if (!selectedFile) return;
    show('progress-section');
    setStep('upload');
    setProgress(10);
    if (progressTitle) progressTitle.textContent = 'Uploading…';

    try {
        const fd = new FormData();
        fd.append('file', selectedFile);
        const res = await fetch(API_BASE + '/upload', { method: 'POST', body: fd });
        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Upload failed');

        doneStep('upload');
        setProgress(100);
        show('results-section');
        setPipeline([{ label: 'Uploaded', status: 'success' }]);
        if (resultFilename && data.filename) resultFilename.textContent = data.filename;
        // Show raw OCR if available
        if (data.ocr_text && rawOcrCard) {
            rawOcrCard.style.display = 'block';
            if (rawOcrText) rawOcrText.textContent = data.ocr_text;
        }
        if (cleanedCard) cleanedCard.style.display = 'none';
        if (errorCard) errorCard.style.display = 'none';
        if (medContainer) medContainer.innerHTML = '';

    } catch (err) {
        show('results-section');
        showErr('Upload Failed', err.message);
    }
});

/* ─── Full Scan (OCR + AI) — uses single /scan endpoint ─── */
btnUpload && btnUpload.addEventListener('click', async () => {
    if (!selectedFile) return;

    show('progress-section');
    setProgress(5);
    if (progressTitle) progressTitle.textContent = 'Uploading file…';
    setStep('upload');

    try {
        // Animate steps while the single /scan call runs
        const animTimer = animateSteps();

        const fd = new FormData();
        fd.append('file', selectedFile);

        // Optional auth header if user is logged in
        const hdrs = {};
        const token = localStorage.getItem('mediscan_token');
        if (token) hdrs['Authorization'] = 'Bearer ' + token;

        const res = await fetch(API_BASE + '/scan', { method: 'POST', headers: hdrs, body: fd });
        clearTimeout(animTimer);

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Scan failed');

        // Mark all steps done
        doneStep('upload');
        doneStep('ocr');
        doneStep('cleanup');
        doneStep('explain');
        setProgress(100);

        show('results-section');

        const ocrOk      = !!data.raw_ocr;
        const cleanedOk  = !!data.cleaned_text;
        const medsOk     = !!(data.medicines && data.medicines.length);

        setPipeline([
            { label: 'Upload',      status: 'success' },
            { label: 'OCR',         status: ocrOk ? 'success' : 'failed' },
            { label: 'LLM Cleanup', status: cleanedOk ? 'success' : 'pending' },
            { label: 'Explain',     status: medsOk ? 'success' : 'pending' },
        ]);

        if (ocrOk && rawOcrCard) {
            rawOcrCard.style.display = 'block';
            if (rawOcrText) rawOcrText.textContent = data.raw_ocr;
            if (resultFilename) resultFilename.textContent = data.filename || 'Tesseract';
        }
        if (cleanedOk && cleanedCard) {
            cleanedCard.style.display = 'block';
            if (cleanedText) cleanedText.textContent = data.cleaned_text;
        }
        if (medsOk) renderMeds(data.medicines);
        else if (!ocrOk) showErr('OCR Failed', data.error || 'No text could be extracted.');
        else if (data.error) showErr('Processing Warning', data.error);

    } catch (err) {
        show('results-section');
        showErr('Processing Error', err.message);
    }
});

/* Animate steps progressively while waiting for /scan */
function animateSteps() {
    const sequence = [
        { key: 'upload',  pct: 20, title: 'Uploading file…',          delay: 800 },
        { key: 'ocr',     pct: 45, title: 'Running OCR…',             delay: 2500 },
        { key: 'cleanup', pct: 70, title: 'Cleaning with AI…',        delay: 5000 },
        { key: 'explain', pct: 88, title: 'Generating explanation…',  delay: 8000 },
    ];
    let lastTimer;
    sequence.forEach(({ key, pct, title, delay }) => {
        lastTimer = setTimeout(() => {
            // Mark previous step done
            const keys = ['upload', 'ocr', 'cleanup', 'explain'];
            const prevKey = keys[keys.indexOf(key) - 1];
            if (prevKey) doneStep(prevKey);
            setStep(key);
            setProgress(pct);
            if (progressTitle) progressTitle.textContent = title;
        }, delay);
    });
    return lastTimer;
}

/* ─── Medicine cards ─── */
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMeds(meds) {
    if (!medContainer) return;
    medContainer.innerHTML = '';
    meds.forEach((m, i) => {
        const card = document.createElement('div');
        card.className = 'med-card';
        card.style.animationDelay = (i * 0.08) + 's';

        const sideEffects = (m.side_effects || []).map(s => `<span class="med-tag">${esc(s)}</span>`).join('');
        const warnings    = (m.warnings    || []).map(w => `<span class="med-tag w">${esc(w)}</span>`).join('');

        card.innerHTML = `
      <div class="med-card-head">
        <div class="med-num-badge">${String(i + 1).padStart(2, '0')}</div>
        <div class="med-head-text">
          <div class="med-name">${esc(m.name || 'Unknown Medicine')}</div>
          ${m.dosage ? `<div class="med-dosage">${esc(m.dosage)}${m.frequency ? ' · ' + esc(m.frequency) : ''}</div>` : ''}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
          <button class="btn-read-aloud" title="Read aloud">🔊 Listen</button>
          <button class="btn-soft" style="padding:6px 10px;font-size:12px;"
            onclick="openReminderModal('${esc(m.name || 'Medicine').replace(/'/g, "\\'")}')">🔔 Remind</button>
        </div>
      </div>
      <div class="med-card-body">
        <div class="med-grid">
          ${m.frequency ? `<div class="med-field"><span class="med-lbl">Frequency</span><div class="med-val">${esc(m.frequency)}</div></div>` : ''}
          ${m.duration  ? `<div class="med-field"><span class="med-lbl">Duration</span><div class="med-val">${esc(m.duration)}</div></div>` : ''}
          ${m.purpose   ? `<div class="med-field"><span class="med-lbl">Purpose</span><div class="med-val">${esc(m.purpose)}</div></div>` : ''}
          ${m.category  ? `<div class="med-field"><span class="med-lbl">Category</span><div class="med-val">${esc(m.category)}</div></div>` : ''}
        </div>
        ${sideEffects ? `<div class="med-field" style="margin-bottom:10px"><span class="med-lbl">Side Effects</span><div class="med-tags">${sideEffects}</div></div>` : ''}
        ${warnings    ? `<div class="med-field"><span class="med-lbl">Warnings</span><div class="med-tags">${warnings}</div></div>` : ''}
      </div>
      ${m.plain_english ? `<div class="plain-english">${esc(m.plain_english)}</div>` : ''}
    `;
        card.querySelector('.btn-read-aloud').addEventListener('click', () => readAloud(m));
        medContainer.appendChild(card);
    });
}

function readAloud(med) {
    if (!window.speechSynthesis) return alert('Text-to-speech not supported.');
    window.speechSynthesis.cancel();
    const text = [
        med.name ? `Medicine: ${med.name}.` : '',
        med.dosage ? `Dosage: ${med.dosage}.` : '',
        med.frequency ? `Take ${med.frequency}.` : '',
        med.purpose ? `Purpose: ${med.purpose}.` : '',
        med.plain_english || ''
    ].filter(Boolean).join(' ');
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-IN'; utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
}

function showErr(title, msg) {
    if (!errorCard) return;
    errorCard.style.display = 'flex';
    if (errorTitle) errorTitle.textContent = title;
    if (errorMsg)   errorMsg.textContent = msg;
    if (rawOcrCard) rawOcrCard.style.display = 'none';
    if (cleanedCard) cleanedCard.style.display = 'none';
    if (medContainer) medContainer.innerHTML = '';
}

console.log('🏥 MediScan frontend loaded');

// ==========================================
// ===== REMINDERS FEATURE =====
// ==========================================

const reminderModal     = document.getElementById('reminder-modal');
const btnCloseModal     = document.getElementById('btn-close-modal');
const btnCancelReminder = document.getElementById('btn-cancel-reminder');
const btnSaveReminder   = document.getElementById('btn-save-reminder');
const reminderMedNameEl = document.getElementById('reminder-med-name');
const reminderTimeInput = document.getElementById('reminder-time');
const btnViewReminders  = document.getElementById('btn-view-reminders');
const remindersCountEl  = document.getElementById('reminders-count');

let currentReminderMed = '';
let reminders = JSON.parse(localStorage.getItem('mediscan_reminders') || '[]');

function updateRemindersCount() {
    if (!remindersCountEl) return;
    if (reminders.length > 0) {
        remindersCountEl.textContent = reminders.length;
        remindersCountEl.style.display = 'flex';
    } else {
        remindersCountEl.style.display = 'none';
    }
}

if ('Notification' in window) Notification.requestPermission();

window.openReminderModal = function (medName) {
    if (!reminderModal) return;
    currentReminderMed = medName;
    if (reminderMedNameEl) reminderMedNameEl.textContent = medName;
    if (reminderTimeInput) reminderTimeInput.value = '';
    reminderModal.style.display = 'flex';
};

function closeReminderModal() {
    if (reminderModal) reminderModal.style.display = 'none';
    currentReminderMed = '';
}

btnCloseModal && btnCloseModal.addEventListener('click', closeReminderModal);
btnCancelReminder && btnCancelReminder.addEventListener('click', closeReminderModal);

btnSaveReminder && btnSaveReminder.addEventListener('click', () => {
    const time = reminderTimeInput?.value;
    if (!time) { alert('Please select a time.'); return; }
    if ('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
    reminders.push({ id: Date.now().toString(), medicine: currentReminderMed, time });
    localStorage.setItem('mediscan_reminders', JSON.stringify(reminders));
    updateRemindersCount();
    closeReminderModal();
    alert(`Reminder set for ${currentReminderMed} at ${time}`);
});

btnViewReminders && btnViewReminders.addEventListener('click', () => {
    if (reminders.length === 0) { alert('No active reminders.'); return; }
    let msg = 'Active Reminders:\n\n';
    reminders.forEach((r, i) => { msg += `${i + 1}. ${r.medicine} at ${r.time}\n`; });
    if (confirm(msg + '\n(OK to clear all, Cancel to keep)')) {
        reminders = [];
        localStorage.removeItem('mediscan_reminders');
        updateRemindersCount();
    }
});

setInterval(() => {
    if (!reminders.length) return;
    const now = new Date();
    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (localStorage.getItem('last_fired_time') === cur) return;
    let fired = false;
    reminders.forEach(r => {
        if (r.time === cur) {
            fired = true;
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('MediScan Reminder 💊', { body: `Time to take: ${r.medicine}` });
            } else {
                alert(`💊 Time to take: ${r.medicine}`);
            }
        }
    });
    if (fired) localStorage.setItem('last_fired_time', cur);
}, 30000);

updateRemindersCount();

// ==========================================
// ===== PHARMACIES MAP FEATURE =====
// ==========================================

const btnFindPharmacies = document.getElementById('btn-find-pharmacies');
const mapContainer      = document.getElementById('map-container');
const mapStatus         = document.getElementById('map-status');
const pharmacyMapEl     = document.getElementById('pharmacy-map');
let leafletMap = null;

if (btnFindPharmacies) {
    btnFindPharmacies.addEventListener('click', () => {
        if (mapContainer) mapContainer.style.display = 'block';
        if (mapStatus) { mapStatus.style.display = 'block'; mapStatus.textContent = 'Requesting your location…'; }
        if (pharmacyMapEl) pharmacyMapEl.style.display = 'none';

        if (!navigator.geolocation) {
            if (mapStatus) mapStatus.textContent = 'Geolocation not supported.';
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => loadPharmaciesMap(pos.coords.latitude, pos.coords.longitude),
            () => { if (mapStatus) mapStatus.textContent = 'Demo mode: Ernakulam'; loadPharmaciesMap(9.9816, 76.2999); },
            { timeout: 5000 }
        );
    });
}

async function loadPharmaciesMap(lat, lon) {
    try {
        const query = `[out:json];node(around:2000,${lat},${lon})[amenity=pharmacy];out;`;
        const url   = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const data  = await (await fetch(url)).json();

        if (mapStatus) mapStatus.style.display = 'none';
        if (pharmacyMapEl) pharmacyMapEl.style.display = 'block';

        if (!leafletMap && typeof L !== 'undefined') {
            leafletMap = L.map('pharmacy-map').setView([lat, lon], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(leafletMap);
        } else if (leafletMap) {
            leafletMap.setView([lat, lon], 14);
        }

        if (leafletMap) {
            const userIcon = L.divIcon({
                html: '<div style="background:#0369a1;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px rgba(3,105,161,0.8);"></div>',
                className: 'user-marker'
            });
            L.marker([lat, lon], { icon: userIcon }).addTo(leafletMap).bindPopup('<b>You are here</b>').openPopup();

            if (data.elements?.length) {
                data.elements.forEach(p => {
                    L.marker([p.lat, p.lon]).addTo(leafletMap).bindPopup(`<b>💊 ${p.tags?.name || 'Pharmacy'}</b>`);
                });
            } else {
                alert('No pharmacies found within 2km.');
            }
            setTimeout(() => leafletMap.invalidateSize(), 100);
        }
    } catch (err) {
        console.error('Map error:', err);
        if (mapStatus) { mapStatus.style.display = 'block'; mapStatus.textContent = 'Failed to load map. Try again.'; }
        if (pharmacyMapEl) pharmacyMapEl.style.display = 'none';
    }
}
