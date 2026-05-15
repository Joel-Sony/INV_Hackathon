/* MediScan — app.js */

const uploadSection = document.getElementById('upload-section');
const progressSection = document.getElementById('progress-section');
const resultsSection = document.getElementById('results-section');

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadTrigger = document.getElementById('upload-trigger');
const filePreview = document.getElementById('file-preview');
const previewImage = document.getElementById('preview-image');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const btnRemove = document.getElementById('btn-remove');
const actionButtons = document.getElementById('action-buttons');
const btnUpload = document.getElementById('btn-upload');
const btnUploadOnly = document.getElementById('btn-upload-only');
const btnScanAgain = document.getElementById('btn-scan-again');

const progressTitle = document.getElementById('progress-title');
const progressBar = document.getElementById('progress-bar');
const stepEls = {
    upload: document.getElementById('step-upload'),
    ocr: document.getElementById('step-ocr'),
    cleanup: document.getElementById('step-cleanup'),
    explain: document.getElementById('step-explain'),
};

const pipelineSteps = document.getElementById('pipeline-steps');
const rawOcrCard = document.getElementById('raw-ocr-card');
const rawOcrText = document.getElementById('raw-ocr-text');
const resultFilename = document.getElementById('result-filename');
const cleanedCard = document.getElementById('cleaned-text-card');
const cleanedText = document.getElementById('cleaned-text');
const medContainer = document.getElementById('medicines-container');
const errorCard = document.getElementById('error-card');
const errorTitle = document.getElementById('error-title');
const errorMsg = document.getElementById('error-message');

let selectedFile = null;

/* ── Sections ── */
function show(id) {
    [uploadSection, progressSection, resultsSection].forEach(s => {
        if (s) s.style.display = s.id === id ? 'block' : 'none';
    });
}
show('upload-section');

/* ── File handling ── */
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
dropZone.addEventListener('click', () => { if (!selectedFile) fileInput.click(); });
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

function resetUpload() {
    selectedFile = null; fileInput.value = ''; previewImage.src = '';
    dropZone.style.display = 'block'; filePreview.style.display = 'none'; actionButtons.style.display = 'none';
}
btnRemove && btnRemove.addEventListener('click', resetUpload);

btnScanAgain && btnScanAgain.addEventListener('click', () => {
    resetUpload(); show('upload-section');
    medContainer.innerHTML = '';
    rawOcrCard.style.display = 'none'; cleanedCard.style.display = 'none'; errorCard.style.display = 'none';
    pipelineSteps.innerHTML = '';
    Object.values(stepEls).forEach(el => el && el.classList.remove('active', 'done'));
});

