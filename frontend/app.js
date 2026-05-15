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
                <div style="margin: 0 0 0 auto; display: flex; gap: 8px;">
                    <button class="btn-read-aloud" title="Read Aloud">🔊 Listen</button>
                    <button class="btn btn-outline btn-small" onclick="openReminderModal('${esc(med.name || 'Unknown Medicine').replace(/'/g, "\\'")}')" style="padding: 6px 10px; font-size: 0.75rem;">🔔 Set</button>
                </div>
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

console.log('🏥 MediScan frontend loaded');

// ==========================================
// ===== REMINDERS FEATURE =====
// ==========================================

const reminderModal = document.getElementById('reminder-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelReminder = document.getElementById('btn-cancel-reminder');
const btnSaveReminder = document.getElementById('btn-save-reminder');
const reminderMedNameEl = document.getElementById('reminder-med-name');
const reminderTimeInput = document.getElementById('reminder-time');
const btnViewReminders = document.getElementById('btn-view-reminders');
const remindersCountEl = document.getElementById('reminders-count');

let currentReminderMed = '';
let reminders = JSON.parse(localStorage.getItem('mediscan_reminders') || '[]');

function updateRemindersCount() {
    if (reminders.length > 0) {
        remindersCountEl.textContent = reminders.length;
        remindersCountEl.style.display = 'flex';
    } else {
        remindersCountEl.style.display = 'none';
    }
}

// Request Notification Permission
if ('Notification' in window) {
    Notification.requestPermission();
}

// Open modal from medicine card
window.openReminderModal = function(medName) {
    currentReminderMed = medName;
    reminderMedNameEl.textContent = medName;
    reminderTimeInput.value = '';
    reminderModal.style.display = 'flex';
};

function closeReminderModal() {
    reminderModal.style.display = 'none';
    currentReminderMed = '';
}

btnCloseModal.addEventListener('click', closeReminderModal);
btnCancelReminder.addEventListener('click', closeReminderModal);

btnSaveReminder.addEventListener('click', () => {
    const time = reminderTimeInput.value;
    if (!time) {
        alert("Please select a time.");
        return;
    }
    
    // Check permission
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    const newReminder = {
        id: Date.now().toString(),
        medicine: currentReminderMed,
        time: time // Format: "HH:MM"
    };

    reminders.push(newReminder);
    localStorage.setItem('mediscan_reminders', JSON.stringify(reminders));
    updateRemindersCount();
    closeReminderModal();
    alert(`Reminder set for ${currentReminderMed} at ${time}`);
});

btnViewReminders.addEventListener('click', () => {
    if (reminders.length === 0) {
        alert("No active reminders.");
        return;
    }
    let msg = "Active Reminders:\n\n";
    reminders.forEach((r, i) => {
        msg += `${i+1}. ${r.medicine} at ${r.time}\n`;
    });
    msg += "\n(Click OK to clear all reminders, or Cancel to keep them)";
    
    if (confirm(msg)) {
        reminders = [];
        localStorage.removeItem('mediscan_reminders');
        updateRemindersCount();
    }
});

// Reminder checking loop (every 30 seconds)
setInterval(() => {
    if (reminders.length === 0) return;
    
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    // Prevent firing multiple times in the same minute
    const lastFiredTime = localStorage.getItem('last_fired_time');
    if (lastFiredTime === currentTime) return;

    let fired = false;
    reminders.forEach(r => {
        if (r.time === currentTime) {
            fired = true;
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('MediScan Reminder 💊', {
                    body: `It's time to take: ${r.medicine}`,
                    icon: '💊'
                });
            } else {
                alert(`💊 Reminder: It's time to take ${r.medicine}`);
            }
        }
    });

    if (fired) {
        localStorage.setItem('last_fired_time', currentTime);
    }
}, 30000);

updateRemindersCount();

// ==========================================
// ===== PHARMACIES MAP FEATURE =====
// ==========================================

const btnFindPharmacies = document.getElementById('btn-find-pharmacies');
const mapContainer = document.getElementById('map-container');
const mapStatus = document.getElementById('map-status');
const pharmacyMapEl = document.getElementById('pharmacy-map');
let leafletMap = null;

if (btnFindPharmacies) {
    btnFindPharmacies.addEventListener('click', () => {
        // Show map container
        mapContainer.style.display = 'block';
        mapStatus.style.display = 'block';
        mapStatus.textContent = 'Requesting your location...';
        pharmacyMapEl.style.display = 'none';

        if (!navigator.geolocation) {
            mapStatus.textContent = 'Geolocation is not supported by your browser.';
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                mapStatus.textContent = 'Location found. Searching for pharmacies...';
                loadPharmaciesMap(lat, lon);
            },
            (error) => {
                console.warn("Geolocation error, falling back to demo location:", error);
                mapStatus.textContent = 'Demo Mode: Using Ernakulam...';
                loadPharmaciesMap(9.9816, 76.2999);
            },
            { timeout: 5000 }
        );
    });
}

async function loadPharmaciesMap(lat, lon) {
    try {
        // Query Overpass API for pharmacies within ~2km radius
        const query = `
            [out:json];
            node(around:2000, ${lat}, ${lon})[amenity=pharmacy];
            out;
        `;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        
        const response = await fetch(url);
        const data = await response.json();

        // Hide status, show map
        mapStatus.style.display = 'none';
        pharmacyMapEl.style.display = 'block';

        // Initialize Leaflet map if not already done
        if (!leafletMap) {
            leafletMap = L.map('pharmacy-map').setView([lat, lon], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(leafletMap);
        } else {
            leafletMap.setView([lat, lon], 14);
        }

        // Add user marker
        const userIcon = L.divIcon({
            html: '<div style="background-color:#6366f1; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px rgba(99,102,241,0.8);"></div>',
            className: 'user-marker'
        });
        L.marker([lat, lon], {icon: userIcon}).addTo(leafletMap)
            .bindPopup('<b>You are here</b>').openPopup();

        // Add pharmacy markers
        if (data.elements && data.elements.length > 0) {
            data.elements.forEach(pharmacy => {
                const name = pharmacy.tags.name || 'Pharmacy';
                const marker = L.marker([pharmacy.lat, pharmacy.lon]).addTo(leafletMap);
                marker.bindPopup(`<b>💊 ${name}</b>`);
            });
        } else {
            alert("No pharmacies found within 2km.");
        }
        
        // Force Leaflet to recalculate size since we just unhid the div
        setTimeout(() => {
            leafletMap.invalidateSize();
        }, 100);

    } catch (error) {
        console.error("Error fetching pharmacies:", error);
        mapStatus.textContent = 'Failed to load pharmacies. Please try again later.';
        mapStatus.style.display = 'block';
        pharmacyMapEl.style.display = 'none';
    }
}