/* ── Step UI ── */
function setStep(key) {
    Object.entries(stepEls).forEach(([k, el]) => {
        if (!el) return;
        el.classList.remove('active', 'done');
        if (k === key) el.classList.add('active');
    });
}
function doneStep(key) {
    if (stepEls[key]) { stepEls[key].classList.remove('active'); stepEls[key].classList.add('done'); }
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

/* ── Upload Only ── */
btnUploadOnly && btnUploadOnly.addEventListener('click', async () => {
    if (!selectedFile) return;
    show('progress-section'); setStep('upload'); setProgress(10);
    progressTitle.textContent = 'Uploading…';
    try {
        const fd = new FormData(); fd.append('file', selectedFile);
        const res = await fetch('/upload', { method: 'POST', body: fd });
        const data = await res.json();
        doneStep('upload'); setProgress(100);
        show('results-section');
        setPipeline([{ label: 'Uploaded', status: 'success' }]);
        if (data.filename && resultFilename) resultFilename.textContent = data.filename;
        rawOcrCard.style.display = 'none'; cleanedCard.style.display = 'none';
        errorCard.style.display = 'none'; medContainer.innerHTML = '';
    } catch (err) { show('results-section'); showErr('Upload Failed', err.message); }
});

/* ── Scan ── */
btnUpload && btnUpload.addEventListener('click', async () => {
    if (!selectedFile) return;
    show('progress-section'); setProgress(5);
    try {
        progressTitle.textContent = 'Uploading file…'; setStep('upload');
        const fd = new FormData(); fd.append('file', selectedFile);
        const upRes = await fetch('/upload', { method: 'POST', body: fd });
        if (!upRes.ok) throw new Error('Upload failed: ' + upRes.statusText);
        const upData = await upRes.json();
        doneStep('upload'); setProgress(22);

        progressTitle.textContent = 'Running OCR…'; setStep('ocr'); setProgress(38);
        const ocrRes = await fetch('/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: upData.filename }) });
        if (!ocrRes.ok) throw new Error('OCR failed: ' + ocrRes.statusText);
        const ocrData = await ocrRes.json();
        doneStep('ocr'); setProgress(56);

        progressTitle.textContent = 'Cleaning with AI…'; setStep('cleanup'); setProgress(66);
        const clRes = await fetch('/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ocrData.text }) });
        const clData = clRes.ok ? await clRes.json() : { cleaned: null };
        doneStep('cleanup'); setProgress(80);

        progressTitle.textContent = 'Generating explanation…'; setStep('explain');
        const exRes = await fetch('/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clData.cleaned || ocrData.text }) });
        const exData = exRes.ok ? await exRes.json() : { medicines: [] };
        doneStep('explain'); setProgress(100);

        show('results-section');
        setPipeline([
            { label: 'Upload', status: 'success' },
            { label: 'OCR', status: ocrData.text ? 'success' : 'failed' },
            { label: 'LLM Cleanup', status: clData.cleaned ? 'success' : 'pending' },
            { label: 'Explain', status: exData.medicines?.length ? 'success' : 'pending' },
        ]);
        if (ocrData.text) {
            rawOcrCard.style.display = 'block'; rawOcrText.textContent = ocrData.text;
            if (resultFilename) resultFilename.textContent = upData.filename || 'Tesseract';
        }
        if (clData.cleaned) { cleanedCard.style.display = 'block'; cleanedText.textContent = clData.cleaned; }
        if (exData.medicines?.length) renderMeds(exData.medicines);

    } catch (err) { show('results-section'); showErr('Processing Error', err.message); }
});

/* ── Medicine cards ── */
function renderMeds(meds) {
    medContainer.innerHTML = '';
    meds.forEach((m, i) => {
        const card = document.createElement('div');
        card.className = 'med-card';
        card.style.animationDelay = (i * 0.08) + 's';

        const sideEffects = (m.side_effects || []).map(s => `<span class="med-tag">${s}</span>`).join('');
        const warnings = (m.warnings || []).map(w => `<span class="med-tag w">${w}</span>`).join('');

        card.innerHTML = `
      <div class="med-card-head">
        <div class="med-num-badge">${String(i + 1).padStart(2, '0')}</div>
        <div class="med-head-text">
          <div class="med-name">${m.name || 'Unknown Medicine'}</div>
          ${m.dosage ? `<div class="med-dosage">${m.dosage}</div>` : ''}
        </div>
      </div>
      <div class="med-card-body">
        <div class="med-grid">
          ${m.frequency ? `<div class="med-field"><span class="med-lbl">Frequency</span><div class="med-val">${m.frequency}</div></div>` : ''}
          ${m.duration ? `<div class="med-field"><span class="med-lbl">Duration</span><div class="med-val">${m.duration}</div></div>` : ''}
          ${m.purpose ? `<div class="med-field"><span class="med-lbl">Purpose</span><div class="med-val">${m.purpose}</div></div>` : ''}
          ${m.category ? `<div class="med-field"><span class="med-lbl">Category</span><div class="med-val">${m.category}</div></div>` : ''}
        </div>
        ${sideEffects ? `<div class="med-field" style="margin-bottom:10px"><span class="med-lbl">Side Effects</span><div class="med-tags">${sideEffects}</div></div>` : ''}
        ${warnings ? `<div class="med-field"><span class="med-lbl">Warnings</span><div class="med-tags">${warnings}</div></div>` : ''}
      </div>
      ${m.plain_english ? `<div class="plain-english">${m.plain_english}</div>` : ''}
    `;
        medContainer.appendChild(card);
    });
}

function showErr(title, msg) {
    errorCard.style.display = 'flex';
    errorTitle.textContent = title;
    errorMsg.textContent = msg;
    rawOcrCard.style.display = 'none'; cleanedCard.style.display = 'none'; medContainer.innerHTML = '';
}